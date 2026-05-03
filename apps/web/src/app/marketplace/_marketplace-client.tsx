// apps/web/src/app/marketplace/_marketplace-client.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Client island for /marketplace.
//
// Indirection rationale: same as `_landing-client.tsx` / `_dashboard-client.tsx`
// — Next.js 15 disallows `ssr: false` inside next/dynamic() from a Server
// Component, so the dynamic call lives in a 'use client' module.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { MarketplaceProps } from '@/lib/jsx-bridge';

const MarketplaceClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.MarketplaceWrapper })),
  { ssr: false },
);

export default function MarketplaceClientShell(props: MarketplaceProps = {}): ReactElement {
  // Canon Marketplace uses internal hardcoded sample data; the previous
  // `servers` real-data slot was dropped on canon re-import. Future
  // wiring will reintroduce a wired Marketplace variant.
  return <MarketplaceClient {...props} />;
}
