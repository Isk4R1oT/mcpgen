from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, field_validator


JOB_STATUSES = (
    "pending",
    "parsing",
    "analyzing",
    "generating",
    "validating",
    "packaging",
    "completed",
    "failed",
)

INPUT_TYPES = ("openapi_json", "openapi_yaml", "url", "file_upload")

AUTH_TYPES = ("none", "api_key", "bearer", "oauth2")

CHAT_ROLES = ("user", "assistant")


class AuthConfig(BaseModel):
    type: Literal["none", "api_key", "bearer", "oauth2"]
    header_name: str | None = None
    env_var_name: str | None = None


class JobConfiguration(BaseModel):
    selected_endpoints: list[str]
    auth_strategy: AuthConfig
    server_name: str

    @field_validator("selected_endpoints")
    @classmethod
    def endpoints_not_empty(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("selected_endpoints must not be empty")
        return v


class JobStatus(BaseModel):
    status: str
    progress_stage: int
    total_stages: int


class EndpointSummary(BaseModel):
    id: str
    method: str
    path: str
    summary: str
    tag: str
    parameters_count: int


class JobRow(BaseModel):
    id: UUID
    status: str
    input_type: str
    input_ref: str
    error_message: str | None = None
    config: dict | None = None
    docker_image_tag: str | None = None
    source_archive_path: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        if v not in JOB_STATUSES:
            raise ValueError(f"status must be one of {JOB_STATUSES}, got '{v}'")
        return v

    @field_validator("input_type")
    @classmethod
    def validate_input_type(cls, v: str) -> str:
        if v not in INPUT_TYPES:
            raise ValueError(f"input_type must be one of {INPUT_TYPES}, got '{v}'")
        return v


class ParsedSpecRow(BaseModel):
    id: UUID
    job_id: UUID
    title: str | None = None
    base_url: str | None = None
    auth_schemes: list[dict] | None = None
    endpoints: list[dict]
    raw_spec: dict | None = None
    created_at: datetime | None = None


class GeneratedServerRow(BaseModel):
    id: UUID
    job_id: UUID
    server_code: str
    requirements_txt: str
    dockerfile: str
    tool_manifest: list[dict] | None = None
    validation_result: dict | None = None
    created_at: datetime | None = None


class ChatMessageRow(BaseModel):
    id: UUID
    job_id: UUID
    role: str
    content: str
    created_at: datetime | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in CHAT_ROLES:
            raise ValueError(f"role must be one of {CHAT_ROLES}, got '{v}'")
        return v
