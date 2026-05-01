# Runbook: Anon-cleanup BetterStack heartbeat (W7 calendar action; Phase 9.1 D-06 critical)

**References:**

- `.planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md` D-06
  (anon retention crons)
- `.planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md` §3
  ("Pitfall 3" — cost-runaway risk if cleanup silently fails)
- `apps/api/src/inngest/functions/anon-tenant-cleanup.ts`
  (consumes `BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL`; pings on every
  successful run including 0-deletes case)
- `docs/runbooks/betterstack-setup.md` (general BetterStack provisioning;
  this runbook extends it for the anon-cleanup-specific monitor)
- `apps/api/.dev.vars.example` (env-var contract)

## When to use

- **W7 of the Phase-10 launch sprint** — the anon-tenant-cleanup cron
  ships in Phase 9.1 with the heartbeat helper wired to no-op gracefully
  when the URL env var is absent (D-01 graceful pattern). Cloud
  provisioning is a calendar action the founder runs once before public
  launch. Without this runbook, **silent cleanup-failure → cost runaway**
  — see "Cost-runaway threshold" below.
- **After a BetterStack token rotation** (90-day rotation cadence per
  org policy).
- **When the anon flow is enabled in a new environment** (staging,
  preview deploy) — the heartbeat URL is per-environment.

This runbook is **idempotent** — re-runs are no-ops; an existing monitor
is updated in place.

## Cost-runaway threshold (why this matters)

The cron runs every 15 minutes. If it stops running silently (Inngest
schedule mis-config, CF API token expired, DB query regression), expired
anon CFWP scripts accumulate. Each anon script consumes a fixed CF
"deployed Worker" slot; CF Workers for Platforms billing currently
charges per script-month.

| Anon scripts orphaned | Daily cost (approx, $0.02/script-day) | Time to alert without heartbeat |
|---|---|---|
| 100 | $2.00 | ~immediately (one missed cron) |
| 500 | $10.00 | < 24h |
| 4,000 | **$80.00** | ~24h (worst case if 1 anon per 15 min × 1 day) |
| 10,000+ | **$200.00+** | If failure undetected for ~3 days |

**Mitigation:** BetterStack heartbeat with 20-minute grace period (5 min
buffer over the 15-min cron cadence). A missed heartbeat fires an email
within 30 minutes — well before any of the above thresholds become
catastrophic.

## Manual click-path

1. **Sign in to BetterStack** at <https://uptime.betterstack.com>.
   - Reuse the account from `betterstack-setup.md` Step 1.

2. **Create the heartbeat monitor for `anon-tenant-cleanup-v1`**.
   - **Monitors → Create monitor → Heartbeat**.
   - Name: `anon-tenant-cleanup-v1`.
   - Period: `20 minutes` (5-minute buffer over the 15-minute cron
     cadence — Inngest may delay a step by a few minutes under load).
   - Grace period: `5 minutes`.
   - Click **Save**.
   - Copy the heartbeat URL (looks like
     `https://uptime.betterstack.com/api/v1/heartbeat/<token>`).

3. **Set CI / production secrets**.
   - GitHub → Repo → Settings → Secrets and variables → Actions →
     **New repository secret**:

     | Secret name                                    | Value                                                             |
     |------------------------------------------------|-------------------------------------------------------------------|
     | `BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL`       | URL from step 2                                                   |

   - Production CF Workers deployment:

     ```bash
     cd apps/api
     wrangler secret put BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL
     # paste the URL from step 2 when prompted
     ```

   - For local dev (`.dev.vars`), the env var is **optional** — without
     it the cron runs and logs a warning but does NOT block the
     pipeline. Production MUST have it set.

4. **Configure escalation policy**.
   - **Settings → Escalation policies → Create policy** (or reuse the
     `mcpgen-on-call` policy from `betterstack-setup.md` step 4).
   - Step 1: Email → `OPS_EMAIL` (e.g. `ops@mcpgen.dev`) **immediately**
     (no delay — cost runaway compounds).
   - Step 2 (after 30 min of missing heartbeats): SMS → founder phone
     number.
   - Save and assign the policy to the `anon-tenant-cleanup-v1`
     heartbeat monitor.

5. **Verify with a manual run**.
   - In a Phase-10 staging environment with the secret set:

     ```bash
     # Trigger the cron via Inngest CLI (Phase 10 ships Inngest Cloud).
     pnpm exec inngest run anon-tenant-cleanup-v1
     ```

   - In BetterStack Console, the heartbeat monitor should turn green
     within 5 minutes (one ping = healthy).
   - In `apps/api` Inngest Cloud dashboard, the run should show the
     `delete-cf-*` and `delete-db-*` steps (zero or many depending on
     state) followed by an end-of-run heartbeat fetch.

6. **Sign-off**.
   - Take a screenshot of the BetterStack monitor showing the
     `anon-tenant-cleanup-v1` heartbeat green.
   - Paste into `09.1-PHASE-VERIFICATION.md` (Phase-10 launch checklist
     section) under "Anon-cleanup heartbeat — W7".
   - Move the deferred item from `STATE.md` → "Deferred Items" to
     "Completed in Phase 10".

## Output

- 1 heartbeat monitor (`anon-tenant-cleanup-v1`) configured + green.
- 1 escalation policy (immediate email + 30-min SMS) attached.
- 1 secret in CI: `BETTERSTACK_ANON_CLEANUP_HEARTBEAT_URL`.
- 1 secret in production CF Workers deployment.
- Screenshot evidence in `09.1-PHASE-VERIFICATION.md`.

## Troubleshooting

- **Heartbeat monitor never goes green** after step 5.
  - Verify the secret is set in production:

    ```bash
    cd apps/api
    wrangler secret list --env production | grep BETTERSTACK_ANON_CLEANUP
    ```

  - Tail Inngest Cloud logs for `anon-tenant-cleanup-v1`. The
    `[anon-tenant-cleanup] heartbeat fetch failed:` warning indicates a
    URL typo or BetterStack outage.
  - Check the URL by hand: `curl -I "$URL"` should return 200 OK.

- **Heartbeat fires but BetterStack reports "missed" after 5 min**.
  - The cron may be queued behind a long-running deletion batch (500
    rows × ~200ms CF API call = up to 100s). Increase the heartbeat
    period from 20 min → 25 min if the queue regularly stretches.

- **Heartbeat fires but no DB rows are deleted**.
  - Run `SELECT id, expires_at, anon_session_id FROM deployments WHERE
    expires_at < NOW() AND anon_session_id IS NOT NULL LIMIT 5` against
    Neon. Empty result = legitimately no expired anon tenants. Non-empty
    result + zero deletions = D-06 query regression; file P1 incident.

- **Cost spike alert fires (CF billing > expected)**.
  - First check the `anon-tenant-cleanup-v1` monitor — if green for 24h
    but cost is spiking, the issue is upstream (anon abuse not throttled
    by D-02 rate-limit, or the claim flow's tag-rewrite is leaking
    `anon=true` tags). Escalate to founder per RUNBOOK §"P1 incident".

## Phase 9.1 vs Phase 10 split

| Phase   | Owns                                                                                       |
|---------|--------------------------------------------------------------------------------------------|
| Phase 9.1 plan 10 | Cron implementation + heartbeat helper + this runbook (no real BetterStack account required to merge plan 10 PRs). |
| Phase 10 W7      | Founder runs this runbook end-to-end during W7 — produces the heartbeat URL + secrets that wire into production CI. |
