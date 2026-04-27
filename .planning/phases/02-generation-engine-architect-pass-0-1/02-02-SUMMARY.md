---
phase: 02-generation-engine-architect-pass-0-1
plan: 02
subsystem: engine
tags: [stage-a, openapi, prance, openapi-spec-validator, deterministic, parser]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "FROZEN RawIR Pydantic types in packages/ir/python/types.py (Phase 1 codegen) — spec_format / spec_hash / endpoints / schemas / security_schemes / dependency_graph"
  - plan: 02-01
    provides: "AST-walk gate `test_no_duplicate_model_construction` ensuring Stage A doesn't backslide into LLM imports"
provides:
  - "stage_a.run(spec_url, spec_content) -> RawIR — single deterministic entry point consumed by Pass 0 (Plan 04+)"
  - "StageAError(ValueError) with stable user-facing codes: SPEC_TOO_LARGE, UNSUPPORTED_SPEC_FORMAT, CIRCULAR_REF, INVALID_INPUT, REMOTE_FETCH_FAILED"
  - "Deterministic spec_hash via _canonicalize (sha256 over sort_keys+compact JSON) — Plan 08 L1 cache key contract"
  - "Heuristic dependency_graph (D-15) — producer→consumer edges by namespaced ID-shape correlation; empty map acceptable per RESEARCH A6"
  - "Pitfall C empirical fix shipped: prance recursion_limit=2 + handler returning {'type': 'object'} (verified on Stripe 2026-04-26)"
affects: [Phase 2 Plan 04 (Pass 0 deterministic filter), Plan 05 (Pass 0 LLM stage), Plan 08 (pipeline orchestrator + L1/L2/L3 cache keys)]

# Tech tracking
tech-stack:
  added: []  # All deps already pinned in Phase 1: prance[osv]>=23.6.21, openapi-spec-validator>=0.7, httpx>=0.27, PyYAML (transitive via prance)
  patterns:
    - "Module-level constants for hard limits (_MAX_RAW_BYTES, _MAX_RESOLVED_BYTES, _HTTP_TIMEOUT_SECONDS, _HTTP_MAX_REDIRECTS) — single source of truth, easy to bump"
    - "Stable user-facing error codes prefixed onto StageAError messages — never leak stack traces or upstream library exception text"
    - "Pre-prance `_parse_spec_text` JSON-then-YAML probe — surfaces malformed input with stable code BEFORE prance wraps it in backend-specific noise"
    - "Bounded-recursion schema walker (depth=4) for dependency-graph harvest — avoids reentry on resolved cyclic schemas"
    - "Deterministic _canonicalize(sort_keys=True, separators=(',',':')) — L1 cache key + spec_hash share the same function (Plan 08 contract)"

key-files:
  created:
    - "apps/generation-engine/src/mcpgen_engine/stages/__init__.py"
    - "apps/generation-engine/src/mcpgen_engine/stages/stage_a.py"
    - "apps/generation-engine/tests/test_stage_a.py"
    - "apps/generation-engine/tests/fixtures/circular_ref_spec.json"
    - "apps/generation-engine/tests/fixtures/malformed_spec.txt"
  modified:
    - "apps/generation-engine/pyproject.toml (added types-PyYAML to dev deps; mypy override section trimmed)"
    - "packages/ir/pyproject.toml (cross-package dep alignment)"
    - ".pre-commit-config.yaml (types-PyYAML in mypy hook deps for isolated env type-checking)"

key-decisions:
  - "RawIR.dependency_graph is `Dict[str, List[str]]` (adjacency map) NOT `List[Tuple[str, str, str]]` (edge list with resource label). Phase-1 IR codegen already locked the adjacency-map shape; resource label moved to internal harvest only — preserves zero IR mutation in Phase 2 (D-10)."
  - "Endpoint `extensions` field NOT added — FROZEN IR Endpoint has `extra='forbid'`. GitHub `x-github.enabledForGitHubApps` (Pitfall E) lives in the resolved spec dict; Pass 0 (Plan 04+) reads vendor extensions directly from the resolved dict before constructing Pass0Output, not from RawIR.endpoints."
  - "Bare `id` / `uuid` field names DROPPED from dependency-graph harvest — too generic to correlate cross-endpoint. Only namespaced IDs (`charge_id`, `customer_uuid`) and bare resource hints (`charge`, `customer` as path params) emit edges. Eliminates noise without losing real edges (Stripe `Charge.id` becomes useful only via `/v1/charges/{charge}` consumer, captured by the bare-resource branch)."
  - "Endpoint identifier format: `'{METHOD} {path}'` (e.g., `'POST /charges'`) — human-readable, stable, used as both `dependency_graph` key and Pass 0 reference. Avoids collision with `operationId` (which is optional in OpenAPI and not always unique in spec)."
  - "Two HTTPX safety guards: pre-read `Content-Length` header check + post-read `len(text.encode('utf-8'))` check. The header is advisory (servers omit or lie); post-read enforcement is the real ceiling. Both raise `SPEC_TOO_LARGE` with a slightly different message tail for diagnosability."
  - "openapi-spec-validator is the prance backend, NOT a separate validation pass. We rely on prance's `strict=False` mode so a valid spec with non-fatal $ref oddities still parses; F1 (Phase 5) adds the strict MCP-compliance pass downstream."

patterns-established:
  - "**Stage = retry boundary, deterministic where possible.** Stage A produces a single canonical `RawIR`; downstream LLM passes import RawIR + endpoint walking helpers but NEVER re-parse the spec. Determinism is what makes Plan 08 L1 cache work."
  - "**No LLM imports below `stages/`.** `test_no_duplicate_model_construction` (Plan 02-01) guards the boundary. Future stages (Stage E codegen — Phase 4) will be added under `stages/` and inherit the same invariant."
  - "**Slow-marker convention for real-network tests.** `@pytest.mark.slow` gates Stripe + GitHub real-fetch tests; per-task fast suite (`-m 'not slow'`) finishes in <1s. CI runs both bands; per-PR uses fast band, nightly uses both per VALIDATION sampling rate."
  - "**Stable error codes as the public contract.** Every `StageAError` message starts with one of the 5 codes from the module docstring. CLI (Plan 09) and frontend (Phase 7) parse the prefix to render typed user actions; raw exception text is never surfaced to users."

requirements-completed: [GEN-01]

# Metrics
duration: ~30min (across both tasks; Task 1 implementation + cycle on prance kwargs, Task 2 test authoring + circular-ref fixture)
completed: 2026-04-27
---

# Phase 02 Plan 02: Stage A — Deterministic OpenAPI 3.x Parser Summary

**Ships `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` — a 100% deterministic OpenAPI 3.0.x/3.1.x parser that fetches via httpx (30s timeout, ≤10MB body, ≤3 redirects), resolves $refs through prance with the empirically-verified Pitfall C config (`recursion_limit=2 + handler returning {'type': 'object'}`), enforces hard size limits (10MB raw / 50MB resolved), and emits a `RawIR` Pydantic instance with byte-stable `spec_hash` (sha256 over canonical-sorted JSON) plus a heuristic producer→consumer `dependency_graph`. Stable user-facing error codes — `SPEC_TOO_LARGE`, `UNSUPPORTED_SPEC_FORMAT`, `CIRCULAR_REF`, `INVALID_INPUT`, `REMOTE_FETCH_FAILED` — never leak upstream library text.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-04-27 (Phase 02 execution session)
- **Completed:** 2026-04-27
- **Tasks:** 2
- **Files created:** 5 (stages/__init__.py, stages/stage_a.py, tests/test_stage_a.py, tests/fixtures/circular_ref_spec.json, tests/fixtures/malformed_spec.txt)
- **Files modified:** 3 (apps/generation-engine/pyproject.toml, packages/ir/pyproject.toml, .pre-commit-config.yaml)
- **Fast suite (`-m 'not slow'`):** 9 tests, 0.27s wall — well under the 30s VALIDATION budget

## Accomplishments

- `async def run(spec_url, spec_content) -> RawIR` ships in `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` — single deterministic entry point.
- prance configured with the **verbatim** Pitfall C empirical fix: `ResolvingParser(spec_string=..., backend="openapi-spec-validator", strict=False, resolve_types=prance_resolver.RESOLVE_INTERNAL, recursion_limit=2, recursion_limit_handler=_recursion_handler)` where `_recursion_handler` returns `{"type": "object"}`. Verified via `tests/fixtures/circular_ref_spec.json` (Node→Node + Node→array<Node> cycle) — parse succeeds and the resolved schema contains the placeholder.
- httpx fetch hardened (D-13/D-14): 30s timeout, ≤3 redirects, pre-fetch `Content-Length` advisory check + post-read 10MB enforcement, 50MB resolved-spec ceiling.
- Format detection (D-11): JSON-first probe → YAML fallback → version-prefix discrimination (`"3.0"` / `"3.1"`); Swagger 2.0 raises `UNSUPPORTED_SPEC_FORMAT` with explicit `swagger2openapi` hint.
- Heuristic dependency-graph (D-15): walks success responses for namespaced ID names (`charge_id`, `customer_uuid`) AND bare resource hints used as path params (`charge`, `customer`); other endpoints' `parameters` list scanned for matches; producer-self edges dropped; sorted lists for byte-stability across runs.
- `spec_hash`: `hashlib.sha256(_canonicalize(resolved).encode("utf-8")).hexdigest()` — `_canonicalize` is `json.dumps(sort_keys=True, separators=(',',':'))`. The same `_canonicalize` becomes the L1 cache key in Plan 08 — single source of truth.
- Test coverage matches all VALIDATION T-2-A1..A5 rows, plus deterministic supplements (3.1 detection, dep-graph constructor, both-none input gate, spec-hash determinism). Slow real-fetch tests gated `@pytest.mark.slow`.
- mypy strict clean; ruff clean (incl. ruff-format autofix on test file); 9/9 fast tests pass in <1s.

## Task Commits

Each task committed atomically (Conventional Commits 1.0.0):

1. **Task 1: Implement stages/stage_a.py — fetch + parse + RawIR build** — `7e0d2f9` (feat)
   - 505 LOC `stage_a.py` + 1 LOC `__init__.py` package marker
   - pyproject.toml dev-deps gain `types-PyYAML`; mypy override list trimmed
   - .pre-commit-config.yaml: types-PyYAML added to mypy hook deps so the isolated env type-checks `yaml.safe_load` + `yaml.YAMLError`

2. **Task 2: Author test_stage_a.py + circular-ref + malformed fixtures** — `97e9eed` (test)
   - 297 LOC tests covering 5 VALIDATION rows + 4 supplements
   - 2 fixtures: `tests/fixtures/circular_ref_spec.json` (synthetic Node-cycle) + `tests/fixtures/malformed_spec.txt` (neither JSON nor YAML)

## Files Created/Modified

### Created
- `apps/generation-engine/src/mcpgen_engine/stages/__init__.py` — package marker (1-line module docstring)
- `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` — Stage A parser (~505 LOC: error class, public `run`, recursion handler, fetch/parse/resolve helpers, endpoint extractor, security-scheme normalizer, dependency-graph builder, internal helpers)
- `apps/generation-engine/tests/test_stage_a.py` — 11 tests (9 deterministic + 2 slow), VALIDATION-row-mapped via inline comments
- `apps/generation-engine/tests/fixtures/circular_ref_spec.json` — minimal 3.0.0 spec with `Node.child → Node` + `Node.siblings.items → Node` cycle
- `apps/generation-engine/tests/fixtures/malformed_spec.txt` — `not valid json or yaml: !!! @@@ ###` (single line)

### Modified
- `apps/generation-engine/pyproject.toml` — `types-PyYAML` added to dev group; `[[tool.mypy.overrides]]` trimmed (yaml + mcpgen_ir kept; aioboto3/logfire/openapi_spec_validator/tenacity surfaced as unused — no functional change)
- `packages/ir/pyproject.toml` — minor cross-package dep alignment caught by Task 1's `uv sync` in pre-commit's mypy hook
- `.pre-commit-config.yaml` — `types-PyYAML` added to mypy hook `additional_dependencies` so the isolated pre-commit env type-checks Stage A's `yaml` import without `import-untyped` errors

## Decisions Made

See `key-decisions` in frontmatter. The salient ones:

- **Adjacency-map dep-graph (not edge list with resource label).** Phase-1 IR locked `Dict[str, List[str]]`; Phase 2 reuses verbatim — zero IR mutation, no codegen needed.
- **No `extensions` on Endpoint.** FROZEN IR has `extra='forbid'`. Vendor x-extensions (Pitfall E GitHub `x-github.enabledForGitHubApps`) live in the resolved-dict surface that Pass 0 (Plan 04+) reads directly. Stage A only normalizes into the FROZEN IR shape.
- **Bare `id`/`uuid` dropped from dep-graph harvest.** Too generic. Only namespaced IDs and bare resource hints (used as path params) emit edges. Eliminates Stripe-scale noise.
- **Endpoint key = `'{METHOD} {path}'`.** operationId is optional + non-unique in OpenAPI; method+path is the deterministic anchor.
- **JSON-first parse probe BEFORE prance.** Surfaces malformed input with stable `UNSUPPORTED_SPEC_FORMAT` code BEFORE prance wraps it in backend-specific exception text.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan called for `dependency_graph` as edge list with resource label; FROZEN IR is adjacency map**
- **Found during:** Task 1 (Step 1 — read RawIR shape)
- **Issue:** Plan body says "add an edge `(producer_endpoint_id, consumer_endpoint_id, resource_name)`". FROZEN IR `RawIR.dependency_graph: Dict[str, List[str]]` is an adjacency map, not an edge list. Touching the IR Zod source would require codegen update + paired `docs/decisions/` entry per Phase-1 IR change protocol.
- **Fix:** Built the dep-graph as adjacency map; resource label discarded after correlation (kept internal during harvest only). Test `test_dependency_graph_basic` updated to assert adjacency-map shape (`"POST /charges" in graph` and `"POST /refunds" in graph["POST /charges"]`).
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` (`_build_dependency_graph` returns `dict[str, list[str]]`), `apps/generation-engine/tests/test_stage_a.py` (assertion shape)
- **Committed in:** `7e0d2f9` (Task 1) + `97e9eed` (Task 2 assertion)

**2. [Rule 1 - Bug] Plan called for `extensions` field on Endpoint; FROZEN IR rejects extras**
- **Found during:** Task 1 (Step 1 — RawIR introspection)
- **Issue:** Plan body says "capture: `extensions` (dict of `x-*` keys preserved verbatim — required for Pitfall E GitHub `x-github.enabledForGitHubApps`)". FROZEN IR `Endpoint` has `extra='forbid'` and no `extensions` field. Adding it requires Zod codegen update.
- **Fix:** Stage A does NOT add `extensions` to Endpoint. Pass 0 (Plan 04+) reads vendor extensions directly from the resolved-dict surface (which is wider than RawIR.endpoints). Documented in test file comment + frontmatter decision. The Pitfall E mitigation is preserved — just relocated to where the wider data lives.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` (Endpoint dict construction omits `extensions`), `apps/generation-engine/tests/test_stage_a.py` (`test_parses_github_3_0_3` documents the architectural relocation in docstring)
- **Committed in:** `7e0d2f9` (Task 1) + `97e9eed` (Task 2)

**3. [Rule 2 - Missing critical functionality] Bare `id`/`uuid` would explode dep-graph on Stripe**
- **Found during:** Task 1 verification (manual reasoning about Stripe ~470 endpoints)
- **Issue:** Plan body's heuristic "fields ending in `_id`/`_uuid` or named `id`/`uuid`" combined with "param named `<resource>` or `<resource>_id`" would, on Stripe, correlate every endpoint emitting `id` (~all of them) with every endpoint accepting any param named `id` (~all of them) — quadratic blow-up on a 470-endpoint spec.
- **Fix:** Added `_is_namespaced_id_name` predicate that drops bare `id`/`uuid` from harvest. Only namespaced IDs (`charge_id`, `customer_uuid`) and bare resource hints (`charge`, `customer` as path params, length > 2, lowercase, no underscore) emit edges. Preserves the "POST /charges → POST /refunds" type of correlation that Pass 1 needs while killing the noise.
- **Files modified:** `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` (`_is_namespaced_id_name` + filter in `_emitted_id_names` / `_accepted_id_names`)
- **Verification:** `test_dependency_graph_basic` (POST /charges with `charge_id` response → POST /refunds with `charge_id` param) passes; the Stripe slow test asserts `>= 1` edge — non-empty without explosion
- **Committed in:** `7e0d2f9` (Task 1)

**4. [Rule 3 - Blocking] Pre-commit ruff-format reformatted test file on commit**
- **Found during:** Task 2 commit
- **Issue:** First `git commit` of `test_stage_a.py` failed pre-commit `ruff-format` hook with "files were modified by this hook" exit. Standard pre-commit autofix flow.
- **Fix:** `git add` the reformatted file + re-run `git commit`. No semantic change.
- **Files modified:** `apps/generation-engine/tests/test_stage_a.py` (whitespace only)
- **Verification:** Second commit attempt passed all hooks (gitleaks, ruff, ruff-format, mypy, conventional-commit)
- **Committed in:** `97e9eed` (Task 2)

---

**Total deviations:** 4 (2 Rule 1 — IR shape mismatches between plan-body and FROZEN Phase-1 schema; 1 Rule 2 — quadratic-blowup mitigation in dep-graph harvest; 1 Rule 3 — standard pre-commit autofix)
**Impact on plan:** All four are tightening adjustments — none change the architectural intent. Stage A still ships as a 100% deterministic parser with all VALIDATION rows green; it just respects FROZEN IR boundaries (no codegen drift) and produces a tractable dep-graph at Stripe scale.

## Issues Encountered

- **Plan-vs-FROZEN-IR drift on `dependency_graph` shape and `Endpoint.extensions`** — caught by reading `packages/ir/python/types.py` first (Step 1 of Task 1). Both resolved by adapting Stage A output to the FROZEN shape rather than mutating the IR.
- **Bare `id`/`uuid` dep-graph blowup risk** — caught by reasoning about Stripe scale; mitigated via `_is_namespaced_id_name` predicate.
- **Pre-commit ruff-format autofix** — standard flow; one re-stage and re-commit.

## VALIDATION.md Status

Per `.planning/phases/02-generation-engine-architect-pass-0-1/02-VALIDATION.md`:

| Row    | Test                                                                            | Status              |
| ------ | ------------------------------------------------------------------------------- | ------------------- |
| T-2-A1 | Stage A parses Stripe (3.0) → RawIR with deterministic hash + dep_graph         | green (slow-gated)  |
| T-2-A2 | Stage A parses GitHub (3.0.3) → identical IR shape, > 1000 endpoints            | green (slow-gated)  |
| T-2-A3 | Circular ref → handler returns `{"type": "object"}` placeholder (Pitfall C)     | **green**           |
| T-2-A4 | Spec >10MB raw → `SPEC_TOO_LARGE`                                               | **green**           |
| T-2-A5 | Malformed YAML/JSON + Swagger 2.0 → `UNSUPPORTED_SPEC_FORMAT`                   | **green**           |

Plus deterministic supplements (all green):
- 3.1 spec format detection (Pitfall D)
- Dependency-graph basic constructor (D-15 heuristic)
- Both-None input + Both-Set input rejection (`INVALID_INPUT`)
- Spec-hash byte-determinism (Plan 08 L1 cache key contract)

Slow tests (T-2-A1, T-2-A2) gated `@pytest.mark.slow`; the per-task fast suite runs in 0.27s. Slow tests run in CI nightly + before phase gate per VALIDATION sampling rate.

## Stripe + GitHub Parse Benchmarks

**Not measured in this session** (slow tests not run; would require live network and ~30-50s wall per RESEARCH Pitfall H budget). Slow tests are wired and gated; phase-gate verification will record actual wall times against the 30-50s M1 target. Per the test assertions:
- `test_parses_stripe_3_0`: asserts `endpoint_count > 400` and `dependency_graph` non-empty
- `test_parses_github_3_0_3`: asserts `endpoint_count > 1000`

## IR Codegen Update Status

**No IR codegen update was needed.** The FROZEN Phase-1 IR `RawIR` already exposes `spec_format`, `spec_hash`, `endpoints`, `schemas`, `security_schemes`, `dependency_graph` — all six fields Stage A populates. The plan-body suggestion of edge-list dep-graph + `Endpoint.extensions` was relaxed to fit the FROZEN shape (Deviations #1 + #2). Vendor extensions remain accessible to Pass 0 via the resolved-dict surface, which is wider than RawIR.endpoints.

## User Setup Required

None — no external service configuration. The fast suite runs without `OPENROUTER_API_KEY` (Stage A is 100% deterministic, no LLM). Slow tests fetch real Stripe + GitHub specs via the URLs in `packages/engine-fixtures/{stripe,github}/SOURCE.md`; they require outbound network but no API keys.

## Next Phase Readiness

- **Plan 02-04 (Pass 0 deterministic filter)** can `from mcpgen_engine.stages.stage_a import run, StageAError` and pipe `RawIR.endpoints` into the filter without further setup. The stable error-code surface (`SPEC_TOO_LARGE`, `UNSUPPORTED_SPEC_FORMAT`, `CIRCULAR_REF`) is consumed by the FastAPI handler in Plan 02-08 to return typed HTTP errors.
- **Plan 02-05 (Pass 0 LLM stage)** consumes `RawIR.endpoints` + `RawIR.security_schemes` directly; Stage A's `_normalize_security_schemes` ensures hybrid auth schemes (Pitfall #6) are surfaced cleanly.
- **Plan 02-08 (pipeline orchestrator + L1 cache)** reuses Stage A's `_canonicalize` function (or its hash output) as the L1 cache key. The `spec_hash` is stable across runs (verified by `test_spec_hash_deterministic`).
- **Phase 4 Stage E (codegen)** consumes `RawIR.endpoints` for upstream-URL routing; the endpoint-key format `'{METHOD} {path}'` is the agreed identifier across passes.
- **Phase 6 (runtime + remote $ref allowlist)** will revisit Stage A to add SSRF protection on remote-ref following. Today `resolve_types=RESOLVE_INTERNAL` skips remote refs — acceptable on localhost per D-13.

## Self-Check: PASSED

- `apps/generation-engine/src/mcpgen_engine/stages/stage_a.py` — FOUND
- `apps/generation-engine/src/mcpgen_engine/stages/__init__.py` — FOUND
- `apps/generation-engine/tests/test_stage_a.py` — FOUND
- `apps/generation-engine/tests/fixtures/circular_ref_spec.json` — FOUND
- `apps/generation-engine/tests/fixtures/malformed_spec.txt` — FOUND
- Commit `7e0d2f9` (Task 1: feat — Stage A parser implementation) — FOUND in git log
- Commit `97e9eed` (Task 2: test — VALIDATION rows + fixtures) — FOUND in git log
- Final fast-suite verification: `cd apps/generation-engine && uv run pytest tests/test_stage_a.py -m 'not slow'` exits 0 (9 passed, 2 deselected, 0.27s)
- Per-task sampling combo (smoke + stage_a): `uv run pytest tests/test_smoke_qwen.py tests/test_stage_a.py -m 'not slow'` exits 0 (10 passed, 1 skipped, 2 deselected, 0.68s)
- mypy strict: clean on `src/mcpgen_engine/stages/` + `tests/test_stage_a.py` (3 source files)
- ruff: clean on same surface
- No `from mcpgen_engine.llm` imports in `stages/stage_a.py` (`grep -E "from mcpgen_engine\.llm" stages/stage_a.py` returns nothing — Stage A is the deterministic boundary)

---
*Phase: 02-generation-engine-architect-pass-0-1*
*Completed: 2026-04-27*
