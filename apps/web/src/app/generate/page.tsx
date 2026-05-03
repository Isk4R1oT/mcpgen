// apps/web/src/app/generate/page.tsx
//
// /generate route segment (Canvas screen). Server Component shell that reads
// the `?spec_url=...` query param and forwards it to the Client Component
// canvas. When `spec_url` is present the Canvas auto-submits
// POST /api/v1/generate on mount and redirects to /generate/[jobId].
// Otherwise it renders the canon canvas (3-pane editor with seed tool data).

import type { ReactElement } from 'react';

import { Canvas } from '@/components/screens/canvas/canvas';

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
  return <Canvas specUrl={specUrl} />;
}
