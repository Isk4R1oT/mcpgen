from uuid import UUID

import pytest
from pydantic import ValidationError

from backend.db.models import (
    AuthConfig,
    ChatMessageRow,
    EndpointSummary,
    GeneratedServerRow,
    JobConfiguration,
    JobRow,
    JobStatus,
    ParsedSpecRow,
)


class TestJobRow:
    def test_create_job_row(self) -> None:
        job = JobRow(
            id=UUID("12345678-1234-1234-1234-123456789abc"),
            status="pending",
            input_type="openapi_yaml",
            input_ref="specs/test.yaml",
        )
        assert job.status == "pending"
        assert job.error_message is None
        assert job.config is None

    def test_job_status_validation(self) -> None:
        with pytest.raises(ValidationError):
            JobRow(
                id=UUID("12345678-1234-1234-1234-123456789abc"),
                status="invalid_status",
                input_type="openapi_yaml",
                input_ref="specs/test.yaml",
            )

    def test_job_input_type_validation(self) -> None:
        with pytest.raises(ValidationError):
            JobRow(
                id=UUID("12345678-1234-1234-1234-123456789abc"),
                status="pending",
                input_type="invalid_type",
                input_ref="specs/test.yaml",
            )


class TestJobConfiguration:
    def test_job_configuration_with_api_key(self) -> None:
        config = JobConfiguration(
            selected_endpoints=["get_/pets", "post_/pets"],
            auth_strategy=AuthConfig(
                type="api_key",
                header_name="X-API-Key",
                env_var_name="API_KEY",
            ),
            server_name="petstore-mcp",
        )
        assert len(config.selected_endpoints) == 2
        assert config.auth_strategy.type == "api_key"

    def test_job_configuration_no_auth(self) -> None:
        config = JobConfiguration(
            selected_endpoints=["get_/pets"],
            auth_strategy=AuthConfig(type="none"),
            server_name="test-mcp",
        )
        assert config.auth_strategy.type == "none"

    def test_job_configuration_requires_endpoints(self) -> None:
        with pytest.raises(ValidationError):
            JobConfiguration(
                selected_endpoints=[],
                auth_strategy=AuthConfig(type="none"),
                server_name="test",
            )


class TestJobStatus:
    def test_job_status_model(self) -> None:
        status = JobStatus(
            status="generating",
            progress_stage=3,
            total_stages=5,
        )
        assert status.progress_stage == 3


class TestEndpointSummary:
    def test_endpoint_summary(self) -> None:
        endpoint = EndpointSummary(
            id="get_/pets",
            method="GET",
            path="/pets",
            summary="List all pets",
            tag="pets",
            parameters_count=2,
        )
        assert endpoint.id == "get_/pets"


class TestParsedSpecRow:
    def test_parsed_spec_row(self) -> None:
        spec = ParsedSpecRow(
            id=UUID("12345678-1234-1234-1234-123456789abc"),
            job_id=UUID("12345678-1234-1234-1234-123456789abc"),
            title="Petstore API",
            base_url="https://petstore.swagger.io/v2",
            auth_schemes=[{"type": "apiKey", "in": "header", "name": "api_key"}],
            endpoints=[],
        )
        assert spec.title == "Petstore API"


class TestGeneratedServerRow:
    def test_generated_server_row(self) -> None:
        server = GeneratedServerRow(
            id=UUID("12345678-1234-1234-1234-123456789abc"),
            job_id=UUID("12345678-1234-1234-1234-123456789abc"),
            server_code="from fastmcp import FastMCP\n...",
            requirements_txt="fastmcp>=3.1.0\nhttpx>=0.28",
            dockerfile="FROM python:3.12-slim\n...",
            tool_manifest=[{"name": "list_pets", "description": "List pets"}],
            validation_result={"syntax_ok": True, "imports_ok": True},
        )
        assert server.server_code.startswith("from fastmcp")


class TestChatMessageRow:
    def test_chat_message(self) -> None:
        msg = ChatMessageRow(
            id=UUID("12345678-1234-1234-1234-123456789abc"),
            job_id=UUID("12345678-1234-1234-1234-123456789abc"),
            role="user",
            content="Should I include admin endpoints?",
        )
        assert msg.role == "user"

    def test_chat_role_validation(self) -> None:
        with pytest.raises(ValidationError):
            ChatMessageRow(
                id=UUID("12345678-1234-1234-1234-123456789abc"),
                job_id=UUID("12345678-1234-1234-1234-123456789abc"),
                role="system",
                content="test",
            )
