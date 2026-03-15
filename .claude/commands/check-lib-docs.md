# Check Library Documentation via Context7

Before using any external library in code, ALWAYS check its latest documentation via Context7 MCP.

## Steps

1. Identify the library you are about to use (e.g., pydantic-ai, fastmcp, supabase, docker-py, deepeval)
2. Call `mcp__claude_ai_context7__resolve-library-id` with the library name
3. Call `mcp__claude_ai_context7__query-docs` with the resolved library ID and your specific question
4. Review the docs — look for:
   - Correct import paths (they change between versions)
   - Current API signatures (parameters, return types)
   - Recommended patterns and anti-patterns
   - Breaking changes from recent versions
5. Only then write the code using verified API

## When to use

- Before writing ANY code that imports an external library for the first time in this session
- When you encounter an import error or unexpected API behavior
- When implementing a new feature that relies on a library capability you haven't used before

## Libraries to always check

- `pydantic-ai` — API changes frequently (pre-1.0)
- `fastmcp` — v3.x has breaking changes from v2
- `supabase` — Python client differs from JS
- `deepeval` — evaluation metrics and LLM judge setup
- `docker` (docker-py) — build API quirks
- `prance` — OpenAPI parsing options
