// apps/web/src/app/_auth-client.tsx
//
// Plan 07-02 — Client wrapper for the (auth)/sign-in + (auth)/sign-up
// routes. Next.js 15 disallows `ssr: false` inside next/dynamic() when
// called from a Server Component; the call must live inside a 'use client'
// module. This is the indirection.

'use client';

import dynamic from 'next/dynamic';
import type { ReactElement } from 'react';

const AuthClient = dynamic(
  () => import('@/lib/jsx-bridge/screens').then((m) => ({ default: m.AuthScreenWrapper })),
  { ssr: false },
);

interface Props {
  mode: 'sign-in' | 'sign-up';
}

export default function AuthClientShell({ mode }: Props): ReactElement {
  return <AuthClient mode={mode} />;
}
