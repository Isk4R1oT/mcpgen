"""Cached FastMCP documentation for inclusion in generator prompts.

This documentation is sourced from FastMCP v3.1 official docs and is used
to give the code generation LLM accurate, up-to-date API knowledge.
"""

FASTMCP_REFERENCE = """
## FastMCP v3.1 — Reference for Code Generation

### Creating a server

```python
from fastmcp import FastMCP

mcp = FastMCP(name="My Server")
```

### Defining tools

Use the `@mcp.tool` decorator on functions. FastMCP auto-generates the JSON schema
from the function signature, type hints, and docstring.

```python
@mcp.tool
def add(a: int, b: int) -> int:
    \"\"\"Add two numbers together.\"\"\"
    return a + b
```

### Tool with parameter descriptions (Annotated)

```python
from typing import Annotated
from pydantic import Field

@mcp.tool
def search_items(
    query: Annotated[str, "Search query string"],
    limit: Annotated[int, Field(description="Max results", ge=1, le=100)] = 10,
) -> list[dict]:
    \"\"\"Search for items matching the query.\"\"\"
    ...
```

### Async tool with httpx

```python
import httpx

@mcp.tool
async def get_user(user_id: int) -> dict:
    \"\"\"Fetch user by ID from the API.\"\"\"
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/users/{user_id}")
        response.raise_for_status()
        return response.json()
```

### Tool with error handling

```python
import httpx

@mcp.tool
async def get_item(item_id: int) -> dict:
    \"\"\"Fetch an item by ID. Returns error info if the request fails.\"\"\"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BASE_URL}/items/{item_id}",
                headers=headers,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        return {"error": f"HTTP {e.response.status_code}", "detail": e.response.text[:500]}
    except httpx.RequestError as e:
        return {"error": "request_failed", "detail": str(e)}
```

### Authentication pattern — API Key via env var

```python
import os

API_KEY = os.environ["API_KEY"]
API_KEY_HEADER = os.environ.get("API_KEY_HEADER", "Authorization")
BASE_URL = os.environ.get("BASE_URL", "https://api.example.com")

headers = {API_KEY_HEADER: API_KEY}

@mcp.tool
async def list_items() -> list[dict]:
    \"\"\"List all items.\"\"\"
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/items", headers=headers)
        response.raise_for_status()
        return response.json()
```

### Authentication pattern — Bearer token

```python
import os

BEARER_TOKEN = os.environ["BEARER_TOKEN"]
BASE_URL = os.environ.get("BASE_URL", "https://api.example.com")

headers = {"Authorization": f"Bearer {BEARER_TOKEN}"}
```

### Running the server

```python
if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```

Transport options: "streamable-http" (recommended for production), "http", "sse" (deprecated).

### Health check tool pattern

```python
@mcp.tool
def health_check() -> dict:
    \"\"\"Check if the MCP server and target API are healthy.\"\"\"
    return {"status": "ok", "server": mcp.name}
```

### Query parameters pattern

```python
@mcp.tool
async def list_pets(
    status: Annotated[str | None, "Filter by status (available, pending, sold)"] = None,
    limit: Annotated[int | None, "Maximum number of results"] = None,
) -> list[dict]:
    \"\"\"Use when you need to list pets with optional filtering.\"\"\"
    params = {}
    if status is not None:
        params["status"] = status
    if limit is not None:
        params["limit"] = limit
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/pets", params=params, headers=headers)
        response.raise_for_status()
        return response.json()
```

### Path parameters pattern

```python
@mcp.tool
async def get_pet_by_id(pet_id: Annotated[int, "The unique ID of the pet"]) -> dict:
    \"\"\"Use when you need to retrieve a specific pet by its ID.\"\"\"
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/pets/{pet_id}", headers=headers)
        response.raise_for_status()
        return response.json()
```

### POST with request body pattern

```python
@mcp.tool
async def create_pet(
    name: Annotated[str, "Name of the pet"],
    status: Annotated[str, "Pet status"] = "available",
) -> dict:
    \"\"\"Use when you need to create a new pet.\"\"\"
    body = {"name": name, "status": status}
    async with httpx.AsyncClient() as client:
        response = await client.post(f"{BASE_URL}/pets", json=body, headers=headers)
        response.raise_for_status()
        return response.json()
```

### DELETE pattern

```python
@mcp.tool
async def delete_pet(pet_id: Annotated[int, "ID of the pet to delete"]) -> dict:
    \"\"\"Use when you need to delete a pet by ID.\"\"\"
    async with httpx.AsyncClient() as client:
        response = await client.delete(f"{BASE_URL}/pets/{pet_id}", headers=headers)
        response.raise_for_status()
        return {"deleted": True, "pet_id": pet_id}
```

### Complete server example

```python
import os
from typing import Annotated

import httpx
from fastmcp import FastMCP

mcp = FastMCP(name="petstore_mcp")

BASE_URL = os.environ.get("BASE_URL", "https://petstore.swagger.io/v2")
API_KEY = os.environ.get("API_KEY", "")
headers = {"api_key": API_KEY} if API_KEY else {}


@mcp.tool
async def list_pets(
    status: Annotated[str | None, "Filter by status"] = None,
) -> list[dict]:
    \"\"\"Use when you need to list available pets.\"\"\"
    params = {}
    if status is not None:
        params["status"] = status
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/pet/findByStatus", params=params or {"status": "available"}, headers=headers)
        response.raise_for_status()
        return response.json()


@mcp.tool
async def get_pet_by_id(pet_id: Annotated[int, "The unique ID of the pet"]) -> dict:
    \"\"\"Use when you need to retrieve a specific pet by its ID.\"\"\"
    async with httpx.AsyncClient() as client:
        response = await client.get(f"{BASE_URL}/pet/{pet_id}", headers=headers)
        response.raise_for_status()
        return response.json()


@mcp.tool
def health_check() -> dict:
    \"\"\"Check server health.\"\"\"
    return {"status": "ok", "server": "petstore_mcp"}


if __name__ == "__main__":
    mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)
```

### IMPORTANT RULES
- Always use `@mcp.tool` (not `@mcp.tool()` with parentheses unless adding params)
- Use `Annotated[type, "description"]` for parameter descriptions
- Use `async with httpx.AsyncClient()` — create a new client per call, don't reuse
- Always call `response.raise_for_status()` after HTTP calls
- Return dicts/lists, never raw Response objects
- Read credentials from `os.environ`, never hardcode
- The server variable must be named `mcp` (for `fastmcp list server.py` to work)
- Use `mcp.run(transport="streamable-http", host="0.0.0.0", port=8000)` for production
"""
