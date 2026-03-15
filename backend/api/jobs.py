from fastapi import APIRouter

from backend.db.models import JobConfiguration
from backend.db.store import get_job, save_job_config

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("/{job_id}/configure")
async def configure_job(job_id: str, config: JobConfiguration) -> dict:
    """Save user configuration for MCP server generation."""
    get_job(job_id)  # Validate exists
    save_job_config(job_id, config.model_dump())
    return {"job_id": job_id, "status": "configured"}


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
