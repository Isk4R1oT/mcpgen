"""Pass 0 Stage 0b — chunked LLM path for specs > 200 endpoints (D-20).

Activates when ``len(kept_endpoints) > CHUNKED_THRESHOLD`` after the Stage 0a
deterministic filter. Hard-fails when ``> HARD_FAIL_THRESHOLD`` (D-20: > 1000)
because no path-clustering rescue is feasible for that scale.

Four-phase pipeline (per docs/mcpgen-pass-0-design.md §"Chunked approach"):

    Phase 1 — Path-cluster (deterministic).
        Group endpoints by their first two path segments. ``/v1/customers/...``
        and ``/v1/charges/...`` become two clusters; single-segment paths
        (``/login``) form their own clusters.

    Phase 2 — Cluster decisions (single LLM call).
        Send a high-level summary (cluster name + endpoint count + first-line
        summaries) to Qwen. The LLM returns target_complexity adjustments and
        cross-cluster composite candidates. We keep the schema very simple:
        the call reuses the same ``run_llm_stage`` agent with a synthetic
        single-endpoint-per-cluster summary view, and we discard everything
        except the LLM's composite_candidates list — Phase 4 then merges them
        with the per-cluster composites.

    Phase 3 — Per-cluster detail (parallel LLM calls).
        For each cluster, call ``run_llm_stage(cluster_endpoints, options)``
        under an ``asyncio.Semaphore(concurrency)`` cap (default = 5 per
        RESEARCH A4 — calibrated; drop to 3 if 429s appear in CI).

    Phase 4 — Cross-cluster merge (deterministic).
        Concatenate per-cluster ``tool_plans``. Cross-cluster naming
        collisions are disambiguated by prepending a stable cluster
        namespace prefix to the duplicate (e.g., ``users_create`` survives
        as-is in the first cluster; the second cluster's ``users_create``
        becomes ``<cluster_namespace>_users_create``). Composite candidates
        and llm_dropped_endpoints are concatenated without dedup
        (Pass 1 owns final dedup of composites).

Tenacity retries are inherited from ``run_llm_stage`` per cluster — chunked.py
adds no extra retry layer.

Threats addressed:
- T-2-18 (calibrated DoS): concurrency=5 cap; per-cluster retries handle 429s.
- T-2-13 (D-52): structlog logs only structural counts (cluster_count,
  per_cluster_endpoint_counts) — no spec text.

References:
- 02-CONTEXT.md D-20 (chunked threshold + hard fail)
- 02-RESEARCH.md §"Pass 0 Module Skeleton" + §"Open Question 1"
- 02-PATTERNS.md `passes/pass_0/chunked.py` row
- docs/mcpgen-pass-0-design.md §"Chunked approach"
"""

from __future__ import annotations

import asyncio
from typing import Final

import structlog
from mcpgen_ir.types import CompositeCandidate, DroppedEndpoint, Endpoint, Method, ToolPlan

from .filter import UserOptions
from .llm import run_llm_stage
from .validation import Pass0Error, Pass0LlmOutput, cluster_by_path_prefix

# D-20 thresholds (re-exported via the pass_0 orchestrator).
CHUNKED_THRESHOLD: Final[int] = 200
HARD_FAIL_THRESHOLD: Final[int] = 1000

# RESEARCH A4: initial concurrency 5; CI calibration may drop to 3 if 429s appear.
DEFAULT_CONCURRENCY: Final[int] = 5

# Cluster-suggestion sizing for the hard-fail suggestion list. Matches
# `validation.cluster_by_path_prefix` default for consistent UX.
_CLUSTER_SUGGESTION_MIN: Final[int] = 30

_log = structlog.get_logger(__name__)


# ─────────────────────────────── Public API ────────────────────────────────


async def run_llm_chunked(
    endpoints: list[Endpoint],
    options: UserOptions,
    *,
    concurrency: int = DEFAULT_CONCURRENCY,
) -> Pass0LlmOutput:
    """Execute the 4-phase chunked Pass 0 LLM path (D-20).

    Phase 1 (deterministic) clusters endpoints by their first two path
    segments. Phase 2 calls the LLM once for cross-cluster composite hints
    (best-effort — failures degrade to empty hints). Phase 3 runs per-cluster
    LLM calls in parallel under a semaphore. Phase 4 merges deterministically
    with naming-collision disambiguation.

    Hard-fails with ``Pass0Error("SPEC_TOO_LARGE_ENDPOINTS", ...)`` when
    ``len(endpoints) > HARD_FAIL_THRESHOLD`` (D-20).
    """
    if len(endpoints) > HARD_FAIL_THRESHOLD:
        suggestions = cluster_by_path_prefix(endpoints, min_cluster_size=_CLUSTER_SUGGESTION_MIN)
        _log.warning(
            "pass_0.chunked.spec_too_large",
            endpoint_count=len(endpoints),
            hard_fail_threshold=HARD_FAIL_THRESHOLD,
            suggestion_count=len(suggestions),
        )
        raise Pass0Error(
            f"SPEC_TOO_LARGE_ENDPOINTS: {len(endpoints)} endpoints exceed the "
            f"{HARD_FAIL_THRESHOLD}-endpoint chunked-pipeline ceiling; "
            "split the spec by top-level path prefix",
            suggestions=suggestions,
        )

    # Phase 1 — deterministic path clustering.
    clusters = _path_cluster(endpoints)

    # Phase 2 — cluster decisions (best-effort; failure → empty cross-cluster hints).
    cross_cluster_hints = await _cluster_decisions(clusters, options)

    # Phase 3 — per-cluster detail with bounded parallelism.
    semaphore = asyncio.Semaphore(concurrency)

    async def _detail_for_cluster(prefix: str, cluster_endpoints: list[Endpoint]) -> _ClusterResult:
        async with semaphore:
            output = await run_llm_stage(cluster_endpoints, options)
            return _ClusterResult(prefix=prefix, output=output)

    cluster_results = await asyncio.gather(
        *[_detail_for_cluster(prefix, eps) for prefix, eps in clusters.items()],
    )

    # Phase 4 — deterministic cross-cluster merge.
    merged = _merge_clusters(cluster_results, cross_cluster_hints)

    _log.info(
        "pass_0.chunked.complete",
        cluster_count=len(clusters),
        per_cluster_endpoint_counts={k: len(v) for k, v in clusters.items()},
        merged_tool_plan_count=len(merged.tool_plans),
        merged_composite_count=len(merged.composite_candidates),
    )
    return merged


# ─────────────────────────────── Phase helpers ─────────────────────────────


def _path_cluster(endpoints: list[Endpoint]) -> dict[str, list[Endpoint]]:
    """Phase 1 — group endpoints by first two path segments.

    ``/v1/customers/abc`` → key ``/v1/customers``. Single-segment paths
    (``/login``) keep their key (``/login``). The ``/`` and empty paths
    fall under ``/_root`` for completeness.
    """
    out: dict[str, list[Endpoint]] = {}
    for ep in endpoints:
        prefix = _first_two_segments(ep.path)
        out.setdefault(prefix, []).append(ep)
    return out


async def _cluster_decisions(
    clusters: dict[str, list[Endpoint]],
    options: UserOptions,
) -> list[CompositeCandidate]:
    """Phase 2 — best-effort cross-cluster composite hints.

    We synthesize a single Endpoint per cluster (``GET /<prefix>`` summarizing
    the cluster) and feed that to ``run_llm_stage``. Only the
    ``composite_candidates`` field is consumed; tool_plans / dropped from this
    call are discarded (Phase 3 produces the authoritative tool inventory).

    Failures degrade to an empty list — Phase 4 merge tolerates this.
    """
    summary_endpoints = [
        _synthetic_cluster_summary_endpoint(prefix, len(cluster_endpoints))
        for prefix, cluster_endpoints in clusters.items()
    ]
    if not summary_endpoints:
        return []

    try:
        summary_output = await run_llm_stage(summary_endpoints, options)
    except Pass0Error as exc:
        _log.warning(
            "pass_0.chunked.cross_cluster_hints_unavailable",
            error_class=type(exc).__name__,
            cluster_count=len(clusters),
        )
        return []
    return list(summary_output.composite_candidates)


def _merge_clusters(
    cluster_results: tuple[_ClusterResult, ...] | list[_ClusterResult],
    cross_cluster_hints: list[CompositeCandidate],
) -> Pass0LlmOutput:
    """Phase 4 — deterministic merge with naming-collision disambiguation.

    Iterate clusters in their map-iteration order (Python ≥ 3.7 dict
    preserves insertion order; ``_path_cluster`` orders by first encounter).
    Within a cluster, plan names are already unique (``run_llm_stage``
    delegates to PydanticAI which validates each tool plan's name regex).
    Across clusters, the FIRST occurrence of a name keeps the unprefixed
    form; SUBSEQUENT collisions get ``<cluster_namespace>_<name>``.
    """
    seen_names: set[str] = set()
    merged_plans: list[ToolPlan] = []
    merged_composites: list[CompositeCandidate] = list(cross_cluster_hints)
    merged_dropped: list[DroppedEndpoint] = []

    for result in cluster_results:
        cluster_namespace = _cluster_namespace(result.prefix)
        for plan in result.output.tool_plans:
            if plan.name not in seen_names:
                merged_plans.append(plan)
                seen_names.add(plan.name)
                continue

            # Collision — disambiguate with the cluster namespace.
            disambiguated_name = _disambiguated_name(cluster_namespace, plan.name)
            if disambiguated_name in seen_names:
                # Extremely unlikely (would require user_<cluster>_<name> already
                # present); fall back to numeric suffix.
                disambiguated_name = _numeric_suffix_name(disambiguated_name, seen_names)
            disambiguated_plan = plan.model_copy(update={"name": disambiguated_name})
            merged_plans.append(disambiguated_plan)
            seen_names.add(disambiguated_name)

        merged_composites.extend(result.output.composite_candidates)
        merged_dropped.extend(result.output.llm_dropped_endpoints)

    return Pass0LlmOutput(
        tool_plans=merged_plans,
        composite_candidates=merged_composites,
        llm_dropped_endpoints=merged_dropped,
    )


# ───────────────────────────── Helper structures ───────────────────────────


class _ClusterResult:
    """Plain DTO for Phase 3 results — keeps the cluster prefix alongside output."""

    __slots__ = ("output", "prefix")

    def __init__(self: _ClusterResult, prefix: str, output: Pass0LlmOutput) -> None:
        self.prefix = prefix
        self.output = output


def _first_two_segments(path: str) -> str:
    """Stable cluster key for `path`. Mirrors validation `_first_two_segments`.

    Returns:
    - ``/seg1/seg2`` for paths with ≥ 2 segments.
    - ``/seg1`` for single-segment paths (``/login``).
    - ``/_root`` for ``/`` or empty paths (defensive — Stage A normally drops these).
    """
    cleaned = path.strip()
    if not cleaned or cleaned == "/":
        return "/_root"
    segments = [s for s in cleaned.split("/") if s]
    if not segments:
        return "/_root"
    if len(segments) == 1:
        return f"/{segments[0]}"
    return f"/{segments[0]}/{segments[1]}"


def _cluster_namespace(prefix: str) -> str:
    """Convert a cluster prefix to a snake_case namespace token.

    ``/v1/customers`` → ``v1_customers``. ``/login`` → ``login``. ``/_root`` →
    ``root``. Used as the disambiguation prefix for cross-cluster name
    collisions in ``_merge_clusters``.
    """
    cleaned = prefix.strip("/").replace("-", "_").lower()
    cleaned = cleaned.replace("/", "_")
    return cleaned.lstrip("_") or "root"


def _disambiguated_name(cluster_namespace: str, original_name: str) -> str:
    """Build ``<cluster_namespace>_<original_name>`` and clamp to 64 chars (D-17)."""
    candidate = f"{cluster_namespace}_{original_name}"
    if len(candidate) <= 64:
        return candidate
    # Truncate the cluster namespace, keep the original name intact.
    overflow = len(candidate) - 64
    truncated_ns = cluster_namespace[: max(1, len(cluster_namespace) - overflow)]
    return f"{truncated_ns}_{original_name}"[:64]


def _numeric_suffix_name(base: str, seen: set[str]) -> str:
    """Append `_<n>` until uniqueness; clamp to 64 chars."""
    i = 2
    while True:
        suffix = f"_{i}"
        max_base = max(1, 64 - len(suffix))
        candidate = f"{base[:max_base]}{suffix}"
        if candidate not in seen:
            return candidate
        i += 1


def _synthetic_cluster_summary_endpoint(prefix: str, cluster_size: int) -> Endpoint:
    """Build a single Endpoint summarising a cluster for Phase 2 cross-cluster decisions.

    The synthetic endpoint carries no real spec text — only structural metadata —
    so D-52 (no spec content in logs / observability) is preserved by construction.
    """
    return Endpoint(
        method=Method.GET,
        path=prefix,
        operation_id=None,
        summary=f"Cluster summary: {cluster_size} endpoints under {prefix}",
        description=None,
        parameters=[],
        request_body=None,
        responses={},
        tags=[],
        deprecated=False,
    )
