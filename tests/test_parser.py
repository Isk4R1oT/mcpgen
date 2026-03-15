from pathlib import Path

import pytest

from backend.pipeline.parser import (
    ParsedEndpoint,
    ParsedSpec,
    parse_openapi_from_dict,
    parse_openapi_from_file,
    extract_endpoints_from_spec,
)


FIXTURES_DIR = Path(__file__).parent / "fixtures"


class TestParseOpenAPIFromFile:
    def test_parse_petstore_yaml(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        assert spec.title == "Swagger Petstore"
        assert spec.base_url == "https://petstore.swagger.io/v2"

    def test_parse_petstore_has_endpoints(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        assert len(spec.endpoints) > 0

    def test_parse_petstore_has_auth_schemes(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        assert len(spec.auth_schemes) > 0
        scheme_types = [s["type"] for s in spec.auth_schemes]
        assert "apiKey" in scheme_types

    def test_parse_nonexistent_file_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            parse_openapi_from_file(Path("/nonexistent/file.yaml"))


class TestParseOpenAPIFromDict:
    def test_parse_minimal_spec(self) -> None:
        raw = {
            "openapi": "3.0.3",
            "info": {"title": "Test API", "version": "1.0.0"},
            "paths": {
                "/items": {
                    "get": {
                        "summary": "List items",
                        "responses": {"200": {"description": "ok"}},
                    }
                }
            },
        }
        spec = parse_openapi_from_dict(raw)
        assert spec.title == "Test API"
        assert len(spec.endpoints) == 1

    def test_parse_spec_without_servers(self) -> None:
        raw = {
            "openapi": "3.0.3",
            "info": {"title": "No Server", "version": "1.0.0"},
            "paths": {},
        }
        spec = parse_openapi_from_dict(raw)
        assert spec.base_url is None

    def test_parse_spec_with_servers(self) -> None:
        raw = {
            "openapi": "3.0.3",
            "info": {"title": "With Server", "version": "1.0.0"},
            "servers": [{"url": "https://api.example.com/v1"}],
            "paths": {},
        }
        spec = parse_openapi_from_dict(raw)
        assert spec.base_url == "https://api.example.com/v1"

    def test_parse_swagger_2_spec(self) -> None:
        raw = {
            "swagger": "2.0",
            "info": {"title": "Swagger 2 API", "version": "1.0.0"},
            "host": "api.example.com",
            "basePath": "/v1",
            "schemes": ["https"],
            "paths": {
                "/pets": {
                    "get": {
                        "summary": "List pets",
                        "parameters": [],
                        "responses": {"200": {"description": "ok"}},
                    }
                }
            },
        }
        spec = parse_openapi_from_dict(raw)
        assert spec.title == "Swagger 2 API"
        assert "api.example.com" in (spec.base_url or "")
        assert len(spec.endpoints) == 1


class TestExtractEndpoints:
    def test_extract_endpoints_from_petstore(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        assert len(endpoints) > 0
        assert all(isinstance(e, ParsedEndpoint) for e in endpoints)

    def test_endpoint_has_required_fields(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        for ep in endpoints:
            assert ep.id != ""
            assert ep.method in ("GET", "POST", "PUT", "DELETE", "PATCH")
            assert ep.path.startswith("/")

    def test_endpoint_id_format(self) -> None:
        """Endpoint ID should be 'method_path' format."""
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        for ep in endpoints:
            assert ep.id == f"{ep.method.lower()}_{ep.path}"

    def test_endpoint_has_parameters(self) -> None:
        """Pet by ID endpoint should have petId parameter."""
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        pet_by_id = next((e for e in endpoints if e.path == "/pet/{petId}" and e.method == "GET"), None)
        assert pet_by_id is not None
        assert pet_by_id.parameters_count > 0

    def test_endpoint_has_tag(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        tags = {e.tag for e in endpoints}
        assert "pet" in tags
        assert "store" in tags

    def test_endpoint_has_summary(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)
        pet_endpoints = [e for e in endpoints if e.tag == "pet"]
        assert all(e.summary != "" for e in pet_endpoints)


class TestParsedSpec:
    def test_parsed_spec_raw_spec_included(self) -> None:
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        assert spec.raw_spec is not None
        assert "paths" in spec.raw_spec

    def test_parsed_spec_endpoint_details(self) -> None:
        """Endpoints should include full parameter and schema info."""
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        pet_post = next(
            (e for e in spec.endpoints if e.get("path") == "/pet" and e.get("method") == "POST"),
            None,
        )
        assert pet_post is not None
        assert "parameters" in pet_post or "request_body" in pet_post
