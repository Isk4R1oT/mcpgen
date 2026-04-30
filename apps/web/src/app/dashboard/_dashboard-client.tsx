// apps/web/src/app/dashboard/_dashboard-client.tsx
//
// Plan 07-05 — Client island shell for the dashboard route. Next.js 15
// disallows `ssr: false` inside next/dynamic() when called from a Server
// Component; the call lives inside a 'use client' module. Same indirection
// pattern Plan 07-02 established (apps/web/src/app/_landing-client.tsx).
//
// The shell forwards optional `userClaims` from the Server Component to
// DashboardWrapper so the locked screen + sibling deployment list have the
// signed-in user's identity available.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { DashboardWrapperProps } from '@/lib/jsx-bridge/screens';

const DashboardClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.DashboardWrapper })),
  { ssr: false },
);

export default function DashboardClientShell(
  props: DashboardWrapperProps = {},
): ReactElement {
  return <DashboardClient {...props} />;
}
