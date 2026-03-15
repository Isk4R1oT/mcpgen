from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def async_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


async def upload_petstore(client: AsyncClient) -> str:
    """Helper: upload petstore spec and return job_id."""
    file_path = FIXTURES_DIR / "petstore.yaml"
    with open(file_path, "rb") as f:
        response = await client.post(
            "/api/specs/upload",
            files={"file": ("petstore.yaml", f, "application/x-yaml")},
        )
    return response.json()["job_id"]


class TestConfigureJob:
    async def test_configure_job(self, async_client: AsyncClient) -> None:
        job_id = await upload_petstore(async_client)
        response = await async_client.post(
            f"/api/jobs/{job_id}/configure",
            json={
                "selected_endpoints": ["get_/pet", "post_/pet"],
                "auth_strategy": {"type": "api_key", "header_name": "X-API-Key", "env_var_name": "API_KEY"},
                "server_name": "petstore-mcp",
            },
        )
        assert response.status_code == 200
        assert response.json()["status"] == "configured"

    async def test_configure_job_empty_endpoints_fails(self, async_client: AsyncClient) -> None:
        job_id = await upload_petstore(async_client)
        response = await async_client.post(
            f"/api/jobs/{job_id}/configure",
            json={
                "selected_endpoints": [],
                "auth_strategy": {"type": "none"},
                "server_name": "test",
            },
        )
        assert response.status_code == 422

    async def test_configure_nonexistent_job(self, async_client: AsyncClient) -> None:
        response = await async_client.post(
            "/api/jobs/nonexistent/configure",
            json={
                "selected_endpoints": ["get_/pets"],
                "auth_strategy": {"type": "none"},
                "server_name": "test",
            },
        )
        assert response.status_code == 404


class TestGetJob:
    async def test_get_job_detail(self, async_client: AsyncClient) -> None:
        job_id = await upload_petstore(async_client)
        response = await async_client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == job_id
        assert data["status"] == "pending"

    async def test_get_job_status(self, async_client: AsyncClient) -> None:
        job_id = await upload_petstore(async_client)
        response = await async_client.get(f"/api/jobs/{job_id}/status")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending"
        assert data["total_stages"] == 5
