import json

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from backend.agents.models import AnalysisResult
from backend.pipeline.parser import ParsedEndpoint


ANALYZER_INSTRUCTIONS = """You are an API analysis expert. Given a list of API endpoints
with their parameters and schemas, produce optimized tool definitions for an MCP
(Model Context Protocol) server.

Rules:
- Use snake_case for all tool names (e.g., list_pets, get_user_by_id)
- Each tool description must start with "Use when" and be 1-3 sentences
- Group related endpoints logically by their tag/resource
- Write descriptions for an LLM audience, not humans
- Include parameter types, constraints, and examples where helpful
- Flag deprecated endpoints in notes
- Recommend the most appropriate auth strategy based on detected schemes
- Exclude file upload endpoints (multipart/form-data)"""


def create_analyzer_agent(api_key: str, model_name: str) -> Agent:
    """Create a PydanticAI agent for API analysis."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    return Agent(
        model,
        output_type=AnalysisResult,
        instructions=ANALYZER_INSTRUCTIONS,
    )


def build_analysis_prompt(
    endpoints: list[ParsedEndpoint],
    auth_schemes: list[dict],
) -> str:
    """Build the prompt for the analyzer agent."""
    endpoint_descriptions = []
    for ep in endpoints:
        params_str = ""
        if ep.parameters:
            params_list = []
            for p in ep.parameters:
                name = p.get("name", "unknown") if isinstance(p, dict) else str(p)
                param_type = p.get("schema", {}).get("type", p.get("type", "string")) if isinstance(p, dict) else "string"
                required = p.get("required", False) if isinstance(p, dict) else False
                desc = p.get("description", "") if isinstance(p, dict) else ""
                params_list.append(f"  - {name} ({param_type}, required={required}): {desc}")
            params_str = "\n".join(params_list)

        body_str = ""
        if ep.request_body:
            body_str = f"\n  Request body: {json.dumps(ep.request_body, indent=2, default=str)[:500]}"

        response_str = ""
        if ep.response_schema:
            response_str = f"\n  Response: {json.dumps(ep.response_schema, indent=2, default=str)[:500]}"

        endpoint_descriptions.append(
            f"- {ep.method} {ep.path}\n"
            f"  Summary: {ep.summary}\n"
            f"  Tag: {ep.tag}\n"
            f"  Parameters:\n{params_str if params_str else '    (none)'}"
            f"{body_str}{response_str}"
        )

    auth_str = json.dumps(auth_schemes, indent=2, default=str) if auth_schemes else "None detected"

    return f"""Analyze these API endpoints and generate MCP server tool definitions.

## Endpoints

{chr(10).join(endpoint_descriptions)}

## Authentication Schemes

{auth_str}

Generate an AnalysisResult with:
1. A descriptive server_name (snake_case, e.g., "petstore_mcp")
2. A clear server_description (1-2 sentences)
3. Tool definitions for each endpoint
4. Auth recommendation based on detected schemes
5. Any notes or warnings about the API"""
