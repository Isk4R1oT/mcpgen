// apps/web/src/app/generate/page.tsx
//
// /generate route segment. Two modes:
//
// 1. `?spec_url=...` present → render <GenerateBootstrap> which POSTs
//    /api/v1/generate and replaces the URL with /generate/[jobId]/preview.
//    No-chrome interstitial — covers ~200-500ms of round-trip without
//    flashing the post-gen Canvas tour (which was the prior bug:
//    user clicked "make it" and saw a "TOOLS · 0" + onboarding tooltip
//    for 3-4s before being redirected).
//
// 2. No `spec_url` → render the empty <Canvas /> (paste box / unwired
//    editor for users navigating to /generate directly).
//
// Canon: claude-design-reference/canon/ — paste must redirect straight
// to REVIEW, never through CANVAS. CANVAS only after pipeline complete.

import type { ReactElement } from 'react';

import { Canvas } from '@/components/screens/canvas/canvas';
import { GenerateBootstrap } from '@/components/screens/generate-bootstrap/generate-bootstrap';

export const dynamic = 'force-dynamic';

interface GeneratePageProps {
  // Next.js 15 — `searchParams` is a Promise of the parsed query.
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function GeneratePage({
  searchParams,
}: GeneratePageProps): Promise<ReactElement> {
  const params = await searchParams;
  const raw = params['spec_url'];
  const specUrl = typeof raw === 'string' && raw !== '' ? raw : undefined;
  if (specUrl !== undefined) {
    return <GenerateBootstrap specUrl={specUrl} />;
  }
  return <Canvas />;
}
