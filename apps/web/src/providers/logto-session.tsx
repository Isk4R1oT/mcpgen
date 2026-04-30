// apps/web/src/providers/logto-session.tsx
//
// Plan 07-02 — Logto session provider. Server Component fetches the current
// session via getLogtoContext(logtoConfig); a paired Client Component exposes
// the session to descendants via React Context + useLogtoSession() hook.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-17 / D-18 / D-19
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Code Examples" Logto
//   - apps/web/src/lib/logto/client.ts (logtoConfig)
//
// Note: this file mixes Server + Client Components in one module. Next.js 15
// supports that via the 'use client' directive at the top of the client
// segment; the Server Component import paths resolve at build time.

import { getLogtoContext } from '@logto/next/server-actions';
import type { ReactElement, ReactNode } from 'react';

import { logtoConfig } from '@/lib/logto/client';

import { LogtoSessionContextProvider } from './logto-session-context';

interface LogtoClaims {
  readonly sub: string;
  readonly email?: string;
  readonly name?: string;
}

export interface LogtoSession {
  readonly isAuthenticated: boolean;
  readonly claims: LogtoClaims | null;
}

interface Props {
  children: ReactNode;
}

// Logto claims fields are typed as `Nullable<string>` (string | null | undefined)
// upstream; coerce null → undefined so our LogtoClaims (with
// exactOptionalPropertyTypes-strict optional fields) accepts the value.
function nonNull<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

export async function LogtoSessionProvider({ children }: Props): Promise<ReactElement> {
  const ctx = await getLogtoContext(logtoConfig);
  let claims: LogtoClaims | null = null;
  if (ctx.claims !== undefined && ctx.claims !== null) {
    const email = nonNull(ctx.claims.email);
    const name = nonNull(ctx.claims.name);
    claims = {
      sub: ctx.claims.sub,
      ...(email !== undefined ? { email } : {}),
      ...(name !== undefined ? { name } : {}),
    };
  }
  const session: LogtoSession = {
    isAuthenticated: ctx.isAuthenticated,
    claims,
  };
  return (
    <LogtoSessionContextProvider session={session}>{children}</LogtoSessionContextProvider>
  );
}
