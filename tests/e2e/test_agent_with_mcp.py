"""Test a real LLM agent using the generated MCP server.

Spins up a PydanticAI agent with grok-code-fast-1, connects it to
the generated petstore MCP server via fastmcp Client, and verifies
the agent can use tools to answer questions.
"""

import asyncio
from pathlib import Path

import pytest
from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.mcp import MCPServerStreamableHTTP


def get_openrouter_key() -> str:
    env_path = Path(__file__).parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key and not key.startswith("sk-or-v1-your"):
                    return key
    pytest.skip("Real OPENROUTER_API_KEY not found in .env")
    return ""


MCP_URL = "http://localhost:9000/mcp"


def make_agent(api_key: str) -> Agent:
    """Create a PydanticAI agent with grok-code-fast-1 + petstore MCP tools."""
    model = OpenRouterModel(
        "x-ai/grok-code-fast-1",
        provider=OpenRouterProvider(api_key=api_key),
    )

    mcp_server = MCPServerStreamableHTTP(MCP_URL)

    return Agent(
        model,
        toolsets=[mcp_server],
        instructions="You are a helpful assistant with access to a Petstore API via MCP tools. Use the tools to answer questions about pets. Always use tools - never make up data.",
    )


@pytest.mark.slow
class TestAgentWithMCP:
    async def test_agent_can_get_pet_by_id(self) -> None:
        """Agent should use get_pet_by_id tool to fetch pet details."""
        api_key = get_openrouter_key()
        agent = make_agent(api_key)

        async with agent:
            result = await agent.run("What is the name of pet with ID 1?")

        output = result.output
        print(f"\nAgent response: {output}")

        # Agent should have called get_pet_by_id and returned the name
        assert "doggie" in output.lower(), f"Expected 'doggie' in response: {output}"

    async def test_agent_can_list_pets(self) -> None:
        """Agent should use list_pets tool to list available pets."""
        api_key = get_openrouter_key()
        agent = make_agent(api_key)

        async with agent:
            result = await agent.run("List 3 available pets from the store.")

        output = result.output
        print(f"\nAgent response: {output}")

        # Agent should have called list_pets and returned some pet data
        assert len(output) > 20, f"Response too short: {output}"

    async def test_agent_can_check_inventory(self) -> None:
        """Agent should use get_store_inventory tool."""
        api_key = get_openrouter_key()
        agent = make_agent(api_key)

        async with agent:
            result = await agent.run("How many pets are available in the store inventory?")

        output = result.output
        print(f"\nAgent response: {output}")

        # Should contain a number from the inventory
        assert any(char.isdigit() for char in output), f"Expected numbers in response: {output}"

    async def test_agent_uses_multiple_tools(self) -> None:
        """Agent should chain multiple tool calls to answer a complex question."""
        api_key = get_openrouter_key()
        agent = make_agent(api_key)

        async with agent:
            result = await agent.run(
                "First check the store inventory, then get details of pet with ID 2. "
                "Tell me both the inventory summary and the pet's name."
            )

        output = result.output
        print(f"\nAgent response: {output}")

        # Should have used both tools
        assert len(output) > 50, f"Response too short for multi-tool: {output}"

    async def test_agent_health_check(self) -> None:
        """Agent should use health_check tool."""
        api_key = get_openrouter_key()
        agent = make_agent(api_key)

        async with agent:
            result = await agent.run("Check if the petstore MCP server is healthy.")

        output = result.output
        print(f"\nAgent response: {output}")

        assert "ok" in output.lower() or "healthy" in output.lower(), (
            f"Expected health status in response: {output}"
        )
