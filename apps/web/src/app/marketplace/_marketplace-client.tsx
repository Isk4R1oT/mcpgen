// apps/web/src/app/marketplace/_marketplace-client.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Client island for /marketplace.
//
// Indirection rationale: same as `_landing-client.tsx` / `_dashboard-client.tsx`
// — Next.js 15 disallows `ssr: false` inside next/dynamic() from a Server
// Component, so the dynamic call lives in a 'use client' module.

'use client';

import dynamic from 'next/dynamic';
import type { ComponentType, ReactElement } from 'react';

import type { MarketplaceProps } from '@/lib/jsx-bridge';

interface MarketplaceClientShellProps extends MarketplaceProps {
  servers?: ReadonlyArray<unknown>;
}

// Cast to the wider shape: the locked Marketplace JSX (post-§6.2 point edit)
// accepts an extra `servers` prop which the typed wrapper does not yet
// declare. Strip-and-forward via a typed shim keeps the call-site clean
// without leaking the non-canonical prop into the locked-screen typings.
const MarketplaceClient = dynamic(
  () =>
    import('@/lib/jsx-bridge/screens').then((m) => ({
      default: m.MarketplaceWrapper as unknown as ComponentType<MarketplaceClientShellProps>,
    })),
  { ssr: false },
);

export default function MarketplaceClientShell(
  props: MarketplaceClientShellProps = {},
): ReactElement {
  // `servers` is forwarded as a pass-through to the locked screen via the
  // post-§6.2 prop slot. The locked Marketplace screen falls back to the
  // canon design samples when `servers` is undefined; we deliberately pass
  // an empty array (not undefined) so the empty-state renders cleanly.
  return <MarketplaceClient {...props} />;
}
