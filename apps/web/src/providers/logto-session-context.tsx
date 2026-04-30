// apps/web/src/providers/logto-session-context.tsx
//
// Plan 07-02 — Client-side Logto session Context + hook. Split into its own
// 'use client' module so the Server Component LogtoSessionProvider above can
// remain a Server Component while still rendering this client wrapper around
// `children`.

'use client';

import { createContext, useContext, type ReactElement, type ReactNode } from 'react';

import type { LogtoSession } from './logto-session';

const LogtoSessionContext = createContext<LogtoSession | null>(null);

interface ProviderProps {
  session: LogtoSession;
  children: ReactNode;
}

export function LogtoSessionContextProvider({
  session,
  children,
}: ProviderProps): ReactElement {
  return (
    <LogtoSessionContext.Provider value={session}>{children}</LogtoSessionContext.Provider>
  );
}

export function useLogtoSession(): LogtoSession {
  const v = useContext(LogtoSessionContext);
  if (v === null) {
    throw new Error(
      'useLogtoSession must be used inside <LogtoSessionProvider> (apps/web/src/app/layout.tsx).',
    );
  }
  return v;
}
