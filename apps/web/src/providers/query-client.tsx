// apps/web/src/providers/query-client.tsx
//
// Plan 07-02 — TanStack Query Provider for Next.js 15 App Router (CONTEXT D-08).
// Per RESEARCH "Code Examples": per-request QueryClient factory + isServer
// guard. SSR best practice: staleTime > 0 prevents immediate refetch on client
// hydration.
//
// Reference: github.com/tanstack/query/blob/main/docs/framework/react/guides/advanced-ssr.md

'use client';

import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    // Server: always make a new client to avoid request-state contamination.
    return makeQueryClient();
  }
  if (browserQueryClient === undefined) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

interface Props {
  children: ReactNode;
}

export default function QueryProvider({ children }: Props): ReactElement {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
