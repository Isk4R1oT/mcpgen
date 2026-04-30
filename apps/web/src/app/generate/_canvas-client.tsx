// apps/web/src/app/generate/_canvas-client.tsx
//
// Plan 07-03 — Client shell for /generate (canvas). Next 15 disallows
// ssr:false from a Server Component; the call lives in this 'use client' file.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

const CanvasClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.LandingWrapper })),
  { ssr: false },
);

export default function CanvasClientShell(): ReactElement {
  // /generate (no jobId yet) reuses the LandingWrapper form so an
  // already-authenticated user navigating directly to /generate sees the same
  // paste-URL-and-go form. Plan 07-04 may swap to a Canvas variant if the
  // locked CanvasWrapper diverges from Landing.
  return <CanvasClient />;
}
