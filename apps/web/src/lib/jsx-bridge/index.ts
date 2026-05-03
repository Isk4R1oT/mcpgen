// Typed ESM re-exports of window.<ComponentName> after loader.ts side-effect
// imports run. Each export is `as React.ComponentType<XXXProps>`. Routes
// import only from this module (or screens.tsx for wrapped variants), never
// directly from a screen-*.jsx file.

'use client';

import type * as React from 'react';

// Force loader.ts side effects to run before reading window globals below.
// The `import '@/lib/jsx-bridge'` in any consumer route triggers this chain.
import './loader';

export { TWEAK_DEFAULTS, applyTokens, type TweakDefaults } from './loader';

// Locked sample shape — verbatim from apps/web/src/screen-landing.jsx.
// The 5 SAMPLE_APIS entries (lumen, helio, nimbus, rookery, parley) all
// match this shape.
export interface LockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

// Marketplace server shape — verbatim from screen-marketplace.jsx.
// Exposed so server-detail wrappers can pass through real values once
// Wave-2 wires the marketplace BFF.
export interface MarketplaceServer {
  id: string;
  name: string;
  author: string;
  verified?: boolean;
  tools: number;
  stars: number;
  installs: number;
  weekly?: number;
  desc: string;
  tags?: ReadonlyArray<string>;
  updated?: string;
  license?: string;
  forks?: number;
  mine?: boolean;
}

// --- Per-screen prop shapes ---------------------------------------------
// All canon function signatures are extracted verbatim from
// apps/web/src/screen-*.jsx — see each interface header for the exact
// destructured argument list. Canon never uses defaults, so every prop
// is optional here. Real-data slots (`samples`, `servers`, `tools`,
// `history`, `plans`, `invoices`, `usage`, `specDiff`, `mcpUrl`,
// `claudeDesktopConfig`, `serverName`, `onCopy`, `onDownload`,
// `onSubmit`, `onRunTool`, `finalTools`) were dropped when canon was
// re-imported — canon now uses internal hardcoded sample data.

// canon: Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText,
//                   onPricing, onMarketplace, onSignIn })
export interface LandingProps {
  sample?: LockedSample;
  urlText?: string;
  setUrlText?: (s: string) => void;
  onMakeIt?: () => void;
  onSelectSample?: (s: LockedSample) => void;
  onPricing?: () => void;
  onMarketplace?: () => void;
  onSignIn?: () => void;
}

// canon: AuthScreen({ sample, onContinue, onBack })
export interface AuthScreenProps {
  sample?: LockedSample;
  onContinue?: () => void;
  onBack?: () => void;
}

// canon: Canvas({ sample, onPlay, onDeploy, onCmdK, onBack })
export interface CanvasProps {
  sample?: LockedSample;
  onPlay?: () => void;
  onDeploy?: () => void;
  onCmdK?: () => void;
  onBack?: () => void;
}

// canon: StreamLog({ onDone, onCancel, sample })
export interface StreamLogProps {
  sample?: LockedSample;
  onDone?: () => void;
  onCancel?: () => void;
}

// Legacy Playground helper types — retained as exported helpers for any
// future wiring even though canon Playground no longer accepts the
// matching props. Kept to avoid breaking imports in non-canon files.
export interface PlaygroundToolHint {
  /** Tool name (e.g. `charges_create`). Mirrors `FinalTool.name`. */
  readonly name: string;
}

export interface PlaygroundHistoryRow {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly tools: ReadonlyArray<string>;
  readonly tk: number;
  readonly ms: number;
  readonly when: string;
  readonly savedAsTest: boolean;
}

export interface PlaygroundRunResult {
  readonly text?: string;
  readonly result?: unknown;
  readonly tokens?: number;
  readonly latency_ms?: number;
}

export interface PlaygroundRunArgs {
  readonly tool_name: string;
  readonly args: Record<string, unknown>;
  readonly prompt: string;
}

// canon: Playground({ onBack, onDeploy, sample })
export interface PlaygroundProps {
  sample?: LockedSample;
  onBack?: () => void;
  onDeploy?: () => void;
}

// canon: Preview({ sample, onMakeIt, onBack })
export interface PreviewProps {
  sample?: LockedSample;
  onMakeIt?: () => void;
  onBack?: () => void;
}

// canon: QualityReport({ sample, onContinue, onBack })
export interface QualityReportProps {
  sample?: LockedSample;
  onContinue?: () => void;
  onBack?: () => void;
}

// Legacy helper type — kept for any future wired-deploy work.
export interface DeploySubmitArgs {
  readonly target: string;
  readonly auth: string;
}

// canon: Deploy({ onDeployed, onBack, sample })
export interface DeployProps {
  sample?: LockedSample;
  onDeployed?: () => void;
  onBack?: () => void;
}

// canon: DeploySuccess({ onDashboard, sample })
export interface DeploySuccessProps {
  sample?: LockedSample;
  onDashboard?: () => void;
}

// Drift entry shape consumed by screen-dashboard.jsx drift state machine.
// Phase 9 wires this from the upcoming GET /api/v1/servers/:id/drift response.
export interface SpecDiffEntry {
  method?: string;
  path: string;
  desc?: string;
  change?: string;
}
export interface SpecDiff {
  new: ReadonlyArray<SpecDiffEntry>;
  removed: ReadonlyArray<SpecDiffEntry>;
  modified: ReadonlyArray<SpecDiffEntry>;
}

// canon: Dashboard({ onBack, onPlay, sample })
export interface DashboardProps {
  sample?: LockedSample;
  onBack?: () => void;
  onPlay?: () => void;
}

// Server summary as rendered in the dashboard-list grid + table view. The
// canon's USER_SERVERS shape — promoted to a typed contract surface so the
// Server Component can adapt GET /api/v1/deployments rows into it.
export interface DashboardServerSummary {
  id: string;
  name: string;
  api: string;
  tools: number;
  status: 'live' | 'paused' | 'draft' | 'error';
  visibility: 'public' | 'private';
  uptime: string;
  calls7: number;
  p95: number;
  deltaPct: number;
  version: string;
  updated: string;
  stars?: number;
  installs?: number;
  drift?: { kind: string; count: number; severity: 'warn' | 'error' } | null;
  region?: ReadonlyArray<string>;
  owner?: string;
}

// canon: DashboardList({ onBack, onOpen, onMarketplace, onBilling, onLanding })
export interface DashboardListProps {
  onBack?: () => void;
  onOpen?: (server: DashboardServerSummary) => void;
  onMarketplace?: () => void;
  onBilling?: () => void;
  onLanding?: () => void;
}

export interface BillingPlanFeature {
  0: string;
  1: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  price: number | null;
  blurb: string;
  quota: string;
  features: ReadonlyArray<BillingPlanFeature>;
  cta: string;
  current: boolean;
  recommended?: boolean;
}

export interface BillingInvoice {
  date: string;
  period: string;
  amount: string;
  status: string;
  calls: string;
  overage: string;
}

export interface BillingUsage {
  used: number;
  quota: number;
}

// canon: Billing({ onBack, onLanding, onDashboard, onMarketplace })
export interface BillingProps {
  onBack?: () => void;
  onLanding?: () => void;
  onDashboard?: () => void;
  onMarketplace?: () => void;
}

// canon: Marketplace({ onBack, onDashboard, onOpen, onLanding })
export interface MarketplaceProps {
  onBack?: () => void;
  onDashboard?: () => void;
  onOpen?: (server: MarketplaceServer) => void;
  onLanding?: () => void;
}

// canon: ServerDetail({ server, onBack, onInstall, onDashboard, onMarketplace })
export interface ServerDetailProps {
  server?: MarketplaceServer;
  onBack?: () => void;
  onInstall?: () => void;
  onDashboard?: () => void;
  onMarketplace?: () => void;
}

// --- Typed re-exports of window globals ---------------------------------
// After loader.ts's side-effect imports run, every `window.<Component>` is
// set. We narrow the unknown globalThis to typed React.ComponentType.

type WindowGlobals = {
  Landing: React.ComponentType<LandingProps>;
  AuthScreen: React.ComponentType<AuthScreenProps>;
  Canvas: React.ComponentType<CanvasProps>;
  StreamLog: React.ComponentType<StreamLogProps>;
  Playground: React.ComponentType<PlaygroundProps>;
  Preview: React.ComponentType<PreviewProps>;
  QualityReport: React.ComponentType<QualityReportProps>;
  Deploy: React.ComponentType<DeployProps>;
  DeploySuccess: React.ComponentType<DeploySuccessProps>;
  Dashboard: React.ComponentType<DashboardProps>;
  DashboardList: React.ComponentType<DashboardListProps>;
  Billing: React.ComponentType<BillingProps>;
  Marketplace: React.ComponentType<MarketplaceProps>;
  ServerDetail: React.ComponentType<ServerDetailProps>;
  SAMPLE_APIS: ReadonlyArray<LockedSample>;
  MARKETPLACE_SERVERS: ReadonlyArray<MarketplaceServer>;
};

const w = globalThis as unknown as WindowGlobals;

export const Landing = w.Landing;
export const AuthScreen = w.AuthScreen;
export const Canvas = w.Canvas;
export const StreamLog = w.StreamLog;
export const Playground = w.Playground;
export const Preview = w.Preview;
export const QualityReport = w.QualityReport;
export const Deploy = w.Deploy;
export const DeploySuccess = w.DeploySuccess;
export const Dashboard = w.Dashboard;
export const DashboardList = w.DashboardList;
export const Billing = w.Billing;
export const Marketplace = w.Marketplace;
export const ServerDetail = w.ServerDetail;

// SAMPLE_APIS — the 5 fake APIs locked in screen-landing.jsx. Routes
// select one and pass it down as the `sample` prop until Wave-2 swaps
// to real data.
export const SAMPLE_APIS: ReadonlyArray<LockedSample> = w.SAMPLE_APIS;

// MARKETPLACE_SERVERS — locked seed data from screen-marketplace.jsx.
// Gated behind ui_marketplace_perm flag at the wrapper level; the
// constant itself stays exported so server-detail can pick a default.
export const MARKETPLACE_SERVERS: ReadonlyArray<MarketplaceServer> = w.MARKETPLACE_SERVERS;
