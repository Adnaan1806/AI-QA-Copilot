import glob
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import uuid
from typing import Optional

from app import config

EXECUTION_TIMEOUT_SECONDS = 60

TRACES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "traces"
)


def _find_trace(output_dir: str) -> Optional[str]:
    matches = glob.glob(os.path.join(output_dir, "**", "trace.zip"), recursive=True)
    return matches[0] if matches else None


def _kill_tree(proc: subprocess.Popen) -> None:
    """Kill pytest and the browser it launched. os.killpg doesn't exist on Windows."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True
        )
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except ProcessLookupError:
        pass


def execute_script(code: str, test_case_id: Optional[str] = None) -> dict:
    with tempfile.TemporaryDirectory() as tmp_dir:
        script_path = os.path.join(tmp_dir, f"test_{uuid.uuid4().hex}.py")
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(code)

        args = [sys.executable, "-m", "pytest", script_path, "-v", "--tb=short", "-q"]
        if not config.PLAYWRIGHT_HEADLESS:
            args.append("--headed")

        trace_output_dir = None
        if test_case_id:
            # Overwrite on each attempt -- only the latest run's trace matters.
            trace_output_dir = os.path.join(TRACES_DIR, str(test_case_id))
            shutil.rmtree(trace_output_dir, ignore_errors=True)
            os.makedirs(trace_output_dir, exist_ok=True)
            args += ["--tracing=on", f"--output={trace_output_dir}"]

        proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            # Windows defaults to cp1252 on both ends of the pipe; force UTF-8 so
            # non-ASCII text in assertions or page content can't crash the run.
            encoding="utf-8",
            errors="replace",
            env={**os.environ, "PYTHONUTF8": "1"},
            start_new_session=True,  # own process group, so a timeout can kill Playwright's browser child too
        )
        try:
            output, _ = proc.communicate(timeout=EXECUTION_TIMEOUT_SECONDS)
            trace_path = _find_trace(trace_output_dir) if trace_output_dir else None
            return {"passed": proc.returncode == 0, "output": output, "trace_path": trace_path}
        except subprocess.TimeoutExpired:
            _kill_tree(proc)
            proc.communicate()
            return {
                "passed": False,
                "output": f"TIMEOUT: script did not finish within {EXECUTION_TIMEOUT_SECONDS}s",
                "trace_path": None,
            }
