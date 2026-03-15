"""Eval tests for LLM endpoint extractor — real API calls."""

from pathlib import Path

import pytest

from backend.agents.extractor_agent import (
    ExtractionResult,
    create_extractor_agent,
    build_extraction_prompt,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def get_openrouter_key() -> str:
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key and not key.startswith("sk-or-v1-your"):
                    return key
    pytest.skip("Real OPENROUTER_API_KEY not found in .env")
    return ""


@pytest.mark.slow
class TestExtractorEval:
    async def test_extract_from_markdown_docs(self) -> None:
        """LLM should extract endpoints from markdown API documentation."""
        api_key = get_openrouter_key()

        md_text = (FIXTURES_DIR / "sample_api_docs.md").read_text()
        prompt = build_extraction_prompt(md_text, "markdown")

        agent = create_extractor_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)
        extraction = result.output

        assert isinstance(extraction, ExtractionResult)
        assert extraction.title != ""

        # Should find at least 4 endpoints (GET, POST, PUT, DELETE tasks)
        assert len(extraction.endpoints) >= 4, (
            f"Expected >= 4 endpoints, got {len(extraction.endpoints)}: "
            f"{[e.method + ' ' + e.path for e in extraction.endpoints]}"
        )

        # Check specific endpoints
        methods_paths = [(e.method.upper(), e.path) for e in extraction.endpoints]
        assert ("GET", "/tasks") in methods_paths or any(
            e.method == "GET" and "tasks" in e.path and "{" not in e.path
            for e in extraction.endpoints
        ), f"Missing GET /tasks in {methods_paths}"

        assert any(
            e.method.upper() == "POST" and "tasks" in e.path
            for e in extraction.endpoints
        ), f"Missing POST /tasks in {methods_paths}"

        # Should detect auth type
        assert extraction.auth_type is not None, "Should detect bearer auth"

        # Should detect base URL
        assert extraction.base_url is not None, "Should detect base URL"
        assert "taskmanager" in (extraction.base_url or "")

    async def test_extract_from_html_text(self) -> None:
        """LLM should extract endpoints from raw HTML-extracted text."""
        api_key = get_openrouter_key()

        text = """
Users API Documentation

Authentication: API Key in X-API-Key header

Endpoints:

GET /api/v1/users
Returns a list of all users. Supports pagination with ?page=1&limit=20.

GET /api/v1/users/:id
Returns a single user by ID.

POST /api/v1/users
Creates a new user. Body: {"name": "string", "email": "string"}

DELETE /api/v1/users/:id
Deletes a user by ID. Requires admin permissions.
"""

        prompt = build_extraction_prompt(text, "html")
        agent = create_extractor_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)
        extraction = result.output

        assert len(extraction.endpoints) >= 3
        assert extraction.auth_type is not None
