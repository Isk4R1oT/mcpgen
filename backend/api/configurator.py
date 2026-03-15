"""Chat-first configurator API — replaces wizard flow.

User flow:
1. POST /api/configure/start — upload spec or URL, get initial greeting
2. POST /api/configure/{job_id}/chat — conversation to configure auth + endpoints
3. When agent returns ready_to_generate=true → auto-triggers pipeline
"""

import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from backend.agents.configurator_agent import (
    ConfiguratorResponse,
    create_configurator_agent,
    build_configurator_prompt,
)
from backend.config import Settings
from backend.db.store import (
    create_job,
    get_job,
    save_job_config,
    save_chat_message,
    update_job_status,
)
from backend.pipeline.parser import (
    extract_endpoints_from_spec,
    parse_openapi_from_file,
)
from backend.services.spec_fetcher import fetch_url_content, parse_content_to_spec

router = APIRouter(prefix="/configure", tags=["configurator"])

# In-memory chat state per job
_chat_states: dict[str, dict] = {}


class UrlStartInput(BaseModel):
    url: str


class ChatInput(BaseModel):
    message: str


@router.post("/start/upload")
async def start_with_upload(file: UploadFile) -> dict:
    """Start configuration flow by uploading a spec file."""
    content = await file.read()
    filename = file.filename or "spec.yaml"
    ext = Path(filename).suffix.lower()

    with NamedTemporaryFile(suffix=ext, delete=False, mode="wb") as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        parsed_spec = parse_openapi_from_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    endpoints = extract_endpoints_from_spec(parsed_spec)
    input_type = "openapi_yaml" if ext in (".yaml", ".yml") else "openapi_json"
    job_id = create_job(parsed_spec, endpoints, input_type)

    return await _init_chat(job_id, parsed_spec, endpoints)


@router.post("/start/url")
async def start_with_url(payload: UrlStartInput) -> dict:
    """Start configuration flow from a Swagger/API URL."""
    try:
        content, content_type = await fetch_url_content(payload.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e}")

    if content_type in ("openapi_json", "openapi_yaml"):
        parsed_spec = parse_content_to_spec(content, content_type)
        endpoints = extract_endpoints_from_spec(parsed_spec)
        job_id = create_job(parsed_spec, endpoints, content_type)
        return await _init_chat(job_id, parsed_spec, endpoints)

    raise HTTPException(
        status_code=400,
        detail="Could not find OpenAPI spec at this URL. Try the direct openapi.json URL.",
    )


@router.post("/{job_id}/chat")
async def configurator_chat(job_id: str, payload: ChatInput) -> dict:
    """Chat with the configurator agent."""
    job = get_job(job_id)
    state = _chat_states.get(job_id)
    if not state:
        raise HTTPException(status_code=400, detail="Start a configuration session first")

    settings = Settings()
    agent = create_configurator_agent(
        api_key=settings.openrouter_api_key,
        model_name=settings.openrouter_model,
    )

    prompt = build_configurator_prompt(
        endpoints=state["endpoints"],
        auth_schemes=state.get("auth_schemes", []),
        user_message=payload.message,
        chat_history=state["history"],
        current_config=state["config"],
    )

    result = await agent.run(prompt)
    response: ConfiguratorResponse = result.output

    # Update state from response
    if response.auth_type:
        state["config"]["auth_strategy"] = {
            "type": response.auth_type,
            "header_name": response.auth_header,
            "prefix": response.auth_prefix,
            "env_var_name": response.auth_env_var,
        }
    if response.selected_endpoint_ids:
        state["config"]["selected_endpoints"] = response.selected_endpoint_ids
    if response.server_name:
        state["config"]["server_name"] = response.server_name

    # Save history
    state["history"].append({"role": "user", "content": payload.message})
    state["history"].append({"role": "assistant", "content": response.message})
    save_chat_message(job_id, "user", payload.message)
    save_chat_message(job_id, "assistant", response.message)

    # If ready — save config and trigger generation
    if response.ready_to_generate:
        save_job_config(job_id, state["config"])

        # Auto-trigger pipeline in background
        from backend.pipeline.orchestrator import run_pipeline
        import asyncio
        asyncio.create_task(run_pipeline(job_id, settings))

    return {
        "message": response.message,
        "phase": response.phase,
        "config": state["config"],
        "ready_to_generate": response.ready_to_generate,
        "job_id": job_id,
    }


@router.get("/{job_id}/state")
async def get_config_state(job_id: str) -> dict:
    """Get current configuration state."""
    get_job(job_id)
    state = _chat_states.get(job_id, {})
    return {
        "job_id": job_id,
        "config": state.get("config", {}),
        "history": state.get("history", []),
        "endpoints_count": len(state.get("endpoints", [])),
    }


async def _init_chat(job_id: str, parsed_spec, endpoints) -> dict:
    """Initialize chat state and get first greeting from agent."""
    settings = Settings()
    agent = create_configurator_agent(
        api_key=settings.openrouter_api_key,
        model_name=settings.openrouter_model,
    )

    _chat_states[job_id] = {
        "endpoints": endpoints,
        "auth_schemes": parsed_spec.auth_schemes,
        "config": {},
        "history": [],
    }

    prompt = build_configurator_prompt(
        endpoints=endpoints,
        auth_schemes=parsed_spec.auth_schemes,
        user_message="I just uploaded my API spec. Help me create an MCP server.",
        chat_history=[],
        current_config={},
    )

    result = await agent.run(prompt)
    response: ConfiguratorResponse = result.output

    _chat_states[job_id]["history"].append(
        {"role": "assistant", "content": response.message}
    )

    return {
        "job_id": job_id,
        "message": response.message,
        "phase": response.phase,
        "endpoints_count": len(endpoints),
        "config": {},
    }
