"""Chat agent — conversational assistant for MCP server configuration."""

import json

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from backend.agents.models import ChatSuggestion
from backend.pipeline.parser import ParsedEndpoint


CHAT_INSTRUCTIONS = """You are a helpful assistant that guides users in configuring their MCP server.
You have access to the parsed API spec and current configuration.

Your role:
- Answer questions about what API endpoints do
- Recommend which endpoints to include or exclude
- Suggest the best auth strategy based on the API
- Explain trade-offs (e.g., including DELETE endpoints = destructive operations)
- Suggest config changes when appropriate

Rules:
- Be concise — 1-3 sentences per response
- If you suggest config changes, include them in config_updates
- If you suggest adding/removing endpoints, include them in endpoint_suggestions
- Be specific to this API, don't give generic advice
- If unsure, say so honestly"""


def create_chat_agent(api_key: str, model_name: str) -> Agent:
    """Create a PydanticAI agent for user chat during configuration."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    return Agent(
        model,
        output_type=ChatSuggestion,
        instructions=CHAT_INSTRUCTIONS,
    )


def build_chat_prompt(
    user_message: str,
    endpoints: list[ParsedEndpoint],
    current_config: dict,
    chat_history: list[dict],
) -> str:
    """Build the prompt for the chat agent."""
    # Format endpoints
    endpoints_str = ""
    if endpoints:
        ep_lines = []
        for ep in endpoints:
            ep_lines.append(f"  - {ep.method} {ep.path}: {ep.summary} (tag: {ep.tag})")
        endpoints_str = "\n".join(ep_lines)

    # Format config
    config_str = json.dumps(current_config, indent=2) if current_config else "Not configured yet"

    # Format history
    history_str = ""
    if chat_history:
        history_lines = []
        for msg in chat_history:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            history_lines.append(f"  {role}: {content}")
        history_str = "\n".join(history_lines)

    return f"""## Available API Endpoints
{endpoints_str or "  (none loaded yet)"}

## Current Configuration
{config_str}

## Chat History
{history_str or "  (start of conversation)"}

## User Message
{user_message}

Respond with a helpful message. If you suggest changes, include them in config_updates or endpoint_suggestions."""
