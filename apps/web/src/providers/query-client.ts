// apps/web/src/providers/query-client.ts
//
// Server-safe TanStack Query factory. No `'use client'` directive — Server
// Components (e.g. /dashboard/page.tsx) prefetch state into a fresh
// QueryClient and pass `dehydrate(qc)` to the client `<HydrationBoundary>`.
// The client-side QueryProvider (./query-provider.tsx) imports the SAME
// `getQueryClient` so the browser singleton stays consistent across both
// SSR-prefetch and CSR-hydrate paths.
//
// The QueryClientProvider component itself lives in query-provider.tsx
// because it uses React context (browser-only). Splitting the factory out
// of the provider lets Server Components call getQueryClient() without
// pulling in the `'use client'` boundary, which is what threw
// "Attempted to call getQueryClient() from the server but getQueryClient
//  is on the client" before the split.
//
// Reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr

import { isServer, QueryClient } from '@tanstack/react-query';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // staleTime > 0 is the SSR best-practice: prevents the client from
        // immediately refetching freshly-hydrated data.
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
