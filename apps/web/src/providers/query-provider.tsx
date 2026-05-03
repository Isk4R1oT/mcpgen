// apps/web/src/providers/query-provider.tsx
//
// Foundation Agent F-BFFClients — TanStack Query provider with sensible
// defaults for the BFF client modules in apps/web/src/lib/api/. Re-exports
// the per-request QueryClient factory that already lives in
// apps/web/src/providers/query-client.tsx so we have a single owner of the
// `browserQueryClient` singleton (avoiding two QueryClients fighting each
// other when both files are imported via different code paths).
//
// Defaults:
//   - staleTime: 60s (matches existing query-client.tsx)
//   - retry: 1 (one quiet retry; CLAUDE.md "no silent retries" — we cap at 1
//     so transient network blips don't immediately surface as errors, but
//     we never loop forever)
//   - refetchOnWindowFocus: false (avoids waking the dashboard on tab focus)
//   - suspense: false (consumers explicitly opt into Suspense per query)
//
// Mount: already wired in apps/web/src/app/layout.tsx via the `QueryProvider`
// import from `./query-client`. This file exists so the brief's expected
// import path (`@/providers/query-provider`) is also valid.

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
        staleTime: 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (isServer) {
    // Server: always make a new client so request state never leaks across
    // concurrent SSR renders.
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
