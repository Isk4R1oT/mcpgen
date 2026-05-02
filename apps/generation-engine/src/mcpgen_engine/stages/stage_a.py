"""Stage A — Deterministic OpenAPI 3.x parser.

Fetches an OpenAPI 3.0.x or 3.1.x spec (URL or inline content), runs prance's
ResolvingParser with circular-ref + size guards, validates against
openapi-spec-validator, and produces a `RawIR` with deterministic `spec_hash`
(sha256 over canonical-sorted JSON) plus a heuristic `dependency_graph`
(D-15: response→request smart-ID-shape correlation).

This module is **100% deterministic.** It MUST NOT import from
`mcpgen_engine.llm.*`. The `test_no_duplicate_model_construction` AST gate
already enforces this for LLM imports; the absence of any LLM call here keeps
Stage A as the cache-key boundary (Plan 08 L1 cache key derives from
`spec_hash`).

Error codes (stable, user-facing):
- ``SPEC_TOO_LARGE``        — raw >10MB or resolved >50MB
- ``UNSUPPORTED_SPEC_FORMAT`` — non-OpenAPI 3.x input or malformed JSON/YAML
- ``CIRCULAR_REF``          — surfaced from prance ResolutionError after handler
- ``INVALID_INPUT``         — both/neither of spec_url and spec_content provided
- ``REMOTE_FETCH_FAILED``   — httpx error during URL fetch (network, redirect)

References:
- 02-CONTEXT.md D-10..D-15 (Stage A contract)
- 02-RESEARCH.md §"Pattern 2: Stage A" + §"Pitfall C/D/H"
- packages/ir/python/types.py (FROZEN per D-10 — RawIR shape)
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Final, cast

import httpx
import structlog
import yaml
from mcpgen_ir.types import RawIR
from prance import ResolvingParser
from prance.util import resolver as prance_resolver
from prance.util.url import ResolutionError as PranceResolutionError

# ───────────────────────── Hard limits (D-14) ──────────────────────────────

_MAX_RAW_BYTES: Final[int] = 10 * 1024 * 1024  # 10 MB
_MAX_RESOLVED_BYTES: Final[int] = 50 * 1024 * 1024  # 50 MB
_HTTP_TIMEOUT_SECONDS: Final[float] = 30.0
_HTTP_MAX_REDIRECTS: Final[int] = 3

# Methods Stage A surfaces; OPTIONS/HEAD intentionally excluded per D-23 so
# Pass 0's deterministic filter never has to drop them.
_HTTP_METHODS: Final[tuple[str, ...]] = ("get", "post", "put", "patch", "delete")

# Field names that suggest a producer endpoint emits an identifier (D-15
# heuristic — Assumption A6 in 02-RESEARCH.md). Empty graph is acceptable.
_ID_FIELD_SUFFIXES: Final[tuple[str, ...]] = ("_id", "_uuid")
_ID_FIELD_NAMES: Final[frozenset[str]] = frozenset({"id", "uuid"})

_log = structlog.get_logger(__name__)


# ───────────────────────────── Errors ──────────────────────────────────────


class StageAError(ValueError):
    """Raised by Stage A on invalid input. Message is user-facing."""


# ───────────────────────────── Public API ──────────────────────────────────


async def run(spec_url: str | None, spec_content: str | None) -> tuple[RawIR, list[dict[str, Any]]]:
    """Parse an OpenAPI 3.x spec into the canonical ``RawIR`` + spec servers.

    Exactly one of ``spec_url`` or ``spec_content`` must be set. Both-set or
    both-None raises ``StageAError("INVALID_INPUT: ...")``.

    The function is deterministic: identical input always produces a
    byte-identical ``RawIR.spec_hash``.

    Returns a ``(raw_ir, servers)`` tuple. ``servers`` is the OpenAPI
    ``servers[]`` array (each entry ``{"url": str, "description"?: str,
    "variables"?: dict}``); empty list when the spec omits the field.
    Carried alongside ``RawIR`` (rather than embedded in it — frozen IR
    has no ``servers`` field) so Stage E can build a complete upstream
    base URL: ``servers[0].url`` is often a relative path (e.g.
    ``/api/v3`` for Petstore, ``/v1`` for Stripe) which must be appended
    to the spec URL host.
    """

    if (spec_url is None) == (spec_content is None):
        raise StageAError("INVALID_INPUT: provide exactly one of spec_url or spec_content")

    started_ns = time.perf_counter_ns()

    spec_text = (
        await _fetch_spec_text(spec_url) if spec_url is not None else cast(str, spec_content)
    )
    _enforce_raw_size(spec_text)

    # Surface malformed JSON/YAML with a stable error code BEFORE prance gets
    # to wrap the same problem in a backend-specific exception.
    _parse_spec_text(spec_text)
    resolved = _resolve_refs(spec_text)
    _enforce_resolved_size(resolved)

    spec_format = _detect_spec_format(resolved)
    endpoints = _extract_endpoints(resolved)
    schemas = _safe_dict(resolved.get("components", {}).get("schemas"))
    security_schemes_raw = _safe_dict(resolved.get("components", {}).get("securitySchemes"))
    security_schemes = _normalize_security_schemes(security_schemes_raw)
    dependency_graph = _build_dependency_graph(endpoints, schemas)
    servers = _extract_servers(resolved)

    spec_hash = hashlib.sha256(_canonicalize(resolved).encode("utf-8")).hexdigest()

    raw_ir = RawIR.model_validate(
        {
            "spec_format": spec_format,
            "spec_hash": spec_hash,
            "endpoints": endpoints,
            "schemas": schemas,
            "security_schemes": security_schemes,
            "dependency_graph": dependency_graph,
        }
    )

    _log.info(
        "stage_a.complete",
        spec_format=spec_format,
        endpoint_count=len(endpoints),
        server_count=len(servers),
        spec_hash_prefix=spec_hash[:16],
        dependency_edge_count=sum(len(v) for v in dependency_graph.values()),
        parse_duration_ms=(time.perf_counter_ns() - started_ns) // 1_000_000,
    )

    return raw_ir, servers


def _extract_servers(resolved: dict[str, Any]) -> list[dict[str, Any]]:
    """Pull the OpenAPI ``servers[]`` array; empty list when absent.

    OpenAPI 3.x permits ``servers[].url`` to be either fully-qualified
    (``https://api.stripe.com/v1``) or a relative path
    (``/api/v3`` — common for Petstore/Swagger UI generators). We
    surface the raw entries; Stage E ``_derive_upstream_base_url``
    combines them with the original ``spec_url`` host when needed.
    """
    servers_raw = resolved.get("servers")
    if not isinstance(servers_raw, list):
        return []
    out: list[dict[str, Any]] = []
    for entry in servers_raw:
        if not isinstance(entry, dict):
            continue
        url = entry.get("url")
        if not isinstance(url, str) or not url:
            continue
        out.append({k: v for k, v in entry.items() if isinstance(k, str)})
    return out


def _recursion_handler(limit: int, refstring: str, recursions: list[str]) -> dict[str, str]:
    """prance recursion_limit_handler — replace cycles with a placeholder schema.

    Pitfall C empirical fix (verified 2026-04-26 on Stripe). Returning a
    permissive ``{"type": "object"}`` schema is the only viable strategy for
    real-world specs (Stripe `Charge.refund.charge → Charge`); rejecting on
    cycle would fail-close on every major API spec we target.

    Arguments are part of the prance handler ABI; we don't need their values.
    """
    del limit, refstring, recursions
    return {"type": "object"}


# ───────────────────────── Spec fetching / parsing ─────────────────────────


async def _fetch_spec_text(spec_url: str) -> str:
    """Fetch spec via httpx with strict timeouts + body cap (D-13)."""
    try:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(_HTTP_TIMEOUT_SECONDS),
            follow_redirects=True,
            max_redirects=_HTTP_MAX_REDIRECTS,
        ) as client:
            resp = await client.get(spec_url)
            resp.raise_for_status()
    except httpx.HTTPError as e:
        raise StageAError(f"REMOTE_FETCH_FAILED: {e}") from e

    content_length_hdr = resp.headers.get("content-length")
    if content_length_hdr is not None:
        try:
            if int(content_length_hdr) > _MAX_RAW_BYTES:
                raise StageAError("SPEC_TOO_LARGE: raw spec >10MB (Content-Length)")
        except ValueError:
            # Malformed header — fall through to post-read size check.
            pass

    return resp.text


def _enforce_raw_size(spec_text: str) -> None:
    if len(spec_text.encode("utf-8")) > _MAX_RAW_BYTES:
        raise StageAError("SPEC_TOO_LARGE: raw spec >10MB")


def _parse_spec_text(spec_text: str) -> dict[str, Any]:
    """Try JSON first, fall back to YAML (D-12)."""
    try:
        parsed_json = json.loads(spec_text)
    except json.JSONDecodeError:
        parsed_json = None

    if parsed_json is not None:
        if not isinstance(parsed_json, dict):
            raise StageAError("UNSUPPORTED_SPEC_FORMAT: top-level JSON must be an object")
        return cast(dict[str, Any], parsed_json)

    try:
        parsed_yaml = yaml.safe_load(spec_text)
    except yaml.YAMLError as e:
        raise StageAError(f"UNSUPPORTED_SPEC_FORMAT: not JSON or YAML: {e}") from e

    if not isinstance(parsed_yaml, dict):
        raise StageAError("UNSUPPORTED_SPEC_FORMAT: top-level YAML must be a mapping")
    return cast(dict[str, Any], parsed_yaml)


def _resolve_refs(spec_text: str) -> dict[str, Any]:
    """Run prance with the Stripe-empirically-verified circular-ref config.

    Pitfall C (verified 2026-04-26): default config deadlocks on cyclic specs.
    `recursion_limit=2 + handler returning {"type": "object"}` replaces deeply
    nested cycles with a placeholder schema; `RESOLVE_INTERNAL` skips remote
    refs (Phase 6 will reintroduce remote ref following with an allowlist).
    """
    try:
        parser = ResolvingParser(
            spec_string=spec_text,
            backend="openapi-spec-validator",
            strict=False,
            resolve_types=prance_resolver.RESOLVE_INTERNAL,
            recursion_limit=2,
            recursion_limit_handler=_recursion_handler,
        )
    except PranceResolutionError as e:
        # The handler should have replaced cycles, but unresolvable refs (e.g.
        # bad relative paths in a malformed spec) still surface here.
        raise StageAError(f"CIRCULAR_REF: {e}") from e
    except (StageAError, MemoryError):
        # Bubble up our own errors and resource exhaustion unchanged.
        raise
    except Exception as e:
        # openapi-spec-validator wraps schema violations in generic exceptions;
        # treat anything else as a malformed spec rather than a CIRCULAR_REF.
        raise StageAError(f"UNSUPPORTED_SPEC_FORMAT: {e}") from e

    return cast(dict[str, Any], parser.specification)


def _enforce_resolved_size(resolved: dict[str, Any]) -> None:
    if len(json.dumps(resolved)) > _MAX_RESOLVED_BYTES:
        raise StageAError("SPEC_TOO_LARGE: resolved spec >50MB")


def _detect_spec_format(resolved: dict[str, Any]) -> str:
    """Discriminate 3.0.x vs 3.1.x; reject Swagger 2.0 / non-OpenAPI (D-11)."""
    if "swagger" in resolved:
        raise StageAError(
            "UNSUPPORTED_SPEC_FORMAT: Swagger 2.0 is not supported in MVP; "
            "convert via swagger2openapi (https://www.npmjs.com/package/swagger2openapi)"
        )

    version = resolved.get("openapi", "")
    if not isinstance(version, str):
        raise StageAError("UNSUPPORTED_SPEC_FORMAT: openapi version must be a string")
    if version.startswith("3.0"):
        return "openapi-3.0"
    if version.startswith("3.1"):
        return "openapi-3.1"

    raise StageAError(
        f"UNSUPPORTED_SPEC_FORMAT: only OpenAPI 3.0.x/3.1.x supported (got {version!r}); "
        "convert via swagger2openapi if Swagger 2.0"
    )


# ─────────────────────────── Endpoint extraction ───────────────────────────


def _extract_endpoints(resolved: dict[str, Any]) -> list[dict[str, Any]]:
    """Walk paths x methods. OPTIONS/HEAD excluded per D-23.

    Returns plain dicts; ``RawIR.model_validate`` coerces them into
    ``Endpoint`` Pydantic instances.
    """
    paths = _safe_dict(resolved.get("paths"))
    endpoints: list[dict[str, Any]] = []

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method in _HTTP_METHODS:
            operation = path_item.get(method)
            if not isinstance(operation, dict):
                continue

            parameters_raw = operation.get("parameters", [])
            if not isinstance(parameters_raw, list):
                parameters_raw = []
            # FROZEN IR Endpoint accepts List[Dict[str, Any]] — pass-through.
            parameters: list[dict[str, Any]] = [p for p in parameters_raw if isinstance(p, dict)]

            responses_raw = operation.get("responses", {})
            responses = _safe_dict(responses_raw)

            tags_raw = operation.get("tags", [])
            tags: list[str] = (
                [t for t in tags_raw if isinstance(t, str)] if isinstance(tags_raw, list) else []
            )

            request_body = operation.get("requestBody")
            if request_body is not None and not isinstance(request_body, dict):
                request_body = None

            endpoints.append(
                {
                    "method": method.upper(),
                    "path": path,
                    "operation_id": _opt_str(operation.get("operationId")),
                    "summary": _opt_str(operation.get("summary")),
                    "description": _opt_str(operation.get("description")),
                    "parameters": parameters,
                    "request_body": request_body,
                    "responses": responses,
                    "tags": tags,
                    "deprecated": bool(operation.get("deprecated", False)),
                }
            )

    return endpoints


# ────────────────────── Security scheme normalization ──────────────────────


def _normalize_security_schemes(raw: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Reshape OpenAPI ``securitySchemes`` to the FROZEN IR ``SecuritySchemes`` model.

    The IR collapses OpenAPI's ``{type: "http", scheme: "bearer"}`` and
    ``{type: "http", scheme: "basic"}`` into the single ``http`` Type4 enum;
    detail (bearer vs basic) lives on the ``scheme`` field. The IR's ``in_``
    field carries an alias to ``"in"`` and is required; we default missing
    values to ``None`` so HTTP/OAuth schemes (which don't use ``in``) validate.
    """
    out: dict[str, dict[str, Any]] = {}
    for name, scheme in raw.items():
        if not isinstance(scheme, dict):
            continue
        normalized: dict[str, Any] = {
            "type": scheme.get("type"),
            "scheme": _opt_str(scheme.get("scheme")),
            "in": scheme.get("in"),  # Optional[In]; may be absent → None on validate
            "name": _opt_str(scheme.get("name")),
            "flows": scheme.get("flows") if isinstance(scheme.get("flows"), dict) else None,
        }
        out[name] = normalized
    return out


# ───────────────────────── Dependency graph (D-15) ─────────────────────────


def _build_dependency_graph(
    endpoints: list[dict[str, Any]],
    schemas: dict[str, Any],
) -> dict[str, list[str]]:
    """Heuristic producer→consumer correlation by smart-ID shape.

    For each endpoint, we inspect:
    - ``responses`` — looking for fields shaped like ``id`` / ``uuid`` /
      ``<resource>_id`` either inline or via the resolved schema.
    - other endpoints' ``parameters`` — looking for a parameter named
      ``<resource>`` or ``<resource>_id`` that matches a producer's emitted
      identifier name.

    Returns a mapping ``producer_id → [consumer_id, ...]``. An empty mapping
    is acceptable (RESEARCH Assumption A6 fallback).
    """
    del schemas  # Reserved for v1.1 (cross-schema ref walk); not needed yet.

    # Phase 1: harvest every producer's emitted identifier names.
    producers: dict[str, set[str]] = {}
    for ep in endpoints:
        endpoint_id = _endpoint_id(ep)
        emitted = _emitted_id_names(ep)
        if emitted:
            producers[endpoint_id] = emitted

    # Phase 2: scan every endpoint's parameters for matching identifier names.
    graph: dict[str, list[str]] = {pid: [] for pid in producers}
    for consumer in endpoints:
        consumer_id = _endpoint_id(consumer)
        accepted = _accepted_id_names(consumer)
        if not accepted:
            continue
        for producer_id, emitted in producers.items():
            if producer_id == consumer_id:
                continue  # Self-edges are noise.
            if emitted & accepted:
                graph[producer_id].append(consumer_id)

    # Drop producers with no consumers — keep the graph compact.
    return {pid: sorted(set(consumers)) for pid, consumers in graph.items() if consumers}


def _emitted_id_names(endpoint: dict[str, Any]) -> set[str]:
    """Walk the endpoint's success responses for ID-shaped field names.

    Schemas are already resolved by prance, so we just walk the inline shapes.
    """
    names: set[str] = set()
    responses = endpoint.get("responses", {})
    if not isinstance(responses, dict):
        return names

    for status_code, response in responses.items():
        if not _is_success_status(status_code):
            continue
        if not isinstance(response, dict):
            continue
        content = response.get("content")
        if not isinstance(content, dict):
            continue
        for media_type in content.values():
            if not isinstance(media_type, dict):
                continue
            schema = media_type.get("schema")
            if isinstance(schema, dict):
                _walk_schema_for_id_names(schema, names, depth=0)

    # Discard the bare "id" / "uuid" — too generic to correlate cross-endpoint.
    # We only keep namespaced names like "customer_id", "charge_uuid".
    return {n for n in names if _is_namespaced_id_name(n)}


def _accepted_id_names(endpoint: dict[str, Any]) -> set[str]:
    """Collect parameter names that look like consumed identifiers."""
    names: set[str] = set()
    params = endpoint.get("parameters", [])
    if not isinstance(params, list):
        return names
    for param in params:
        if not isinstance(param, dict):
            continue
        name = param.get("name")
        if isinstance(name, str) and _is_namespaced_id_name(name):
            names.add(name)
    return names


def _walk_schema_for_id_names(schema: dict[str, Any], names: set[str], depth: int) -> None:
    """Bounded recursion (depth 4) over inline schemas to collect property names."""
    if depth > 4:
        return

    properties = schema.get("properties")
    if isinstance(properties, dict):
        for prop_name, prop_schema in properties.items():
            if isinstance(prop_name, str):
                names.add(prop_name)
            if isinstance(prop_schema, dict):
                _walk_schema_for_id_names(prop_schema, names, depth + 1)

    items = schema.get("items")
    if isinstance(items, dict):
        _walk_schema_for_id_names(items, names, depth + 1)

    for combinator in ("oneOf", "anyOf", "allOf"):
        branches = schema.get(combinator)
        if isinstance(branches, list):
            for branch in branches:
                if isinstance(branch, dict):
                    _walk_schema_for_id_names(branch, names, depth + 1)


def _is_namespaced_id_name(name: str) -> bool:
    """Match identifier-shape names that carry a resource hint.

    ``id`` / ``uuid`` alone → False (too generic).
    ``customer_id`` / ``charge_uuid`` / ``customer`` → True.
    """
    if name in _ID_FIELD_NAMES:
        return False
    if name.endswith(_ID_FIELD_SUFFIXES):
        return True
    # Bare resource names like ``customer`` / ``charge`` used as path params
    # in patterns like ``/v1/customers/{customer}`` are also smart-ID consumers.
    return name.isidentifier() and name.islower() and "_" not in name and len(name) > 2


def _is_success_status(status_code: object) -> bool:
    if not isinstance(status_code, str):
        return False
    if status_code in {"default"}:
        return False
    return status_code.startswith("2")


# ─────────────────────────────── Helpers ───────────────────────────────────


def _endpoint_id(endpoint: dict[str, Any]) -> str:
    """Stable, human-readable identifier for graph keys + Pass 0 references."""
    method = endpoint.get("method", "")
    path = endpoint.get("path", "")
    return f"{method} {path}"


def _safe_dict(value: object) -> dict[str, Any]:
    if isinstance(value, dict):
        return cast(dict[str, Any], value)
    return {}


def _opt_str(value: object) -> str | None:
    return value if isinstance(value, str) else None


def _canonicalize(spec_dict: dict[str, Any]) -> str:
    """Deterministic canonicalization for ``spec_hash`` + L1 cache key (Plan 08).

    Sort keys recursively; use the most compact JSON representation.
    """
    return json.dumps(spec_dict, sort_keys=True, separators=(",", ":"))
