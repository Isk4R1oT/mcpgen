"""Pass 1 Phase 1.4 — deterministic coverage validation.

Pure-function module — NO LLM, NO I/O. Validates that every Pass 0 endpoint
maps to at least one Pass 1 routing rule, and emits a ``CoverageProofItem``
with a parseable upstream URL per endpoint.

Three responsibilities:

1. ``build_coverage_proof(...)`` — for every Pass 0 source_endpoint, emit a
   ``CoverageProofItem`` if a matching ``Rule1`` exists in the routing table.
   ``sample_invocation.url`` is constructed via ``urljoin(server_base,
   path_with_synthetic_params)`` and validated via ``urllib.parse.urlparse``
   (D-33 / Pitfall #3): ``parsed.scheme`` + ``parsed.netloc`` + ``parsed.path``
   all must be non-empty.

2. ``coverage_pct(...)`` — fraction of Pass 0 source_endpoints with proof
   coverage. 0.0-100.0 float; 100.0 means every endpoint is covered.

3. ``find_uncovered(...)`` — list of source_endpoint identifiers that have NO
   matching rule. Used by the orchestrator's 3-retry loop (D-34): the
   uncovered list is folded into the next LLM prompt asking the model to
   include them; after 3 retries the orchestrator degrades the residue to
   ``specialized_tools`` (same fallback shape as Pass 0 D-26).

The Pass 1 IR carries ``Pass1Output.coverage_proof: List[CoverageProofItem]``
as a frozen field — ``CoverageProofItem`` (and ``SampleInvocation``) come
from ``mcpgen_ir.types``. We do NOT define local Pydantic mirrors.

Threats addressed:
- T-2-07-03 (Pitfall #3 / D-33): every coverage proof is verified to round-trip
  via ``urlparse``. Hallucinated ``target_endpoint`` (mismatched method/path)
  silently fails to match a rule → uncovered → orchestrator retries.

References:
- 02-CONTEXT.md D-33 (coverage proof) + D-34 (3-retry + degrade)
- 02-RESEARCH.md §"Pattern 5: Coverage Proof URL Round-Trip" lines 695-738
- 02-PATTERNS.md `passes/pass_1/coverage.py` row
"""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import ParseResult, urljoin, urlparse

from mcpgen_ir.types import (
    CoverageProofItem,
    Endpoint,
    Method,
    RawIR,
    Routing1,
    Rule1,
    SampleInvocation,
    ToolPlan,
)

# Default upstream base URL when the raw IR carries no explicit servers map.
# Phase 2 RawIR has no servers field — Stage A doesn't yet plumb spec.servers
# into the IR. Coverage proof construction therefore uses a sane default
# scheme + host pair derived from the slug; downstream Phase 4 Stage E will
# override at codegen time once Stage A is enriched.
_DEFAULT_SERVER_TEMPLATE = "https://api.example.invalid"


# ───────────────────────────── Errors ──────────────────────────────────────


class CoverageError(ValueError):
    """Raised when a constructed sample URL fails the round-trip parse.

    Carries the offending URL + endpoint identifier in args[0] for stable
    log emission. Caller (orchestrator) treats this as a coverage gap and
    triggers retry / degrade per D-34.
    """


# ─────────────────────────── Public API ────────────────────────────────────


def build_coverage_proof(
    pass_0_plans: list[ToolPlan],
    routing: Routing1,
    raw_ir: RawIR,
    server_base: str | None = None,
) -> list[CoverageProofItem]:
    """Emit a ``CoverageProofItem`` for every covered Pass 0 endpoint.

    Per D-33: every proof's ``sample_invocation.url`` round-trips via
    ``urllib.parse.urlparse`` — ``scheme + netloc + path`` all non-empty.

    Pure function: no I/O, no side effects. Deterministic for given inputs.

    ``server_base`` is the API base (e.g. ``https://api.stripe.com``). When
    ``None`` we use the in-memory placeholder ``_DEFAULT_SERVER_TEMPLATE``.

    The returned list contains entries only for endpoints that match a rule;
    unmatched endpoints are silently absent — call ``coverage_pct`` to
    measure coverage and ``find_uncovered`` to drive retries.
    """
    base = server_base or _DEFAULT_SERVER_TEMPLATE
    endpoint_index = _build_endpoint_index(raw_ir.endpoints)

    # De-duplicate by endpoint_id — multiple Pass 0 plans may reference the
    # same upstream endpoint (e.g., Stripe `stripe_search` and `objects_list`
    # both subsume `GET /v1/customers`). The coverage proof is one-per-distinct-
    # endpoint, not one-per-plan-mention.
    seen_endpoints: set[str] = set()
    proofs: list[CoverageProofItem] = []
    for plan in pass_0_plans:
        for endpoint_id in plan.source_endpoints:
            if endpoint_id in seen_endpoints:
                continue
            ep = endpoint_index.get(endpoint_id)
            if ep is None:
                # Pass 0 referenced an endpoint that doesn't exist in raw_ir.
                # Skip silently — Stage A consistency drift surfaces in
                # `coverage_pct(raw_ir=...)` exclusion logic.
                continue
            rule = _find_matching_rule(ep, routing)
            if rule is None:
                # Coverage gap — orchestrator retries with this endpoint in
                # the prompt's `uncovered` list (D-34).
                continue

            path_with_params = _substitute_path_params(ep.path, ep.parameters)
            full_url = _build_sample_url(base, path_with_params, ep)
            parsed = urlparse(full_url)
            if not _is_valid_url_shape(parsed):
                msg = (
                    f"Invalid sample URL '{full_url}' for endpoint "
                    f"{_method_str(ep.method)} {ep.path} "
                    f"(rule: {rule.target_endpoint})"
                )
                raise CoverageError(msg)

            seen_endpoints.add(endpoint_id)
            proofs.append(
                CoverageProofItem(
                    endpoint_id=endpoint_id,
                    mapped_to_universal_tool=rule.universal_tool.value,
                    sample_invocation=SampleInvocation(
                        url=full_url,
                        method=_method_str(ep.method),
                        params=_synthetic_params(ep.parameters, ep),
                    ),
                )
            )
    return proofs


def coverage_pct(
    pass_0_plans: list[ToolPlan],
    proofs: list[CoverageProofItem],
    raw_ir: RawIR | None = None,
) -> float:
    """Fraction of Pass 0 source_endpoints covered by ``proofs``, 0.0-100.0.

    Empty plan list → 100.0 (vacuous coverage). Otherwise the count of
    distinct ``proof.endpoint_id`` over the count of distinct Pass 0
    source_endpoints.

    When ``raw_ir`` is provided, Pass 0 source_endpoints that don't exist in
    ``raw_ir.endpoints`` are excluded from the denominator. They are
    fundamentally uncoverable by Pass 1 (Stage A doesn't know about them) and
    represent a Pass 0 ↔ Stage A consistency drift that has to be flagged
    upstream — not a Pass 1 coverage failure.
    """
    expected = _expected_endpoint_ids(pass_0_plans)
    if raw_ir is not None:
        expected = _filter_to_known_endpoints(expected, raw_ir)
    if not expected:
        return 100.0
    covered = {p.endpoint_id for p in proofs}
    pct = 100.0 * len(covered & expected) / len(expected)
    # Clamp explicitly — float arithmetic should never exceed 100.0 here but
    # the IR field carries `confloat(ge=0.0, le=100.0)`.
    return max(0.0, min(100.0, pct))


def find_uncovered(
    pass_0_plans: list[ToolPlan],
    proofs: list[CoverageProofItem],
    raw_ir: RawIR | None = None,
) -> list[str]:
    """Return sorted list of Pass 0 source_endpoints with NO matching proof.

    Used by the orchestrator's 3-retry loop (D-34) — the result is rendered
    into the next LLM prompt as a ``REQUIRED COVERAGE`` directive.

    Excludes endpoints not present in ``raw_ir`` when ``raw_ir`` is supplied
    (same rationale as ``coverage_pct``).
    """
    expected = _expected_endpoint_ids(pass_0_plans)
    if raw_ir is not None:
        expected = _filter_to_known_endpoints(expected, raw_ir)
    covered = {p.endpoint_id for p in proofs}
    return sorted(expected - covered)


def _filter_to_known_endpoints(expected: set[str], raw_ir: RawIR) -> set[str]:
    """Drop endpoint identifiers that don't appear in ``raw_ir.endpoints``."""
    known = {f"{_method_str(ep.method)} {ep.path}" for ep in raw_ir.endpoints}
    return expected & known


# ───────────────────────────── Helpers ─────────────────────────────────────


def _expected_endpoint_ids(plans: list[ToolPlan]) -> set[str]:
    """Distinct ``source_endpoints`` across all plans."""
    expected: set[str] = set()
    for plan in plans:
        for endpoint_id in plan.source_endpoints:
            expected.add(endpoint_id)
    return expected


def _build_endpoint_index(endpoints: list[Endpoint]) -> dict[str, Endpoint]:
    """``"METHOD path"`` → ``Endpoint`` lookup table."""
    return {f"{_method_str(ep.method)} {ep.path}": ep for ep in endpoints}


def _method_str(method: Method | str) -> str:
    if isinstance(method, Method):
        return str(method.value)
    return str(method).upper()


def _find_matching_rule(endpoint: Endpoint, routing: Routing1) -> Rule1 | None:
    """First rule whose ``target_endpoint`` exactly matches ``METHOD path``."""
    target = f"{_method_str(endpoint.method)} {endpoint.path}"
    for rule in routing.rules:
        if rule.target_endpoint == target:
            return rule
    return None


def _substitute_path_params(path: str, parameters: list[dict[str, Any]]) -> str:
    """Replace ``{name}`` placeholders in ``path`` with synthetic values.

    Synthetic values are deterministic ``test_`` prefixed strings so the URL
    parses cleanly and the proof is reproducible across runs. Phase 4 Stage E
    re-substitutes at runtime with real upstream IDs from the agent's request.
    """
    result = path
    # `parameters` is consulted for diagnostic logging only — every `{name}`
    # placeholder in the path gets a synthetic value regardless, so the
    # round-trip URL is always parseable.
    _ = {_param_name(p) for p in parameters if _param_in(p) == "path"}
    placeholder_re = re.compile(r"\{([^}]+)\}")
    for match in placeholder_re.finditer(path):
        name = match.group(1)
        synthetic = _synthetic_path_value(name)
        result = result.replace(match.group(0), synthetic)
    return result


def _synthetic_path_value(name: str) -> str:
    """Generate a deterministic synthetic value for a path parameter.

    For typical resource ID parameters (``id``, ``charge``, ``customer``,
    ``subscription_exposed_id``) we produce ``"<name>_test_AAA…"`` shapes that
    survive the URL round-trip. Path-component-safe characters only.
    """
    safe = re.sub(r"[^A-Za-z0-9_]+", "_", name).strip("_") or "id"
    return f"{safe}_test_AAAAAAAAAAAAAA"


def _build_sample_url(server_base: str, path_with_params: str, endpoint: Endpoint) -> str:
    """Compose the full sample URL via ``urljoin``.

    ``urljoin`` requires the base to end in ``/`` to preserve path semantics.
    For GET endpoints with at least one query parameter, append a synthetic
    ``?limit=25`` query string so the test verifies query-string handling.
    """
    base = server_base.rstrip("/") + "/"
    path = path_with_params.lstrip("/")
    full = urljoin(base, path)
    if _has_query_param(endpoint):
        sep = "&" if "?" in full else "?"
        full = f"{full}{sep}limit=25"
    return full


def _has_query_param(endpoint: Endpoint) -> bool:
    return any(_param_in(p) == "query" for p in endpoint.parameters)


def _is_valid_url_shape(parsed: ParseResult) -> bool:
    """D-33 Phase 2 acceptance: scheme + netloc + path all non-empty."""
    return bool(parsed.scheme) and bool(parsed.netloc) and bool(parsed.path)


def _synthetic_params(parameters: list[dict[str, Any]], endpoint: Endpoint) -> dict[str, Any]:
    """Generate deterministic synthetic ``params`` for the sample invocation.

    Path params get the same synthetic value used in URL substitution.
    Query params get a sane default (``limit=25``). Body endpoints get a
    shallow placeholder ``{"data": {}}``.
    """
    params: dict[str, Any] = {}
    for p in parameters:
        located = _param_in(p)
        name = _param_name(p)
        if located == "path":
            params[name] = _synthetic_path_value(name)
        elif located == "query":
            params.setdefault(name, 25 if name == "limit" else "test")
    if endpoint.request_body is not None and "data" not in params:
        params["data"] = {}
    return params


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
