"""Sandbox service — manages Docker containers for testing generated MCP servers.

Each generated MCP server runs in its own container with:
- Unique port assignment
- User-provided env vars (API tokens, etc.)
- Auto-cleanup after timeout
"""

import asyncio
import docker
from dataclasses import dataclass


@dataclass
class SandboxInstance:
    container_id: str
    container_name: str
    port: int
    mcp_url: str
    status: str  # "starting", "running", "stopped", "error"
    job_id: str


# Track running sandboxes
_sandboxes: dict[str, SandboxInstance] = {}

# Port range for sandbox containers
_next_port = 9100


def _allocate_port() -> int:
    global _next_port
    port = _next_port
    _next_port += 1
    if _next_port > 9200:
        _next_port = 9100
    return port


def start_sandbox(
    job_id: str,
    server_code: str,
    requirements: list[str],
    env_vars: dict[str, str],
) -> SandboxInstance:
    """Build and start a Docker container with the generated MCP server.

    Args:
        job_id: The job ID for tracking
        server_code: Contents of server.py
        requirements: List of pip requirements
        env_vars: Environment variables (API tokens, base URL, etc.)

    Returns:
        SandboxInstance with connection details
    """
    # Stop existing sandbox for this job if any
    if job_id in _sandboxes:
        stop_sandbox(job_id)

    port = _allocate_port()
    container_name = f"mcpgen-sandbox-{job_id[:8]}"

    client = docker.from_env()

    # Create Dockerfile content
    dockerfile = f"""FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir {' '.join(requirements)}
COPY server.py .
EXPOSE 8000
CMD ["python", "server.py"]
"""

    # Build image using docker-py with a temp directory
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        (tmp_path / "Dockerfile").write_text(dockerfile)
        (tmp_path / "server.py").write_text(server_code)

        image, _ = client.images.build(path=str(tmp_path), tag=f"mcpgen-sandbox:{job_id[:8]}", rm=True)

    # Run container — attach to mcpgen Docker Compose network if available
    network_name = None
    try:
        for net in client.networks.list():
            if "mcpgen" in net.name:
                network_name = net.name
                break
    except Exception:
        pass

    run_kwargs: dict = {
        "name": container_name,
        "ports": {"8000/tcp": port},
        "environment": env_vars,
        "detach": True,
        "remove": False,
    }
    if network_name:
        run_kwargs["network"] = network_name

    container = client.containers.run(image.id, **run_kwargs)

    # MCP URL: use container name if on same network, else localhost
    if network_name:
        mcp_host = container_name
    else:
        mcp_host = "localhost"

    sandbox = SandboxInstance(
        container_id=container.id,
        container_name=container_name,
        port=port,
        mcp_url=f"http://{mcp_host}:{8000 if network_name else port}/mcp",
        status="starting",
        job_id=job_id,
    )
    _sandboxes[job_id] = sandbox

    return sandbox


def stop_sandbox(job_id: str) -> None:
    """Stop and remove a sandbox container."""
    sandbox = _sandboxes.get(job_id)
    if not sandbox:
        return

    try:
        client = docker.from_env()
        container = client.containers.get(sandbox.container_id)
        container.stop(timeout=5)
        container.remove(force=True)
    except Exception:
        pass

    del _sandboxes[job_id]


def get_sandbox(job_id: str) -> SandboxInstance | None:
    """Get sandbox info for a job."""
    return _sandboxes.get(job_id)


def get_sandbox_logs(job_id: str, tail: int) -> str:
    """Get container logs for debugging."""
    sandbox = _sandboxes.get(job_id)
    if not sandbox:
        return "No sandbox found"

    try:
        client = docker.from_env()
        container = client.containers.get(sandbox.container_id)
        return container.logs(tail=tail).decode("utf-8", errors="replace")
    except Exception as e:
        return f"Error getting logs: {e}"


async def wait_for_healthy(job_id: str, timeout: int) -> bool:
    """Wait for the sandbox MCP server to become healthy."""
    import httpx

    sandbox = _sandboxes.get(job_id)
    if not sandbox:
        return False

    # Try both the container URL and localhost
    urls_to_try = [sandbox.mcp_url, f"http://localhost:{sandbox.port}/mcp"]

    for _ in range(timeout):
        for url in urls_to_try:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(url, timeout=2.0)
                    if resp.status_code in (200, 404, 405, 406):
                        sandbox.status = "running"
                        return True
            except Exception:
                pass
        await asyncio.sleep(1)

    sandbox.status = "error"
    return False
