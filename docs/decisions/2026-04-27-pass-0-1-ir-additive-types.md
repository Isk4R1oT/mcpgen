# 2026-04-27 — Pass 0/1 IR additive types: SampleInvocation, CoverageProof, prompt_injection_warnings, per-endpoint auth_requirements

## Status

Accepted.

## Context

Phase 2 Plan 02-03 ships hand-tuned `pass-0-output.json` and `pass-1-output.json`
fixtures for the 5 canonical APIs (Stripe / GitHub / Notion / Linear / Slack)
**before** the Pass 0/1 LLM implementation lands (Waves 2–4). The fixtures are
the contract that downstream Plans 02-04..02-09 validate against (per Phase 2
Open Question 3 — "fixtures-as-truth").

To fully express the contract, the IR Zod source-of-truth in
`packages/ir/src/types.ts` needs four extensions to `Pass0Output` and
`Pass1Output` that were not present when Phase 1 froze the IR:

1. `SampleInvocation` — `{ url, method, params }` (per Phase 2 D-33).
2. `CoverageProof` — `{ endpoint_id, mapped_to_universal_tool, sample_invocation }`
   (per Phase 2 D-33; Pitfall #3 mitigation — every Pass 0 endpoint must
   round-trip to a syntactically valid upstream URL).
3. `Pass0Output.auth_requirements` shape change from `Array<AuthRequirement>`
   (flat) to `Record<endpoint_id, Array<AuthRequirement>>` (per-endpoint dict —
   Phase 2 D-21 + Pitfall E "GitHub hybrid auth"). Hybrid endpoints (Bearer +
   GitHub Apps OAuth, Stripe Bearer + restricted keys, etc.) need ≥ 2 auth
   entries on a single endpoint; the flat form cannot express this.
4. `Pass0Output.prompt_injection_warnings: Array<string>` — heuristic match
   buffer for known prompt-injection patterns inside spec descriptions
   (per Phase 2 D-51, defense against spec-borne prompt-injection).
5. `Pass1Output.coverage_proof: Array<CoverageProof>` — one entry per Pass 0
   endpoint (per Phase 2 D-33).

## Decision

Extend `packages/ir/src/types.ts` with the four schema additions above and
regenerate `packages/ir/python/types.py` via `pnpm --filter @mcpgen/ir codegen`.

The `auth_requirements` shape evolution is a **strict contract evolution**, not
an additive-only field add. It is justified because:

- Pass 0/1 implementation has not yet shipped (Waves 2–4 are unstarted at this
  date — STATE.md confirms Plan 02-02 is the current head).
- No Phase-1 consumer reads `Pass0Output.auth_requirements` (verified by
  `rg "Pass0Output|auth_requirements" --type=py --type=ts` returning empty
  outside of generated artifacts).
- The flat-list form was a Phase-1 Zod-typing oversight that did not match the
  Pass 0 design spec (D-21) nor the GitHub Pitfall E hybrid-auth requirement.
- Plan 02-03's success criteria require GitHub `pass-0-output.json` to surface
  ≥ 2 auth entries on at least one endpoint (Pitfall E mitigation), which the
  flat form cannot validate.

`SampleInvocation`, `CoverageProof`, and `prompt_injection_warnings` are pure
additive new types/fields and pose no compatibility concern.

## Consequences

- Plan 02-03 fixtures (10 JSON files) validate against the new shapes via
  `Pass0Output.safeParse` (TS) and `Pass0Output.model_validate` (Python).
- Plan 02-04 (Pass 0 deterministic filter) and Plan 02-05 (Pass 0 LLM stage)
  build directly on the new dict-shape `auth_requirements` — no migration
  burden, no type drift.
- Plan 02-06 (Pass 1 schema synthesis) populates `coverage_proof` per emitted
  endpoint. Plan 02-07 (Pass 1 coverage validation) verifies the round-trip
  URL invariant per `SampleInvocation.url` + `urllib.parse.urlparse`.
- Pre-commit hook `ir-codegen-check` enforces that the regenerated Pydantic
  mirror in `packages/ir/python/types.py` is byte-identical to the committed
  copy on every PR (Phase 1 D-13 three-layer freshness defense — local hook
  + CI workflow + scripted check).

## Three-layer freshness defense

1. **Pre-commit hook** `ir-codegen-check` runs `pnpm --filter @mcpgen/ir
   codegen:check` on every commit touching `packages/ir/`.
2. **CI workflow** `.github/workflows/contract-codegen-check.yml` runs the same
   command on every PR.
3. **TypeScript `--check` mode** of `scripts/codegen.ts` regenerates to a temp
   dir and byte-compares against the committed `python/types.py`; any drift
   fails CI loudly.

## References

- `.planning/phases/02-generation-engine-architect-pass-0-1/02-CONTEXT.md`
  D-21 (per-endpoint auth_requirements), D-33 (CoverageProof shape), D-51
  (prompt_injection_warnings heuristic surface)
- `.planning/phases/02-generation-engine-architect-pass-0-1/02-03-PLAN.md`
  Task 1 behavior block
- `.planning/phases/01-foundation/01-CONTEXT.md` D-13 (paired decision protocol)
- `docs/mcpgen-pass-0-design.md` §"Pass 0 Output Schema" (auth subsystem)
- `docs/mcpgen-pass-1-design.md` §"Pass 1 Output Schema" (coverage_proof)
- `packages/ir/src/types.ts` (Zod source of truth)
- `packages/ir/python/types.py` (Pydantic codegen output — DO NOT hand-edit)
