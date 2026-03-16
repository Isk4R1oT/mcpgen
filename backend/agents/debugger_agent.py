"""Debugger agent — analyzes MCP server errors and fixes the code.

When a tool call fails or returns unexpected results, this agent:
1. Reads the error message and server logs
2. Analyzes the server.py code
3. Produces a fixed version
4. The sandbox is restarted with the fix
"""

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider

from backend.codegen.fastmcp_docs import FASTMCP_REFERENCE


class CodeFix(BaseModel):
    """A fix for the generated MCP server code."""
    diagnosis: str  # What went wrong
    fixed_server_py: str  # Complete fixed server.py content
    changes_summary: str  # What was changed and why


DEBUGGER_INSTRUCTIONS = f"""You are an expert Python debugger specializing in MCP servers built with FastMCP.

When given an error from an MCP server, you:
1. Analyze the error message and server logs
2. Read the current server.py code
3. Identify the root cause
4. Return the COMPLETE fixed server.py (not a diff, the full file)

Common issues:
- Wrong URL path construction (missing /api prefix, wrong param interpolation)
- Missing auth headers in requests
- Wrong HTTP method (GET vs POST)
- Response parsing errors (expecting JSON but getting HTML)
- Timeout issues (API is slow, need longer timeout)
- Wrong parameter names or types
- Missing error handling for specific status codes

Rules:
- Always return the COMPLETE server.py, not just the changed parts
- Keep all existing tools that work — only fix the broken ones
- Add better error messages that explain what went wrong
- If the API returns HTML instead of JSON, the base URL might be wrong

{FASTMCP_REFERENCE}"""


def create_debugger_agent(api_key: str, model_name: str) -> Agent:
    """Create the debugger agent."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    return Agent(
        model,
        output_type=CodeFix,
        instructions=DEBUGGER_INSTRUCTIONS,
    )


def build_debug_prompt(
    server_code: str,
    error_message: str,
    server_logs: str,
    tool_name: str | None,
    user_context: str,
) -> str:
    """Build prompt for the debugger agent."""
    return f"""## Error Report

Tool that failed: {tool_name or "unknown"}
Error: {error_message}

## User Context
{user_context}

## Server Logs (last 50 lines)
```
{server_logs[-3000:]}
```

## Current server.py
```python
{server_code}
```

Analyze the error, identify the root cause, and return the complete fixed server.py."""
