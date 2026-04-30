// apps/web/src/app/generate/page.tsx
//
// Plan 07-03 — /generate route segment (canvas). Server Component shell that
// delegates to a Client Component shell which calls next/dynamic({ ssr: false }).
//
// Reference: CONTEXT D-06 (route map), Plan 07-02 patterns-established.

import type { ReactElement } from 'react';

import CanvasClientShell from './_canvas-client';

export const dynamic = 'force-dynamic';

export default function GeneratePage(): ReactElement {
  return <CanvasClientShell />;
}
