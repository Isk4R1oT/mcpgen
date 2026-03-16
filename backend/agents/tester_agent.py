"""Tester agent — connects to a running MCP server and tests tools via LLM.

Shows tool calls, parameters, and responses in real-time.
"""

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.mcp import MCPServerStreamableHTTP


class TestResult(BaseModel):
    """Result of a test interaction with the MCP server."""
    response: str
    tool_calls: list[dict]  # [{tool_name, args, result_preview}]
    success: bool
    error: str | None = None


def create_test_agent(api_key: str, model_name: str, mcp_url: str) -> Agent:
    """Create an agent connected to the generated MCP server for testing."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    mcp_server = MCPServerStreamableHTTP(mcp_url)

    return Agent(
        model,
        toolsets=[mcp_server],
        instructions=(
            "You are testing an MCP server. Use the available tools to answer "
            "the user's question. Always use tools — never make up data. "
            "If a tool returns an error, report it clearly."
        ),
    )


async def run_test(
    api_key: str,
    model_name: str,
    mcp_url: str,
    user_message: str,
) -> TestResult:
    """Run a test query against the MCP server and capture tool calls."""
    agent = create_test_agent(api_key, model_name, mcp_url)
    tool_calls: list[dict] = []

    try:
        async with agent:
            result = await agent.run(user_message)

            # Extract tool calls from the run messages
            for msg in result.all_messages():
                # Look for tool call parts in model responses
                if hasattr(msg, "parts"):
                    for part in msg.parts:
                        if hasattr(part, "tool_name"):
                            tool_calls.append({
                                "tool_name": getattr(part, "tool_name", "unknown"),
                                "args": str(getattr(part, "args", ""))[:500],
                                "result_preview": "",
                            })
                        elif hasattr(part, "content") and hasattr(part, "tool_name"):
                            # Tool result
                            for tc in tool_calls:
                                if not tc["result_preview"]:
                                    tc["result_preview"] = str(getattr(part, "content", ""))[:500]

            return TestResult(
                response=result.output,
                tool_calls=tool_calls,
                success=True,
            )

    except Exception as e:
        return TestResult(
            response="",
            tool_calls=tool_calls,
            success=False,
            error=str(e),
        )
