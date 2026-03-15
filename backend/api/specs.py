import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml
from fastapi import APIRouter, HTTPException, UploadFile

from backend.db.models import EndpointSummary
from backend.pipeline.parser import (
    extract_endpoints_from_spec,
    parse_openapi_from_dict,
    parse_openapi_from_file,
)

router = APIRouter(prefix="/specs", tags=["specs"])

ALLOWED_EXTENSIONS = {".yaml", ".yml", ".json", ".pdf", ".md"}

# In-memory storage for MVP (will be replaced with Supabase)
_jobs_store: dict[str, dict] = {}


def get_job(job_id: str) -> dict:
    if job_id not in _jobs_store:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return _jobs_store[job_id]


@router.post("/upload")
async def upload_spec(file: UploadFile) -> dict:
    """Upload an OpenAPI spec file and parse it."""
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()

    if ext in (".yaml", ".yml"):
        raw_spec = yaml.safe_load(content)
        input_type = "openapi_yaml"
    elif ext == ".json":
        import json
        raw_spec = json.loads(content)
        input_type = "openapi_json"
    else:
        # PDF and MD will be handled in M7
        raise HTTPException(
            status_code=400,
            detail=f"File type {ext} is not yet supported. Use YAML or JSON OpenAPI specs.",
        )

    # Parse with prance for $ref resolution
    with NamedTemporaryFile(suffix=ext, delete=False, mode="wb") as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        parsed_spec = parse_openapi_from_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    job_id = str(uuid.uuid4())
    endpoints = extract_endpoints_from_spec(parsed_spec)

    _jobs_store[job_id] = {
        "id": job_id,
        "status": "pending",
        "input_type": input_type,
        "parsed_spec": parsed_spec,
        "endpoints": endpoints,
    }

    return {
        "job_id": job_id,
        "parsed_spec_id": str(uuid.uuid4()),
        "endpoints_count": len(endpoints),
    }


@router.get("/{job_id}/endpoints")
async def get_endpoints(job_id: str) -> list[dict]:
    """Get parsed endpoints for a job."""
    job = get_job(job_id)
    endpoints = job["endpoints"]

    return [
        {
            "id": ep.id,
            "method": ep.method,
            "path": ep.path,
            "summary": ep.summary,
            "tag": ep.tag,
            "parameters_count": ep.parameters_count,
        }
        for ep in endpoints
    ]
