"""Pass 3 — D-21 standard parameter descriptions for 6 universal tools.

Hardcoded canonical descriptions for every (universal_tool, param_name)
pair in the universal-tool standard signatures from
``extract.py::_UNIVERSAL_MIN_SIG``. Pass 3 design Appendix A is the verbatim
source for the param-name + default-value contract; the descriptions here
are the canonical English text that lands in the agent-facing JSON Schema.

Plan 03-09 wiring (downstream consumer):

- For tools whose ``Tool1.type == Type.universal``: look up the standard
  description per ``(universal_tool_name, param_name)``. If found, OVERRIDE
  the LLM-enriched description (the LLM may extend with API-specific detail
  in a separate field; the canonical text MUST be present).

- For other tools: fall back to LLM-enriched description from ``enrich.py``.

Pitfall #32 (OpenAI Deep Research compliance): ``search.query`` and
``fetch.id`` descriptions are FROZEN — Phase 5 F1 hardcodes the regex
check. Adding extra params to ``search`` or ``fetch`` is an architectural
violation; cross-parameter validation in Plan 03-09 enforces.

Pure: no I/O, no LLM imports.

References:
- 03-CONTEXT.md D-21 (standard sets verbatim) + Pitfall #32 (search/fetch invariant)
- 03-PATTERNS.md ``passes/pass_3/standards.py`` row
- docs/mcpgen-pass-3-design.md Appendix A
"""

from __future__ import annotations

from typing import Final

# ─────────────────────────── D-21 standards ────────────────────────────────


# Each entry's value is the canonical description that lands in the agent-facing
# JSON Schema's ``description`` field for this universal-tool parameter. Every
# value is > 50 chars (substantive, not stubs). Names of standard params
# (``limit`` / ``offset`` / ``cursor`` / ``sort_order`` / ``properties``) are
# FROZEN across all servers per Pass 3 design §11.3 — different APIs use
# different upstream conventions (``per_page``, ``count``, ``pagesize``...);
# Phase 4 Stage E maps these standard names back to upstream wire keys.
STANDARD_PARAMETER_DESCRIPTIONS: Final[dict[tuple[str, str], str]] = {
    # search — Pitfall #32 OpenAI compliance: query is the ONLY param.
    # FROZEN text — Phase 5 F1 regex-checks the leading "Search query string."
    ("search", "query"): (
        "Search query string. Returns ranked results with smart IDs in "
        "{spec_slug}:{type}:{collection}:{identifier} format. "
        "Use natural-language phrasing or upstream-API-specific keywords."
    ),
    # fetch — Pitfall #32 OpenAI compliance: id is the ONLY param.
    # FROZEN text — Phase 5 F1 regex-checks the leading "Smart identifier".
    ("fetch", "id"): (
        "Smart identifier for the object to fetch, in "
        "{spec_slug}:{type}:{collection}:{identifier} format. "
        "If you only have a bare upstream ID, prefix with the smart-ID format "
        "above; the server will route correctly."
    ),
    # list_collections (4 params).
    ("list_collections", "pattern"): (
        "Optional glob-style pattern to filter collection names "
        "(e.g., 'charge*' to list only Charge-related collections). "
        "Omit to list all available collections."
    ),
    ("list_collections", "include_schema"): (
        "When true, includes the JSON Schema for each collection's objects. "
        "Default false to save tokens; opt in only when you need the schema."
    ),
    ("list_collections", "limit"): (
        "Maximum number of collections to return per page. Default 50, max 100."
    ),
    ("list_collections", "offset"): (
        "Number of collections to skip (for pagination). Default 0; "
        "increment by 'limit' to walk subsequent pages."
    ),
    # list_objects (8 params).
    ("list_objects", "collection"): (
        "Required collection name (e.g., 'Charge', 'Customer'). "
        "Use list_collections() to discover available collection names first."
    ),
    ("list_objects", "properties"): (
        "Optional list of property names to include in each result object. "
        "Omit to use the standard projection; opt in to verbose / nested fields "
        "only when needed (token economy)."
    ),
    ("list_objects", "filter"): (
        "Optional filter — see this tool's filter design for the exact shape "
        "(structured object / DSL string / individual params, depending on the "
        "server's chosen strategy per Pass 3 design D-18)."
    ),
    ("list_objects", "sort_by"): (
        "Optional field name to sort results by (must be one of the collection's "
        "supported sort keys; defaults to natural / insertion order if omitted)."
    ),
    ("list_objects", "sort_order"): (
        "Sort order for results: 'asc' or 'desc'. Default 'desc' (newest first). "
        "Frozen across all servers (Pass 3 design §11.3)."
    ),
    ("list_objects", "limit"): (
        "Maximum number of objects to return per page. Default 25, max 100. "
        "Frozen across all servers (Pass 3 design §11.3)."
    ),
    ("list_objects", "offset"): (
        "Number of objects to skip (for pagination). Default 0. "
        "Mutually exclusive with cursor — use one pagination style per call."
    ),
    ("list_objects", "cursor"): (
        "Opaque cursor string for cursor-based pagination (returned by previous "
        "response's next_cursor). Mutually exclusive with offset."
    ),
    # upsert (4 params).
    ("upsert", "collection"): (
        "Required collection name (e.g., 'Charge', 'Customer'). Use "
        "list_collections() to discover available collection names first."
    ),
    ("upsert", "data"): (
        "Object or array of objects to create or UPDATE. When 'id' / 'ids' is "
        "supplied, performs UPDATE on the matching object(s); otherwise CREATE."
    ),
    ("upsert", "id"): (
        "Optional smart identifier for single-object update, in "
        "{spec_slug}:{type}:{collection}:{identifier} format. "
        "Mutually exclusive with 'ids'."
    ),
    ("upsert", "ids"): (
        "Optional list of smart identifiers for batch update (one per object in "
        "'data'). Mutually exclusive with 'id'."
    ),
    # delete (5 params).
    ("delete", "type"): (
        "Required selector: 'object' (delete one), 'objects' (delete a batch), "
        "or 'collection' (delete the entire collection). Drives which other "
        "params are required."
    ),
    ("delete", "id"): (
        "Smart identifier for single-object delete, in "
        "{spec_slug}:{type}:{collection}:{identifier} format. Required when "
        "type='object'. Mutually exclusive with 'ids' and 'collection'."
    ),
    ("delete", "ids"): (
        "List of smart identifiers for batch delete. Required when "
        "type='objects'. Mutually exclusive with 'id' and 'collection'."
    ),
    ("delete", "collection"): (
        "Collection name to delete entirely. Required when type='collection'. "
        "Mutually exclusive with 'id' and 'ids'."
    ),
    ("delete", "confirm"): (
        "Must be set to true to perform the destructive operation. "
        "Default false (safety) — caller must explicitly opt in. "
        "Pass 4 sets destructiveHint=true on this tool."
    ),
}


# ─────────────────────────── Public API ─────────────────────────────────────


def get_standard_description(universal_tool_name: str, param_name: str) -> str | None:
    """Return the canonical description for a (universal_tool, param) pair.

    Returns ``None`` when the pair is not present in
    ``STANDARD_PARAMETER_DESCRIPTIONS`` — caller falls back to the LLM-enriched
    description from ``enrich.py``.
    """
    return STANDARD_PARAMETER_DESCRIPTIONS.get((universal_tool_name, param_name))
