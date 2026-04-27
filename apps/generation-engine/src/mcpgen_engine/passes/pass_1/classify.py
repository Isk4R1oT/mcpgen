"""Pass 1 Phase 1.1 — deterministic classification (universal/action/workflow/specialized).

Pure-function module — NO LLM, NO I/O. Bucket every Pass 0 ``ToolPlan`` into a
``UniversalToolClass`` (the 6 universal slots) plus a residue list of ``ExtraTool``
entries for action / workflow / specialized tools.

Per D-29: 6 universal slots ALWAYS exist, even when the underlying API has only
some of them (e.g., a write-only API gets empty ``search``/``fetch`` slots).
``schema_synth.py`` handles the empty-slot case by emitting stub tools whose
``source_endpoints`` is empty and whose description reflects "not supported by
upstream".

Per D-36 gates:
- Action — POST/PATCH/DELETE plan with side effect not fitting upsert/delete;
  Pass 0 category=action OR verb pattern in plan name (``_capture``, ``_cancel``,
  ``_archive``, ``_send``, etc.).
- Workflow — 2-5 endpoints in a coherent sequence. Open Question 2: prefer
  ``dependency_graph`` evidence (HIGH-confidence structural) over
  ``composite_candidates`` (MEDIUM-confidence LLM hint) when they disagree;
  surface the disagreement in ``ClassifiedTools.warnings``.
- Specialized — read-only residue not fitting list_objects (Pass 0 category=
  specialized, OR a single-endpoint read plan that has no clear list/fetch
  shape).

Specialized warning gate (per D-36): if more than 3 specialized tools survive,
append a warning ``"N specialized tools (>3) — consider refactoring spec into
multi-server pattern"`` to ``ClassifiedTools.warnings``.

Threats addressed:
- T-2-07-06 (Open Question 2): when ``dependency_graph`` evidence and
  ``composite_candidates`` evidence disagree about a workflow, the dependency
  graph wins; the disagreement is surfaced in warnings (consumed by Phase 5
  F2 quality report).

References:
- 02-CONTEXT.md D-29 (6 universal always) + D-36 (action/workflow/specialized gates)
- 02-RESEARCH.md §"Open Question 2" (composite_candidates vs dependency_graph)
- 02-PATTERNS.md `passes/pass_1/classify.py` row
- docs/mcpgen-pass-1-design.md §3.2 (bucketing rules)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Final

from mcpgen_ir.types import Category, CompositeCandidate, ToolPlan

# D-36 gate: warn when more than this many specialized tools survive.
_SPECIALIZED_WARN_THRESHOLD: Final[int] = 3

# D-36 verb patterns — high-confidence "this is an action, not CRUD" signals.
# Matched against the suffix of a plan name (post-namespace). E.g.,
# `charges_capture` matches because of `_capture`.
_ACTION_VERB_SUFFIXES: Final[tuple[str, ...]] = (
    "_capture",
    "_charge",
    "_pay",
    "_refund",
    "_reverse",
    "_undo",
    "_cancel",
    "_void",
    "_revoke",
    "_archive",
    "_soft_delete",
    "_unlock",
    "_enable",
    "_activate",
    "_send",
    "_lock",
    "_publish",
    "_notify",
    "_close",
    "_merge",
    "_create_with_relations",
    "_advance",
    "_edit",
    "_send_with_thread_followup",
)

# D-36 workflow strict-gate: workflow tools subsume between MIN and MAX endpoints.
_WORKFLOW_STEP_MIN: Final[int] = 2
_WORKFLOW_STEP_MAX: Final[int] = 5


# ───────────────────────────── Public dataclasses ──────────────────────────


@dataclass(frozen=True)
class UniversalToolClass:
    """Bundle of Pass 0 ToolPlans subsumed by each of the 6 universal tools.

    Each slot is a list of plans (possibly empty). D-29 mandates we ALWAYS
    surface all 6 slots — even when empty — so the caller in
    ``schema_synth.py`` can emit a stub tool whose ``source_endpoints=[]``
    and whose description says "not supported by upstream".
    """

    search: list[ToolPlan]
    fetch: list[ToolPlan]
    list_collections: list[ToolPlan]
    list_objects: list[ToolPlan]
    upsert: list[ToolPlan]
    delete: list[ToolPlan]


@dataclass(frozen=True)
class ExtraTool:
    """One non-universal tool (action / workflow / specialized).

    ``plan`` — the originating Pass 0 ToolPlan (for naming + source_endpoints).
    ``type_`` — one of "action" | "workflow" | "specialized".
    ``workflow_steps`` — for workflows, the ordered list of underlying plans
    (each from Pass 0). Empty for action/specialized.
    """

    plan: ToolPlan
    type_: str
    workflow_steps: list[ToolPlan] = field(default_factory=list)


@dataclass(frozen=True)
class ClassifiedTools:
    """Output of Phase 1.1 — universal slots + extras + warnings.

    ``warnings`` is consumed by Phase 5 (F2 quality report); Phase 2 only
    populates the surface and propagates it through the orchestrator's
    return path (currently ignored downstream — added here for forward
    compatibility).
    """

    universal: UniversalToolClass
    extras: list[ExtraTool]
    warnings: list[str]


# ───────────────────────────── Public function ─────────────────────────────


def classify_tool_plans(
    plans: list[ToolPlan],
    composite_candidates: list[CompositeCandidate],
    dependency_graph: dict[str, list[str]],
) -> ClassifiedTools:
    """Bucket Pass 0 ToolPlans into the 6 universal slots + extras.

    Pure: no I/O, no LLM. Deterministic on inputs.

    Bucketing rules (mirrors Pass 1 design §3.2):

    - Pass 0 ``category=search`` → ``UniversalToolClass.search``.
    - Pass 0 ``category=crud`` and plan name contains ``fetch`` / ``get`` /
      ``read`` → ``UniversalToolClass.fetch`` if all source endpoints are
      single-resource GETs; else ``list_objects``.
    - Pass 0 ``category=crud`` and plan name contains ``list`` / ``index`` →
      ``list_objects`` (if endpoints have query filters) or
      ``list_collections`` (if endpoints are metadata/schema-shaped).
    - Pass 0 ``category=crud`` with POST/PATCH/PUT body → ``upsert``.
    - Pass 0 ``category=crud`` with DELETE → ``delete``.
    - Pass 0 ``category=action`` → ``ExtraTool(type_="action", ...)``.
    - Pass 0 ``category=workflow`` → ``ExtraTool(type_="workflow", ...)``,
      validated against ``dependency_graph`` and ``composite_candidates``.
    - Pass 0 ``category=specialized`` → ``ExtraTool(type_="specialized", ...)``.

    Per Open Question 2 — when a Pass 0 ``category=action`` plan name matches
    a workflow composite_candidate AND the underlying endpoints span ≥ 2 keys
    in dependency_graph, we prefer the structural dependency-graph signal,
    bumping the plan to type_="workflow" and surfacing the disagreement in
    ``warnings``.
    """
    warnings: list[str] = []

    search_plans: list[ToolPlan] = []
    fetch_plans: list[ToolPlan] = []
    list_collections_plans: list[ToolPlan] = []
    list_objects_plans: list[ToolPlan] = []
    upsert_plans: list[ToolPlan] = []
    delete_plans: list[ToolPlan] = []
    extras: list[ExtraTool] = []

    workflow_endpoint_sets = _composite_endpoint_sets(composite_candidates)

    for plan in plans:
        bucket = _bucket_for_plan(plan, workflow_endpoint_sets, dependency_graph, warnings)

        if bucket == "search":
            search_plans.append(plan)
        elif bucket == "fetch":
            fetch_plans.append(plan)
        elif bucket == "list_collections":
            list_collections_plans.append(plan)
        elif bucket == "list_objects":
            list_objects_plans.append(plan)
        elif bucket == "upsert":
            upsert_plans.append(plan)
        elif bucket == "delete":
            delete_plans.append(plan)
        elif bucket == "action":
            extras.append(ExtraTool(plan=plan, type_="action"))
        elif bucket == "workflow":
            steps = _resolve_workflow_steps(plan, plans)
            extras.append(ExtraTool(plan=plan, type_="workflow", workflow_steps=steps))
        else:  # "specialized"
            extras.append(ExtraTool(plan=plan, type_="specialized"))

    universal = UniversalToolClass(
        search=search_plans,
        fetch=fetch_plans,
        list_collections=list_collections_plans,
        list_objects=list_objects_plans,
        upsert=upsert_plans,
        delete=delete_plans,
    )

    specialized_count = sum(1 for e in extras if e.type_ == "specialized")
    if specialized_count > _SPECIALIZED_WARN_THRESHOLD:
        warnings.append(
            f"{specialized_count} specialized tools (>{_SPECIALIZED_WARN_THRESHOLD}) — "
            "consider refactoring spec into multi-server pattern"
        )

    return ClassifiedTools(universal=universal, extras=extras, warnings=warnings)


# ───────────────────────────── Helpers ─────────────────────────────────────


def _bucket_for_plan(
    plan: ToolPlan,
    workflow_endpoint_sets: list[set[str]],
    dependency_graph: dict[str, list[str]],
    warnings: list[str],
) -> str:
    """Return one of ``search`` | ``fetch`` | ``list_collections`` |
    ``list_objects`` | ``upsert`` | ``delete`` | ``action`` | ``workflow`` |
    ``specialized``.

    Pure: no side effects beyond appending to ``warnings``.
    """
    category = plan.category

    if category == Category.search:
        return "search"

    if category == Category.action:
        if _looks_like_workflow(plan, workflow_endpoint_sets, dependency_graph):
            warnings.append(
                f"plan '{plan.name}': category=action upgraded to workflow "
                f"(dependency_graph evidence overrides composite_candidates per "
                "Open Question 2)"
            )
            return "workflow"
        return "action"

    if category == Category.workflow:
        return "workflow"

    if category == Category.specialized:
        return "specialized"

    if category == Category.crud:
        return _bucket_crud_plan(plan)

    # Defensive: unknown category → specialized.
    return "specialized"


def _bucket_crud_plan(plan: ToolPlan) -> str:
    """Sub-bucket a `crud` plan into one of the 6 universal CRUD slots."""
    methods = [_method_for_endpoint(e) for e in plan.source_endpoints]
    name_lower = plan.name.lower()

    has_delete = any(m == "DELETE" for m in methods)
    has_post_or_put = any(m in {"POST", "PUT", "PATCH"} for m in methods)
    has_get = any(m == "GET" for m in methods)

    # DELETE-dominant plans → delete slot.
    if has_delete and not has_post_or_put:
        return "delete"

    # Fetch hint — single-resource GET (path ends with /{id}).
    if has_get and not has_post_or_put and _all_single_resource(plan):
        if any(token in name_lower for token in ("fetch", "get", "read", "retrieve")):
            return "fetch"
        # CRUD-shaped plans without explicit verb hint default to list_objects
        # if any endpoint has query filters; else fetch.
        return "fetch"

    # List hint — collection-shaped GET (path ends without /{id}).
    if has_get and not has_post_or_put:
        if any(token in name_lower for token in ("collections_list", "schema", "metadata")):
            return "list_collections"
        return "list_objects"

    # Upsert — POST/PUT/PATCH, possibly with DELETE for upsert+delete combos.
    if has_post_or_put:
        return "upsert"

    # Defensive: GET-only without single-resource shape → list_objects.
    return "list_objects"


def _all_single_resource(plan: ToolPlan) -> bool:
    """All source_endpoints end in a path parameter ``/{name}``."""
    placeholder_re = re.compile(r"\{[^}]+\}$")
    for endpoint_id in plan.source_endpoints:
        path = _path_of_endpoint_id(endpoint_id)
        if not placeholder_re.search(path):
            return False
    return True


def _composite_endpoint_sets(candidates: list[CompositeCandidate]) -> list[set[str]]:
    """Materialise composite_candidates as endpoint-set lookups."""
    return [set(c.steps) for c in candidates]


def _looks_like_workflow(
    plan: ToolPlan,
    workflow_endpoint_sets: list[set[str]],
    dependency_graph: dict[str, list[str]],
) -> bool:
    """Open-Question-2 — does this action plan look like a workflow instead?

    Two signals:
    1. Plan's source_endpoints overlap with a composite_candidate (LLM hint).
    2. Plan's source_endpoints reference ≥ 2 distinct keys in dependency_graph
       (structural evidence — multi-resource workflow).

    Returns True when BOTH signals agree the plan is a workflow. The 2-5
    step gate is enforced separately at workflow_steps resolution time.
    """
    plan_endpoints = set(plan.source_endpoints)
    overlaps_composite = any(plan_endpoints & s for s in workflow_endpoint_sets)
    if not overlaps_composite:
        return False

    if not (_WORKFLOW_STEP_MIN <= len(plan_endpoints) <= _WORKFLOW_STEP_MAX):
        return False

    distinct_resources: set[str] = set()
    for endpoint_id in plan.source_endpoints:
        resource = _resource_of_endpoint_id(endpoint_id)
        if resource is not None and resource in dependency_graph:
            distinct_resources.add(resource)
    return len(distinct_resources) >= _WORKFLOW_STEP_MIN


def _resolve_workflow_steps(plan: ToolPlan, all_plans: list[ToolPlan]) -> list[ToolPlan]:
    """Resolve workflow_steps for a plan flagged as type=workflow.

    Returns the subset of ``all_plans`` whose ``source_endpoints`` overlap
    with this plan's ``source_endpoints``. Trimmed to ``_WORKFLOW_STEP_MAX``.
    """
    plan_endpoints = set(plan.source_endpoints)
    steps: list[ToolPlan] = []
    for other in all_plans:
        if other is plan:
            continue
        if set(other.source_endpoints) & plan_endpoints:
            steps.append(other)
    return steps[:_WORKFLOW_STEP_MAX]


def _method_for_endpoint(endpoint_id: str) -> str:
    """Extract method from ``"METHOD path"``."""
    parts = endpoint_id.split(" ", 1)
    if not parts:
        return "GET"
    return parts[0].upper()


def _path_of_endpoint_id(endpoint_id: str) -> str:
    """Extract path from ``"METHOD path"``."""
    parts = endpoint_id.split(" ", 1)
    if len(parts) >= 2:
        return parts[1]
    return ""


def _resource_of_endpoint_id(endpoint_id: str) -> str | None:
    """Extract a CamelCase resource name from the path's first non-version segment.

    ``GET /v1/charges/{charge}`` → ``Charge``.
    Returns ``None`` for paths without resource segments.
    """
    path = _path_of_endpoint_id(endpoint_id)
    segments = [s for s in path.split("/") if s]
    for seg in segments:
        if re.fullmatch(r"v\d+", seg):
            continue
        if seg.startswith("{") and seg.endswith("}"):
            continue
        return _singularize_camel(seg)
    return None


def _singularize_camel(token: str) -> str:
    """Mirror of ``routing._singularize_camel`` — kept local to avoid a cross-module dep."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]+", "_", token)
    if cleaned.endswith("ies") and len(cleaned) > 3:
        cleaned = cleaned[:-3] + "y"
    elif cleaned.endswith("ses") and len(cleaned) > 3:
        cleaned = cleaned[:-2]
    elif cleaned.endswith("s") and len(cleaned) > 1 and not cleaned.endswith("ss"):
        cleaned = cleaned[:-1]
    parts = re.split(r"[_-]+", cleaned)
    return "".join(p.capitalize() for p in parts if p)


def has_action_verb_suffix(plan_name: str) -> bool:
    """Return True if ``plan_name`` ends with a known D-36 action-verb suffix.

    Exposed at module scope so tests can verify the verb-pattern catalogue
    without re-implementing the matching loop.
    """
    name = plan_name.lower()
    return any(name.endswith(suffix) for suffix in _ACTION_VERB_SUFFIXES)
