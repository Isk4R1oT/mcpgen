# Runbook: BetterStack provisioning (W7 calendar action)

**References:**

- 09-CONTEXT.md D-02 (BetterStack DSN missing — runbook only in Phase 9;
  user provisions before Phase 10 launch)
- 09-CONTEXT.md D-21 (outbox depth alert wired via Resend +
  BetterStack heartbeat URL)
- 09-RESEARCH.md §"Manual-Only Verifications"
- `scripts/observability/outbox-depth-monitor.ts`
  (consumes `BETTERSTACK_OUTBOX_HEARTBEAT_URL`)
- `apps/api/README.md` (env-var contract for `BETTERSTACK_*`)

## When to use

- **W7 of the Phase-10 launch sprint** — observability triad ships in
  Phase 9 with the SDK + alert script wired to no-op gracefully when
  DSNs are absent (D-01); cloud provisioning is a calendar action the
  founder runs once before public launch.
- **After a BetterStack token rotation** (90-day rotation cadence per
  org policy).
- **When onboarding a second-on-call engineer** — re-walk the steps
  with them as a tabletop exercise.

This runbook is **idempotent** — re-runs are no-ops; existing monitors
are updated in place rather than duplicated.

## Manual click-path

1. **Sign in to BetterStack** at <https://uptime.betterstack.com>.
   - If you don't have an account, sign up; the Free tier covers 10
     monitors which is enough for the W7 launch checklist below.

2. **Create a heartbeat monitor for the outbox depth cron**.
   - **Monitors → Create monitor → Heartbeat**.
   - Name: `outbox-depth-monitor`.
   - Period: `60 minutes` (matches the `pnpm outbox:monitor` cron
     cadence — once per hour).
   - Grace period: `10 minutes`.
   - Click **Save**.
   - Copy the heartbeat URL (looks like
     `https://uptime.betterstack.com/api/v1/heartbeat/<token>`).
   - Set in CI / `.env.local`:

     ```bash
     BETTERSTACK_OUTBOX_HEARTBEAT_URL=https://uptime.betterstack.com/api/v1/heartbeat/<token>
     ```

   - Verify by running once locally:

     ```bash
     pnpm outbox:monitor
     ```

     A green tick in the BetterStack Console within 60 s = working.

3. **Create uptime checks** for each public surface.
   - **Monitors → Create monitor → HTTPS check** for each of:

     | Target                     | URL                                        | Expected status |
     |----------------------------|--------------------------------------------|-----------------|
     | `apps/web` (Vercel)        | `https://app.mcpgen.dev`                   | 200             |
     | `apps/api` (CF Workers)    | `https://api.mcpgen.dev/health`            | 200             |
     | `apps/dispatch` (CF Workers) | `https://dispatch.mcpgen.dev/health`     | 200             |
     | `apps/generation-engine` (Fly) | `https://engine.mcpgen.dev/health`     | 200             |
     | Sample tenant Worker       | `https://t.mcpgen.dev/sample/health`       | 200             |
     | Logto endpoint             | `https://${LOGTO_HOST}/oidc/.well-known/openid-configuration` | 200 |

   - For each: period `60 s`, regions `us-east + eu-west` (free tier
     gives 2 regions).

4. **Configure escalation policy**.
   - **Settings → Escalation policies → Create policy**.
   - Name: `mcpgen-on-call`.
   - Step 1: Email → `OPS_EMAIL` (e.g. `ops@mcpgen.dev`).
   - Step 2 (after 5 min downtime): SMS → founder phone number.
   - Save and assign the policy to all monitors created above.

5. **Save tokens to CI secret store**.
   - GitHub → Repo → Settings → Secrets and variables → Actions →
     **New repository secret**:

     | Secret name                          | Value                          |
     |--------------------------------------|--------------------------------|
     | `BETTERSTACK_LOGS_TOKEN`             | from BetterStack Logs settings |
     | `BETTERSTACK_UPTIME_API_KEY`         | from BetterStack API settings  |
     | `BETTERSTACK_OUTBOX_HEARTBEAT_URL`   | from step 2                    |

   - Re-run the relevant CI workflow once to confirm the secrets are
     wired (no `??` fallback warnings in `pnpm outbox:monitor` logs).

6. **Sign-off**.
   - Take a screenshot of the BetterStack monitors page showing all 6
     uptime checks + 1 heartbeat monitor green.
   - Paste into `09-PHASE-VERIFICATION.md` Phase-10 section under
     "BetterStack provisioning — W7".
   - Move the deferred item from `STATE.md` → "Deferred Items" to
     "Completed in Phase 10".

## Output

- 1 heartbeat monitor (`outbox-depth-monitor`) configured + verified.
- 6 uptime checks for public surfaces configured + green.
- 1 escalation policy attached to all monitors.
- 3 BetterStack secrets in CI: `BETTERSTACK_LOGS_TOKEN`,
  `BETTERSTACK_UPTIME_API_KEY`, `BETTERSTACK_OUTBOX_HEARTBEAT_URL`.
- Screenshot evidence in `09-PHASE-VERIFICATION.md`.

## Troubleshooting

- **Heartbeat monitor never goes green** after step 2.
  - Verify the URL is set in the same shell that runs the cron:
    `echo "$BETTERSTACK_OUTBOX_HEARTBEAT_URL"` should print the URL.
  - Verify the script is running: tail BetterStack Logs in the
    Console; you should see one GET hit per hour.
  - If the cron is local-only (Phase 9), it only fires when
    `pnpm outbox:monitor` is invoked — set up a `crontab` /
    `launchd.plist` entry.
- **Uptime check fails with TLS error**.
  - `apps/web` and `apps/api` use Cloudflare TLS; verify the DNS A /
    CNAME record points at the right tenant.
- **Free tier alerts disabled after 3 false-positives**.
  - The 5-min escalation delay (step 4) prevents flapping; if you
    still hit the limit, upgrade BetterStack Free → Team tier
    (~$25/mo) before public launch.

## Phase 9 vs Phase 10 split

| Phase   | Owns                                                             |
|---------|------------------------------------------------------------------|
| Phase 9 | SDK wiring + `pnpm outbox:monitor` cron-able script + this runbook (no real BetterStack account required to merge Phase 9 PRs). |
| Phase 10 | Founder runs this runbook end-to-end during W7 — produces the heartbeat URL + secrets that wire into production CI. |
