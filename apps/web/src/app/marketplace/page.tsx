// apps/web/src/app/marketplace/page.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Marketplace route, gated behind
// `ui_marketplace_perm` (default OFF). When the flag is OFF the route
// returns 404 so the marketplace module is invisible to end users until
// the marketplace BFF lands. When ON the screen mounts via the locked
// MarketplaceWrapper with an empty `servers` array (backend not ready)
// — the wrapper renders the canon design layout with zero listings.
//
// References:
//   - docs/mcpgen-frontend-rebuild-contract.md §5.1 (flags), §5.3 Level 1
//   - .planning/ui-rebuild-sandbox/INTEGRATION-MAP.md §2.11

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import MarketplaceClientShell from './_marketplace-client';
import { evaluateBooleanFlag } from '@/lib/flags';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

export default async function MarketplacePage(): Promise<ReactElement> {
  // Marketplace is browse-anonymous in the eventual product (per UX flow), so
  // we do NOT redirect unauthenticated users — but we still pull the Logto
  // context to feed the flag evaluator the right entityId / email_domain when
  // present. Anonymous users get entity_id = 'anonymous'.
  const { claims } = await getLogtoContext(logtoConfig);
  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = { user_id: userId, email_domain: emailDomain };

  const enabled = await evaluateBooleanFlag(
    'ui_marketplace_perm',
    userId,
    flagContext,
    false,
  );
  if (!enabled) {
    notFound();
  }

  // Backend not ready: forward an empty `servers` array so the screen
  // renders the canon shell without leaking the design-time sample roster.
  // M-5+ swaps in a real fetch (e.g. GET /api/v1/marketplace/servers).
  return <MarketplaceClientShell servers={[]} />;
}
