"""Tests for spec fetcher — URL, PDF, Markdown input handling."""

from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from backend.services.spec_fetcher import (
    detect_content_type,
    parse_content_to_spec,
    fetch_url_content,
    extract_text_from_pdf,
    extract_text_from_markdown,
)
from backend.pipeline.parser import ParsedSpec


FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestDetectContentType:
    def test_json_content(self) -> None:
        content = '{"openapi": "3.0.0", "info": {"title": "Test"}}'
        assert detect_content_type(content) == "openapi_json"

    def test_yaml_content(self) -> None:
        content = "openapi: '3.0.0'\ninfo:\n  title: Test"
        assert detect_content_type(content) == "openapi_yaml"

    def test_swagger_json(self) -> None:
        content = '{"swagger": "2.0", "info": {"title": "Test"}}'
        assert detect_content_type(content) == "openapi_json"

    def test_html_content(self) -> None:
        content = "<html><body><h1>API Docs</h1></body></html>"
        assert detect_content_type(content) == "html"

    def test_plain_text(self) -> None:
        content = "GET /users - list all users\nPOST /users - create user"
        assert detect_content_type(content) == "text"


class TestParseContentToSpec:
    def test_parse_openapi_json(self) -> None:
        content = '{"openapi":"3.0.3","info":{"title":"Test API","version":"1.0"},"paths":{"/items":{"get":{"summary":"List items","responses":{"200":{"description":"ok"}}}}}}'
        spec = parse_content_to_spec(content, "openapi_json")
        assert spec.title == "Test API"
        assert len(spec.endpoints) == 1

    def test_parse_openapi_yaml(self) -> None:
        yaml_content = (FIXTURES_DIR / "petstore.yaml").read_text()
        spec = parse_content_to_spec(yaml_content, "openapi_yaml")
        assert spec.title == "Swagger Petstore"
        assert len(spec.endpoints) > 0


class TestExtractTextFromMarkdown:
    def test_extract_from_markdown(self) -> None:
        md = """# My API

## Endpoints

### GET /users
List all users. Returns array of User objects.

### POST /users
Create a new user. Body: {name: string, email: string}

### GET /users/{id}
Get user by ID. Returns User object.
"""
        text = extract_text_from_markdown(md)
        assert "GET /users" in text
        assert "POST /users" in text


class TestExtractTextFromPDF:
    def test_extract_returns_string(self) -> None:
        # Create a minimal test — just verify the function signature works
        # Real PDF testing requires a fixture file
        with pytest.raises(Exception):
            extract_text_from_pdf(b"not a real pdf")


class TestFetchUrlContent:
    async def test_fetch_json_url(self) -> None:
        mock_response = MagicMock()
        mock_response.text = '{"openapi":"3.0.0","info":{"title":"Test"},"paths":{}}'
        mock_response.headers = {"content-type": "application/json"}
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()

        with patch("backend.services.spec_fetcher.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            content, content_type = await fetch_url_content("https://example.com/api.json")
            assert content_type == "openapi_json"

    async def test_fetch_html_url(self) -> None:
        mock_response = MagicMock()
        mock_response.text = "<html><body><h1>API</h1><p>GET /users</p></body></html>"
        mock_response.headers = {"content-type": "text/html"}
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()

        with patch("backend.services.spec_fetcher.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client_cls.return_value = mock_client

            content, content_type = await fetch_url_content("https://example.com/docs")
            # trafilatura extracts text from HTML, so type becomes "text"
            assert content_type in ("html", "text")
