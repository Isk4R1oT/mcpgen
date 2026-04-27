# Runbook: Resend domain verification

**References:**

- 08-CONTEXT.md Q4 (open question — Q4 fallback to `onboarding@resend.dev` is acceptable for dev)
- 08-RESEARCH.md §14 (Resend operational email contract) + §20 Q4
- `apps/api/src/lib/email/resend-client.ts` (consumer)

## Status (Phase 8)

Production-grade sender domains require DNS records (SPF / DKIM / DMARC) on
the sender domain. If `mcpgen.dev` is not yet verified in Resend Console,
Phase 8 falls back to `onboarding@resend.dev` (Resend's shared sender) for
dev — the production launch criterion at W7 adds the DNS setup step below
to the launch checklist.

## Click-path

1. Sign in at <https://resend.com>.
2. Domains → **Add Domain** → enter `mcpgen.dev`.
3. Resend issues DNS records (SPF + DKIM + DMARC); copy each.
4. Add records to Cloudflare DNS for `mcpgen.dev` (DNS-only, **NOT** proxied).
5. Wait 1–60 minutes for DNS propagation; click "Verify" in Resend Console.
6. Once verified, set `.env.local`:

   ```bash
   DRIFT_FROM_EMAIL=MCPGen Drift Watcher <drift@mcpgen.dev>
   OPS_FROM_EMAIL=MCPGen Ops Alert <ops@mcpgen.dev>
   ```

7. If domain is **NOT** verified yet (dev mode):
   - Either leave both `*_FROM_EMAIL` env vars unset and accept that
     `apps/api/src/lib/email/resend-client.ts` will use the default
     `MCPGen Drift Watcher <drift@mcpgen.dev>` / `MCPGen Ops Alert
     <ops@mcpgen.dev>` strings (Resend will reject these until the domain is
     verified — this is the expected dev-mode behaviour); **OR**
   - Override both to `onboarding@resend.dev` for unblocked dev:

     ```bash
     DRIFT_FROM_EMAIL=onboarding@resend.dev
     OPS_FROM_EMAIL=onboarding@resend.dev
     ```

   This is the Q4 fallback — a Resend-shared sender that bypasses
   domain-verification.

## API key

1. Resend Console → **API Keys** → **Create API Key**
2. Name: `mcpgen-dev`, scope `Full Access`
3. Copy `re_…` key into `.env.local` as `RESEND_API_KEY`
4. Verify reachability:

   ```bash
   curl -H "Authorization: Bearer $RESEND_API_KEY" https://api.resend.com/domains
   ```

   Should return JSON.

## Production launch criterion (W7)

Domain verification is a launch-day blocker per RESEARCH §14 operational
contract; Phase 8 ships dev-mode with the Q4 fallback acceptable. Add the
following to the W7 launch checklist:

- [ ] `mcpgen.dev` SPF + DKIM + DMARC records verified in Resend Console
- [ ] `DRIFT_FROM_EMAIL` and `OPS_FROM_EMAIL` set to verified-domain senders
- [ ] Smoke-test all 3 send paths (drift / reconciliation / MAU) against a
      real tenant inbox

## Three send paths

The Resend client exposes 3 named functions (per `resend-client.ts`):

| Function                    | Trigger                                                                         | Frequency      |
| --------------------------- | ------------------------------------------------------------------------------- | -------------- |
| `sendDriftEmail`            | `drift-watcher-check-v1` → spec drift detected (D-18 rate-limited 1/wk/tenant)  | ~1/wk/tenant   |
| `sendReconciliationAlert`   | `usage-reconciler-v1` → TimescaleDB ↔ Stripe drift > 2% (Pitfall #16)           | rare (alert)   |
| `sendMauAlert`              | `logto-mau-watch-v1` → Logto MAU > 4000 (75% of 5K cap, Pitfall #17)            | rare (1×/year) |

Total emit rate is far below the Resend free-tier 2 req/s limit; no
rate-limit handling needed beyond the per-function dedup constraints (D-18,
reconciliation_log UNIQUE, mau_log PK).
