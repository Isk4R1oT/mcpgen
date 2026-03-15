"""CRUD operations for Supabase tables."""

import json
from datetime import datetime, timezone
from uuid import UUID

from backend.db.client import get_supabase_client


# ============================================================================
# Jobs
# ============================================================================

def create_job(input_type: str, input_ref: str) -> dict:
    """Create a new job record."""
    client = get_supabase_client()
    result = client.table("jobs").insert({
        "input_type": input_type,
        "input_ref": input_ref,
        "status": "pending",
    }).execute()
    return result.data[0]


def update_job_status(job_id: str, status: str, error_message: str | None) -> dict:
    """Update job status."""
    data: dict = {"status": status}
    if error_message is not None:
        data["error_message"] = error_message
    client = get_supabase_client()
    result = client.table("jobs").update(data).eq("id", job_id).execute()
    return result.data[0]


def update_job_artifacts(
    job_id: str,
    docker_image_tag: str | None,
    source_archive_path: str | None,
    config: dict | None,
) -> dict:
    """Update job with artifact info."""
    data: dict = {}
    if docker_image_tag is not None:
        data["docker_image_tag"] = docker_image_tag
    if source_archive_path is not None:
        data["source_archive_path"] = source_archive_path
    if config is not None:
        data["config"] = config
    client = get_supabase_client()
    result = client.table("jobs").update(data).eq("id", job_id).execute()
    return result.data[0]


def get_job_by_id(job_id: str) -> dict | None:
    """Get a job by ID."""
    client = get_supabase_client()
    result = client.table("jobs").select("*").eq("id", job_id).execute()
    return result.data[0] if result.data else None


# ============================================================================
# Parsed Specs
# ============================================================================

def save_parsed_spec(
    job_id: str,
    title: str | None,
    base_url: str | None,
    auth_schemes: list[dict],
    endpoints: list[dict],
    raw_spec: dict,
) -> dict:
    """Save parsed spec for a job."""
    client = get_supabase_client()
    result = client.table("parsed_specs").insert({
        "job_id": job_id,
        "title": title,
        "base_url": base_url,
        "auth_schemes": auth_schemes,
        "endpoints": endpoints,
        "raw_spec": raw_spec,
    }).execute()
    return result.data[0]


def get_parsed_spec_by_job(job_id: str) -> dict | None:
    """Get parsed spec for a job."""
    client = get_supabase_client()
    result = client.table("parsed_specs").select("*").eq("job_id", job_id).execute()
    return result.data[0] if result.data else None


# ============================================================================
# Generated Servers
# ============================================================================

def save_generated_server(
    job_id: str,
    server_code: str,
    requirements_txt: str,
    dockerfile: str,
    tool_manifest: list[dict],
    validation_result: dict,
) -> dict:
    """Save generated server artifacts."""
    client = get_supabase_client()
    result = client.table("generated_servers").insert({
        "job_id": job_id,
        "server_code": server_code,
        "requirements_txt": requirements_txt,
        "dockerfile": dockerfile,
        "tool_manifest": tool_manifest,
        "validation_result": validation_result,
    }).execute()
    return result.data[0]


def get_generated_server_by_job(job_id: str) -> dict | None:
    """Get generated server for a job."""
    client = get_supabase_client()
    result = client.table("generated_servers").select("*").eq("job_id", job_id).execute()
    return result.data[0] if result.data else None


# ============================================================================
# Chat Messages
# ============================================================================

def save_chat_message(job_id: str, role: str, content: str) -> dict:
    """Save a chat message."""
    client = get_supabase_client()
    result = client.table("chat_messages").insert({
        "job_id": job_id,
        "role": role,
        "content": content,
    }).execute()
    return result.data[0]


def get_chat_messages_by_job(job_id: str) -> list[dict]:
    """Get all chat messages for a job."""
    client = get_supabase_client()
    result = (
        client.table("chat_messages")
        .select("*")
        .eq("job_id", job_id)
        .order("created_at")
        .execute()
    )
    return result.data


# ============================================================================
# Storage
# ============================================================================

def upload_to_storage(bucket: str, path: str, data: bytes, content_type: str) -> str:
    """Upload file to Supabase Storage. Returns the path."""
    client = get_supabase_client()
    client.storage.from_(bucket).upload(path, data, {"content-type": content_type})
    return path


def get_download_url(bucket: str, path: str, expires_in: int) -> str:
    """Get a signed download URL."""
    client = get_supabase_client()
    result = client.storage.from_(bucket).create_signed_url(path, expires_in)
    return result["signedURL"]
