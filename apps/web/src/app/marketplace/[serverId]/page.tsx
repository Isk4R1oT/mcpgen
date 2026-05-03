// apps/web/src/app/marketplace/[serverId]/page.tsx
//
// Phase 2 / Agent B4 — Marketplace ServerDetail route. Gated behind
// `ui_marketplace_perm` (default OFF) at the route level → 404 when off.
// The "install" button is *additionally* gated behind
// `ui_marketplace_install_perm` (eval'd server-side, passed in as a
// boolean prop so the client-side toggle is deterministic).
//
// References:
//   - .planning/phase-rebuild/agent-briefs/PHASE-2.md (B4)
//   - .planning/phase-rebuild/FLAGS-NEEDED.md (ui_marketplace_install_perm)
//   - apps/web/src/components/screens/server-detail/server-detail.tsx

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import ServerDetail from '@/components/screens/server-detail/server-detail';
import { evaluateBooleanFlag } from '@/lib/flags';
import { evalMarketplaceActionFlags } from '@/lib/flags/admin-actions';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

export default async function MarketplaceServerDetailPage({
  params,
}: RouteParams): Promise<ReactElement> {
  const { serverId } = await params;

  const { claims } = await getLogtoContext(logtoConfig);
  const userId = typeof claims?.sub === 'string' ? claims.sub : 'anonymous';
  const emailDomain =
    typeof claims?.email === 'string' && claims.email.includes('@')
      ? (claims.email.split('@')[1] ?? '')
      : '';
  const flagContext: Record<string, string> = {
    user_id: userId,
    email_domain: emailDomain,
  };

  const enabled = await evaluateBooleanFlag(
    'ui_marketplace_perm',
    userId,
    flagContext,
    false,
  );
  if (!enabled) {
    notFound();
  }

  // Per-action gate: real install/star/fork/soc2 flows are dark by default.
  // Pass the booleans down so the client component renders the proper CTA
  // branch (toast stub vs actual call) without re-running flag eval client-side.
  const marketFlags = await evalMarketplaceActionFlags({ userId, flagContext });

  return (
    <ServerDetail
      serverId={serverId}
      installEnabled={marketFlags.ui_marketplace_install_perm}
      starEnabled={marketFlags.ui_marketplace_star_perm}
      forkEnabled={marketFlags.ui_marketplace_fork_perm}
      soc2Enabled={marketFlags.ui_security_soc2_perm}
    />
  );
}
