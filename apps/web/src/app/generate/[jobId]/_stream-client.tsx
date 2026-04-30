// apps/web/src/app/generate/[jobId]/_stream-client.tsx

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

// CRITICAL: do NOT import { SAMPLE_APIS } at module scope from
// `@/lib/jsx-bridge/screens` — that triggers `loader.ts` which references
// `window` at top level. Even with 'use client', Next.js evaluates the
// module on the server during SSR analysis, crashing the route handler with
// `ReferenceError: window is not defined`. Use a local fallback sample
// instead — the locked Landing screen's SAMPLE_APIS first entry is `lumen`
// (verified at apps/web/src/screen-landing.jsx).

interface LocalLockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

const StreamClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.StreamLogWrapper })),
  { ssr: false },
);

const FALLBACK_SAMPLE: LocalLockedSample = {
  id: 'lumen',
  name: 'lumen payments',
  endpoints: 348,
  tools: 47,
  save: 76,
};

interface Props {
  jobId: string;
}

export default function StreamClientShell({ jobId }: Props): ReactElement {
  return <StreamClient jobId={jobId} sample={FALLBACK_SAMPLE} />;
}
