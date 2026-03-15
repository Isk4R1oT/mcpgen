from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def async_client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestSpecUpload:
    async def test_upload_openapi_yaml(self, async_client: AsyncClient) -> None:
        file_path = FIXTURES_DIR / "petstore.yaml"
        with open(file_path, "rb") as f:
            response = await async_client.post(
                "/api/specs/upload",
                files={"file": ("petstore.yaml", f, "application/x-yaml")},
            )
        assert response.status_code == 200
        data = response.json()
        assert "job_id" in data
        assert data["endpoints_count"] > 0

    async def test_upload_returns_valid_job_id(self, async_client: AsyncClient) -> None:
        file_path = FIXTURES_DIR / "petstore.yaml"
        with open(file_path, "rb") as f:
            response = await async_client.post(
                "/api/specs/upload",
                files={"file": ("petstore.yaml", f, "application/x-yaml")},
            )
        data = response.json()
        # Job ID should be a valid UUID-like string
        assert len(data["job_id"]) > 0

    async def test_upload_unsupported_file_type(self, async_client: AsyncClient) -> None:
        response = await async_client.post(
            "/api/specs/upload",
            files={"file": ("test.exe", b"binary content", "application/octet-stream")},
        )
        assert response.status_code == 400


class TestGetEndpoints:
    async def test_get_endpoints_after_upload(self, async_client: AsyncClient) -> None:
        # Upload first
        file_path = FIXTURES_DIR / "petstore.yaml"
        with open(file_path, "rb") as f:
            upload_resp = await async_client.post(
                "/api/specs/upload",
                files={"file": ("petstore.yaml", f, "application/x-yaml")},
            )
        job_id = upload_resp.json()["job_id"]

        # Get endpoints
        response = await async_client.get(f"/api/specs/{job_id}/endpoints")
        assert response.status_code == 200
        endpoints = response.json()
        assert isinstance(endpoints, list)
        assert len(endpoints) > 0

        # Each endpoint should have required fields
        for ep in endpoints:
            assert "id" in ep
            assert "method" in ep
            assert "path" in ep
            assert "summary" in ep
            assert "tag" in ep
            assert "parameters_count" in ep

    async def test_get_endpoints_nonexistent_job(self, async_client: AsyncClient) -> None:
        response = await async_client.get("/api/specs/nonexistent-id/endpoints")
        assert response.status_code == 404
