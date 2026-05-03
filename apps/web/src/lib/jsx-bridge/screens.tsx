// apps/web/src/lib/jsx-bridge/screens.tsx
//
// Phase M-4-INFRA — Screen wrapper registry.
//
// Each `*Wrapper` here is the bottom-of-the-stack client island that:
//
//   1. Triggers loader.ts side effects (tokens / ui / i18n / 13 screens)
//      once when first dynamically imported.
//   2. Reads the locked screen component from window.<Name> via the
//      typed `index.ts` barrel.
//   3. Renders it with the props the caller passes.
//
// The wrappers do NOT mount providers themselves — those live in
// app/layout.tsx (I18nProvider, NavShim, QueryProvider, LogtoSession).
// Wrappers are pure renderers; routes import them via `next/dynamic`
// with `ssr: false` (per Plan 07-02 pattern; locked JSX uses
// React.useState at module top, which crashes under SSR analysis).
//
// Marketplace + admin wrappers are flag-gated at the route level
// (ui_marketplace_perm, ui_admin_panel_perm) — Wave-2 Agent 5 owns
// those flag definitions and their per-page enforcement.

'use client';

import type { ReactElement } from 'react';

import {
  AuthScreen,
  Billing,
  Canvas,
  Dashboard,
  DashboardList,
  Deploy,
  DeploySuccess,
  Landing,
  Marketplace,
  Playground,
  Preview,
  QualityReport,
  ServerDetail,
  StreamLog,
} from './index';
import type {
  AuthScreenProps,
  BillingProps,
  CanvasProps,
  DashboardListProps,
  DashboardProps,
  DeployProps,
  DeploySuccessProps,
  LandingProps,
  MarketplaceProps,
  PlaygroundProps,
  PreviewProps,
  QualityReportProps,
  ServerDetailProps,
  StreamLogProps,
} from './index';

// ----------------------------------------------------------------------
// Per-screen wrappers (Wave-1 surface). Each is a single-render shim;
// Wave-2 owners refine them with real data fetches inside the route's
// page.tsx + _*-client.tsx Server/Client split.
// ----------------------------------------------------------------------

export function LandingWrapper(props: LandingProps): ReactElement {
  return <Landing {...props} />;
}

interface AuthScreenWrapperProps extends AuthScreenProps {
  /** 'sign-in' or 'sign-up' — currently informational; canon screen
   *  shows the same selector. Wave-2 may diverge. */
  mode?: 'sign-in' | 'sign-up';
}

export function AuthScreenWrapper(props: AuthScreenWrapperProps): ReactElement {
  // mode is forwarded for symmetry but the locked AuthScreen does not
  // consume it. Wave-2 may add a discriminator visual.
  const { mode: _mode, ...rest } = props;
  return <AuthScreen {...rest} />;
}

export function CanvasWrapper(props: CanvasProps): ReactElement {
  return <Canvas {...props} />;
}

export interface StreamLogWrapperProps extends StreamLogProps {
  /** Job id from /generate/[jobId]/* route param. Wave-2 uses it to
   *  open the SSE stream via lib/sse/use-generation-sse. */
  jobId?: string;
}

export function StreamLogWrapper(props: StreamLogWrapperProps): ReactElement {
  // jobId is consumed by the wave-2 Stream wrapper, not by the canon
  // StreamLog component. Strip it before forward.
  const { jobId: _jobId, ...rest } = props;
  return <StreamLog {...rest} />;
}

export interface PreviewWrapperProps extends PreviewProps {
  jobId?: string;
  /** Route-level metadata; canon Preview ignores. Stripped before forward. */
  qualityReport?: unknown;
}

export function PreviewWrapper(props: PreviewWrapperProps): ReactElement {
  const { jobId: _jobId, qualityReport: _qr, ...rest } = props;
  return <Preview {...rest} />;
}

export interface QualityReportWrapperProps extends QualityReportProps {
  jobId?: string;
  qualityReport?: unknown;
  cacheHit?: unknown;
}

export function QualityReportWrapper(props: QualityReportWrapperProps): ReactElement {
  const { jobId: _jobId, qualityReport: _qr, cacheHit: _ch, ...rest } = props;
  return <QualityReport {...rest} />;
}

export interface PlaygroundWrapperProps extends PlaygroundProps {
  jobId?: string;
}

export function PlaygroundWrapper(props: PlaygroundWrapperProps): ReactElement {
  const { jobId: _jobId, ...rest } = props;
  return <Playground {...rest} />;
}

export interface DeployWrapperProps extends DeployProps {
  jobId?: string;
}

export function DeployWrapper(props: DeployWrapperProps): ReactElement {
  const { jobId: _jobId, ...rest } = props;
  return <Deploy {...rest} />;
}

export function DeploySuccessWrapper(props: DeploySuccessProps): ReactElement {
  return <DeploySuccess {...props} />;
}

interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

export interface DashboardWrapperProps extends DashboardProps {
  /** Logto claims passed from the protected page Server Component. */
  userClaims?: UserClaimsLite;
}

export function DashboardWrapper(props: DashboardWrapperProps): ReactElement {
  const { userClaims: _claims, ...rest } = props;
  return <Dashboard {...rest} />;
}

export interface DashboardListWrapperProps extends DashboardListProps {
  userClaims?: UserClaimsLite;
}

export function DashboardListWrapper(props: DashboardListWrapperProps): ReactElement {
  const { userClaims: _claims, ...rest } = props;
  return <DashboardList {...rest} />;
}

export interface BillingWrapperProps extends BillingProps {
  userClaims?: UserClaimsLite;
}

export function BillingWrapper(props: BillingWrapperProps): ReactElement {
  const { userClaims: _claims, ...rest } = props;
  return <Billing {...rest} />;
}

// ----------------------------------------------------------------------
// Flag-gated wrappers — marketplace + server-detail + admin.
//
// At the route level a Server Component reads the flag and either
// renders the wrapper or returns notFound(). The wrapper itself is a
// pass-through so Wave-2 can wire real data without flag plumbing here.
// ----------------------------------------------------------------------

export function MarketplaceWrapper(props: MarketplaceProps): ReactElement {
  return <Marketplace {...props} />;
}

export interface ServerDetailWrapperProps extends ServerDetailProps {
  /** Marketplace server slug from /marketplace/[serverId] route param. */
  serverId?: string;
}

export function ServerDetailWrapper(props: ServerDetailWrapperProps): ReactElement {
  const { serverId: _serverId, ...rest } = props;
  return <ServerDetail {...rest} />;
}

// ----------------------------------------------------------------------
// Transitional aliases (M-4-INFRA → Wave-2 migration only).
//
// The previous wrapper.tsx (deleted in M-3) composed AnonBanner /
// AnonCacheHitBadge / AnonSignupCta / AnonDeployCta around the locked
// screens via these names. Pages under app/generate/[jobId]/{quality,
// preview, deploy}/_*-client.tsx still import them. We keep the
// names as plain pass-throughs so typecheck stays green; Wave-2
// agents that own those pages will drop the alias and call the real
// `*Wrapper` directly (or the new client component they design).
//
// Per task brief Forbidden Zones: M-4-INFRA does NOT modify those
// page client files. The aliases are the bridge.
// ----------------------------------------------------------------------

export const QualityScreenWithAnonChrome = QualityReportWrapper;
export const PreviewScreenWithAnonChrome = PreviewWrapper;
export const DeployScreenWithAnonChrome = DeployWrapper;

// ----------------------------------------------------------------------
// Re-exports for convenience (callers that import from screens.tsx).
// ----------------------------------------------------------------------

export type {
  LockedSample,
  DashboardServerSummary,
  SpecDiff,
  SpecDiffEntry,
} from './index';
export { SAMPLE_APIS, MARKETPLACE_SERVERS } from './index';
