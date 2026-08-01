#!/usr/bin/env python3
import sys
import os
import urllib.request
import json

def main():
    cmd = os.path.basename(sys.argv[0])
    args = sys.argv[1:]
    cwd = os.getcwd()
    
    payload = json.dumps({
        "command": cmd,
        "args": args,
        "cwd": cwd
    }).encode("utf-8")
    
    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/agent/intercept",
        data=payload,
        headers={"Content-Type": "application/json"}
    )
    
    try:
        resp = urllib.request.urlopen(req, timeout=86400)
        data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        sys.stderr.write(f"\\n[Mobile Dev Studio] Interceptor error: {e}\\n")
        sys.exit(126)
        
    if not data.get("approved", False):
        sys.stderr.write("\\n[Mobile Dev Studio] ACTION REJECTED by user.\\n")
        sys.exit(130)
        
    original_path = os.environ.get("PATH", "")
    interceptor_dir = os.path.dirname(os.path.abspath(__file__))
    
    path_dirs = original_path.split(os.pathsep)
    if interceptor_dir in path_dirs:
        path_dirs.remove(interceptor_dir)
        
    real_bin = None
    for d in path_dirs:
        candidate = os.path.join(d, cmd)
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            real_bin = candidate
            break
            
    if not real_bin:
        sys.stderr.write(f"\\n[Mobile Dev Studio] Error: Cannot find real binary for '{cmd}' in original PATH.\\n")
        sys.exit(127)
        
    env = dict(os.environ)
    env["PATH"] = os.pathsep.join(path_dirs)
    
    try:
        os.execvpe(real_bin, [real_bin] + args, env)
    except Exception as e:
        sys.stderr.write(f"\\n[Mobile Dev Studio] Failed to execute real binary: {e}\\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
