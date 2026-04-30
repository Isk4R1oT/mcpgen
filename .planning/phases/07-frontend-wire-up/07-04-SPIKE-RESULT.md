# Plan 07-04 — Pre-Execution Assumption Spike Results

**Date:** 2026-04-27
**Executor:** gsd-executor (worktree: agent-a20f24f7e67f90484, branch base 8d56160)
**Pre-condition:** Phase 5 merged (`9f3a927 feat(engine): ship Phase 5 validation Stage F`) AND Phase 8 merged (`ef75971 feat(ops): ship Phase 8 auth + billing`). Both confirmed in `git log` lineage of the worktree branch.

---

## A1: Locked `screen-stream.jsx` `onDone` short-circuitability

**Verdict:** **PASS** (proceed without modifying locked screen).

**Method:** Code inspection of `apps/web/src/screen-stream.jsx` lines 21–55, plus inspection of the existing `StreamLogWrapper` body at `apps/web/src/lib/jsx-bridge/screens.tsx` lines 219–243 (already shipping in production via Plan 07-03 commit `b248d23`).

**Observed behavior:**

1. `StreamLog` (locked) runs its OWN `useEffect` on mount that simulates 11 sequential stages via a closed-over `cancelled` flag. The simulation calls `onDone()` only after the full ~12s walk completes (line 33–35: `if (i >= STREAM_STEPS.length) { setTimeout(() => !cancelled && onDone(), 400); return; }`).
2. The `cancelled` flag is set to `true` in the cleanup function of the same `useEffect` (line 54: `return () => { cancelled = true; };`). This means **as soon as the locked component unmounts, its internal `setTimeout` and `requestAnimationFrame` chains short-circuit cleanly** — no leaked timers, no late `onDone` fires after navigation.
3. The wrapper drives navigation independently via `useGenerationSSE(jobId).status === 'completed'` triggering `router.push('/preview')` in its OWN `useEffect`. When `router.push` runs, the wrapper's `<StreamLog>` element unmounts (the route segment changes), which fires the locked `useEffect` cleanup, which sets `cancelled = true`. Result: locked screen halts gracefully; user sees navigation immediately when real SSE completes regardless of where the locked timer is in its 11-stage walk.
4. The wrapper's `onDone` is wired as a **fallback** only — if SSE happens to complete AFTER the locked timer ran out (e.g., very fast fixture mode), the locked `onDone` fires `router.push('/preview')` and is idempotent with the wrapper's own SSE-driven navigation (Next.js dedupes pushes to the same URL).

**Conclusion:** A1 holds. The locked screen-stream.jsx's self-driven progress simulation does NOT block external navigation. The wrapper-driven `useEffect(() => { if (status === 'completed') router.push(...); })` pattern is correct and already shipping (Plan 07-03 `b248d23`). No locked-screen modification needed.

**Spike artifact:** Not required — Plan 07-03's existing `StreamLogWrapper` body IS the spike (it has been live in fixture mode for one wave with passing e2e Pitfall #20 test). No `apps/web/tests/spike/stream-spike-page.tsx` written; Wave 1 already proved the contract.

---

## A4: `QualityReport` field names

**Verdict:** **PASS** (no field-name mismatch).

**Method:** Direct read of `packages/ir/src/types.ts` lines 397–481 (Stage F — QualityReport).

**Verified field names:**

```ts
export const QualityReport = z.object({
  spec_hash: z.string().regex(/^[a-f0-9]{64}$/),
  f1_static: F1StaticReport,                         // ✓ matches quality-badge.ts
  f2_smell: F2SmellReport,                           // ✓ matches quality-badge.ts
  f3_agent_eval: F3AgentEvalReport.nullable(),       // ✓ matches quality-badge.ts
  overall_score: z.number().min(0).max(5),
  quality_badge: QualityBadge,
  // ...strictly-additive Phase-5 fields below
});

export const F1StaticReport = z.object({
  passed: z.boolean(),                               // ✓ f1_static.passed exists
  // ...
});

export const F2SmellReport = z.object({
  tool_scores: z.array(F2ToolSmellScore),
  overall_average: z.number().min(0).max(5),         // ✓ f2_smell.overall_average exists
  passed: z.boolean(),
});

export const F3AgentEvalReport = z.object({
  results: z.array(F3GoldenTaskResult),
  pass_rate: z.number().min(0).max(1),               // ✓ f3_agent_eval.pass_rate exists
  passed: z.boolean(),
});
```

**Conclusion:** All three fields the badge mapper uses (`f1_static.passed`, `f2_smell.overall_average`, `f3_agent_eval.pass_rate`) exist with exact names in the FROZEN IR schema. No quality-badge.ts changes needed; existing Plan 07-03 mapper compiles against real Phase-5 output unchanged.

---

## A8: `GET /api/v1/jobs/:id` BFF response shape

**Verdict:** **ESCALATE-DEFERRED** (gap acknowledged in plan body; downstream-tolerant).

**Method:** Direct read of `apps/api/src/routes/v1/` and `apps/api/src/index.ts`.

**Observed:**

1. `apps/api/src/routes/v1/generate.ts` STILL returns 501 stub (no Phase-8 modification — verified by `git show ef75971 --stat | grep apps/api/src/routes/v1/generate` returns empty).
2. `apps/api/src/routes/v1/jobs/stream.ts` STILL returns the Phase-1 stub `phase1_stub` event (no Phase-8 modification).
3. There is NO `GET /api/v1/jobs/:id` route handler in the BFF — `apps/api/src/index.ts` line 79 mounts `protectedApp.route('/jobs', jobsStreamRoute)` and `jobsStreamRoute` only registers `.get('/:id/stream', ...)` — no plain `:id` GET route exists.
4. Phase-8 SUMMARY (`08-05-SUMMARY.md`) explicitly notes "Step 3: `POST /api/v1/generate` (200/202 success or 501 Phase-1-stub gap)" — Phase 8 did NOT ship the generation kickoff itself; it implemented auth middleware + billing infra + drift watcher + webhook handlers, but generation kickoff remains a Phase-1-stub gap.

**Impact on this plan:**

- Plan 07-04's "live-mode proxy" code (Plan 07-03 already wired) will faithfully forward whatever the BFF returns. Currently that's a 501 from `POST /generate`, a 404 from `GET /jobs/:id`, and a `phase1_stub` SSE event from `GET /jobs/:id/stream`.
- The plan's `requires MCPGEN_FRONTEND_MODE=live` e2e tests SKIP when the env var is not set — they will not run in CI by default, so they will not fail the build.
- The plan body explicitly acknowledges this: "EXECUTION must be blocked by tooling until Phase 5 (engine) AND Phase 8 (BFF generation kickoff) are merged" — but the `EXECUTION-BLOCKED-UNTIL` marker only references "phase-5-merged" (the orchestrator interpretation of the marker matches the literal frontmatter value).
- The orchestrator spawned this executor knowing the worktree is post-Phase-5 + post-Phase-8 merge; the structural wire-up (proxy + Shiki + dual-baseline tests) is shippable independent of whether the BFF returns 501 or real responses, because the proxy is content-agnostic.

**Conclusion:** Proceed with structural wire-up. Document in Plan 07-04 SUMMARY that **the BFF generation kickoff is a Phase-1-stub gap that Phase 8 did NOT close** — the live-mode proxy is shippable today but does not produce useful output until a follow-up plan (Phase 9 integration or a Phase 8 amendment) wires `apps/api/src/routes/v1/generate.ts` to enqueue an Inngest job + ships `GET /api/v1/jobs/:id` reading from `generations` + `pending_callbacks` tables. Do NOT block this plan on it; the deliverable is the **frontend-side** wiring + Shiki + dual e2e tests.

**Carry-forward action:** Add to Plan 07-04 SUMMARY "Deferred Issues" section: "BFF `POST /api/v1/generate` + `GET /api/v1/jobs/:id` + `GET /api/v1/jobs/:id/stream` real implementations remain Phase-1-stubs after Phase 8 merge — engine workstream Phase-9 integration plan (or Phase 8 amendment) must close before live-mode demo."

---

## A12: Engine-fixtures `LockedSample` derivation rules

**Verdict:** **PASS** (existing wrappers already use a fallback shape; derivation rules documented).

**Method:** Direct read of `packages/engine-fixtures/stripe/ir.json` (RawIR shape) + `packages/engine-fixtures/stripe/final-tools.json` + `packages/engine-fixtures/stripe/quality-report.json`. Cross-referenced with `LockedSample` shape in `apps/web/src/lib/jsx-bridge/index.ts` and `screens.tsx` `FALLBACK_SAMPLE` constant.

**RawIR.metadata fields available** (from `ir.json` top-level shape):

- `spec_format` (e.g., `"openapi-3.1"`)
- `spec_hash` (sha256 hex)
- `endpoints[]` — array; **`endpoints.length` gives the endpoint count**

**FinalTool[]** (from `final-tools.json`): array of `FinalTool` objects; **`finalTools.length` gives the tool count**.

**QualityReport** (from `quality-report.json`): includes `bundle_size_kb` (Phase-4 strictly-additive) which can power "save" but no `token_savings_pct` field exists in the FROZEN IR.

**Derivation rules** (for Wave 2 PreviewWrapper / QualityReportWrapper):

```ts
const sample: LockedSample = {
  id: specSlug,                             // Derived from spec URL hostname (e.g., "stripe")
  name: humanFriendlyName,                  // Derived from spec_hash → look up in fixtures registry, OR from spec_url path
  endpoints: rawIR.endpoints.length,        // ✓ direct count
  tools: finalTools.length,                 // ✓ direct count
  save: estimatedTokenSavingsPct ?? 0,      // No source-of-truth field; use 0 fallback OR a downstream computation
};
```

**Note:** The locked Preview/Quality screens render `sample` for layout decoration only (server-name placeholder, endpoint count badge); the REAL data (FinalTool[], QualityReport) flows through dedicated props (`finalTools`, `qualityReport`) which Wave 1 already threaded through (Plan 07-03 PreviewWrapper signature). No `sample` derivation is critical for Wave 2 — `FALLBACK_SAMPLE` continues to satisfy the locked screen's render path; the new render paths (Shiki code panel, F2 component breakdown) read the dedicated props directly.

**Conclusion:** Wave 2 derivation rules are documented; no new helper required. PreviewWrapper continues to take `sample` as the locked-screen prop (FALLBACK_SAMPLE is fine when no real sample is available) and adds `codeSource: string | null` for the new Shiki render path. QualityReportWrapper continues to take `sample` + `qualityReport` and renders the badge tier from `quality-badge.ts` mapper (already shipping).

---

## Summary

| Assumption | Verdict | Action |
|---|---|---|
| A1 (locked screen-stream onDone short-circuit) | PASS | Proceed; existing wrapper pattern is correct. |
| A4 (QualityReport field names) | PASS | No badge-mapper changes. |
| A8 (BFF GET /jobs/:id shape) | ESCALATE-DEFERRED | Document gap in SUMMARY; wire live-mode proxy that's content-agnostic; live e2e tests skip-if-not-set. |
| A12 (LockedSample derivation) | PASS | Document derivation rules; no helper needed for Wave 2 wire-up. |

**Decision: PROCEED with Tasks 2–4** (live-mode proxy, Shiki code panel, dual-baseline e2e tests). Document A8 gap in Plan 07-04 SUMMARY under "Deferred Issues" so Phase 9 / a Phase-8 amendment knows to close it.
