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
// Derived from screen-*.jsx function signatures. Wave-2 owners refine
// these per-screen as they extract FALLBACK_* literals to props.
//
// All props are intentionally optional where the locked screen falls
// back to a hardcoded default (e.g. sample defaults to 'lumen'). This
// matches what the canon does when called without props.

export interface LandingProps {
  sample?: LockedSample;
  urlText?: string;
  setUrlText?: (s: string) => void;
  onMakeIt?: () => void;
  onSelectSample?: (s: LockedSample) => void;
  onPricing?: () => void;
  onMarketplace?: () => void;
  onSignIn?: () => void;
  // M-4-ENTRY: real-data slot. Empty / omitted hides the sample chip row.
  samples?: ReadonlyArray<LockedSample>;
}

export interface AuthScreenProps {
  sample?: LockedSample;
  onContinue?: () => void;
  onBack?: () => void;
}

export interface CanvasProps {
  sample?: LockedSample;
  onPlay?: () => void;
  onDeploy?: () => void;
  onCmdK?: () => void;
  onBack?: () => void;
}

export interface StreamLogProps {
  sample?: LockedSample;
  onDone?: () => void;
  onCancel?: () => void;
}

export interface PlaygroundToolHint {
  /** Tool name (e.g. `charges_create`) — surfaced in the agent dropdown
   *  and the trace panel. Mirrors `FinalTool.name` from @mcpgen/ir. */
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
  /** Free-text result rendered in the agent message body. */
  readonly text?: string;
  /** Full structured result (JSON-stringified into the message body when
   *  `text` is absent). */
  readonly result?: unknown;
  /** Token count for the trace panel. */
  readonly tokens?: number;
  /** Wall-clock duration of the upstream call in ms. */
  readonly latency_ms?: number;
}

export interface PlaygroundRunArgs {
  readonly tool_name: string;
  readonly args: Record<string, unknown>;
  readonly prompt: string;
}

export interface PlaygroundProps {
  sample?: LockedSample;
  onBack?: () => void;
  onDeploy?: () => void;
  /** Tool catalog from the live job artifacts (Pass 5 final tools). */
  tools?: ReadonlyArray<PlaygroundToolHint>;
  /** Prior runs from the BFF history endpoint (currently empty until the
   *  endpoint exists — see SHARED-FILE-REQUESTS.md). */
  history?: ReadonlyArray<PlaygroundHistoryRow>;
  /** Wired tool-execution callback. When undefined the locked screen
   *  renders its visual-only fake-trace path. */
  onRunTool?: (args: PlaygroundRunArgs) => Promise<PlaygroundRunResult>;
}

export interface PreviewProps {
  sample?: LockedSample;
  onMakeIt?: () => void;
  onBack?: () => void;
}

export interface QualityReportProps {
  sample?: LockedSample;
  onContinue?: () => void;
  onBack?: () => void;
}

export interface DeploySubmitArgs {
  /** Deploy target id from DEPLOY_OPTIONS (cloud / cf / docker / src). */
  readonly target: string;
  /** Auth forwarding mode (passthrough / static). */
  readonly auth: string;
}

export interface DeployProps {
  sample?: LockedSample;
  onDeployed?: () => void;
  onBack?: () => void;
  /** Wired deploy callback. Resolves on success → wrapper navigates to
   *  DeploySuccess; rejects on failure → locked recoverable failed state. */
  onSubmit?: (args: DeploySubmitArgs) => Promise<void>;
}

export interface DeploySuccessProps {
  sample?: LockedSample;
  onDashboard?: () => void;
  /** Full https endpoint of the deployed MCP server (replaces locked
   *  `${id}-mcp-abc123.mcpgen.app/mcp` placeholder). */
  mcpUrl?: string;
  /** Pre-formatted JSON string from
   *  `formatConfigJson(buildConfig({serverName, serverUrl}))`. */
  claudeDesktopConfig?: string;
  /** Snake-case server name used in install command + share slug. */
  serverName?: string;
  /** Override the clipboard write (defaults to navigator.clipboard.writeText). */
  onCopy?: (text: string, key: string) => void;
  /** Trigger a config-file download (wrapper supplies an HTMLAnchor blob link). */
  onDownload?: () => void;
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

export interface DashboardProps {
  sample?: LockedSample;
  onBack?: () => void;
  onPlay?: () => void;
  // M-4-ENTRY: real-data slot. Null / omitted hides the drift banner.
  specDiff?: SpecDiff | null;
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

export interface DashboardListProps {
  onBack?: () => void;
  onOpen?: (server: DashboardServerSummary) => void;
  onMarketplace?: () => void;
  onBilling?: () => void;
  onLanding?: () => void;
  // M-4-ENTRY: real-data slot. Empty / omitted renders the EmptyDashboard
  // onboarding branch — same UX as the locked canon's "first-run" state.
  servers?: ReadonlyArray<DashboardServerSummary>;
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

export interface BillingProps {
  onBack?: () => void;
  onLanding?: () => void;
  onDashboard?: () => void;
  onMarketplace?: () => void;
  /** Phase M-4 §6.2 — optional prop slots for Stripe-backed data. When
   *  omitted, the screen renders with canon design literals (loading
   *  state). Production paths gate the entire /billing route behind
   *  ui_billing_active_perm so the literals never leak to end users. */
  plans?: ReadonlyArray<BillingPlan>;
  invoices?: ReadonlyArray<BillingInvoice>;
  usage?: BillingUsage;
}

export interface MarketplaceProps {
  onBack?: () => void;
  onDashboard?: () => void;
  onOpen?: (server: MarketplaceServer) => void;
  onLanding?: () => void;
}

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
