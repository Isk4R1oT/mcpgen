"""Pass 5 Phase 1 — deterministic pagination strategy detection.

Per CONTEXT D-08 precedence (FIRST match wins): cursor → offset →
page-number → none. Per-server majority vote with cursor tie-break
across ``list_*`` tools.

Default limits per Pass 5 design §1.6:

- ``search``           → ``default_limit=10``, ``max_limit=50``  (denser results)
- ``list_objects``     → ``default_limit=25``, ``max_limit=100``
- ``list_collections`` → ``default_limit=25``, ``max_limit=100``

Threats addressed:

- T-04-01-spec-leak: logging emits ONLY structural metrics
  (``strategy.value``, ``list_tool_count``, ``override_count``); raw
  param names + spec field names are NEVER logged.
- T-04-01-IR-mutation: pure functions; ``PaginationStrategy`` is a
  Pydantic model with ``extra='forbid'``; no in-place mutation of
  ``Endpoint`` / ``RawIR``.

References:

- 04-CONTEXT.md D-05 + D-08
- 04-RESEARCH.md Code Example 1 (verbatim source for regex sets)
- docs/mcpgen-pass-5-design.md §1.2 + §11
- Analog deterministic classifier: ``passes/pass_3/filter_design.py``
- ``Tool1`` (frozen IR) has fields ``{name, type, source_endpoints}`` ONLY —
  for ``Type.universal`` tools the ``name`` IS the universal-tool variant
  (``"search"`` / ``"list_objects"`` / ...). Same convention as
  ``passes/pass_4/rules.py`` (Plan 03-10 deviation).
"""

from __future__ import annotations

from typing import Any, Final, Literal

import structlog
from mcpgen_ir.types import Endpoint, Pass1Output, RawIR, Tool1, Type
from pydantic import BaseModel, ConfigDict

_log = structlog.get_logger(__name__)


# ───────────────────────────── D-08 precedence sets ─────────────────────────
# Case-insensitive matching: input names are lowercased before set lookup.

_CURSOR_REQUEST_NAMES: Final[frozenset[str]] = frozenset(
    {"cursor", "page_token", "next_token", "after", "starting_after"}
)
_CURSOR_RESPONSE_NAMES: Final[frozenset[str]] = frozenset(
    {"next_cursor", "nextcursor", "next_page_token", "nextpagetoken"}
)
_OFFSET_REQUEST_NAMES: Final[frozenset[str]] = frozenset({"offset", "skip", "start_at", "startat"})
_PAGE_REQUEST_NAMES: Final[frozenset[str]] = frozenset({"page", "page_number", "pagenumber"})
_PER_PAGE_REQUEST_NAMES: Final[frozenset[str]] = frozenset({"per_page", "pagesize", "limit"})

# D-05 default limits per universal tool name (Pass 5 design §1.6).
_DEFAULT_LIMITS: Final[dict[str, tuple[int, int]]] = {
    "search": (10, 50),  # denser results
    "list_objects": (25, 100),
    "list_collections": (25, 100),
}

# Universal tool names that get pagination treatment (list-like).
_LIST_LIKE_UNIVERSAL_NAMES: Final[frozenset[str]] = frozenset(
    {"search", "list_objects", "list_collections"}
)

# Tie-break order when counts are equal (D-08: cursor preferred per MCP canonical).
_TIE_BREAK_ORDER: Final[tuple[str, ...]] = ("cursor", "offset", "page_number")


# ───────────────────────────── PaginationStrategy ───────────────────────────


class PaginationStrategy(BaseModel):
    """One pagination strategy chosen per server (D-08 invariant).

    All ``list_*`` tools in one server agree on ``style``. Per-tool
    overrides (when a single tool's local detection differs from the
    server-wide majority) are surfaced as warnings via the second
    element of ``detect_pagination_strategy``'s tuple — consumed by
    Pass 5 final assembly in plan 04-05.
    """

    model_config = ConfigDict(extra="forbid")

    style: Literal["cursor", "offset", "page_number", "none"]
    cursor_param_name: str | None = None
    cursor_response_field: str | None = None
    offset_param_name: str | None = None
    page_param_name: str | None = None
    per_page_param_name: str | None = None
    default_limit: int = 25
    max_limit: int = 100


# ─────────────────────────── per-endpoint detection ─────────────────────────


def _extract_param_names(parameters: list[dict[str, Any]]) -> set[str]:
    """Pull lowercased ``name`` field from each raw OpenAPI parameter dict.

    ``Endpoint.parameters`` is ``List[Dict[str, Any]]`` (raw OpenAPI param
    objects) per the frozen IR shape. Each item has a ``name`` key per the
    OpenAPI spec; we tolerate missing/non-string names defensively.
    """
    names: set[str] = set()
    for param in parameters:
        raw_name = param.get("name")
        if isinstance(raw_name, str):
            names.add(raw_name.lower())
    return names


def _extract_response_property_names(response_schema: dict[str, Any]) -> set[str]:
    """Pull lowercased property keys from a JSON-schema-like response object."""
    properties = response_schema.get("properties")
    if not isinstance(properties, dict):
        return set()
    return {k.lower() for k in properties if isinstance(k, str)}


def detect_pagination_for_endpoint(
    endpoint: Endpoint,
    response_schema: dict[str, Any],
    *,
    universal_tool_name: str | None = None,
) -> PaginationStrategy:
    """D-08 precedence — first match wins.

    1. Cursor (request param OR response field).
    2. Offset (request param).
    3. Page-number (request param ``page`` AND ``per_page``).
    4. None.
    """
    request_param_names = _extract_param_names(endpoint.parameters)
    response_props = _extract_response_property_names(response_schema)

    default_limit, max_limit = _DEFAULT_LIMITS.get(universal_tool_name or "", (25, 100))

    # 1. Cursor — request OR response signal.
    cursor_match_request = request_param_names & _CURSOR_REQUEST_NAMES
    cursor_match_response = response_props & _CURSOR_RESPONSE_NAMES
    if cursor_match_request or cursor_match_response:
        return PaginationStrategy(
            style="cursor",
            cursor_param_name=next(iter(cursor_match_request)) if cursor_match_request else None,
            cursor_response_field=next(iter(cursor_match_response))
            if cursor_match_response
            else None,
            default_limit=default_limit,
            max_limit=max_limit,
        )

    # 2. Offset.
    offset_match = request_param_names & _OFFSET_REQUEST_NAMES
    if offset_match:
        return PaginationStrategy(
            style="offset",
            offset_param_name=next(iter(offset_match)),
            default_limit=default_limit,
            max_limit=max_limit,
        )

    # 3. Page-number — REQUIRES BOTH page + per_page (D-08).
    page_match = request_param_names & _PAGE_REQUEST_NAMES
    per_page_match = request_param_names & _PER_PAGE_REQUEST_NAMES
    if page_match and per_page_match:
        return PaginationStrategy(
            style="page_number",
            page_param_name=next(iter(page_match)),
            per_page_param_name=next(iter(per_page_match)),
            default_limit=default_limit,
            max_limit=max_limit,
        )

    # 4. None — single-shot; no pagination params surfaced in inputSchema.
    return PaginationStrategy(style="none")


# ─────────────────────────── per-server majority vote ───────────────────────


def vote_majority_strategy(
    per_tool: dict[str, PaginationStrategy],
) -> PaginationStrategy:
    """Per-server majority vote with cursor → offset → page_number tie-break.

    Ignores tools with ``style='none'`` from the count. Returns
    ``PaginationStrategy(style='none')`` when no list-like tools have
    pagination signals.
    """
    counts: dict[str, int] = {}
    for strategy in per_tool.values():
        if strategy.style == "none":
            continue
        counts[strategy.style] = counts.get(strategy.style, 0) + 1

    if not counts:
        return PaginationStrategy(style="none")

    max_count = max(counts.values())

    # Tie-break order — cursor preferred per MCP canonical.
    for preferred in _TIE_BREAK_ORDER:
        if counts.get(preferred) == max_count:
            # Use the first tool with this style as the parameter-name source.
            for strategy in per_tool.values():
                if strategy.style == preferred:
                    return strategy

    # Defensive — every key in ``counts`` is a member of ``_TIE_BREAK_ORDER``.
    msg = f"unreachable: counts={counts!r}"
    raise RuntimeError(msg)


# ───────────────────────── server-wide orchestrator ─────────────────────────


def _is_list_like(tool: Tool1) -> bool:
    """Tool eligible for pagination treatment.

    For ``Type.universal`` tools, ``tool.name`` IS the universal-tool variant
    (Plan 03-10 convention; same as ``passes/pass_4/rules.py``).
    """
    if tool.type != Type.universal:
        return False
    return tool.name in _LIST_LIKE_UNIVERSAL_NAMES


def _response_schema_for_endpoint(endpoint: Endpoint) -> dict[str, Any]:
    """Pull the 200-OK response schema dict (or first 2xx fallback).

    ``Endpoint.responses`` is ``Dict[str, Any]`` — each value is a raw
    OpenAPI response object dict that MAY contain a ``schema`` key.
    Returns ``{}`` if no usable schema present.
    """
    two_hundred = endpoint.responses.get("200")
    if isinstance(two_hundred, dict):
        schema = two_hundred.get("schema")
        if isinstance(schema, dict):
            return schema
    # Fallback: first 2xx with a schema dict.
    for status, response in endpoint.responses.items():
        if not status.startswith("2"):
            continue
        if not isinstance(response, dict):
            continue
        schema = response.get("schema")
        if isinstance(schema, dict):
            return schema
    return {}


def detect_pagination_strategy(
    pass_1_output: Pass1Output,
    raw_ir: RawIR,
) -> tuple[PaginationStrategy, list[str]]:
    """Walk every list-shaped tool, detect per-tool strategy, vote majority.

    Returns ``(server_strategy, override_warnings)`` where each warning is
    a string like ``"list_things: tool-local strategy offset overridden by
    server-wide cursor"``. Consumed by plan 04-05's final-assembly module.
    """
    # Build endpoint lookup table (``"{METHOD} {path}"`` key).
    endpoints_by_id: dict[str, Endpoint] = {
        f"{e.method.value} {e.path}": e for e in raw_ir.endpoints
    }

    per_tool: dict[str, PaginationStrategy] = {}
    for tool in pass_1_output.tools:
        if not _is_list_like(tool):
            continue
        if not tool.source_endpoints:
            continue

        endpoint = endpoints_by_id.get(tool.source_endpoints[0])
        if endpoint is None:
            _log.warning(
                "pass_5.pagination.endpoint_not_found",
                tool_name=tool.name,
            )
            continue

        response_schema = _response_schema_for_endpoint(endpoint)
        per_tool[tool.name] = detect_pagination_for_endpoint(
            endpoint,
            response_schema,
            universal_tool_name=tool.name,
        )

    server_strategy = vote_majority_strategy(per_tool)

    override_warnings: list[str] = []
    for tool_name, tool_strategy in per_tool.items():
        if tool_strategy.style != server_strategy.style and tool_strategy.style != "none":
            override_warnings.append(
                f"{tool_name}: tool-local strategy {tool_strategy.style} "
                f"overridden by server-wide {server_strategy.style}"
            )

    _log.info(
        "pass_5.pagination.detect_complete",
        strategy=server_strategy.style,
        list_tool_count=len(per_tool),
        override_count=len(override_warnings),
    )
    return server_strategy, override_warnings
