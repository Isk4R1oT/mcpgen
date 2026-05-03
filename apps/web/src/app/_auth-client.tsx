// apps/web/src/app/_auth-client.tsx
//
// Client wrapper for the (auth)/sign-in + (auth)/sign-up routes. Renders
// the production TSX AuthScreen from
// `@/components/screens/auth/auth.tsx`. The `mode` prop is currently
// informational — the AuthScreen renders the same selector regardless;
// future work may diverge sign-in vs sign-up.

'use client';

import type { ReactElement } from 'react';

import { AuthScreen } from '@/components/screens/auth/auth';

interface Props {
  mode: 'sign-in' | 'sign-up';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function AuthClientShell({ mode: _mode }: Props): ReactElement {
  return <AuthScreen />;
}
