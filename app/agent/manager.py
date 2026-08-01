import os
import asyncio
import json
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from app.filesystem.manager import get_project_dir

SAFE_COMMANDS = {"ls", "pwd", "cat", "grep", "rg", "find", "python", "python3", "pytest", "echo", "which"}
DANGEROUS_COMMANDS = {"rm", "mv", "chmod", "chown", "apt", "apt-get", "dpkg"}
PACKAGE_MANAGERS = {"pip", "pip3", "uv", "npm", "pnpm", "yarn", "cargo"}
GIT_COMMAND = "git"

@dataclass
class AgentSessionState:
    profile: str = "normal"  # safe, normal, full
    project: str = ""
    session_approved_commands: set = None
    
    def __post_init__(self):
        if self.session_approved_commands is None:
            self.session_approved_commands = set()

class AgentManager:
    def __init__(self):
        self.state = AgentSessionState()
        self.pending_requests: Dict[str, asyncio.Future] = {}
        self.request_counter = 0
        self.listeners: List[asyncio.Queue] = []
        self._last_mtimes: Dict[str, float] = {}
        self.is_watching = False
        
    async def start_watching(self):
        if self.is_watching:
            return
        self.is_watching = True
        while True:
            await asyncio.sleep(2.0)
            if not self.state.project:
                continue
                
            try:
                proj_dir = get_project_dir(self.state.project)
                for root, _, files in os.walk(proj_dir):
                    if ".venv" in root or ".git" in root or "__pycache__" in root:
                        continue
                    for file in files:
                        path = os.path.join(root, file)
                        try:
                            mtime = os.stat(path).st_mtime
                            rel_path = os.path.relpath(path, proj_dir)
                            if path not in self._last_mtimes:
                                self._last_mtimes[path] = mtime
                            elif mtime > self._last_mtimes[path]:
                                self._last_mtimes[path] = mtime
                                await self.broadcast({"type": "activity", "action": "File Modified", "detail": rel_path, "status": "Detected"})
                        except Exception:
                            pass
            except Exception:
                pass
                
    def set_profile(self, profile: str, project: str):
        self.state.profile = profile.lower()
        self.state.project = project
        self.state.session_approved_commands.clear()
        
    def add_listener(self, queue: asyncio.Queue):
        self.listeners.append(queue)
        
    def remove_listener(self, queue: asyncio.Queue):
        if queue in self.listeners:
            self.listeners.remove(queue)
            
    async def broadcast(self, message: dict):
        for q in self.listeners:
            await q.put(message)
            
    def _is_out_of_bounds(self, cwd: str) -> bool:
        if not self.state.project:
            return False
        proj_dir = get_project_dir(self.state.project)
        try:
            resolved_cwd = os.path.realpath(cwd)
            if not resolved_cwd.startswith(proj_dir + os.sep) and resolved_cwd != proj_dir:
                return True
            return False
        except Exception:
            return True

    async def handle_interception(self, command: str, args: List[str], cwd: str) -> bool:
        is_oob = self._is_out_of_bounds(cwd)
        profile = self.state.profile
        full_cmd = f"{command} {' '.join(args)}".strip()
        
        if full_cmd in self.state.session_approved_commands:
            await self.broadcast({"type": "activity", "action": "Command", "detail": full_cmd, "status": "Auto-approved (Session)"})
            return True
            
        requires_approval = False
        reason = ""
        risk = "unknown"
        
        if is_oob:
            requires_approval = True
            reason = "OUTSIDE PROJECT"
            risk = "High - Operating outside workspace boundary."
        elif command in DANGEROUS_COMMANDS:
            requires_approval = True
            reason = "DANGEROUS COMMAND"
            risk = "High - Potential destructive modification."
        elif command in PACKAGE_MANAGERS:
            requires_approval = True
            reason = "PACKAGE INSTALLATION"
            risk = "Medium - Modifies dependencies."
            if command in ("apt", "apt-get", "dpkg"):
                reason = "SYSTEM PACKAGE INSTALLATION"
                risk = "High - Modifies Ubuntu system environment."
        elif command == GIT_COMMAND:
            if args:
                subcmd = args[0]
                if subcmd in ("commit", "push", "reset", "clean", "checkout", "restore", "branch", "rebase"):
                    requires_approval = True
                    reason = "GIT ACTION"
                    risk = f"Medium - Git {subcmd} alters history or remote."
                elif subcmd in ("status", "diff", "log", "show", "rev-parse"):
                    pass
                else:
                    if profile == "safe":
                        requires_approval = True
                        reason = "GIT ACTION"
                        risk = "Medium - Requires approval in SAFE mode."
        else:
            if profile == "safe" and command not in SAFE_COMMANDS:
                requires_approval = True
                reason = "COMMAND REQUIRES APPROVAL"
                risk = "Low - Unknown command requires approval in SAFE mode."
            elif profile == "normal":
                pass
            elif profile == "full":
                pass
                
        if not requires_approval:
            await self.broadcast({"type": "activity", "action": "Command", "detail": full_cmd, "status": "Running"})
            return True
            
        self.request_counter += 1
        req_id = f"req_{self.request_counter}"
        future = asyncio.get_event_loop().create_future()
        self.pending_requests[req_id] = future
        
        await self.broadcast({
            "type": "approval_needed",
            "req_id": req_id,
            "reason": reason,
            "command": full_cmd,
            "cwd": cwd,
            "risk": risk,
            "can_session_approve": not is_oob and command not in ("apt", "apt-get")
        })
        
        try:
            approved, save_session = await future
            if approved and save_session:
                self.state.session_approved_commands.add(full_cmd)
                
            status_str = "Approved" if approved else "Rejected"
            await self.broadcast({"type": "activity", "action": "Command", "detail": full_cmd, "status": status_str})
            return approved
        except Exception:
            return False
            
    def resolve_approval(self, req_id: str, approved: bool, save_session: bool = False):
        if req_id in self.pending_requests:
            future = self.pending_requests.pop(req_id)
            if not future.done():
                future.set_result((approved, save_session))

agent_manager = AgentManager()
