"""Plan 05-07 Task 1 -- 3 mock MCP clients (CONTEXT D-21).

Pure unit tests with pytest-httpx -- no real wrangler subprocess. Real-server
integration tests live in Plan 05-10 alongside the F3 + retry orchestrator
end-to-end coverage.
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from pytest_httpx import HTTPXMock

from mcpgen_engine.stages.stage_f.mock_clients import (
    ChatGPTDeepResearchMockClient,
    ClaudeDesktopOlderMockClient,
    CursorMockClient,
    MockClientResult,
)

_SERVER_URL = "http://127.0.0.1:18787/mcp"


def _stub_initialize_response() -> dict[str, Any]:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            "protocolVersion": "2025-06-18",
            "capabilities": {},
            "serverInfo": {"name": "stub", "version": "0.1.0"},
        },
    }


def _stub_tools_list_response(tools: list[dict[str, Any]]) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": 1, "result": {"tools": tools}}


def _stub_tools_call_response(*, structured: bool) -> dict[str, Any]:
    result: dict[str, Any] = {"content": [{"type": "text", "text": "{}"}]}
    if structured:
        result["structuredContent"] = {"data": "leaked"}
    return {"jsonrpc": "2.0", "id": 1, "result": result}


def _full_annotations(
    *,
    read_only: bool,
    destructive: bool,
    idempotent: bool,
    open_world: bool,
) -> dict[str, bool]:
    return {
        "readOnlyHint": read_only,
        "destructiveHint": destructive,
        "idempotentHint": idempotent,
        "openWorldHint": open_world,
    }


# ─── CursorMockClient (Pitfall #31) ──────────────────────────────────────────


async def test_cursor_passes_with_explicit_annotations(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
                    "annotations": _full_annotations(
                        read_only=True, destructive=False, idempotent=True, open_world=True
                    ),
                },
                {
                    "name": "list_collections",
                    "description": "list collections",
                    "inputSchema": {"type": "object"},
                    "annotations": _full_annotations(
                        read_only=True, destructive=False, idempotent=True, open_world=True
                    ),
                },
            ]
        ),
    )
    result = await CursorMockClient().verify(_SERVER_URL)
    assert isinstance(result, MockClientResult)
    assert result.passed is True, result.reason


async def test_cursor_fails_when_open_world_false_on_read_tool(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
                    "annotations": _full_annotations(
                        read_only=True, destructive=False, idempotent=True, open_world=False
                    ),
                },
            ]
        ),
    )
    result = await CursorMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "openWorldHint" in result.reason


async def test_cursor_fails_when_read_tool_missing_read_only(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
                    "annotations": _full_annotations(
                        read_only=False, destructive=False, idempotent=True, open_world=True
                    ),
                },
            ]
        ),
    )
    result = await CursorMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "readOnlyHint" in result.reason


async def test_cursor_fails_when_annotation_missing(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object"},
                    "annotations": {
                        "readOnlyHint": True,
                        "destructiveHint": False,
                        "idempotentHint": True,
                        # openWorldHint deliberately missing
                    },
                },
            ]
        ),
    )
    result = await CursorMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "missing annotation openWorldHint" in result.reason


# ─── ClaudeDesktopOlderMockClient (Pitfall #4) ────────────────────────────────


async def test_claude_desktop_older_passes_when_no_output_schema(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}}},
                    "annotations": _full_annotations(
                        read_only=True, destructive=False, idempotent=True, open_world=True
                    ),
                    # outputSchema deliberately omitted (capability negotiation downgrade)
                },
            ]
        ),
    )
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_tools_call_response(structured=False))
    result = await ClaudeDesktopOlderMockClient().verify(_SERVER_URL)
    assert result.passed is True, result.reason


async def test_claude_desktop_older_fails_when_output_schema_leaks(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object"},
                    "outputSchema": {"type": "object"},  # leak!
                    "annotations": _full_annotations(
                        read_only=True, destructive=False, idempotent=True, open_world=True
                    ),
                },
            ]
        ),
    )
    result = await ClaudeDesktopOlderMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "outputSchema leaked" in result.reason


async def test_claude_desktop_older_fails_when_structured_content_leaks(
    httpx_mock: HTTPXMock,
) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {
                    "name": "search",
                    "description": "search the API",
                    "inputSchema": {"type": "object"},
                    "annotations": _full_annotations(
                        read_only=True, destructive=False, idempotent=True, open_world=True
                    ),
                },
            ]
        ),
    )
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_call_response(structured=True),  # leak
    )
    result = await ClaudeDesktopOlderMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "structuredContent leaked" in result.reason


# ─── ChatGPTDeepResearchMockClient (Pitfall #32) ──────────────────────────────


_CANONICAL_SEARCH = {
    "type": "object",
    "properties": {"query": {"type": "string"}},
    "required": ["query"],
    "additionalProperties": False,
}
_CANONICAL_FETCH = {
    "type": "object",
    "properties": {"id": {"type": "string"}},
    "required": ["id"],
    "additionalProperties": False,
}


async def test_chatgpt_passes_when_search_fetch_match_canonical(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {"name": "search", "description": "s", "inputSchema": _CANONICAL_SEARCH},
                {"name": "fetch", "description": "f", "inputSchema": _CANONICAL_FETCH},
            ]
        ),
    )
    result = await ChatGPTDeepResearchMockClient().verify(_SERVER_URL)
    assert result.passed is True, result.reason


async def test_chatgpt_fails_when_search_adds_extra_property(httpx_mock: HTTPXMock) -> None:
    drifted = json.loads(json.dumps(_CANONICAL_SEARCH))
    drifted["properties"]["limit"] = {"type": "integer"}
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {"name": "search", "description": "s", "inputSchema": drifted},
                {"name": "fetch", "description": "f", "inputSchema": _CANONICAL_FETCH},
            ]
        ),
    )
    result = await ChatGPTDeepResearchMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "search" in result.reason
    assert "limit" in result.details["extra"]
    assert result.details["retry_target"] == "pass_1"


async def test_chatgpt_fails_when_fetch_renames_id(httpx_mock: HTTPXMock) -> None:
    drifted = {
        "type": "object",
        "properties": {"object_id": {"type": "string"}},
        "required": ["object_id"],
        "additionalProperties": False,
    }
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                {"name": "search", "description": "s", "inputSchema": _CANONICAL_SEARCH},
                {"name": "fetch", "description": "f", "inputSchema": drifted},
            ]
        ),
    )
    result = await ChatGPTDeepResearchMockClient().verify(_SERVER_URL)
    assert result.passed is False
    assert "fetch" in result.reason
    assert "id" in result.details["missing"]
    assert "object_id" in result.details["extra"]


async def test_chatgpt_skips_when_action_only_api(httpx_mock: HTTPXMock) -> None:
    httpx_mock.add_response(url=_SERVER_URL, json=_stub_initialize_response())
    httpx_mock.add_response(
        url=_SERVER_URL,
        json=_stub_tools_list_response(
            [
                # Action-only API: no search / fetch.
                {"name": "charges_create", "description": "c", "inputSchema": {"type": "object"}},
            ]
        ),
    )
    result = await ChatGPTDeepResearchMockClient().verify(_SERVER_URL)
    assert result.passed is True, result.reason


# ─── Provenance: canonical fixtures must be readable from the engine path ─────


def test_canonical_dir_resolves() -> None:
    # Regression guard: the parent walk must find packages/engine-fixtures/_canonical.
    # If repo layout shifts, fail loudly here, not in the middle of an F3 run.
    from mcpgen_engine.stages.stage_f.mock_clients import _canonical_dir

    canonical = _canonical_dir()
    assert (canonical / "search_signature.json").exists()
    assert (canonical / "fetch_signature.json").exists()
    pytest.importorskip("json")  # placeholder to keep test impl honest
