// apps/web/src/components/screens/billing/drawers/upgrade-to-team.tsx
//
// Phase 2 — Agent B3 — Upgrade-to-team drawer body.
//
// Source of truth: claude-design-reference/canon/screen-billing.jsx lines 108–117
// (inline JSX inside the `mcpDrawer('upgrade to team', …)` call).
//
// Behaviour wiring:
//   - `confirm upgrade` triggers `createCheckoutSession({ plan: 'team' })`
//     (real BFF endpoint — `POST /api/v1/billing/checkout`). On success we
//     hard-navigate to the Stripe-hosted checkout URL; on failure we surface
//     a toast with the error code.
//   - `talk to sales` is flag-gated (`ui_billing_enterprise_perm`) — not
//     implemented yet, so it falls back to the canon toast copy.
//
// Note: the `proration preview` line ("$22 credit") is static copy from canon
// — the proration BFF endpoint (`POST /api/v1/billing/preview-plan-change`) is
// not implemented (`ui_billing_proration_perm` OFF). Per the catalog we keep
// the static text instead of stripping the surface.

'use client';

import type { JSX } from 'react';

import { Btn } from '@/components/ui';
import { createCheckoutSession } from '@/lib/api/billing';
import { closeDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

export function UpgradeToTeamDrawerBody(): JSX.Element {
  const onConfirm = async (): Promise<void> => {
    const result = await createCheckoutSession();
    if (!result.ok) {
      toast(`upgrade failed · ${result.error}`, { kind: 'error' });
      return;
    }
    // POST /api/v1/billing/checkout returns a Stripe-hosted URL. Hard-navigate
    // (cross-origin) — `router.push` cannot follow that redirect.
    closeDrawer();
    window.location.assign(result.data.url);
  };

  const onTalkToSales = (): void => {
    toast('talk to sales: contact@mcpgen.dev');
  };

  return (
    <div className="col" style={{ gap: 14, fontSize: 13, lineHeight: 1.6 }}>
      <div>
        <strong>$99/mo</strong> · includes <strong>500K calls</strong>, 5 seats,
        sso, audit log retention 90 days.
      </div>
      <div className="muted">
        prorated against your remaining pro period (~$22 credit). next bill: may 14.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 6,
        }}
      >
        <Btn
          kind="ink"
          size="sm"
          full
          onClick={(): void => {
            void onConfirm();
          }}
        >
          confirm upgrade
        </Btn>
        <Btn kind="ghost" size="sm" full onClick={onTalkToSales}>
          talk to sales
        </Btn>
      </div>
    </div>
  );
}
