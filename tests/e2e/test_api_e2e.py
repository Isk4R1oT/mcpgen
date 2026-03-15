"""E2E tests — full API flow without browser, using httpx against real FastAPI app.

Tests the complete flow: upload → endpoints → configure → generate → download.
Uses real LLM calls via OpenRouter.
"""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from backend.main import app

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


def get_real_env() -> dict[str, str]:
    """Read real env vars from .env file."""
    env_path = Path(__file__).parent.parent.parent / ".env"
    env_vars = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env_vars[k.strip()] = v.strip()
    if not env_vars.get("OPENROUTER_API_KEY") or env_vars["OPENROUTER_API_KEY"].startswith("sk-or-v1-your"):
        pytest.skip("Real OPENROUTER_API_KEY not found in .env")
    return env_vars


@pytest.fixture(autouse=True)
def set_real_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Override conftest fake env with real values for E2E tests."""
    for k, v in get_real_env().items():
        monkeypatch.setenv(k, v)


@pytest.fixture
def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.mark.slow
class TestFullApiFlow:
    async def test_upload_configure_generate_download(self, client: AsyncClient) -> None:
        """Complete E2E: upload petstore → select endpoints → configure → generate → get artifacts."""
        # Step 1: Upload spec
        file_path = FIXTURES_DIR / "petstore.yaml"
        with open(file_path, "rb") as f:
            upload_resp = await client.post(
                "/api/specs/upload",
                files={"file": ("petstore.yaml", f, "application/x-yaml")},
            )
        assert upload_resp.status_code == 200
        job_id = upload_resp.json()["job_id"]
        endpoints_count = upload_resp.json()["endpoints_count"]
        assert endpoints_count > 0

        # Step 2: Get endpoints
        ep_resp = await client.get(f"/api/specs/{job_id}/endpoints")
        assert ep_resp.status_code == 200
        endpoints = ep_resp.json()
        assert len(endpoints) == endpoints_count

        # Select first 3 endpoints
        selected = [ep["id"] for ep in endpoints[:3]]

        # Step 3: Configure
        config_resp = await client.post(
            f"/api/jobs/{job_id}/configure",
            json={
                "selected_endpoints": selected,
                "auth_strategy": {"type": "api_key", "header_name": "X-API-Key", "env_var_name": "API_KEY"},
                "server_name": "petstore-e2e-test",
            },
        )
        assert config_resp.status_code == 200
        assert config_resp.json()["status"] == "configured"

        # Step 4: Trigger generation (runs synchronously in test since no background tasks in test client)
        # Instead we'll call the pipeline directly
        from backend.config import Settings
        from backend.pipeline.orchestrator import run_pipeline

        settings = Settings()
        await run_pipeline(job_id, settings)

        # Step 5: Check job status
        status_resp = await client.get(f"/api/jobs/{job_id}/status")
        assert status_resp.status_code == 200
        assert status_resp.json()["status"] == "completed"

        # Step 6: Get code preview
        code_resp = await client.get(f"/api/jobs/{job_id}/artifacts/code")
        assert code_resp.status_code == 200
        files = code_resp.json()["files"]
        assert len(files) >= 1
        assert any(f["filename"] == "server.py" for f in files)

        # Verify server.py contains FastMCP
        server_py = next(f for f in files if f["filename"] == "server.py")
        assert "FastMCP" in server_py["content"] or "fastmcp" in server_py["content"]

        # Step 7: Get Docker info
        docker_resp = await client.get(f"/api/jobs/{job_id}/artifacts/docker-info")
        assert docker_resp.status_code == 200
        assert "pull_command" in docker_resp.json()

        # Step 8: Download source
        source_resp = await client.get(f"/api/jobs/{job_id}/artifacts/source")
        assert source_resp.status_code == 200
        assert len(source_resp.content) > 100  # Should be a real tar.gz

    async def test_chat_during_configuration(self, client: AsyncClient) -> None:
        """Test chat interaction after uploading a spec."""
        # Upload
        file_path = FIXTURES_DIR / "petstore.yaml"
        with open(file_path, "rb") as f:
            resp = await client.post(
                "/api/specs/upload",
                files={"file": ("petstore.yaml", f, "application/x-yaml")},
            )
        job_id = resp.json()["job_id"]

        # Chat
        chat_resp = await client.post(
            f"/api/jobs/{job_id}/chat",
            json={"message": "Which endpoints should I include for a read-only MCP server?"},
        )
        assert chat_resp.status_code == 200
        assert len(chat_resp.json()["message"]) > 10

        # History
        history_resp = await client.get(f"/api/jobs/{job_id}/chat/history")
        assert history_resp.status_code == 200
        assert len(history_resp.json()) == 2  # user + assistant
