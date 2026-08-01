import os
import subprocess
import re
from typing import List, Dict, Any, Optional
from app.filesystem.manager import BASE_PROJECTS_DIR, get_project_dir


def _run_git(project_name: str, args: List[str], check: bool = True) -> subprocess.CompletedProcess:
    """Run a git command safely inside the project directory."""
    proj_dir = get_project_dir(project_name)
    cmd = ["git"] + args
    result = subprocess.run(
        cmd,
        cwd=proj_dir,
        capture_output=True,
        text=True,
        timeout=30
    )
    if check and result.returncode != 0:
        error_msg = result.stderr.strip() or result.stdout.strip() or "Git command failed."
        raise RuntimeError(error_msg)
    return result


def is_git_repo(project_name: str) -> bool:
    """Check if the project directory is inside a Git work tree."""
    try:
        result = _run_git(project_name, ["rev-parse", "--is-inside-work-tree"], check=False)
        return result.returncode == 0 and result.stdout.strip() == "true"
    except Exception:
        return False


def init_repo(project_name: str) -> Dict[str, Any]:
    """Initialize a new Git repository in the project directory."""
    _run_git(project_name, ["init"])
    return {"initialized": True, "project": project_name}


def get_current_branch(project_name: str) -> str:
    """Get the current branch name."""
    result = _run_git(project_name, ["branch", "--show-current"], check=False)
    branch = result.stdout.strip()
    if not branch:
        # Possibly detached HEAD or initial commit
        result2 = _run_git(project_name, ["rev-parse", "--abbrev-ref", "HEAD"], check=False)
        branch = result2.stdout.strip() or "(unknown)"
    return branch


def get_status(project_name: str) -> Dict[str, Any]:
    """Get parsed Git status using porcelain v1 format."""
    if not is_git_repo(project_name):
        return {"is_repo": False}

    result = _run_git(project_name, ["status", "--porcelain=v1", "-uall"], check=False)
    branch = get_current_branch(project_name)

    staged = []
    unstaged = []
    untracked = []
    conflicted = []

    for line in result.stdout.splitlines():
        if len(line) < 4:
            continue
        index_status = line[0]
        worktree_status = line[1]
        filepath = line[3:]

        # Handle renames: "R  old -> new"
        rename_parts = None
        if " -> " in filepath:
            rename_parts = filepath.split(" -> ")
            filepath = rename_parts[1] if len(rename_parts) > 1 else filepath

        entry = {
            "path": filepath,
            "index": index_status,
            "worktree": worktree_status,
        }
        if rename_parts:
            entry["old_path"] = rename_parts[0]

        # Conflict detection (both modified, added+added, etc.)
        if index_status in ("U", "A") and worktree_status in ("U", "A"):
            conflicted.append(entry)
        elif index_status == "U" or worktree_status == "U":
            conflicted.append(entry)
        elif index_status == "?" and worktree_status == "?":
            untracked.append(entry)
        else:
            if index_status != " " and index_status != "?":
                staged.append(entry)
            if worktree_status != " " and worktree_status != "?":
                unstaged.append(entry)

    return {
        "is_repo": True,
        "branch": branch,
        "staged": staged,
        "unstaged": unstaged,
        "untracked": untracked,
        "conflicted": conflicted
    }


def get_diff(project_name: str, path: str, staged: bool = False) -> str:
    """Get diff for a specific file."""
    args = ["diff"]
    if staged:
        args.append("--cached")
    args.append("--")
    args.append(path)
    result = _run_git(project_name, args, check=False)
    return result.stdout


def stage_file(project_name: str, path: str) -> Dict[str, Any]:
    """Stage a specific file."""
    _run_git(project_name, ["add", "--", path])
    return {"staged": path}


def stage_all(project_name: str) -> Dict[str, Any]:
    """Stage all changes."""
    _run_git(project_name, ["add", "-A"])
    return {"staged_all": True}


def unstage_file(project_name: str, path: str) -> Dict[str, Any]:
    """Unstage a specific file without modifying working copy."""
    # Try restore --staged first, fall back to reset HEAD
    result = _run_git(project_name, ["restore", "--staged", "--", path], check=False)
    if result.returncode != 0:
        _run_git(project_name, ["reset", "HEAD", "--", path], check=False)
    return {"unstaged": path}


def discard_changes(project_name: str, path: str) -> Dict[str, Any]:
    """Discard working directory changes for a tracked file."""
    _run_git(project_name, ["checkout", "--", path])
    return {"discarded": path}


def commit(project_name: str, message: str) -> Dict[str, Any]:
    """Create a commit with the given message."""
    if not message or not message.strip():
        raise ValueError("Commit message cannot be empty.")

    # Check if there are staged changes
    result = _run_git(project_name, ["diff", "--cached", "--name-only"], check=False)
    if not result.stdout.strip():
        raise ValueError("Nothing staged to commit. Stage files before committing.")

    _run_git(project_name, ["commit", "-m", message.strip()])

    # Get the new commit info
    log_result = _run_git(project_name, [
        "log", "-1", "--format=%H%n%h%n%s%n%an%n%ar"
    ], check=False)
    lines = log_result.stdout.strip().splitlines()
    if len(lines) >= 5:
        return {
            "committed": True,
            "hash": lines[0],
            "short_hash": lines[1],
            "message": lines[2],
            "author": lines[3],
            "date": lines[4]
        }
    return {"committed": True}


def list_branches(project_name: str) -> List[Dict[str, Any]]:
    """List all local branches."""
    result = _run_git(project_name, ["branch", "--format=%(refname:short)%09%(HEAD)"], check=False)
    branches = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("\t")
        name = parts[0].strip() if parts else ""
        is_current = len(parts) > 1 and parts[1].strip() == "*"
        if name:
            branches.append({"name": name, "current": is_current})
    return branches


def create_branch(project_name: str, branch_name: str) -> Dict[str, Any]:
    """Create a new branch without switching to it."""
    if not branch_name or not branch_name.strip():
        raise ValueError("Branch name cannot be empty.")
    _run_git(project_name, ["branch", branch_name.strip()])
    return {"created": branch_name.strip()}


def switch_branch(project_name: str, branch_name: str) -> Dict[str, Any]:
    """Switch to an existing branch."""
    if not branch_name or not branch_name.strip():
        raise ValueError("Branch name cannot be empty.")

    # Check for uncommitted changes first
    status = get_status(project_name)
    has_changes = bool(status.get("staged") or status.get("unstaged"))

    result = _run_git(project_name, ["checkout", branch_name.strip()], check=False)
    if result.returncode != 0:
        error = result.stderr.strip()
        if "overwritten by checkout" in error or "would be overwritten" in error:
            raise RuntimeError(
                f"Cannot switch to '{branch_name}': you have uncommitted changes "
                f"that would be overwritten. Commit or stash them first."
            )
        raise RuntimeError(error or "Failed to switch branch.")

    return {"switched": branch_name.strip(), "had_changes": has_changes}


def get_log(project_name: str, count: int = 20) -> List[Dict[str, Any]]:
    """Get recent commit history."""
    result = _run_git(project_name, [
        "log", f"-{count}",
        "--format=%H%x1f%h%x1f%s%x1f%an%x1f%ar%x1f%ai",
    ], check=False)

    commits = []
    for line in result.stdout.strip().splitlines():
        parts = line.split("\x1f")
        if len(parts) >= 5:
            commits.append({
                "hash": parts[0],
                "short_hash": parts[1],
                "message": parts[2],
                "author": parts[3],
                "relative_date": parts[4],
                "date": parts[5] if len(parts) > 5 else ""
            })
    return commits


def get_commit_detail(project_name: str, commit_hash: str) -> Dict[str, Any]:
    """Get details for a specific commit."""
    # Validate commit hash format (hex characters only)
    if not re.match(r'^[a-fA-F0-9]+$', commit_hash):
        raise ValueError("Invalid commit hash.")

    result = _run_git(project_name, [
        "show", commit_hash,
        "--format=%H%n%h%n%s%n%b%n---AUTHOR---%n%an%n---DATE---%n%ai",
        "--name-status"
    ], check=False)

    if result.returncode != 0:
        raise ValueError("Commit not found.")

    output = result.stdout
    lines = output.splitlines()

    # Parse header
    full_hash = lines[0] if lines else ""
    short_hash = lines[1] if len(lines) > 1 else ""
    subject = lines[2] if len(lines) > 2 else ""

    # Find author and date sections
    author = ""
    date = ""
    body_lines = []
    changed_files = []
    in_body = True
    in_files = False

    for i, line in enumerate(lines[3:], start=3):
        if line == "---AUTHOR---":
            in_body = False
            author = lines[i + 1] if i + 1 < len(lines) else ""
        elif line == "---DATE---":
            date = lines[i + 1] if i + 1 < len(lines) else ""
            in_files = True
        elif in_files and line.strip():
            # Parse name-status lines
            parts = line.split("\t")
            if len(parts) >= 2:
                changed_files.append({
                    "status": parts[0],
                    "path": parts[1]
                })
        elif in_body:
            body_lines.append(line)

    return {
        "hash": full_hash,
        "short_hash": short_hash,
        "message": subject,
        "body": "\n".join(body_lines).strip(),
        "author": author,
        "date": date,
        "changed_files": changed_files
    }


def get_remotes(project_name: str) -> List[Dict[str, str]]:
    """List configured remotes."""
    result = _run_git(project_name, ["remote", "-v"], check=False)
    remotes = {}
    for line in result.stdout.strip().splitlines():
        parts = line.split()
        if len(parts) >= 2:
            name = parts[0]
            url = parts[1]
            if name not in remotes:
                remotes[name] = {"name": name, "url": url}
    return list(remotes.values())


def pull(project_name: str) -> Dict[str, Any]:
    """Pull from remote."""
    result = _run_git(project_name, ["pull"], check=False)
    return {
        "success": result.returncode == 0,
        "output": result.stdout.strip(),
        "error": result.stderr.strip() if result.returncode != 0 else ""
    }


def push(project_name: str) -> Dict[str, Any]:
    """Push to remote (never force)."""
    result = _run_git(project_name, ["push"], check=False)
    return {
        "success": result.returncode == 0,
        "output": result.stdout.strip(),
        "error": result.stderr.strip() if result.returncode != 0 else ""
    }
