---
phase: 05-generation-engine-validation-stage-f
plan: 09
type: visual-review
mode: auto-approved
verified_at: 2026-04-29
verifier: gsd-executor (auto-mode chain)
---

# Plan 05-09 Visual Review — CLI Stage F Rendering

This document records the Plan 05-09 Task 4 visual review of the CLI's
Stage F output (F1/F2/F3 progress lines + final QualityReport summary
box). Auto-mode is active for this Plan 05-09 execution, so the
checkpoint is auto-approved per the orchestrator's chain policy. Manual
operator-eye verification on physical macOS Terminal / iTerm2 / Linux
gnome-terminal is deferred to the next interactive run — this document
records what is verifiable from the test suite + static review and
flags anything that requires a human eye.

## What was built

| Artifact                                    | Purpose                                                       | Verified by                                  |
| ------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `apps/cli/src/init/render_quality_report.ts` | Renders the D-38 summary box with colour-coded badge          | 13 unit tests (badge/strict/F3-absent paths) |
| `apps/cli/src/init/sse_consumer.ts`          | Adds `handleStageFEvent` router for F1/F2/F3/retry/terminal   | 12 unit tests (lifecycle + payload coverage) |
| `apps/cli/src/init/options.ts`               | `--f3` / `--sandbox-creds` / `--strict` flag definitions      | 12 unit tests (flag parse + YAML loader)     |
| `apps/cli/src/init/index.ts`                 | Wires Stage F into runInit + GET `/quality-report` fallback   | typecheck + 56 existing CLI tests still pass |
| Fixture `golden_tasks.json` × 3              | Hand-authored 30 tasks (Stripe/GitHub/Notion × 10)            | Pydantic validation via GoldenTask           |
| Fixture `mock_upstream.py` × 2               | Linear / Slack adapters delegating to `synthesize`            | Smoke import + sample call (deterministic)   |

## Static verification (passed automatically in auto-mode)

1. **F1 line format** — emitted as `⏺ F1 — running 11 checks...` on
   `F1:started` and `✓ F1 — N/N passed (Xs)` on `F1:completed`. Test
   `Test 2: F1:completed with passed=true renders pass count` asserts
   the `11/11` token appears.
2. **F2 line format** — emitted as `✓ F2 — 4.31 / 5.00 (overall) — σ =
   0.52 (Xs)` per the engine's `_serialize_f2` payload. Test `Test 4`
   asserts both `4.31` and `0.52` appear in the rendered line.
3. **F3 line format** — emitted as `✓ F3 — 8/10 tasks passed (rate
   0.80) (Xs)`. Test `F3:completed renders pass-rate` asserts the rate
   appears.
4. **Final summary box** — separator (`━`-repeated 50×) wraps a two-line
   summary; tests assert at least 2 separator lines + the `VERIFIED` /
   `PREMIUM` / `STANDARD` / `NEEDS_REVIEW` token.
5. **Colour coding** —
   - `PREMIUM` → `pc.bold(pc.green(...))`  (bright green)
   - `VERIFIED` → `pc.bold(pc.green(...))` (green)
   - `STANDARD` → `pc.bold(pc.yellow(...))` (yellow)
   - `NEEDS_REVIEW` → `pc.bold(pc.red(...))` (red)
   `picocolors` is NO_COLOR-aware out of the box (consults
   `process.env.NO_COLOR` and `process.env.FORCE_COLOR`); piping
   through `cat` or setting `NO_COLOR=1` produces plain ASCII.
6. **`--strict` exit code** — 4 tests cover F1 fail / F2 below
   threshold / F3 below threshold / all-gates-pass. Thresholds source
   from `LAUNCH_CRITERIA` only (Pitfall #29 invariant — verified by the
   absence of bare `4.0` / `0.7` literals outside `LAUNCH_CRITERIA`
   reference lines).
7. **GET `/quality-report` fallback** — `index.ts::fetchQualityReportSafely`
   calls the new endpoint when SSE drops; returns `null` on 404 so older
   engines (Phase 4) gracefully degrade without crashing.

## Items deferred to human-eye review (next interactive run)

- **Terminal width handling at 80 cols** — the `━` separator is fixed
  at 50 chars, so it should fit comfortably under 80 cols, but no
  programmatic test asserts wrapping behaviour. A future interactive
  run should resize the terminal and verify that the summary box
  reflows or remains intact.
- **Per-terminal-emulator unicode rendering** — the `⏺`, `↻`, `✓`, `✗`,
  `━`, `·`, `σ` glyphs render fine in modern terminals but legacy
  Linux consoles or non-UTF-8 SSH sessions may show replacement chars.
  The CLI does not currently degrade — operators on legacy terminals
  see boxes, not crashes.
- **Real engine integration smoke test** — running
  `bun run dev init <real-spec> --f3` end-to-end against a live engine
  with a real OpenRouter key is gated on the orchestrator-level Plan
  05-10 E2E run; deferred to that plan.

## Auto-mode resume signal

`approved` — proceeding to plan summary.
