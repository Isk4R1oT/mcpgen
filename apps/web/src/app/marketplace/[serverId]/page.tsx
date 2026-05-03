// apps/web/src/app/marketplace/[serverId]/page.tsx
//
// Phase M-4 (Wave-2 Agent 5) — Marketplace server-detail route, gated
// behind `ui_marketplace_perm` (default OFF). When the flag is OFF the
// route 404s. When ON it forwards the `serverId` route param to the
// locked ServerDetailWrapper; the marketplace BFF (post-MVP) supplies the
// real `server` object — until then the wrapper falls back to the canon
// design sample (see screen-server-detail.jsx §6.2 point edit).

import { getLogtoContext } from '@logto/next/server-actions';
import { notFound } from 'next/navigation';
import type { ReactElement } from 'react';

import ServerDetailClientShell from './_server-detail-client';
import { evaluateBooleanFlag } from '@/lib/flags';
import { logtoConfig } from '@/lib/logto/client';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ serverId: string }>;
}

export default async function MarketplaceServerDetailPage(
  { params }: RouteParams,
): Promise<ReactElement> {
  const { serverId } = await params;

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

  return <ServerDetailClientShell serverId={serverId} />;
}
