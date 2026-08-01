import os
import pty
import select
import signal
import termios
import struct
import fcntl
import asyncio
import logging

logger = logging.getLogger("PTYManager")

class PTYSession:
    def __init__(self, command=None, initial_dir=None, env_overrides=None):
        self.master_fd = None
        self.slave_fd = None
        self.pid = None
        self.command = command  # e.g. ["/root/.local/bin/agy"] or None for shell
        self.env_overrides = env_overrides or {}
        self.buffer = b""
        self.max_buffer_size = 128 * 1024  # 128 KB buffer

        # Set default working directory to ~/projects or fallback to cwd
        default_dir = os.path.expanduser("~/projects")
        if not os.path.exists(default_dir):
            default_dir = os.getcwd()
        self.initial_dir = initial_dir or default_dir

    def start(self):
        """Fork child process attached to pseudo-terminal."""
        master_fd, slave_fd = pty.openpty()
        pid = os.fork()

        if pid == 0:
            # Child process
            os.close(master_fd)
            os.setsid()

            # Set slave as controlling terminal
            fcntl.ioctl(slave_fd, termios.TIOCSCTTY, 0)

            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)

            if slave_fd > 2:
                os.close(slave_fd)

            # Change to initial working directory
            try:
                os.chdir(self.initial_dir)
            except Exception:
                pass

            # Environment setup
            env = dict(os.environ)
            env["TERM"] = "xterm-256color"
            env["COLORTERM"] = "truecolor"
            env.update(self.env_overrides)

            if self.command:
                os.execvpe(self.command[0], self.command, env)
            else:
                shell = env.get("SHELL", "/bin/bash")
                os.execvpe(shell, [shell], env)
        else:
            # Parent process
            os.close(slave_fd)
            self.master_fd = master_fd
            self.pid = pid

            # Set non-blocking master_fd
            flags = fcntl.fcntl(self.master_fd, fcntl.F_GETFL)
            fcntl.fcntl(self.master_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

    def read(self, max_bytes=4096):
        """Read output bytes from master PTY."""
        if self.master_fd is None:
            return b""
        try:
            data = os.read(self.master_fd, max_bytes)
            if data:
                self.buffer += data
                if len(self.buffer) > self.max_buffer_size:
                    self.buffer = self.buffer[-self.max_buffer_size:]
            return data
        except (OSError, BlockingIOError):
            return b""
            
    def get_buffer(self) -> bytes:
        return self.buffer

    def write(self, data: bytes):
        """Write input bytes to master PTY."""
        if self.master_fd is None:
            return
        try:
            os.write(self.master_fd, data)
        except OSError as e:
            logger.error(f"Error writing to PTY: {e}")

    def resize(self, cols: int, rows: int):
        """Resize PTY window size."""
        if self.master_fd is not None:
            try:
                cols = max(1, int(cols))
                rows = max(1, int(rows))
                size = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, size)
            except Exception as e:
                logger.error(f"Error resizing PTY: {e}")

    def terminate(self):
        """Clean up PTY process and close file descriptors."""
        if self.master_fd is not None:
            try:
                os.close(self.master_fd)
            except OSError:
                pass
            self.master_fd = None

        if self.pid is not None:
            try:
                os.killpg(self.pid, signal.SIGTERM)
                os.waitpid(self.pid, os.WNOHANG)
            except OSError:
                pass
            try:
                os.kill(self.pid, signal.SIGKILL)
                os.waitpid(self.pid, 0)
            except OSError:
                pass
            self.pid = None
