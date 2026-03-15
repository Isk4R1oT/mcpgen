import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app


@pytest.fixture
def async_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestAppHealth:
    async def test_health_endpoint(self, async_client: AsyncClient) -> None:
        response = await async_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "version" in data

    async def test_api_router_mounted(self, async_client: AsyncClient) -> None:
        """API router should be mounted at /api prefix."""
        response = await async_client.get("/api/health")
        assert response.status_code == 200


class TestAppCORS:
    async def test_cors_headers_present(self, async_client: AsyncClient) -> None:
        response = await async_client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert response.status_code == 200
