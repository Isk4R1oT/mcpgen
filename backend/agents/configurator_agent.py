"""Configurator agent — guides user through MCP server setup via chat.

This agent replaces the wizard flow. It:
1. Analyzes the parsed API spec
2. Asks about auth (auto-detects JWT, API key, Bearer, etc.)
3. Suggests endpoint groups based on user's goals
4. Selects final endpoints
5. Triggers generation when ready
"""

import json

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from backend.pipeline.parser import ParsedEndpoint


class ConfiguratorResponse(BaseModel):
    """Structured response from the configurator agent."""
    message: str
    phase: str  # "greeting", "auth_setup", "endpoint_selection", "review", "ready"

    # Auth config (filled during auth_setup phase)
    auth_type: str | None = None  # "none", "bearer_jwt", "api_key", "oauth2"
    auth_header: str | None = None  # e.g. "Authorization", "X-API-Key"
    auth_prefix: str | None = None  # e.g. "Bearer", ""
    auth_env_var: str | None = None  # e.g. "API_TOKEN"

    # Endpoint selection (filled during endpoint_selection/review phase)
    selected_endpoint_ids: list[str] | None = None
    server_name: str | None = None

    # When phase="ready" — all config is final, trigger generation
    ready_to_generate: bool = False


CONFIGURATOR_INSTRUCTIONS = """You are an MCP server configuration assistant. You guide users through setting up their MCP server in a natural conversation.

## Your Role
You help users create MCP servers from their API documentation. You've already received their API spec — now you need to help them configure auth and select endpoints.

## Conversation Flow

### Phase 1: greeting
- Briefly summarize what you found in the API (total endpoints, tags/groups, detected auth patterns)
- Ask the user what they want to do with this API

### Phase 2: auth_setup
- Analyze the API endpoints for auth patterns (look for Authorization headers, API keys, OAuth)
- Ask the user how they authenticate with this API
- Common patterns:
  - JWT Bearer token → auth_type="bearer_jwt", auth_header="Authorization", auth_prefix="Bearer"
  - API Key in header → auth_type="api_key", auth_header="X-API-Key" or custom, auth_prefix=""
  - No auth → auth_type="none"
- Set the auth fields in your response

### Phase 3: endpoint_selection
- Based on what the user wants to do, suggest relevant endpoint groups
- Let them pick groups or individual endpoints
- Set selected_endpoint_ids in your response (list of endpoint IDs like "get_/api/v1/agents")
- Don't select ALL endpoints — focus on what the user needs

### Phase 4: review
- Show a summary: server name, auth type, selected endpoints count
- Ask for confirmation
- Set server_name

### Phase 5: ready
- Set ready_to_generate=true and phase="ready"
- Include final selected_endpoint_ids, auth config, and server_name

## Rules
- Be concise — 2-4 sentences per message
- Always include the phase field
- Once auth is configured, keep it in all subsequent responses
- Once endpoints are selected, keep them unless user changes
- If user says "go" or "generate" or "ready" — move to ready phase
- server_name should be snake_case, derived from the API name
- For a 384-endpoint API, suggest 10-30 most useful endpoints, not all
- Ask about use case first — "read-only monitoring", "full CRUD", "specific feature"
"""


def create_configurator_agent(api_key: str, model_name: str) -> Agent:
    """Create the configurator agent."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    return Agent(
        model,
        output_type=ConfiguratorResponse,
        instructions=CONFIGURATOR_INSTRUCTIONS,
    )


def build_configurator_prompt(
    endpoints: list[ParsedEndpoint],
    auth_schemes: list[dict],
    user_message: str,
    chat_history: list[dict],
    current_config: dict,
) -> str:
    """Build prompt with full API context for the configurator."""

    # Group endpoints by tag
    tags: dict[str, list[str]] = {}
    for ep in endpoints:
        tag = ep.tag if isinstance(ep, ParsedEndpoint) else ep.get("tag", "default")
        ep_id = ep.id if isinstance(ep, ParsedEndpoint) else ep.get("id", "")
        method = ep.method if isinstance(ep, ParsedEndpoint) else ep.get("method", "")
        path = ep.path if isinstance(ep, ParsedEndpoint) else ep.get("path", "")
        summary = ep.summary if isinstance(ep, ParsedEndpoint) else ep.get("summary", "")
        tags.setdefault(tag, []).append(f"{method:6} {path:50} {summary}")

    tags_summary = []
    for tag, eps in sorted(tags.items()):
        tags_summary.append(f"### {tag} ({len(eps)} endpoints)")
        for ep_str in eps[:5]:
            tags_summary.append(f"  {ep_str}")
        if len(eps) > 5:
            tags_summary.append(f"  ... +{len(eps) - 5} more")

    # Auth info
    auth_str = "No security schemes defined in spec" if not auth_schemes else json.dumps(auth_schemes, indent=2)

    # History
    history_str = ""
    if chat_history:
        history_str = "\n".join(
            f"  {msg['role']}: {msg['content'][:200]}" for msg in chat_history[-10:]
        )

    # Current config state
    config_str = json.dumps(current_config, indent=2) if current_config else "Not configured yet"

    return f"""## API Overview
Total endpoints: {len(endpoints)}
Auth schemes in spec: {auth_str}

## Endpoint Groups
{chr(10).join(tags_summary)}

## Current Configuration
{config_str}

## Chat History
{history_str or "(start of conversation)"}

## User Message
{user_message}"""
