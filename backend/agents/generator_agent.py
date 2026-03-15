import json

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from backend.agents.models import AnalysisResult, GeneratedServer
from backend.codegen.fastmcp_docs import FASTMCP_REFERENCE


GENERATOR_INSTRUCTIONS = f"""You are an expert Python developer specializing in MCP servers.
Generate a complete, production-ready FastMCP server.

Rules:
- Use FastMCP v3.1 with streamable-http transport
- Use httpx for async HTTP calls to the target API
- Each tool must have proper type hints and docstrings
- Auth credentials come from environment variables (os.environ)
- Include a health_check tool that returns server status
- server.py must be runnable: python server.py
- Handle HTTP errors gracefully — return error info, don't crash
- Return structured data (dicts/lists), not raw HTTP response text
- Use async/await for all HTTP calls
- Include proper imports at the top of each file
- The FastMCP server variable MUST be named `mcp`
- Use `@mcp.tool` decorator (without parentheses)
- Use `Annotated[type, "description"]` for parameter docs
- Use `async with httpx.AsyncClient()` per call, do not reuse clients
- Always `response.raise_for_status()` after HTTP calls
- End with `mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)`

Security rules:
- Validate all string inputs — use Field(pattern=) constraints for known value sets, or explicit checks
- Validate numeric inputs — use Field(ge=, le=) for bounds on limits, offsets, and IDs
- DELETE tools must include a `confirm: bool = False` parameter; return a warning dict if confirm is not true
- Error messages must not expose internal paths, stack traces, or API keys — return user-safe messages only
- All httpx calls must have explicit timeout=30.0
- Catch httpx.HTTPStatusError and httpx.RequestError separately with sanitized error responses

The output must contain at least:
1. server.py — the main MCP server file
2. List of pip requirements
3. List of required environment variables
4. The startup command

{FASTMCP_REFERENCE}"""


def create_generator_agent(api_key: str, model_name: str) -> Agent:
    """Create a PydanticAI agent for MCP server code generation."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    return Agent(
        model,
        output_type=GeneratedServer,
        instructions=GENERATOR_INSTRUCTIONS,
    )


def build_generation_prompt(
    analysis: AnalysisResult,
    auth_type: str,
    base_url: str,
) -> str:
    """Build the prompt for the generator agent."""
    tools_description = []
    for tool in analysis.tools:
        params_str = ""
        if tool.parameters:
            params_list = []
            for p in tool.parameters:
                if isinstance(p, dict):
                    params_list.append(f"    - {p['name']}: {p['type']} (required={p['required']}) — {p['description']}")
                else:
                    params_list.append(f"    - {p.name}: {p.type} (required={p.required}) — {p.description}")
            params_str = "\n".join(params_list)

        body_str = ""
        if tool.request_body_schema:
            body_str = f"\n  Request body: {json.dumps(tool.request_body_schema, indent=2)[:500]}"

        tools_description.append(
            f"### {tool.tool_name}\n"
            f"- Method: {tool.http_method}\n"
            f"- Path: {tool.path}\n"
            f"- Description: {tool.description}\n"
            f"- Parameters:\n{params_str if params_str else '    (none)'}"
            f"{body_str}\n"
            f"- Response: {tool.response_description}"
        )

    auth_instructions = _get_auth_instructions(auth_type)

    return f"""Generate a complete FastMCP server for the following API.

## Server Info
- Name: {analysis.server_name}
- Description: {analysis.server_description}
- Base URL: {base_url}

## Authentication
{auth_instructions}

## Tools to Implement

{chr(10).join(tools_description)}

## Requirements
- Use FastMCP v3.1
- Use httpx for HTTP calls
- Use streamable-http transport on port 8000
- Each tool function must be decorated with @mcp.tool (no parentheses)
- Include a health_check tool
- All HTTP calls must be async
- Environment variables for auth and base URL"""


def _get_auth_instructions(auth_type: str) -> str:
    if auth_type == "api_key":
        return """Authentication: API Key
- Read API key from environment variable API_KEY
- Pass it as a header in all HTTP requests
- Header name should be configurable via API_KEY_HEADER env var (default: "Authorization")"""
    elif auth_type == "bearer":
        return """Authentication: Bearer Token
- Read token from environment variable BEARER_TOKEN
- Pass it as "Authorization: Bearer {token}" header in all requests"""
    elif auth_type == "oauth2":
        return """Authentication: OAuth2
- Read access token from environment variable ACCESS_TOKEN
- Pass it as "Authorization: Bearer {token}" header
- Note: Token refresh is not implemented — user must provide a valid token"""
    else:
        return "Authentication: None required"
