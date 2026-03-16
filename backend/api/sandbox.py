"""Sandbox API — run, test, and debug generated MCP servers.

Flow:
1. POST /api/sandbox/{job_id}/start — build and start MCP server in Docker
2. POST /api/sandbox/{job_id}/test — send a message, agent uses MCP tools
3. POST /api/sandbox/{job_id}/debug — fix code if something is broken
4. GET  /api/sandbox/{job_id}/logs — view container logs
5. DELETE /api/sandbox/{job_id} — stop and cleanup
"""

import asyncio

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.agents.debugger_agent import create_debugger_agent, build_debug_prompt, CodeFix
from backend.agents.tester_agent import run_test
from backend.config import Settings
from backend.db.store import get_job, save_generated_server
from backend.services.sandbox import (
    start_sandbox,
    stop_sandbox,
    get_sandbox,
    get_sandbox_logs,
    wait_for_healthy,
)

router = APIRouter(prefix="/sandbox", tags=["sandbox"])


class StartInput(BaseModel):
    env_vars: dict[str, str]  # {"API_TOKEN": "xxx", "BASE_URL": "https://..."}


class TestInput(BaseModel):
    message: str


class DebugInput(BaseModel):
    error_description: str
    failed_tool: str | None = None


@router.post("/{job_id}/start")
async def start_sandbox_endpoint(job_id: str, payload: StartInput) -> dict:
    """Build and start the generated MCP server in a Docker container."""
    job = get_job(job_id)

    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail="Job must be completed first")

    generated = job.get("generated_server")
    if not generated:
        raise HTTPException(status_code=404, detail="No generated server found")

    server_py = next((f for f in generated.files if f.filename == "server.py"), generated.files[0])

    try:
        sandbox = start_sandbox(
            job_id=job_id,
            server_code=server_py.content,
            requirements=generated.requirements,
            env_vars=payload.env_vars,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start sandbox: {e}")

    # Wait for server to be healthy
    healthy = await wait_for_healthy(job_id, timeout=30)

    return {
        "job_id": job_id,
        "container_id": sandbox.container_id[:12],
        "mcp_url": sandbox.mcp_url,
        "port": sandbox.port,
        "status": "running" if healthy else "starting",
        "healthy": healthy,
    }


@router.post("/{job_id}/test")
async def test_sandbox_endpoint(job_id: str, payload: TestInput) -> dict:
    """Send a message to the LLM agent connected to the sandbox MCP server."""
    sandbox = get_sandbox(job_id)
    if not sandbox:
        raise HTTPException(status_code=404, detail="No sandbox running. Start one first.")

    # Recheck health if not running yet
    if sandbox.status != "running":
        healthy = await wait_for_healthy(job_id, timeout=15)
        if not healthy:
            raise HTTPException(status_code=400, detail=f"Sandbox not ready: {sandbox.status}")

    settings = Settings()
    result = await run_test(
        api_key=settings.openrouter_api_key,
        model_name=settings.openrouter_model,
        mcp_url=sandbox.mcp_url,
        user_message=payload.message,
    )

    return {
        "response": result.response,
        "tool_calls": result.tool_calls,
        "success": result.success,
        "error": result.error,
    }


@router.post("/{job_id}/debug")
async def debug_sandbox_endpoint(job_id: str, payload: DebugInput) -> dict:
    """Use the debugger agent to fix the MCP server code."""
    job = get_job(job_id)
    generated = job.get("generated_server")
    if not generated:
        raise HTTPException(status_code=404, detail="No generated server found")

    server_py = next((f for f in generated.files if f.filename == "server.py"), generated.files[0])
    logs = get_sandbox_logs(job_id, tail=50)

    settings = Settings()
    agent = create_debugger_agent(
        api_key=settings.openrouter_api_key,
        model_name=settings.openrouter_model,
    )

    prompt = build_debug_prompt(
        server_code=server_py.content,
        error_message=payload.error_description,
        server_logs=logs,
        tool_name=payload.failed_tool,
        user_context=payload.error_description,
    )

    result = await agent.run(prompt)
    fix: CodeFix = result.output

    # Update the generated server with the fix
    from backend.agents.models import GeneratedFile
    fixed_files = []
    for f in generated.files:
        if f.filename == "server.py":
            fixed_files.append(GeneratedFile(
                filename="server.py",
                content=fix.fixed_server_py,
                description=f.description,
            ))
        else:
            fixed_files.append(f)

    from backend.agents.models import GeneratedServer
    fixed_server = GeneratedServer(
        files=fixed_files,
        requirements=generated.requirements,
        env_vars=generated.env_vars,
        startup_command=generated.startup_command,
    )

    # Save fixed version
    save_generated_server(job_id, fixed_server, {"fixed": True, "diagnosis": fix.diagnosis})

    # Restart sandbox with fixed code
    sandbox = get_sandbox(job_id)
    if sandbox:
        env_vars_backup = {}
        try:
            import docker
            client = docker.from_env()
            container = client.containers.get(sandbox.container_id)
            env_vars_backup = dict(e.split("=", 1) for e in (container.attrs.get("Config", {}).get("Env", [])) if "=" in e)
        except Exception:
            pass

        stop_sandbox(job_id)
        start_sandbox(
            job_id=job_id,
            server_code=fix.fixed_server_py,
            requirements=generated.requirements,
            env_vars=env_vars_backup,
        )
        await wait_for_healthy(job_id, timeout=30)

    return {
        "diagnosis": fix.diagnosis,
        "changes_summary": fix.changes_summary,
        "sandbox_restarted": True,
        "fixed_code_preview": fix.fixed_server_py[:500] + "...",
    }


@router.get("/{job_id}/logs")
async def sandbox_logs_endpoint(job_id: str) -> dict:
    """Get sandbox container logs."""
    logs = get_sandbox_logs(job_id, tail=100)
    return {"logs": logs}


@router.get("/{job_id}/status")
async def sandbox_status_endpoint(job_id: str) -> dict:
    """Get sandbox status."""
    sandbox = get_sandbox(job_id)
    if not sandbox:
        return {"status": "not_running", "mcp_url": None}
    return {
        "status": sandbox.status,
        "mcp_url": sandbox.mcp_url,
        "port": sandbox.port,
        "container_id": sandbox.container_id[:12],
    }


@router.delete("/{job_id}")
async def stop_sandbox_endpoint(job_id: str) -> dict:
    """Stop and remove sandbox container."""
    stop_sandbox(job_id)
    return {"status": "stopped"}
