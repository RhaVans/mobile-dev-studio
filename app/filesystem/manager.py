import os
import shutil
import re
from typing import List, Dict, Any, Optional

BASE_PROJECTS_DIR = os.path.realpath(os.path.expanduser("~/projects"))
MAX_FILE_SIZE = 2 * 1024 * 1024  # 2MB Limit for text editor

TEXT_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx", ".html", ".css", ".json", ".md",
    ".txt", ".yaml", ".yml", ".toml", ".xml", ".sh", ".sql", ".java",
    ".c", ".cpp", ".h", ".hpp", ".rs", ".go", ".ini", ".env", ".gitignore"
}


def validate_project_name(name: str) -> str:
    """Validate project directory name."""
    if not name or not name.strip():
        raise ValueError("Project name cannot be empty.")
    name = name.strip()
    if re.search(r'[\\/:*?"<>|]|\.\.', name):
        raise ValueError("Invalid project name.")
    return name


def get_project_dir(project_name: str) -> str:
    """Resolve and validate a project's root path inside ~/projects."""
    name = validate_project_name(project_name)
    target_path = os.path.realpath(os.path.join(BASE_PROJECTS_DIR, name))
    if not target_path.startswith(BASE_PROJECTS_DIR + os.sep) and target_path != BASE_PROJECTS_DIR:
        raise ValueError("Access denied: Path escapes project root boundary.")
    return target_path


def validate_relative_path(project_name: str, rel_path: str) -> str:
    """Resolve and validate any relative file/folder path inside a project."""
    proj_dir = get_project_dir(project_name)
    clean_rel = rel_path.lstrip("/").lstrip("\\")
    target_path = os.path.realpath(os.path.join(proj_dir, clean_rel))

    if not target_path.startswith(proj_dir + os.sep) and target_path != proj_dir:
        raise ValueError("Access denied: Path escapes project boundary.")

    return target_path


def list_projects() -> List[Dict[str, Any]]:
    """List all project directories in ~/projects."""
    if not os.path.exists(BASE_PROJECTS_DIR):
        os.makedirs(BASE_PROJECTS_DIR, exist_ok=True)

    projects = []
    for item in os.listdir(BASE_PROJECTS_DIR):
        full_path = os.path.join(BASE_PROJECTS_DIR, item)
        if os.path.isdir(full_path) and not item.startswith("."):
            stat = os.stat(full_path)
            projects.append({
                "name": item,
                "path": full_path,
                "mtime": stat.st_mtime
            })
    projects.sort(key=lambda x: x["name"])
    return projects


def create_project(name: str) -> Dict[str, Any]:
    """Create a new project directory in ~/projects."""
    target_path = get_project_dir(name)
    if os.path.exists(target_path):
        raise ValueError(f"Project '{name}' already exists.")
    os.makedirs(target_path, exist_ok=True)
    return {"name": name, "path": target_path}


def get_dir_tree(project_name: str, sub_path: str = "") -> List[Dict[str, Any]]:
    """List files and folders in a given project directory path."""
    target_dir = validate_relative_path(project_name, sub_path)
    if not os.path.isdir(target_dir):
        raise ValueError("Target is not a directory.")

    items = []
    proj_dir = get_project_dir(project_name)

    for entry in os.listdir(target_dir):
        if entry.startswith(".venv") or entry == ".git":
            continue
        full_entry = os.path.join(target_dir, entry)
        rel_entry = os.path.relpath(full_entry, proj_dir)
        is_dir = os.path.isdir(full_entry)

        stat = os.stat(full_entry)
        items.append({
            "name": entry,
            "rel_path": rel_entry,
            "is_dir": is_dir,
            "size": stat.st_size if not is_dir else 0,
            "mtime": stat.st_mtime
        })

    # Sort directories first, then files alphabetically
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return items


def is_binary_file(filepath: str) -> bool:
    """Check if file is binary by extension and byte inspection."""
    _, ext = os.path.splitext(filepath)
    if ext.lower() in TEXT_EXTENSIONS:
        return False

    try:
        with open(filepath, "rb") as f:
            chunk = f.read(1024)
            if b"\x00" in chunk:
                return True
    except Exception:
        pass
    return False


def read_file_content(project_name: str, rel_path: str) -> Dict[str, Any]:
    """Read file content safely with size limit and binary checks."""
    file_path = validate_relative_path(project_name, rel_path)
    if not os.path.isfile(file_path):
        raise ValueError("File not found.")

    stat = os.stat(file_path)
    if stat.st_size > MAX_FILE_SIZE:
        raise ValueError("File is too large to open in the editor (limit 2MB).")

    if is_binary_file(file_path):
        return {
            "rel_path": rel_path,
            "is_binary": True,
            "content": None,
            "mtime": stat.st_mtime,
            "size": stat.st_size
        }

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    return {
        "rel_path": rel_path,
        "is_binary": False,
        "content": content,
        "mtime": stat.st_mtime,
        "size": stat.st_size
    }


def write_file_content(project_name: str, rel_path: str, content: str, expected_mtime: Optional[float] = None) -> Dict[str, Any]:
    """Write text file content safely with optional external modification check."""
    file_path = validate_relative_path(project_name, rel_path)

    if os.path.exists(file_path):
        stat = os.stat(file_path)
        if expected_mtime is not None and abs(stat.st_mtime - expected_mtime) > 0.5:
            # File modified externally
            return {
                "conflict": True,
                "message": "File was modified externally on disk.",
                "disk_mtime": stat.st_mtime
            }

    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

    new_stat = os.stat(file_path)
    return {
        "conflict": False,
        "rel_path": rel_path,
        "mtime": new_stat.st_mtime,
        "size": new_stat.st_size
    }


def create_fs_item(project_name: str, rel_path: str, item_type: str = "file") -> Dict[str, Any]:
    """Create a new file or directory inside project."""
    target_path = validate_relative_path(project_name, rel_path)
    if os.path.exists(target_path):
        raise ValueError("File or folder already exists.")

    if item_type == "dir":
        os.makedirs(target_path, exist_ok=True)
    else:
        os.makedirs(os.path.dirname(target_path), exist_ok=True)
        with open(target_path, "w", encoding="utf-8") as f:
            f.write("")

    return {"rel_path": rel_path, "type": item_type}


def rename_fs_item(project_name: str, old_rel_path: str, new_rel_path: str) -> Dict[str, Any]:
    """Rename a file or folder safely within project boundaries."""
    old_path = validate_relative_path(project_name, old_rel_path)
    new_path = validate_relative_path(project_name, new_rel_path)

    if not os.path.exists(old_path):
        raise ValueError("Source file or directory does not exist.")
    if os.path.exists(new_path):
        raise ValueError("Destination name already exists.")

    os.makedirs(os.path.dirname(new_path), exist_ok=True)
    os.rename(old_path, new_path)
    return {"old_rel_path": old_rel_path, "new_rel_path": new_rel_path}


def delete_fs_item(project_name: str, rel_path: str) -> Dict[str, Any]:
    """Delete a file or directory safely."""
    target_path = validate_relative_path(project_name, rel_path)
    if not os.path.exists(target_path):
        raise ValueError("Target file or directory does not exist.")

    if os.path.isdir(target_path):
        shutil.rmtree(target_path)
    else:
        os.remove(target_path)

    return {"rel_path": rel_path, "deleted": True}
