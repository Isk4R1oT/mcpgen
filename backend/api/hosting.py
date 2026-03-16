"""Hosting API — host MCP servers and provide connection URLs.

Users get 3 options:
1. Download source code (.tar.gz)
2. Download Docker image info (build instructions)
3. Hosted MCP — we run it, user gets a connection URL

For hosted MCP, we run the container and expose it via a URL.
The user can configure Claude Desktop, Cursor, etc. to connect to it.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.db.store import get_job
from backend.services.sandbox import get_sandbox, start_sandbox, wait_for_healthy

router = APIRouter(prefix="/hosting", tags=["hosting"])


class HostInput(BaseModel):
    env_vars: dict[str, str]


@router.post("/{job_id}/deploy")
async def deploy_hosted_mcp(job_id: str, payload: HostInput) -> dict:
    """Deploy the generated MCP server as a hosted service.

    Returns the MCP connection URL that can be used in:
    - Claude Desktop: Settings → Connectors → Custom → URL
    - Cursor: MCP settings
    - Any MCP client via Streamable HTTP
    """
    job = get_job(job_id)
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed")

    generated = job.get("generated_server")
    if not generated:
        raise HTTPException(status_code=404, detail="No generated server")

    server_py = next((f for f in generated.files if f.filename == "server.py"), generated.files[0])

    sandbox = start_sandbox(
        job_id=job_id,
        server_code=server_py.content,
        requirements=generated.requirements,
        env_vars=payload.env_vars,
    )

    healthy = await wait_for_healthy(job_id, timeout=30)
    if not healthy:
        return {
            "status": "error",
            "detail": "Server failed to start. Check logs at /api/sandbox/{job_id}/logs",
        }

    # For local deployment, the URL is localhost
    # For production, this would be a public URL behind a reverse proxy
    mcp_url = sandbox.mcp_url
    analysis = job.get("analysis")
    server_name = "mcp-server"
    if analysis:
        server_name = analysis.server_name

    return {
        "status": "running",
        "mcp_url": mcp_url,
        "server_name": server_name,
        "port": sandbox.port,
        "connection_configs": {
            "claude_desktop": {
                "description": "Add to Claude Desktop → Settings → Connectors",
                "url": mcp_url,
            },
            "cursor": {
                "description": "Add to Cursor MCP settings",
                "config": {
                    "mcpServers": {
                        server_name: {
                            "url": mcp_url,
                        }
                    }
                },
            },
            "claude_code": {
                "description": "Add to .claude/settings.json",
                "config": {
                    "mcpServers": {
                        server_name: {
                            "type": "url",
                            "url": mcp_url,
                        }
                    }
                },
            },
            "generic": {
                "description": "Connect any MCP client via Streamable HTTP",
                "url": mcp_url,
                "transport": "streamable-http",
            },
        },
        "delivery_options": {
            "hosted": {
                "description": "We host it — use the connection URL above",
                "mcp_url": mcp_url,
            },
            "download_source": {
                "description": "Download source code and build yourself",
                "url": f"/api/jobs/{job_id}/artifacts/source",
            },
            "docker_build": {
                "description": "Build Docker image from source",
                "instructions": f"curl -o server.tar.gz /api/jobs/{job_id}/artifacts/source && tar xzf server.tar.gz && cd {server_name} && docker build -t {server_name} . && docker run -p 8000:8000 --env-file .env {server_name}",
            },
        },
    }


@router.get("/{job_id}/connection-info")
async def get_connection_info(job_id: str) -> dict:
    """Get connection info for a hosted MCP server."""
    sandbox = get_sandbox(job_id)
    if not sandbox:
        return {"status": "not_deployed"}

    job = get_job(job_id)
    analysis = job.get("analysis")
    server_name = analysis.server_name if analysis else "mcp-server"

    return {
        "status": sandbox.status,
        "mcp_url": sandbox.mcp_url,
        "server_name": server_name,
    }
