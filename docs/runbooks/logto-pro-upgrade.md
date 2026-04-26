# Logto Pro Upgrade Runbook (T-1-06)

**Decision drivers:** D-14, RESEARCH §Pitfall #17, T-1-06 (Logto Cloud free-tier MAU saturation at viral launch).

**Pre-buy date:** end of W7 (1 week before public launch W9). The calendar
entry MUST be set during Phase 1. Phase-1 deviation note (per
`.planning/phases/01-foundation/01-PHASE-DEVIATIONS.md` revision 2): the
staging-tenant Pro-upgrade dry-run is **deferred to Phase 10** because
staging requires the deferred CF deploy. The `mcpgen-prod` Pro pre-buy
itself stays on the W7 calendar — it does not depend on CF.

## Why pre-buy

Logto Cloud free tier caps at **5,000 MAU** (5K). A viral W9 spike (Show HN
+ Product Hunt simultaneously) can saturate that cap within hours, producing
a "0 signups" outage during peak interest — exactly when MCPGen most needs to
convert. The Pro tier is **$60/mo for 50,000 MAU** (50K). The cost of a single
missed launch >> $60.

Pre-buying at W7 (one week before public launch) provides:

- A calm window to test billing / payment failures before they matter.
- Time for any Logto-side provisioning delay (no observed issue, but margin).
- A documented cap raise so monitoring alerts (Phase 9 BetterStack) can be
  re-tuned away from the 5K threshold.

## Pre-buy procedure (~10 min)

1. Logto Console → Billing → upgrade to Pro on the `mcpgen-prod` tenant.
2. Confirm card in the Stripe-side dialog.
3. Verify monthly invoice arrives via the email tied to the Logto account
   within 5 minutes (pre-prorated invoice is normal on first activation).
4. Confirm 50K MAU cap visible in Tenant Settings → Plan.
5. Update `docs/launch-criteria.md` (or the canonical launch tracker) to mark
   "Logto Pro purchased" as **GO**.

## Test on staging (deferred to Phase 10 per PHASE-DEVIATIONS.md revision 2)

When staging is provisioned in Phase 10:

1. Run the Pro-upgrade flow against `mcpgen-staging` first.
2. Verify the new MAU cap takes effect within 1 minute.
3. Verify all existing OIDC sessions remain valid (Logto plan upgrades do
   not rotate tokens — confirm by hitting `/oidc/userinfo` with a pre-upgrade
   token and asserting 200).
4. Document the dry-run outcome in `.planning/phases/10-launch/`.

## Monitoring (Phase 9 wires the alert)

- BetterStack uptime check on `${LOGTO_ENDPOINT}/oidc/.well-known/openid-configuration`.
- Logto Admin API MAU pull every 1h; alert if MAU > 4,000 AND no Pro
  subscription detected (MAU > 4,000 corresponds to 80% of the free cap —
  the alert threshold by convention).

## Self-host migration trigger

Pro tier MAU > 25,000 consistently OR cost > revenue threshold (decided
post-launch). See `infrastructure/logto/README.md` self-host runbook
(D-14).

## Rollback

Pro → Free downgrade is supported by Logto Console; sessions remain valid.
The MAU cap drops the moment the next billing cycle starts. No data is
lost on downgrade.
