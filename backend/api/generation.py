from fastapi import APIRouter, BackgroundTasks, HTTPException

from backend.api.specs import get_job
from backend.config import Settings
from backend.pipeline.orchestrator import run_pipeline

router = APIRouter(prefix="/jobs", tags=["generation"])


@router.post("/{job_id}/generate")
async def start_generation(
    job_id: str,
    background_tasks: BackgroundTasks,
) -> dict:
    """Trigger the async generation pipeline."""
    job = get_job(job_id)

    if job["status"] not in ("pending", "configured"):
        raise HTTPException(
            status_code=400,
            detail=f"Job is already in status '{job['status']}', cannot start generation",
        )

    settings = Settings()
    background_tasks.add_task(run_pipeline, job_id, settings)

    return {"job_id": job_id, "status": "parsing"}
