from fastapi import APIRouter

from backend.api.specs import router as specs_router

api_router = APIRouter()


@api_router.get("/health")
async def api_health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}


api_router.include_router(specs_router)
