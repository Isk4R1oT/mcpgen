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

export interface PlaygroundProps {
  sample?: LockedSample;
  onBack?: () => void;
  onDeploy?: () => void;
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

export interface DeployProps {
  sample?: LockedSample;
  onDeployed?: () => void;
  onBack?: () => void;
}

export interface DeploySuccessProps {
  sample?: LockedSample;
  onDashboard?: () => void;
}

export interface DashboardProps {
  sample?: LockedSample;
  onBack?: () => void;
  onPlay?: () => void;
}

export interface DashboardListProps {
  onBack?: () => void;
  onOpen?: (server: LockedSample) => void;
  onMarketplace?: () => void;
  onBilling?: () => void;
  onLanding?: () => void;
}

export interface BillingProps {
  onBack?: () => void;
  onLanding?: () => void;
  onDashboard?: () => void;
  onMarketplace?: () => void;
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
