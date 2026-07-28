import os
import signal
import subprocess
import sys
import tempfile
import uuid

EXECUTION_TIMEOUT_SECONDS = 60


def execute_script(code: str) -> dict:
    with tempfile.TemporaryDirectory() as tmp_dir:
        script_path = os.path.join(tmp_dir, f"test_{uuid.uuid4().hex}.py")
        with open(script_path, "w") as f:
            f.write(code)

        proc = subprocess.Popen(
            [sys.executable, "-m", "pytest", script_path, "-v", "--tb=short", "-q"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,  # own process group, so a timeout can kill Playwright's browser child too
        )
        try:
            output, _ = proc.communicate(timeout=EXECUTION_TIMEOUT_SECONDS)
            return {"passed": proc.returncode == 0, "output": output}
        except subprocess.TimeoutExpired:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.communicate()
            return {
                "passed": False,
                "output": f"TIMEOUT: script did not finish within {EXECUTION_TIMEOUT_SECONDS}s",
            }
