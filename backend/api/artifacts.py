import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend.db.store import get_job
from backend.pipeline.packager import create_source_archive

router = APIRouter(prefix="/jobs", tags=["artifacts"])


@router.get("/{job_id}/artifacts/source")
async def download_source(job_id: str) -> StreamingResponse:
    """Download generated server source as .tar.gz."""
    job = get_job(job_id)

    if job["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Job is in status '{job['status']}', not completed",
        )

    generated = job.get("generated_server")
    if generated is None:
        raise HTTPException(status_code=404, detail="No generated server found")

    analysis = job.get("analysis")
    server_name = "mcp-server"
    if analysis is not None:
        server_name = analysis.server_name.replace(" ", "-")

    archive = create_source_archive(generated, server_name)

    return StreamingResponse(
        io.BytesIO(archive),
        media_type="application/gzip",
        headers={"Content-Disposition": f"attachment; filename={server_name}.tar.gz"},
    )


@router.get("/{job_id}/artifacts/code")
async def preview_code(job_id: str) -> dict:
    """Preview generated server code."""
    job = get_job(job_id)

    generated = job.get("generated_server")
    if generated is None:
        raise HTTPException(status_code=404, detail="No generated server found")

    return {
        "files": [
            {"filename": f.filename, "content": f.content}
            for f in generated.files
        ],
    }


@router.get("/{job_id}/artifacts/docker-info")
async def docker_info(job_id: str) -> dict:
    """Get Docker pull/run information."""
    job = get_job(job_id)

    analysis = job.get("analysis")
    server_name = "mcp-server"
    if analysis is not None:
        server_name = analysis.server_name.replace(" ", "-")

    docker_tag = job.get("docker_image_tag", f"mcpgen/{server_name}:latest")

    return {
        "image_tag": docker_tag,
        "pull_command": f"docker pull {docker_tag}",
        "run_command": f"docker run -p 8000:8000 --env-file .env {docker_tag}",
        "build_from_source": f"tar xzf {server_name}.tar.gz && cd {server_name} && docker build -t {server_name} .",
    }
