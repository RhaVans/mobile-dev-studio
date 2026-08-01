import os
import json
import shutil
import asyncio
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.terminal.pty_manager import PTYSession
from app.filesystem import manager as fs_manager
from app.git import manager as git_manager
from app.agent.manager import agent_manager

app = FastAPI(title="Mobile Dev Studio")

ACTIVE_TERMINALS: dict[str, PTYSession] = {}
ACTIVE_AGENTS: dict[str, PTYSession] = {}

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(agent_manager.start_watching())

# Mount static directory for static assets
app.mount("/static", StaticFiles(directory="app/static"), name="static")

AGENT_CONFIGS = {
    "antigravity": {
        "name": "Antigravity",
        "executable": "agy",
        "custom_paths": ["~/.local/bin/agy"],
    },
    "opencode": {
        "name": "OpenCode",
        "executable": "opencode",
        "custom_paths": ["~/.opencode/bin/opencode"],
    }
}


def resolve_agent_binary(agent_id: str):
    """Locate executable path for specified agent."""
    config = AGENT_CONFIGS.get(agent_id.lower())
    if not config:
        return None, None

    path = shutil.which(config["executable"])
    if not path:
        for custom_path in config.get("custom_paths", []):
            expanded = os.path.expanduser(custom_path)
            if os.path.exists(expanded):
                path = expanded
                break

    return config["name"], path


@app.get("/api/info")
def get_info():
    """Return basic project environment details and agent availability."""
    agents_info = {}
    for agent_id in AGENT_CONFIGS:
        name, path = resolve_agent_binary(agent_id)
        agents_info[agent_id] = {
            "name": name,
            "available": path is not None,
            "path": path
        }

    return {
        "project_dir": os.getcwd(),
        "agents": agents_info
    }


@app.get("/")
def read_root():
    """Serve index.html at root."""
    return FileResponse("app/static/index.html")

# --- AGENT PERMISSIONS & ACTIVITY ---

@app.post("/api/agent/profile")
def set_agent_profile(payload: dict = Body(...)):
    profile = payload.get("profile", "normal")
    project = payload.get("project", "")
    agent_manager.set_profile(profile, project)
    return {"status": "ok", "profile": profile}

@app.post("/api/agent/intercept")
async def intercept_command(payload: dict = Body(...)):
    command = payload.get("command", "")
    args = payload.get("args", [])
    cwd = payload.get("cwd", "")
    
    approved = await agent_manager.handle_interception(command, args, cwd)
    return {"approved": approved}

@app.post("/api/agent/approve")
def approve_request(payload: dict = Body(...)):
    req_id = payload.get("req_id")
    approved = payload.get("approved", False)
    save_session = payload.get("save_session", False)
    agent_manager.resolve_approval(req_id, approved, save_session)
    return {"status": "ok"}

@app.websocket("/ws/agent_activity")
async def agent_activity_ws(websocket: WebSocket):
    await websocket.accept()
    q = asyncio.Queue()
    agent_manager.add_listener(q)
    try:
        while True:
            msg = await q.get()
            await websocket.send_json(msg)
    except Exception:
        pass
    finally:
        agent_manager.remove_listener(q)


# --- FILESYSTEM & PROJECT MANAGEMENT REST API ---

@app.get("/api/projects")
def list_projects_endpoint():
    """List all available project directories."""
    try:
        return fs_manager.list_projects()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/projects")
def create_project_endpoint(payload: dict = Body(...)):
    """Create a new project directory."""
    name = payload.get("name")
    try:
        return fs_manager.create_project(name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fs/tree")
def get_tree_endpoint(project: str = Query(...), path: str = Query("")):
    """List files/folders in a project directory."""
    try:
        return fs_manager.get_dir_tree(project, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fs/read")
def read_file_endpoint(project: str = Query(...), path: str = Query(...)):
    """Read content of a text file."""
    try:
        return fs_manager.read_file_content(project, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fs/write")
def write_file_endpoint(payload: dict = Body(...)):
    """Write text file content with external modification check."""
    project = payload.get("project")
    path = payload.get("path")
    content = payload.get("content", "")
    expected_mtime = payload.get("expected_mtime")
    force = payload.get("force", False)

    try:
        res = fs_manager.write_file_content(
            project, path, content, None if force else expected_mtime
        )
        if res.get("conflict"):
            return JSONResponse(status_code=409, content=res)
        return res
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fs/create")
def create_item_endpoint(payload: dict = Body(...)):
    """Create a file or directory inside a project."""
    project = payload.get("project")
    path = payload.get("path")
    item_type = payload.get("type", "file")
    try:
        return fs_manager.create_fs_item(project, path, item_type)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fs/rename")
def rename_item_endpoint(payload: dict = Body(...)):
    """Rename a file or folder inside a project."""
    project = payload.get("project")
    old_path = payload.get("old_path")
    new_path = payload.get("new_path")
    try:
        return fs_manager.rename_fs_item(project, old_path, new_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fs/delete")
def delete_item_endpoint(payload: dict = Body(...)):
    """Delete a file or directory inside a project."""
    project = payload.get("project")
    path = payload.get("path")
    try:
        return fs_manager.delete_fs_item(project, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- GIT REST API ---

@app.get("/api/git/status")
def git_status_endpoint(project: str = Query(...)):
    """Get parsed Git status for a project."""
    try:
        return git_manager.get_status(project)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/init")
def git_init_endpoint(payload: dict = Body(...)):
    """Initialize a Git repository."""
    project = payload.get("project")
    try:
        return git_manager.init_repo(project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/diff")
def git_diff_endpoint(project: str = Query(...), path: str = Query(...), staged: bool = Query(False)):
    """Get diff for a specific file."""
    try:
        diff_text = git_manager.get_diff(project, path, staged)
        return {"path": path, "staged": staged, "diff": diff_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/stage")
def git_stage_endpoint(payload: dict = Body(...)):
    """Stage file(s)."""
    project = payload.get("project")
    path = payload.get("path")
    stage_all = payload.get("all", False)
    try:
        if stage_all:
            return git_manager.stage_all(project)
        return git_manager.stage_file(project, path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/unstage")
def git_unstage_endpoint(payload: dict = Body(...)):
    """Unstage a file."""
    project = payload.get("project")
    path = payload.get("path")
    try:
        return git_manager.unstage_file(project, path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/discard")
def git_discard_endpoint(payload: dict = Body(...)):
    """Discard working directory changes for a file."""
    project = payload.get("project")
    path = payload.get("path")
    try:
        return git_manager.discard_changes(project, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/commit")
def git_commit_endpoint(payload: dict = Body(...)):
    """Create a Git commit."""
    project = payload.get("project")
    message = payload.get("message")
    try:
        return git_manager.commit(project, message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/branches")
def git_branches_endpoint(project: str = Query(...)):
    """List local branches."""
    try:
        return git_manager.list_branches(project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/branch/create")
def git_create_branch_endpoint(payload: dict = Body(...)):
    """Create a new branch."""
    project = payload.get("project")
    name = payload.get("name")
    try:
        return git_manager.create_branch(project, name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/branch/switch")
def git_switch_branch_endpoint(payload: dict = Body(...)):
    """Switch to a branch."""
    project = payload.get("project")
    name = payload.get("name")
    try:
        return git_manager.switch_branch(project, name)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/log")
def git_log_endpoint(project: str = Query(...), count: int = Query(20)):
    """Get recent commit history."""
    try:
        return git_manager.get_log(project, count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/commit-detail")
def git_commit_detail_endpoint(project: str = Query(...), hash: str = Query(...)):
    """Get details for a specific commit."""
    try:
        return git_manager.get_commit_detail(project, hash)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/git/remotes")
def git_remotes_endpoint(project: str = Query(...)):
    """List configured remotes."""
    try:
        return git_manager.get_remotes(project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/pull")
def git_pull_endpoint(payload: dict = Body(...)):
    """Pull from remote."""
    project = payload.get("project")
    try:
        return git_manager.pull(project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/git/push")
def git_push_endpoint(payload: dict = Body(...)):
    """Push to remote (never force)."""
    project = payload.get("project")
    try:
        return git_manager.push(project)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- WEBSOCKET ENDPOINTS ---

@app.websocket("/ws/terminal")
async def terminal_websocket_endpoint(websocket: WebSocket, project: str = Query("default")):
    await websocket.accept()

    session_id = f"terminal_{project}"
    
    if session_id in ACTIVE_TERMINALS and ACTIVE_TERMINALS[session_id].pid is not None:
        try:
            os.kill(ACTIVE_TERMINALS[session_id].pid, 0)
            pty_session = ACTIVE_TERMINALS[session_id]
        except OSError:
            pty_session = PTYSession()
            pty_session.start()
            ACTIVE_TERMINALS[session_id] = pty_session
    else:
        pty_session = PTYSession()
        pty_session.start()
        ACTIVE_TERMINALS[session_id] = pty_session

    if pty_session.buffer:
        await websocket.send_text(pty_session.buffer.decode("utf-8", errors="replace"))

    loop = asyncio.get_event_loop()

    async def pty_to_websocket():
        while True:
            await asyncio.sleep(0.02)
            if pty_session.master_fd is None:
                break
            try:
                output = await loop.run_in_executor(None, pty_session.read, 4096)
                if output:
                    await websocket.send_text(output.decode("utf-8", errors="replace"))
            except Exception:
                break

    async def websocket_to_pty():
        while True:
            try:
                data = await websocket.receive_text()
                try:
                    payload = json.loads(data)
                    msg_type = payload.get("type")
                    if msg_type == "input":
                        input_data = payload.get("data", "")
                        pty_session.write(input_data.encode("utf-8"))
                    elif msg_type == "resize":
                        cols = payload.get("cols", 80)
                        rows = payload.get("rows", 24)
                        pty_session.resize(cols, rows)
                    elif msg_type == "stop":
                        pty_session.terminate()
                        if session_id in ACTIVE_TERMINALS:
                            del ACTIVE_TERMINALS[session_id]
                        break
                except json.JSONDecodeError:
                    pty_session.write(data.encode("utf-8"))
            except WebSocketDisconnect:
                break
            except Exception:
                break

    task_read = asyncio.create_task(pty_to_websocket())
    task_write = asyncio.create_task(websocket_to_pty())

    done, pending = await asyncio.wait(
        [task_read, task_write],
        return_when=asyncio.FIRST_COMPLETED
    )

    for task in pending:
        task.cancel()


@app.websocket("/ws/agent")
async def agent_websocket_endpoint(
    websocket: WebSocket,
    agent: str = Query("antigravity"),
    project: str = Query("mobile-dev-studio")
):
    await websocket.accept()

    agent_name, agent_bin = resolve_agent_binary(agent)
    if not agent_bin:
        display_name = agent_name or agent.capitalize()
        err_msg = json.dumps({
            "type": "error",
            "message": f"{display_name} CLI ('{agent}') was not found in the current environment."
        })
        await websocket.send_text(err_msg)
        await websocket.close()
        return

    # Resolve target project directory
    target_dir = os.path.expanduser(f"~/projects/{project}")
    if not os.path.exists(target_dir):
        target_dir = os.getcwd()

    # Prepend interceptor path to agent environment
    interceptor_bin = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "agent", "bin"))
    current_path = os.environ.get("PATH", "")
    env_overrides = {
        "PATH": f"{interceptor_bin}{os.pathsep}{current_path}"
    }

    session_id = f"{project}_{agent}"

    if session_id in ACTIVE_AGENTS and ACTIVE_AGENTS[session_id].pid is not None:
        try:
            os.kill(ACTIVE_AGENTS[session_id].pid, 0)
            pty_session = ACTIVE_AGENTS[session_id]
        except OSError:
            pty_session = PTYSession(command=[agent_bin], initial_dir=target_dir, env_overrides=env_overrides)
            pty_session.start()
            ACTIVE_AGENTS[session_id] = pty_session
    else:
        pty_session = PTYSession(command=[agent_bin], initial_dir=target_dir, env_overrides=env_overrides)
        pty_session.start()
        ACTIVE_AGENTS[session_id] = pty_session

    if pty_session.buffer:
        await websocket.send_text(pty_session.buffer.decode("utf-8", errors="replace"))

    loop = asyncio.get_event_loop()

    async def pty_to_websocket():
        while True:
            await asyncio.sleep(0.02)
            if pty_session.master_fd is None:
                break
            try:
                output = await loop.run_in_executor(None, pty_session.read, 4096)
                if output:
                    await websocket.send_text(output.decode("utf-8", errors="replace"))
            except Exception:
                break

    async def websocket_to_pty():
        while True:
            try:
                data = await websocket.receive_text()
                try:
                    payload = json.loads(data)
                    msg_type = payload.get("type")
                    if msg_type == "input":
                        input_data = payload.get("data", "")
                        pty_session.write(input_data.encode("utf-8"))
                    elif msg_type == "resize":
                        cols = payload.get("cols", 80)
                        rows = payload.get("rows", 24)
                        pty_session.resize(cols, rows)
                    elif msg_type == "stop":
                        pty_session.terminate()
                        if session_id in ACTIVE_AGENTS:
                            del ACTIVE_AGENTS[session_id]
                        break
                except json.JSONDecodeError:
                    pty_session.write(data.encode("utf-8"))
            except WebSocketDisconnect:
                break
            except Exception:
                break

    task_read = asyncio.create_task(pty_to_websocket())
    task_write = asyncio.create_task(websocket_to_pty())

    done, pending = await asyncio.wait(
        [task_read, task_write],
        return_when=asyncio.FIRST_COMPLETED
    )

    for task in pending:
        task.cancel()
