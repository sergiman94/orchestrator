"""Script executor with sandboxing, resource limits, and metrics."""

import json
import os
import platform
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from typing import Dict, Optional

from backend.config import SANDBOX_MODE, MAX_MEMORY_MB


@dataclass
class ExecutionMetrics:
    wall_time_seconds: float = 0.0
    cpu_time_seconds: float = 0.0
    peak_memory_mb: float = 0.0


@dataclass
class ExecutionResult:
    stdout: str
    stderr: str
    return_value: str
    success: bool
    metrics: ExecutionMetrics = field(default_factory=ExecutionMetrics)


# Dangerous env vars to strip in sandbox mode
_DANGEROUS_ENV_VARS = {
    "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
    "GOOGLE_APPLICATION_CREDENTIALS", "AZURE_CLIENT_SECRET",
    "DATABASE_URL", "DB_PASSWORD", "SMTP_PASSWORD",
    "JWT_SECRET", "SECRET_KEY", "API_KEY", "PRIVATE_KEY",
}


def _build_env(extra_env: Optional[Dict[str, str]] = None) -> dict:
    """Build the environment dict for the subprocess."""
    if SANDBOX_MODE:
        env = {
            "PATH": "/usr/bin:/bin:/usr/local/bin",
            "HOME": tempfile.gettempdir(),
            "LANG": os.environ.get("LANG", "en_US.UTF-8"),
            "PYTHONPATH": "",
        }
    else:
        env = os.environ.copy()
        # Still strip the most dangerous vars even outside sandbox
        for key in _DANGEROUS_ENV_VARS:
            env.pop(key, None)

    # Inject user-supplied per-job env vars
    if extra_env:
        env.update(extra_env)

    return env


def _get_preexec_fn():
    """Return a preexec_fn that applies resource limits on Unix."""
    if platform.system() == "Windows":
        return None

    def _set_limits():
        import resource
        # Memory limit (RSS)
        mem_bytes = MAX_MEMORY_MB * 1024 * 1024
        try:
            resource.setrlimit(resource.RLIMIT_AS, (mem_bytes, mem_bytes))
        except (ValueError, resource.error):
            pass  # Some platforms don't support RLIMIT_AS

    return _set_limits


def run_script(
    script: str,
    input_data: Optional[str] = None,
    timeout: int = 300,
    env_vars: Optional[Dict[str, str]] = None,
) -> ExecutionResult:
    """
    Execute a Python script in an isolated subprocess.

    For chained steps, INPUT_DATA is injected as a variable containing
    the previous step's return value.

    Args:
        script: The Python script source code to execute.
        input_data: Optional input from a previous chained step.
        timeout: Maximum execution time in seconds.
        env_vars: Optional dict of extra environment variables to inject.
    """
    # Build the full script to execute
    full_script_lines = []

    # Inject INPUT_DATA if provided (for chained steps)
    env = _build_env(env_vars)
    if input_data is not None:
        env["__CRON_INPUT_DATA__"] = input_data
        full_script_lines.append("import os as __os__")
        full_script_lines.append("INPUT_DATA = __os__.environ.get('__CRON_INPUT_DATA__', '')")
        full_script_lines.append("del __os__")

    # Add metrics collection wrapper
    full_script_lines.append("")
    full_script_lines.append("# --- User Script ---")
    full_script_lines.append(script)
    full_script_lines.append("")
    # After user script, emit resource usage as JSON on stderr (tagged line)
    full_script_lines.append("# --- Metrics ---")
    full_script_lines.append("try:")
    full_script_lines.append("    import resource as __res__, json as __json__, sys as __sys__")
    full_script_lines.append("    __usage__ = __res__.getrusage(__res__.RUSAGE_SELF)")
    full_script_lines.append("    __m__ = {'cpu_time': __usage__.ru_utime + __usage__.ru_stime, 'peak_memory_kb': __usage__.ru_maxrss}")
    full_script_lines.append("    print('__METRICS__:' + __json__.dumps(__m__), file=__sys__.stderr)")
    full_script_lines.append("except Exception:")
    full_script_lines.append("    pass")

    full_script = "\n".join(full_script_lines)

    # Choose cwd: temp dir in sandbox, else current directory
    if SANDBOX_MODE:
        cwd = tempfile.mkdtemp(prefix="cron_sandbox_")
    else:
        cwd = os.getcwd()

    # Write script to a temporary file
    with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False) as f:
        f.write(full_script)
        script_path = f.name

    metrics = ExecutionMetrics()
    wall_start = time.monotonic()

    try:
        proc = subprocess.Popen(
            [sys.executable, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=cwd,
            env=env,
            preexec_fn=_get_preexec_fn(),
        )

        try:
            stdout, stderr = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            # Graceful SIGTERM first, then SIGKILL fallback
            proc.terminate()
            try:
                proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.communicate()
            return ExecutionResult(
                stdout="",
                stderr=f"Script timed out after {timeout} seconds",
                return_value="",
                success=False,
                metrics=ExecutionMetrics(wall_time_seconds=round(time.monotonic() - wall_start, 3)),
            )

        wall_time = round(time.monotonic() - wall_start, 3)
        success = proc.returncode == 0

        # Extract metrics from stderr tag
        stderr_lines = []
        for line in stderr.split("\n"):
            if line.startswith("__METRICS__:"):
                try:
                    m = json.loads(line[len("__METRICS__:"):])
                    metrics.cpu_time_seconds = round(m.get("cpu_time", 0), 3)
                    # macOS reports ru_maxrss in bytes, Linux in KB
                    peak_kb = m.get("peak_memory_kb", 0)
                    if platform.system() == "Darwin":
                        metrics.peak_memory_mb = round(peak_kb / (1024 * 1024), 2)
                    else:
                        metrics.peak_memory_mb = round(peak_kb / 1024, 2)
                except (json.JSONDecodeError, TypeError):
                    pass
            else:
                stderr_lines.append(line)
        stderr_clean = "\n".join(stderr_lines)
        metrics.wall_time_seconds = wall_time

        # Try to extract return value: last non-empty line of stdout
        return_value = ""
        if stdout.strip():
            lines = stdout.strip().split("\n")
            return_value = lines[-1]

        return ExecutionResult(
            stdout=stdout,
            stderr=stderr_clean,
            return_value=return_value,
            success=success,
            metrics=metrics,
        )

    except Exception as e:
        return ExecutionResult(
            stdout="",
            stderr=str(e),
            return_value="",
            success=False,
            metrics=ExecutionMetrics(wall_time_seconds=round(time.monotonic() - wall_start, 3)),
        )
    finally:
        try:
            os.unlink(script_path)
        except OSError:
            pass
        # Clean up sandbox temp dir
        if SANDBOX_MODE and cwd.startswith(tempfile.gettempdir()):
            import shutil
            shutil.rmtree(cwd, ignore_errors=True)
