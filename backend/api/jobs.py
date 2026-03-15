from fastapi import APIRouter, HTTPException

from backend.api.specs import _jobs_store, get_job
from backend.db.models import JobConfiguration

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/{job_id}/configure")
async def configure_job(job_id: str, config: JobConfiguration) -> dict:
    """Save user configuration for MCP server generation."""
    job = get_job(job_id)
    job["config"] = config.model_dump()
    job["status"] = "configured"
    return {"job_id": job_id, "status": job["status"]}


@router.get("/{job_id}")
async def get_job_detail(job_id: str) -> dict:
    """Get full job details."""
    job = get_job(job_id)
    return {
        "id": job["id"],
        "status": job["status"],
        "input_type": job.get("input_type"),
        "config": job.get("config"),
        "docker_image_tag": job.get("docker_image_tag"),
        "source_archive_path": job.get("source_archive_path"),
    }


@router.get("/{job_id}/status")
async def get_job_status(job_id: str) -> dict:
    """Lightweight status polling endpoint."""
    job = get_job(job_id)
    status = job["status"]

    stage_map = {
        "pending": 0,
        "configured": 0,
        "parsing": 1,
        "analyzing": 2,
        "generating": 3,
        "validating": 4,
        "packaging": 5,
        "completed": 5,
        "failed": -1,
    }

    return {
        "status": status,
        "progress_stage": stage_map.get(status, 0),
        "total_stages": 5,
    }
