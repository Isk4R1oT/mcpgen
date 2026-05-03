// apps/web/src/app/generate/page.tsx
//
// Plan 07-03 / M-4 Agent 1 (FLOW) — /generate route segment (canvas). Server
// Component shell that delegates to a Client shell which calls
// next/dynamic({ ssr: false }) and wires POST /api/v1/generate on submit.
//
// Recent-generations prefetch: there is no `GET /api/v1/generations/recent`
// endpoint in the BFF today, so we pass `null` per task brief — the Canvas
// screen renders an empty inventory until a real job_id exists.
//
// Reference: CONTEXT D-06 (route map), Plan 07-02 patterns-established.

import type { ReactElement } from 'react';

import CanvasClientShell from './_canvas-client';

export const dynamic = 'force-dynamic';

export default function GeneratePage(): ReactElement {
  // No recent-generations endpoint exists yet. The wrapper handles a
  // null/empty inventory cleanly (loading state in screen-canvas.jsx).
  const recentGenerations = null;
  return <CanvasClientShell recentGenerations={recentGenerations} />;
}
