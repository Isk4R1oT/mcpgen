from fastapi import APIRouter

api_router = APIRouter()


@api_router.get("/health")
async def api_health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}
