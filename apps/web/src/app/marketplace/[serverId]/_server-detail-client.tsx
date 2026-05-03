// apps/web/src/app/marketplace/[serverId]/_server-detail-client.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Client island for /marketplace/[serverId].

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

import type { ServerDetailWrapperProps } from '@/lib/jsx-bridge/screens';

const ServerDetailClient = dynamic(
  () =>
    import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.ServerDetailWrapper })),
  { ssr: false },
);

export default function ServerDetailClientShell(
  props: ServerDetailWrapperProps = {},
): ReactElement {
  return <ServerDetailClient {...props} />;
}
