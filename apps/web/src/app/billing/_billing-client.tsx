// apps/web/src/app/billing/_billing-client.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Client island for /billing.
//
// Why an indirection: Next.js 15 disallows `ssr: false` inside `next/dynamic()`
// when invoked from a Server Component (build error); the call must live in a
// 'use client' module. Same pattern as `_landing-client.tsx` and
// `_dashboard-client.tsx` (Plan 07-02 / 07-05).
//
// Phase 8 ops workstream replaces the empty checkout/portal handlers with
// real Stripe redirects (POST /api/v1/billing/checkout · GET /api/v1/billing/portal).

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { BillingWrapperProps } from '@/lib/jsx-bridge/screens';

const BillingClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.BillingWrapper })),
  { ssr: false },
);

export default function BillingClientShell(
  props: BillingWrapperProps = {},
): ReactElement {
  return <BillingClient {...props} />;
}
