# Runbook: Logto tenant reproduction (staging / sandbox)

**References:**

- 08-CONTEXT.md D-03 (Logto dashboard provider config is manual + idempotent procedure)
- 08-RESEARCH.md §6 D-03
- `infrastructure/logto/scaffold.ts` (REFERENCE-ONLY listing helper from Phase 1)
- `infrastructure/logto/README.md` (env-var contract for `LOGTO_*` triple)

## When to use

- Bootstrapping a new tenant (`mcpgen-staging` or `mcpgen-sandbox`).
- Onboarding a new dev to a fresh Logto environment (e.g. lost tenant access).
- Recovering after a Logto Cloud free-tier MAU lock at 5K (Pitfall #17).

This runbook is **idempotent** — re-runs are no-ops; you can safely re-walk
all steps if you are unsure which step you completed last.

## Manual click-path

1. **Create tenant** at <https://cloud.logto.io>
   - Name: `mcpgen-staging` or `mcpgen-sandbox`
   - Region: closest to user (us-west / eu-west)

2. **Sign-in experience**
   - Sign-in identifiers: enable `email` + `password`
   - **Do NOT** enable Google / Twitter / Apple / passwordless-magic-link
     — explicit OUT-OF-SCOPE per `RULES.md §6` anti-pattern #5 (OAuth zoo).

3. **Connectors → Social → GitHub**
   - Paste OAuth app credentials (Client ID + Client Secret) from your
     **GitHub Developer Settings → OAuth Apps → New OAuth App**.
   - Authorization callback URL: `https://${LOGTO_HOST}/callback/github`
     (Logto auto-fills this on the connector creation page; copy verbatim).

4. **Applications**
   - Create traditional-web app `MCPGen Web`
     → copy `App ID` to `.env.local` as `LOGTO_APP_ID`
     → copy `App Secret` to `.env.local` as `LOGTO_APP_SECRET`
     → set Redirect URI: `${LOGTO_BASE_URL}/api/auth/callback`
   - Create M2M app `MCPGen Engine M2M`
     → copy `App ID` to `.env.local` as `LOGTO_M2M_APP_ID`
     → copy `App Secret` to `.env.local` as `LOGTO_M2M_APP_SECRET`

5. **API Resources**
   - Create resource `https://api.mcpgen.dev/m2m`
     → copy Resource Indicator to `.env.local` as `LOGTO_M2M_RESOURCE_INDICATOR`
     → grant the M2M app the resource scope `all`
   - **Required for Phase 8 Plan 04 MAU watcher (D-05):** also grant the M2M
     app the **Logto Management API** resource (`https://${LOGTO_HOST}/api`)
     with scope `all`. Without this grant the `logto-mau-watch-v1` cron
     `getLogtoMau()` call will fail with 401 / 403.

6. **Verify** by running:

   ```bash
   pnpm tsx infrastructure/logto/scaffold.ts
   ```

   The script LISTS connectors + applications and warns if any are missing.
   It does **NOT** auto-create anything (per Phase 1 D-14 reference-only pattern).

## Output

All `LOGTO_*` env vars set in `.env.local`:

```bash
LOGTO_ENDPOINT=https://<your-tenant>.logto.app
LOGTO_BASE_URL=http://localhost:3000          # or https://app.mcpgen.dev for prod
LOGTO_APP_ID=<traditional-web-app-id>
LOGTO_APP_SECRET=<traditional-web-app-secret>
LOGTO_M2M_APP_ID=<m2m-app-id>
LOGTO_M2M_APP_SECRET=<m2m-app-secret>
LOGTO_M2M_RESOURCE_INDICATOR=https://api.mcpgen.dev/m2m
```

Phase 8 Plan 04 MAU watcher cron + drift watcher M2M token grant work
end-to-end after this is complete.

## Troubleshooting

- **`logto-mau-watch-v1` returns 401 on the MGMT API call** → step 5 second
  bullet missed. Re-grant the Logto Management API resource scope to the
  `MCPGen Engine M2M` app.
- **`getM2mTokenForEngine` returns 401 on cancel-generation / parse calls**
  → step 5 first bullet missed. Re-grant the `https://api.mcpgen.dev/m2m`
  resource scope.
- **Cross-tenant token leakage suspected** → audience mismatch is a hard fail
  in `apps/api/src/middleware/auth.ts` (Plan 01). The middleware accepts only
  audiences `LOGTO_BASE_URL` (user JWTs) and `LOGTO_M2M_RESOURCE_INDICATOR`
  (M2M JWTs). MGMT-API tokens have a different audience and get rejected
  outright.
