# ADR — auth_mode="none" for unauthenticated upstream specs

**Date:** 2026-05-03
**Status:** Accepted
**Authors:** mcpgen engine
**Supersedes:** none
**Touched:**
- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/auth.py`
- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/scaffold.py`
- `packages/codegen-templates/templates/auth_middleware.ts.j2`

## Context

Phase 4 D-21 froze three auth modes for the generated tenant Worker:
`passthrough` (default for any apiKey / http_basic / http_bearer / none /
empty requirement set), `stored` (AES-256-GCM-encrypted credential in
`TENANT_DEK_KV` for AWS Sig / OAuth-M2M), and `oauth` (delegated to
`@cloudflare/workers-oauth-provider` for user-delegated flows).

The fall-through rule "anything else → passthrough" silently covered
specs whose endpoints declare zero auth requirements — Petstore,
Open-Meteo, NWS, and any other public unauthenticated API. The generated
passthrough middleware demands a non-empty `X-Upstream-Auth` request
header and returns HTTP 400 with the message *"Missing X-Upstream-Auth
header. Configure your MCP client to forward upstream credentials"* when
the header is absent.

Result: every tool call against an unauthenticated upstream API returns
400 before any upstream request — even though the upstream rejects
credentials. The agent has no recovery path; the MCP client has nothing
to forward; the spec authoritatively says no credentials are needed.

This was not caught earlier because Phase 1–9 fixtures (Stripe, GitHub,
Notion, Linear, Slack — the 5 popular APIs in `packages/engine-fixtures/`)
all carry `securitySchemes` and reach passthrough cleanly. Petstore is
the canonical local-dev fixture for the anonymous-hero-flow (Phase 9.1)
and surfaced the bug at the smoke-test stage.

## Decision

Add a fourth `AuthMode = "none"` literal. `select_auth_mode()` returns
it when:

1. No endpoint has any `oauth2` requirement (otherwise → `oauth`)
2. No endpoint has any `aws_signature` requirement (otherwise → `stored`)
3. No endpoint has any `apiKey` / `http_basic` / `http_bearer`
   requirement (otherwise → `passthrough`)
4. Every endpoint either has an empty requirement list or only
   `scheme=none` requirements

`auth_middleware.ts.j2` gains a fourth `{% elif auth_mode == "none" %}`
branch emitting a no-op middleware:

```typescript
export async function authMiddleware(_req, _env): Promise<AuthResult> {
  return { ctx: { upstreamCredential: "" } };
}
```

`runtime/upstream.ts.j2` already gates the `Authorization` header on
`if (opts.ctx.upstreamCredential)` so an empty credential simply omits
the header — no further runtime change needed.

## Why not extend passthrough with a "credential optional" flag

Considered. Rejected because:

- The spec authoritatively says no credentials are needed; demanding the
  agent supply one violates the contract.
- A "credential optional" passthrough would still log/redact the absent
  header and complicate the F1 secret-scan grep.
- A separate mode keeps the Pass 0 → Stage E auth pipeline tree-shaped
  rather than per-endpoint conditional, matching D-21's design intent.

## Why no tenant-key check in the "none" middleware

`passthrough` and `stored` middlewares both validate the
`Authorization: Bearer <tenant_key>` header as belt-and-suspenders — the
real check lives in the Phase 6 dispatch Worker, but the tenant Worker
re-checks for defense in depth.

The "none" middleware deliberately omits this re-check. Rationale:

- In production, Phase 6 dispatch is the security boundary. Tenant keys
  are validated there before any tenant Worker is invoked. The
  re-check inside the tenant Worker is redundant.
- For the dev_local hero flow (Plan 04-14 D-3, the user's local
  `wrangler dev` smoke test), there is no dispatch worker. Claude Code
  points directly at `localhost:8788`. Demanding a tenant key from a
  client that has nothing to send breaks the hero flow at exactly the
  point this ADR exists to fix.
- The DNS-rebinding mitigation
  (`StreamableHTTPServerTransport.allowedHosts`) and Sentry-redaction
  layers are unaffected — those are defense surfaces this ADR does not
  touch.

This is an intentional asymmetry vs `passthrough`/`stored`. The trade-off
is that a misconfigured production deploy with `auth_mode="none"` would
not have the belt-and-suspenders re-check. We accept this because (a)
production deploys still go through dispatch, (b) the alternative is
breaking the documented hero flow.

## Consequences

- **Positive.** Petstore / Open-Meteo / NWS hero-flow generations now
  produce a tenant Worker that Claude Code can connect to without any
  upstream-auth configuration. Phase 10 multi-client smoke run (5
  popular APIs × 3 clients in plan 10-06) is not blocked by this issue
  for any future unauthenticated spec.
- **Positive.** The auth_mode tree remains exhaustive — every spec
  resolves to exactly one of four modes, deterministic from
  `pass_0_output.auth_requirements`.
- **Neutral.** Existing 5-popular-API fixtures (Stripe, GitHub, Notion,
  Linear, Slack) all return `passthrough` unchanged.
- **Risk.** A misconfigured spec that *should* require credentials but
  declares none in `securitySchemes` would now fall through to
  `auth_mode="none"` and emit a credential-less worker. The spec author
  is responsible for declaring auth correctly; this ADR does not change
  that responsibility.

## Validation

- `select_auth_mode` updated; existing fixture-based tests for
  passthrough/stored/oauth modes continue to pass (real-LLM e2e
  verification on Petstore confirms the new branch produces a
  middleware that does not demand `X-Upstream-Auth` and that
  `wrangler dev` accepts unauthenticated requests).
- Stage E smoke tests pass `spec_servers=[]` and the existing test
  fixtures' auth surfaces unchanged (`test_run_e2e.py` Stripe, etc.).
