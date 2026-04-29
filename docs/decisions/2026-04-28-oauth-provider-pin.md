# 2026-04-28 — `@cloudflare/workers-oauth-provider` exact-pin verification (RESEARCH Open Q4 closure)

## Status

Accepted.

## Context

Phase 4 Plan 04-09 (Stage E Phase 4 — auth middleware + credentials templates)
emits the `oauth` variant of `auth_middleware.ts.j2` referencing
`@cloudflare/workers-oauth-provider`. RESEARCH §"Standard Stack" recommended
locking the version, but flagged it as **Open Question 4** because the package
is pre-1.0 (`0.x.y`) and breaking changes are still possible between minor
versions.

Plan 04-06 Task 1 OWNS the `packages/codegen-templates/package.json` write —
the dependency was added there at `^0.2.2` upfront alongside the rest of the
codegen-templates devDependencies (wrangler, typescript, @modelcontextprotocol/sdk,
zod, @sentry/cloudflare). Plan 04-09 (this decision) STRICTLY VERIFIES the
already-authored entry via grep + `npm pack` API-shape inspection.

## Verified Pin

**Pinned version:** `^0.2.2` (matches `0.2.x` only — pre-1.0 caret semver
restricts to the minor range, so `0.3.x` / `0.4.x` will NOT be auto-resolved).

**Verification commands run on 2026-04-28:**

```bash
# Step 1: confirm the entry is present at the expected pin pattern.
grep -E '"@cloudflare/workers-oauth-provider"\s*:\s*"[~^]?0\.2\.[0-9]+"' \
  packages/codegen-templates/package.json
# → matches: "@cloudflare/workers-oauth-provider": "^0.2.2",

# Step 2: latest version on npm registry (informational only).
npm view @cloudflare/workers-oauth-provider version
# → 0.4.0  (drift detected — see "Drift Findings" below)

# Step 3: API stability check via npm pack (no install — `--pack-destination` only).
npm pack @cloudflare/workers-oauth-provider@0.2.2 \
  --pack-destination /tmp/mcpgen-oauth-pack
tar -tzf /tmp/mcpgen-oauth-pack/cloudflare-workers-oauth-provider-0.2.2.tgz
# → package/dist/oauth-provider.d.ts present
# → package/dist/oauth-provider.js  present
```

## Drift Findings

The latest published version on npm at verification time was **`0.4.0`**, but
the project pins `^0.2.2`. The pin is intentional and matches RESEARCH-recorded
guidance — caret semver on a pre-1.0 dep restricts to the minor range. The pin
will resolve `0.2.x` only and will NOT silently bump to `0.3.x` / `0.4.x`.
Phase 6 (when wiring the actual Logto tenant) will re-run this verification
gate; bumping to `0.3.x` or `0.4.x` requires (a) a new paired decision-log
entry, (b) updating `auth_middleware.ts.j2` if the OAuthProvider ctor signature
shifts, and (c) regenerating fixture-rendered Stage E outputs.

## API Surface Confirmed (`0.2.2`)

The ctor signature documented in `docs/mcpgen-stage-e-design.md` §5.3 and
referenced by `auth_middleware.ts.j2` matches the actual `0.2.2` exports:

```typescript
// from package/dist/oauth-provider.d.ts (extracted)
declare class OAuthProvider {
  constructor(options: OAuthProviderOptions);
}
interface OAuthProviderOptions {
  apiRoute?: string | string[];                       // required when using `apiHandler`
  apiHandler?: ExportedHandlerWithFetch | ...;        // single-handler config
  apiHandlers?: Record<string, ...>;                  // multi-handler config (alt)
  defaultHandler: ExportedHandler | ...;              // required
  authorizeEndpoint: string;                          // required
  tokenEndpoint: string;                              // required
  clientRegistrationEndpoint?: string;                // optional
  // ... plus tokenExchangeCallback, scopesSupported, etc.
}
export {
  AuthRequest, ClientInfo, CompleteAuthorizationOptions, Grant, GrantSummary,
  ListOptions, ListResult, OAuthHelpers, OAuthProvider, OAuthProvider as default,
  OAuthProviderOptions, ResolveExternalTokenInput, ResolveExternalTokenResult,
  Token, TokenBase, TokenExchangeCallbackOptions, TokenExchangeCallbackResult,
  TokenSummary,
};
```

Important constraint discovered during inspection: when using the
single-handler form, both `apiRoute` and `apiHandler` MUST be provided
together. The `auth_middleware.ts.j2` oauth variant accordingly emits
`apiRoute: "/api/*"` alongside `apiHandler` (or uses `apiHandlers` for
multi-route configs). This is a Phase 4 structural-template concern;
Phase 6 will refine when wiring the actual Logto tenant.

## Why pre-1.0 Risk Is Acceptable for MVP

1. **Single-tenant scope in Phase 4.** Phase 4 emits the OAuth template surface
   only. Test-only OAuth flows do not exercise the full handshake; production
   OAuth is wired in Phase 6 with a re-verification gate (paired decision-log
   entry mandatory if the pin changes).
2. **No production traffic.** Generated tenant Workers stay in dry-run /
   `wrangler deploy --dry-run` until Phase 6. A breaking-change in
   `0.3.x` / `0.4.x` would surface during the Phase 6 spike, not in user-facing
   production.
3. **Caret semver gates auto-bumps.** `^0.2.2` will NOT silently update to
   `0.3.x`. Engineers must intentionally bump the pin, which forces a paired
   decision-log review per Phase 1 D-13.
4. **Stable enough for the OAuth structural template.** The `OAuthProvider`
   ctor + `OAuthProviderOptions` shape we depend on (`apiHandler`,
   `defaultHandler`, `authorizeEndpoint`, `tokenEndpoint`,
   `clientRegistrationEndpoint`) is documented in `dist/oauth-provider.d.ts`
   and used by Cloudflare's MCP samples in production.

## Upgrade Procedure (Phase 6 + future)

To bump the pin:

1. Re-run `npm view @cloudflare/workers-oauth-provider version` to record the
   target version.
2. Re-run `npm pack @cloudflare/workers-oauth-provider@<new-version> --pack-destination /tmp/oauth-pack`
   and inspect `dist/oauth-provider.d.ts` for ctor-signature drift.
3. If the API has shifted, update `auth_middleware.ts.j2` oauth variant to
   match.
4. File a paired `docs/decisions/<date>-oauth-provider-pin.md` superseding this
   doc per Phase 1 D-13.
5. Update `packages/codegen-templates/package.json` with the new pin (this is
   the ONE place the pin lives — Plan 04-06 OWNS this file).
6. Re-run Stage E fixture renders (Stripe + GitHub + Notion) to confirm
   bit-identical or expected diffs.
7. Re-run `tsc --noEmit` against rendered Stripe to confirm the OAuth template
   still compiles.

## Phase 6 Dep Risk Table

| Risk | Severity | Mitigation |
|------|----------|------------|
| `0.3.x` adds breaking ctor changes | M | Re-verification gate in Phase 6 + paired decision log mandatory before bump. |
| `0.2.x` line abandoned by Cloudflare | L | `^0.2.2` continues to resolve via npm registry historical versions; if abandoned upstream we mirror to GitHub Packages or vendor the source. |
| OAuth flow exercises non-tested code path under load | M | Phase 6 spike covers the actual handshake; F3 agent eval (Phase 5) catches description-quality bugs in the OAuth tool docs. |
| Pre-1.0 → 1.0 release with breaking surface | M | Treat 1.0 release as a separate paired-decision-log gate; do not auto-bump. |

## References

- 04-RESEARCH.md §"Open Questions" Q4 (this decision closes it)
- 04-RESEARCH.md §"Standard Stack" `@cloudflare/workers-oauth-provider` row
- 04-CONTEXT.md D-21 (3 auth modes — oauth variant)
- docs/mcpgen-stage-e-design.md §5.3 (OAuth mode emitter)
- 01-CONTEXT.md D-13 (paired decision-log mandatory for dep pins)
