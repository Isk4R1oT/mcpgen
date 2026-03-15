from fastapi import APIRouter

from backend.api.generation import router as generation_router
from backend.api.jobs import router as jobs_router
from backend.api.specs import router as specs_router

api_router = APIRouter()


@api_router.get("/health")
async def api_health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


api_router.include_router(specs_router)
api_router.include_router(jobs_router)
api_router.include_router(generation_router)
