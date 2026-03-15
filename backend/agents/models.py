from pydantic import BaseModel, field_validator


class ToolParameter(BaseModel):
    name: str
    type: str
    description: str
    required: bool


class ToolDefinition(BaseModel):
    tool_name: str
    description: str
    group: str
    http_method: str
    path: str
    parameters: list[ToolParameter]
    request_body_schema: dict | None
    response_description: str


class AnalysisResult(BaseModel):
    server_name: str
    server_description: str
    tools: list[ToolDefinition]
    auth_recommendation: str
    notes: list[str]


class GeneratedFile(BaseModel):
    filename: str
    content: str
    description: str


class GeneratedServer(BaseModel):
    files: list[GeneratedFile]
    requirements: list[str]
    env_vars: list[str]
    startup_command: str

    @field_validator("files")
    @classmethod
    def files_not_empty(cls, v: list[GeneratedFile]) -> list[GeneratedFile]:
        if not v:
            raise ValueError("files must not be empty")
        return v


class ChatSuggestion(BaseModel):
    message: str
    config_updates: dict | None
    endpoint_suggestions: list[str] | None
