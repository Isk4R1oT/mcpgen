"""Unified job store — in-memory cache + Supabase persistence.

In-memory store is the primary interface during request lifecycle.
Supabase is used for persistence across server restarts.
"""

import json
from dataclasses import asdict

from fastapi import HTTPException

from backend.agents.models import AnalysisResult, GeneratedServer
from backend.pipeline.parser import ParsedSpec, ParsedEndpoint, extract_endpoints_from_spec


# In-memory cache (fast access during pipeline execution)
_jobs_cache: dict[str, dict] = {}


def _get_supabase():
    """Lazy import — returns None if Supabase is not configured or unreachable."""
    try:
        from backend.config import Settings
        settings = Settings()
        # Only connect if real Supabase URL (not test values)
        if "test" in settings.supabase_url or not settings.supabase_url.startswith("https://"):
            return None
        from backend.db.client import get_supabase_client
        return get_supabase_client()
    except Exception:
        return None


def get_job(job_id: str) -> dict:
    """Get job from cache, fallback to Supabase."""
    if job_id in _jobs_cache:
        return _jobs_cache[job_id]

    # Try Supabase
    sb = _get_supabase()
    if sb:
        result = sb.table("jobs").select("*").eq("id", job_id).execute()
        if result.data:
            job = _hydrate_job_from_db(result.data[0])
            _jobs_cache[job_id] = job
            return job

    raise HTTPException(status_code=404, detail=f"Job {job_id} not found")


def create_job(
    parsed_spec: ParsedSpec,
    endpoints: list[ParsedEndpoint],
    input_type: str,
) -> str:
    """Create a job in cache and Supabase."""
    import uuid
    job_id = str(uuid.uuid4())

    job = {
        "id": job_id,
        "status": "pending",
        "input_type": input_type,
        "parsed_spec": parsed_spec,
        "endpoints": endpoints,
    }
    _jobs_cache[job_id] = job

    # Persist to Supabase
    sb = _get_supabase()
    if sb:
        sb.table("jobs").insert({
            "id": job_id,
            "input_type": input_type,
            "input_ref": f"memory://{job_id}",
            "status": "pending",
        }).execute()

        # Save parsed spec
        sb.table("parsed_specs").insert({
            "job_id": job_id,
            "title": parsed_spec.title,
            "base_url": parsed_spec.base_url,
            "auth_schemes": parsed_spec.auth_schemes,
            "endpoints": parsed_spec.endpoints,
            "raw_spec": parsed_spec.raw_spec,
        }).execute()

    return job_id


def update_job_status(job_id: str, status: str, error_message: str | None) -> None:
    """Update job status in cache and Supabase."""
    if job_id in _jobs_cache:
        _jobs_cache[job_id]["status"] = status
        if error_message:
            _jobs_cache[job_id]["error_message"] = error_message

    sb = _get_supabase()
    if sb:
        data: dict = {"status": status}
        if error_message:
            data["error_message"] = error_message
        sb.table("jobs").update(data).eq("id", job_id).execute()


def save_job_config(job_id: str, config: dict) -> None:
    """Save job configuration."""
    if job_id in _jobs_cache:
        _jobs_cache[job_id]["config"] = config
        _jobs_cache[job_id]["status"] = "configured"

    sb = _get_supabase()
    if sb:
        sb.table("jobs").update({
            "config": config,
            "status": "configured",
        }).eq("id", job_id).execute()


def save_analysis(job_id: str, analysis: AnalysisResult) -> None:
    """Save analysis result to cache."""
    if job_id in _jobs_cache:
        _jobs_cache[job_id]["analysis"] = analysis


def save_generated_server(job_id: str, generated: GeneratedServer, validation: dict) -> None:
    """Save generated server to cache and Supabase."""
    if job_id in _jobs_cache:
        _jobs_cache[job_id]["generated_server"] = generated
        _jobs_cache[job_id]["validation"] = validation

    sb = _get_supabase()
    if sb:
        server_py = next((f for f in generated.files if f.filename == "server.py"), generated.files[0])
        sb.table("generated_servers").insert({
            "job_id": job_id,
            "server_code": server_py.content,
            "requirements_txt": "\n".join(generated.requirements),
            "dockerfile": "FROM python:3.12-slim\n...",
            "tool_manifest": [
                {"name": f.filename, "description": f.description}
                for f in generated.files
            ],
            "validation_result": validation,
        }).execute()


def save_chat_message(job_id: str, role: str, content: str) -> None:
    """Save chat message to Supabase."""
    sb = _get_supabase()
    if sb:
        sb.table("chat_messages").insert({
            "job_id": job_id,
            "role": role,
            "content": content,
        }).execute()


def get_chat_history(job_id: str) -> list[dict]:
    """Get chat history from Supabase or in-memory."""
    sb = _get_supabase()
    if sb:
        result = (
            sb.table("chat_messages")
            .select("role,content,created_at")
            .eq("job_id", job_id)
            .order("created_at")
            .execute()
        )
        return result.data

    return []


def _hydrate_job_from_db(row: dict) -> dict:
    """Convert a Supabase jobs row into the in-memory job format."""
    job = {
        "id": row["id"],
        "status": row["status"],
        "input_type": row.get("input_type"),
        "config": row.get("config"),
        "error_message": row.get("error_message"),
    }
    return job


def clear_cache() -> None:
    """Clear in-memory cache (for testing)."""
    _jobs_cache.clear()
