# Phase 4 — Deferred Items

> Items discovered during plan execution that are out of scope per the
> SCOPE BOUNDARY rule (only auto-fix issues DIRECTLY caused by the current
> task's changes). Logged here for the planner / future plans to address.

---

## 2026-04-29 — Plan 04-12 DRAINED Plan 04-11's TS errors

The 5 categorised template TS errors below were **drained by Plan 04-12**
(commit `111d6cb` — `fix(04-12): drain deferred-items.md template TS
errors (5 categorized fixes)`). All Stripe + GitHub + Notion fixtures
now compile `tsc --noEmit` clean with **ZERO warnings**, satisfying the
D-43.5 zero-warning gate + WARNING 5 semantics. Drained items are
preserved below for historical context.

---

## 2026-04-28 — Plan 04-11 (Stage E Phase 6 validate.py)

### Pre-existing template TS compile errors surfaced by `tsc --noEmit`

Plan 04-11 is the first plan to actually run `tsc --noEmit` against the
rendered tenant Worker tree. Doing so surfaced **pre-existing TypeScript
compilation errors** in templates from plans 04-06 through 04-10.

These are NOT caused by Plan 04-11's code (Plan 04-11 fixed the SDK
title-arg drift in tool_*.ts.j2 as a Rule 1 bug fix because that drift
was directly tied to the new tsc gate). The errors below are independent
template bugs that compilers had not previously been run against.

Per VALIDATION.md row `04-12-*`, **end-to-end `tsc --noEmit` clean is
the responsibility of plan 04-12** (E2E pipeline on Stripe/GitHub/Notion
fixtures). Plan 04-11 ships the validation infrastructure
(`run_tsc_no_emit`, `gate_bundle_size`, `ensure_codegen_node_modules`)
that plan 04-12 (or an intermediate template-fix plan) consumes.

#### Categorised TS errors (synthetic 3-tool e2e fixture)

1. **`src/index.ts` — `withSentry` Env shape mismatch + `transport.handleRequest()` arg count.**
   - File: `packages/codegen-templates/templates/index.ts.j2` (Plan 04-06)
   - Errors:
     - `index.ts(36,44): error TS2559: Type 'Env' has no properties in common with type 'Env'.`
     - `index.ts(41,5): error TS2322: Type 'void' is not assignable to type 'Response'.`
     - `index.ts(41,22): error TS2554: Expected 2-3 arguments, but got 1.`
   - Root cause: `@sentry/cloudflare` v10 `withSentry` generic doesn't
     match the bare `Env` interface defined in the template; SDK
     `StreamableHTTPServerTransport.handleRequest(req, res, body?)` needs
     2-3 args, template passes only `req`.
   - Owner: future template-fix plan (likely 04-12 prep).

2. **`src/runtime/sentry_redact.ts` — missing `@sentry/types` package.**
   - File: `packages/codegen-templates/templates/sentry_redact.ts.j2` (Plan 04-08)
   - Error: `sentry_redact.ts(21,39): error TS2307: Cannot find module '@sentry/types'`
   - Root cause: `@sentry/cloudflare` re-exports types but doesn't pull
     `@sentry/types` as a direct dep into node_modules; either add
     `@sentry/types` to `packages/codegen-templates/package.json`
     devDependencies or import from `@sentry/cloudflare` instead.
   - Owner: future template-fix plan.

3. **`src/server.ts` — `McpServer` lacks `setRequestHandler`.**
   - File: `packages/codegen-templates/templates/server.ts.j2` (Plan 04-06)
   - Errors:
     - `server.ts(40,10): error TS2339: Property 'setRequestHandler' does not exist on type 'McpServer'.`
     - `server.ts(40,60): error TS7006: Parameter 'req' implicitly has an 'any' type.`
     - `server.ts(40,65): error TS7006: Parameter '_extra' implicitly has an 'any' type.`
   - Root cause: `McpServer` (high-level) exposes `tool()`/`prompt()`/`resource()`;
     `setRequestHandler` lives on the lower-level `Server`. Template
     should use the `McpServer` API surface (drop the manual
     `InitializeRequestSchema` registration; `McpServer.connect()` handles
     initialize internally).
   - Owner: future template-fix plan.

4. **Tool handler return-type mismatch — `McpErrorResponse` not
   assignable to `CallToolResult`.**
   - File: `packages/codegen-templates/templates/tool_fetch.ts.j2`,
     `tool_list_objects.ts.j2`, others (Plan 04-10).
   - Error: `tool_fetch.ts(47,5): error TS2345` — handler returns a
     union type whose `content` array is `readonly` but the SDK expects
     mutable `content`.
   - Root cause: response_shaping.ts.j2 (Plan 04-08) declares
     `content` as `readonly { ... }[]`; the SDK callback signature wants
     mutable. Either drop `readonly` in `response_shaping.ts.j2` or
     spread the array before returning.
   - Owner: future template-fix plan.

5. **`tool_list_objects.ts` — wrong arg count on a helper call (line 38).**
   - Error: `list_objects.ts(38,10): error TS2554: Expected 2-3 arguments, but got 1.`
   - Likely related to a `routing[...]` lookup; needs investigation.

#### Why deferred

- Per CLAUDE.md global "Process" rule + SCOPE BOUNDARY: only auto-fix
  issues directly caused by the current task's changes.
- Per CONTEXT D-27: NO auto-fix on tsc errors — surface to planner.
- Per VALIDATION.md row `04-12-*`: E2E + tsc --noEmit clean gate belongs
  to plan 04-12 (Stripe/GitHub/Notion fixtures).
- Per fix-attempt limit: fixing 5 categorised template bugs across
  templates from 5 prior plans exceeds the 3-attempt-per-task budget.

#### Plan 04-11's response

- `validate.py::run_tsc_no_emit` works correctly: it raises
  `StageETsError` carrying the categorised error lines on every failure
  shape above. The exception's `.errors` list is the surface plan 04-12
  consumes for retry orchestration / human investigation.
- `test_run_e2e.py` asserts the orchestrator's contract (raises
  `StageETsError` deterministically on the synthetic fixture) rather
  than gating on tsc passing — reflects today's reality and matches the
  validation row split between 04-11 and 04-12.
- The `tsc_warning_count == 0` gate for Stripe/GitHub/Notion fixtures
  (per plan must_haves D-43.5) lands in plan 04-12 alongside the
  template fixes.
