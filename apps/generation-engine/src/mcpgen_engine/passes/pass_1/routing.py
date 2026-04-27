"""Pass 1 Phase 1.3 — deterministic routing config + smart-ID format.

Pure-function module — NO LLM, NO I/O. All public functions are deterministic
on their inputs.

Three responsibilities:

1. ``derive_spec_slug(spec_title)`` — D-32 deterministic spec slug. Lowercases,
   replaces non-alphanum with ``-``, collapses repeats, trims to 32 chars.
   Stripe API → ``stripe-api``; GitHub v3 REST API → ``github-v3-rest-api``.

2. ``build_smart_id_format(spec_slug)`` — D-31 schema-level format string. Phase 2
   emits ``{spec_slug}:{type}:{collection}:{identifier}`` ONLY; the per-tenant
   short-id prefix is prepended at deploy time by Phase 6 dispatch / Phase 4
   Stage E template. Phase 2 NEVER embeds any tenant identifier (verified by
   grep in ``02-07-PLAN.md`` `<verification>` step 6).

3. ``build_routing_config(...)`` — Phase 1.3 driver. Builds ``Routing1`` with
   ``SmartId`` (format + types + collections list) plus ``Rule1[]`` mapping
   each subsumed Pass 0 endpoint → universal tool with ``params_mapping``
   derived from OpenAPI parameter ``style`` + ``explode`` (Pitfall F: Stripe
   ``deepObject`` filter encoding mismatch).

Smart-ID regex helper (``build_smart_id_regex``) is exposed for the Pass 1
fixture round-trip test (D-56, T-2-C5 / Pitfall #1) — the regex tolerates an
arbitrary tenant prefix ``[a-z0-9-]+-`` so two synthetic tenants ``acme-`` and
``widgets-`` wrapping the same ``stripe-api`` spec produce IDs that BOTH match
but are LITERALLY different.

Threats addressed:
- T-2-07-02 (D-31 / D-56): smart-ID format never embeds any per-tenant
  identifier; deploy-time prefix is Phase 6's responsibility.
  ``test_smart_id_no_overlap.py`` proves the invariant.
- T-2-07-06 (Pitfall F): ``params_mapping`` walks endpoint parameters with
  ``style`` + ``explode`` to produce correct upstream wire keys (e.g.,
  ``filter.created.gte`` → ``created[gte]`` for ``deepObject`` style).

References:
- 02-CONTEXT.md D-31 (smart-ID format) + D-32 (slug derivation) + D-56 (Pitfall #1)
- 02-RESEARCH.md §"Pattern 4: Pass 1 Six-Tool Pattern + Smart-ID Schema Format"
  lines 631-693, §"Pitfall F" lines 1022-1031
- 02-PATTERNS.md `passes/pass_1/routing.py` row
"""

from __future__ import annotations

import re
from typing import Any, Final

from mcpgen_ir.types import (
    Endpoint,
    Method,
    RawIR,
    Routing1,
    Rule1,
    SmartId,
    Tool1,
    Type,
    UniversalTool,
)

# D-32: spec_slug is at most 32 chars after collapse + trim.
_SLUG_MAX_LENGTH: Final[int] = 32

# D-31: types we surface in SmartId.types. Phase 2 fixtures use ``object`` and
# ``collection``; ``schema`` is reserved for future metadata-listing servers.
_DEFAULT_SMART_ID_TYPES: Final[tuple[str, ...]] = ("object", "collection")


# ───────────────────────────── Spec-slug derivation ────────────────────────


def derive_spec_slug(spec_title: str) -> str:
    """D-32 — deterministic spec slug from `spec.info.title`.

    ``Stripe API`` → ``stripe-api``.
    ``GitHub v3 REST API`` → ``github-v3-rest-api``.
    ``  Notion-API!  `` → ``notion-api`` (whitespace + punctuation collapse + trim).

    Returns at most 32 chars. Empty input → ``"unnamed-spec"`` (defensive
    fallback; Pass 1 callers must pass a non-empty title — the slug never
    surfaces in user UI when the input is empty).
    """
    s = re.sub(r"[^a-z0-9]+", "-", spec_title.lower())
    s = re.sub(r"-+", "-", s).strip("-")
    if not s:
        return "unnamed-spec"
    return s[:_SLUG_MAX_LENGTH]


# ───────────────────────────── Smart-ID format ─────────────────────────────


def build_smart_id_format(spec_slug: str) -> str:
    """D-31 — schema-level smart-ID format. NO tenant prefix at Phase 2.

    Phase 2 emits ``{spec_slug}:{type}:{collection}:{identifier}`` with
    ``{spec_slug}`` substituted to its concrete value (e.g. ``stripe-api``)
    and ``{type}``, ``{collection}``, ``{identifier}`` left as Python format
    placeholders so Stage E codegen (Phase 4) and dispatch worker (Phase 6)
    can use ``str.format()`` at runtime.

    The deploy-time per-tenant short-id prefix is NOT embedded here —
    Phase 6 prepends it. ``test_smart_id_no_overlap.py`` proves the
    invariant (D-56 / Pitfall #1).
    """
    return f"{spec_slug}:{{type}}:{{collection}}:{{identifier}}"


def build_smart_id_regex(
    spec_slug: str,
    types: list[str] | tuple[str, ...],
    collections: list[str] | tuple[str, ...],
) -> str:
    """D-56 — regex for the Pass 1 fixture round-trip test (Pitfall #1).

    The regex tolerates an arbitrary tenant prefix ``[a-z0-9-]+-`` so the
    same schema-level format matches IDs from any deployment. Two synthetic
    tenants ``acme-`` and ``widgets-`` wrapping the same ``stripe-api`` spec
    produce literally-different IDs that BOTH match this regex.

    The identifier alphabet is ASCII-printable-safe (alphanum + `_./-`);
    tightening per upstream's actual ID set is Phase 4 work.
    """
    if not types:
        msg = "types must be non-empty"
        raise ValueError(msg)
    if not collections:
        msg = "collections must be non-empty"
        raise ValueError(msg)
    type_alt = "|".join(re.escape(t) for t in types)
    coll_alt = "|".join(re.escape(c) for c in collections)
    return rf"^[a-z0-9-]+-{re.escape(spec_slug)}:" rf"({type_alt}):({coll_alt}):[A-Za-z0-9_./-]+$"


# ───────────────────────────── Routing config ──────────────────────────────


def build_routing_config(
    universal_tools: list[Tool1],
    extras: list[Tool1],
    spec_slug: str,
    raw_ir: RawIR,
) -> Routing1:
    """Phase 1.3 — deterministic ``Routing1`` from synthesized tools + raw IR.

    Builds:
    - ``smart_id`` — ``SmartId(format, types, collections)``. ``format`` is the
      schema-level format from ``build_smart_id_format``. ``types`` is the
      canonical pair ``("object", "collection")``. ``collections`` is derived
      deterministically from raw_ir endpoints by extracting the resource
      collection name (e.g. ``Customer`` from ``/v1/customers/{customer}``).

    - ``rules`` — one ``Rule1`` per (tool, source_endpoint) pair. ``params_mapping``
      is derived deterministically from the underlying OpenAPI parameter
      ``style`` + ``explode``.

    Pure: no I/O. Returns a frozen ``Routing1`` Pydantic model.
    """
    collections = _derive_collections(raw_ir.endpoints)
    smart_id = SmartId(
        format=build_smart_id_format(spec_slug),
        types=list(_DEFAULT_SMART_ID_TYPES),
        collections=collections,
    )

    endpoint_index = _build_endpoint_index(raw_ir.endpoints)
    rules: list[Rule1] = []
    for tool in [*universal_tools, *extras]:
        for endpoint_id in tool.source_endpoints:
            ep = endpoint_index.get(endpoint_id)
            if ep is None:
                # Defensive: skip rules referencing unknown endpoints. The
                # coverage proof step will catch these as uncovered and the
                # orchestrator will retry / degrade per D-34.
                continue
            universal = _resolve_universal_for_tool(tool)
            rules.append(
                Rule1(
                    universal_tool=universal,
                    target_endpoint=f"{_method_str(ep.method)} {ep.path}",
                    params_mapping=_derive_params_mapping(tool, ep),
                )
            )

    return Routing1(smart_id=smart_id, rules=rules)


# ───────────────────────────── Helpers ─────────────────────────────────────


def _build_endpoint_index(endpoints: list[Endpoint]) -> dict[str, Endpoint]:
    """Build ``"METHOD path"`` → ``Endpoint`` lookup table."""
    return {f"{_method_str(ep.method)} {ep.path}": ep for ep in endpoints}


def _method_str(method: Method | str) -> str:
    """Coerce ``Endpoint.method`` (Method enum or str) to uppercase string."""
    if isinstance(method, Method):
        return str(method.value)
    return str(method).upper()


def _derive_collections(endpoints: list[Endpoint]) -> list[str]:
    """Derive the canonical list of collection names from raw_ir endpoints.

    Reads the FIRST resource segment after the API prefix. ``/v1/customers``,
    ``/v1/customers/{id}``, ``/v1/customers/{id}/subscriptions`` all map to
    the ``Customer`` collection. Non-collection paths (e.g. ``/v1/search``)
    are skipped.

    Returns a sorted, de-duplicated list of CamelCase collection names. Sorted
    output keeps SmartId.collections deterministic across runs.
    """
    collections: set[str] = set()
    for ep in endpoints:
        name = _collection_name_from_path(ep.path)
        if name is not None:
            collections.add(name)
    return sorted(collections)


def _collection_name_from_path(path: str) -> str | None:
    """Extract a CamelCase collection name from an OpenAPI path template.

    Skip empty segments, version prefixes (``v1``, ``v2``, ``v3``), and path
    parameters (``{id}``, ``{customer}``). The first remaining segment becomes
    the collection name (singularized + CamelCased).

    ``/v1/customers`` → ``Customer``
    ``/v1/charges/{charge}/capture`` → ``Charge``
    ``/v1/search`` → ``Search`` (singular already)
    ``/`` or empty → ``None``
    """
    segments = [s for s in path.split("/") if s]
    for seg in segments:
        if seg.startswith("{") and seg.endswith("}"):
            continue
        if re.fullmatch(r"v\d+", seg):
            continue
        return _singularize_camel(seg)
    return None


def _singularize_camel(token: str) -> str:
    """Naïve singularization + CamelCase."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", token)
    if cleaned.endswith("ies") and len(cleaned) > 3:
        cleaned = cleaned[:-3] + "y"
    elif cleaned.endswith("ses") and len(cleaned) > 3:
        cleaned = cleaned[:-2]
    elif cleaned.endswith("s") and len(cleaned) > 1 and not cleaned.endswith("ss"):
        cleaned = cleaned[:-1]
    parts = re.split(r"[_-]+", cleaned)
    return "".join(p.capitalize() for p in parts if p)


def _resolve_universal_for_tool(tool: Tool1) -> UniversalTool:
    """Map a ``Tool1`` (universal or extra) to a ``UniversalTool`` enum.

    Universal tools' names match the ``UniversalTool`` enum directly. Extras
    (action / workflow / specialized) don't map cleanly to a single universal —
    they own their own routing semantics — so we route extras to the closest
    universal based on shape. Concretely:

    - Action / workflow → routed under the ``upsert`` umbrella (state-changing
      POST/PATCH/DELETE without a clean delete signature).
    - Specialized → routed under ``list_objects`` (read-only fallback).

    This mapping only feeds ``Rule1.universal_tool`` for routing-table
    lookups in Stage E (Phase 4). The agent surface still sees the extra
    tool by its own name (``charges_capture``, etc.) — the universal-tool
    field is engine-internal routing metadata.
    """
    if tool.type == Type.universal:
        return UniversalTool(tool.name)
    if tool.type == Type.specialized:
        return UniversalTool.list_objects
    # action + workflow → upsert routing umbrella
    return UniversalTool.upsert


def _derive_params_mapping(tool: Tool1, endpoint: Endpoint) -> dict[str, str]:
    """Pitfall F — derive ``params_mapping`` from OpenAPI parameter style/explode.

    For each upstream parameter, decide how the universal tool's input maps
    to the upstream wire format:

    - ``deepObject`` + ``explode=True`` (Stripe ``created[gte]`` family):
      universal ``filter.{name}.{key}`` → upstream ``{name}[{key}]``. We
      emit a placeholder mapping ``filter.{name}`` → ``{name}[*]`` since
      the inner key set isn't fixed at routing time; Stage E expands at
      runtime.
    - Path parameters: universal ``id`` (for ``fetch``) or ``{name}``
      (for action tools) → upstream path placeholder.
    - Query parameters (style=``form``): universal ``filter.{name}`` /
      ``{name}`` → upstream ``{name}`` (1:1).
    - Body params for ``upsert``: universal ``data`` → upstream request
      body root.

    Returns a dict that Stage E (Phase 4) consumes to build the actual HTTP
    query-string serializer (deepObject vs form vs simple).
    """
    mapping: dict[str, str] = {}

    # Universal-tool-specific patterns:
    if tool.type == Type.universal:
        universal = UniversalTool(tool.name)
        if universal == UniversalTool.search:
            mapping["query"] = "query"
            return mapping
        if universal == UniversalTool.fetch:
            # The single OpenAPI path parameter is the smart-ID-extracted identifier.
            for param in endpoint.parameters:
                if _param_in(param) == "path":
                    mapping["id"] = _param_name(param)
                    return mapping
            # Defensive fallback.
            mapping["id"] = "id"
            return mapping
        if universal == UniversalTool.upsert and endpoint.request_body is not None:
            mapping["data"] = "$body"
            # Path params (e.g., POST /v1/customers/{customer}) preserved.
            for param in endpoint.parameters:
                if _param_in(param) == "path":
                    mapping[_param_name(param)] = _param_name(param)
            return mapping
        if universal == UniversalTool.delete:
            for param in endpoint.parameters:
                if _param_in(param) == "path":
                    mapping[_param_name(param)] = _param_name(param)
            return mapping
        # list_objects, list_collections, generic upsert without body:
        for param in endpoint.parameters:
            mapping[_filter_key_for_param(param)] = _wire_key_for_param(param)
        return mapping

    # Action / workflow / specialized — preserve every parameter 1:1 by name.
    for param in endpoint.parameters:
        mapping[_param_name(param)] = _wire_key_for_param(param)
    return mapping


def _param_name(param: dict[str, Any]) -> str:
    name = param.get("name")
    if not isinstance(name, str) or not name:
        return "param"
    return name


def _param_in(param: dict[str, Any]) -> str:
    located = param.get("in")
    if not isinstance(located, str):
        return "query"
    return located


def _filter_key_for_param(param: dict[str, Any]) -> str:
    """Universal-tool side key for a query/header/path parameter.

    ``filter.{name}`` for query/header (so the universal ``list_objects.filter``
    structure survives); ``{name}`` for path. Body parameters are handled
    separately in ``_derive_params_mapping``.
    """
    located = _param_in(param)
    name = _param_name(param)
    if located == "path":
        return name
    return f"filter.{name}"


def _wire_key_for_param(param: dict[str, Any]) -> str:
    """Upstream wire key for a parameter, honoring style+explode.

    Pitfall F — ``deepObject`` + ``explode=True`` (Stripe ``created[gte]``):
    we emit ``{name}[*]`` as the upstream key pattern. Stage E (Phase 4)
    expands ``[*]`` → ``[{actual_key}]`` per inner property at request
    serialization time.
    """
    name = _param_name(param)
    style = param.get("style")
    explode = param.get("explode", False)
    if style == "deepObject" and explode is True:
        return f"{name}[*]"
    return name
