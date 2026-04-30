// apps/web/src/app/_landing-client.tsx
//
// Plan 07-02 — Client wrapper for the landing route. Next.js 15 disallows
// `ssr: false` inside next/dynamic() when called from a Server Component;
// the call must live inside a 'use client' module. This is the indirection.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

const LandingClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.LandingWrapper })),
  { ssr: false },
);

export default function LandingClientShell(): ReactElement {
  return <LandingClient />;
}
