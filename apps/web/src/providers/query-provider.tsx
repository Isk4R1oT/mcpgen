// apps/web/src/providers/query-provider.tsx
//
// Client-only TanStack Query provider. Wraps `<QueryClientProvider>`
// around the app tree at apps/web/src/app/layout.tsx. The QueryClient
// factory lives in ./query-client.ts (server-safe, no `'use client'`) so
// Server Components can prefetch into a fresh client and dehydrate state
// via `<HydrationBoundary>`. We import `getQueryClient` from there to
// keep the browser singleton in sync across SSR-prefetch and CSR-hydrate
// paths.
//
// Reference: https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr

'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement, ReactNode } from 'react';

import { getQueryClient } from './query-client';

interface Props {
  readonly children: ReactNode;
}

export default function QueryProvider({ children }: Props): ReactElement {
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// Re-export for callers that imported `getQueryClient` from this module
// (legacy import path before the server/client split). New code should
// import directly from `./query-client`.
export { getQueryClient } from './query-client';
