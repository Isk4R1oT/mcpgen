// Typed ESM re-exports of window.<ComponentName> after loader.ts side-effect
// imports run. Each export is `as React.ComponentType<XXXProps>`. Routes import
// only from this module, never directly from a screen-*.jsx file.

'use client';

import type * as React from 'react';

// Force loader.ts side effects to run before reading window globals below.
// The `import '@/lib/jsx-bridge'` in any consumer route triggers this chain.
import './loader';

export { TWEAK_DEFAULTS, applyTokens, type TweakDefaults } from './loader';

// Locked sample shape — verbatim from apps/web/src/screen-landing.jsx line 3.
// The 5 SAMPLE_APIS entries (lumen, helio, nimbus, rookery, parley) all match.
export interface LockedSample {
  id: string;
  name: string;
  endpoints: number;
  tools: number;
  save: number;
}

// --- Per-screen prop shapes (derived from screen-*.jsx function signatures) -

export interface LandingProps {
  sample: LockedSample;
  urlText: string;
  setUrlText: (s: string) => void;
  onMakeIt: () => void;
  onSelectSample: (s: LockedSample) => void;
}

export interface AuthScreenProps {
  sample: LockedSample;
  onContinue: () => void;
  onBack: () => void;
}

export interface CanvasProps {
  sample: LockedSample;
  onPlay: () => void;
  onDeploy: () => void;
  onCmdK: () => void;
  onBack: () => void;
}

export interface StreamLogProps {
  sample: LockedSample;
  onDone: () => void;
  onCancel: () => void;
}

export interface PlaygroundProps {
  sample: LockedSample;
  onBack: () => void;
  onDeploy: () => void;
}

export interface PreviewProps {
  sample: LockedSample;
  onMakeIt: () => void;
  onBack: () => void;
}

export interface QualityReportProps {
  sample: LockedSample;
  onContinue: () => void;
  onBack: () => void;
}

export interface DeployProps {
  sample: LockedSample;
  onDeployed: () => void;
  onBack: () => void;
}

export interface DeploySuccessProps {
  sample: LockedSample;
  onDashboard: () => void;
}

export interface DashboardProps {
  sample: LockedSample;
  onBack: () => void;
  onPlay: () => void;
}

// --- Typed re-exports of window globals -----------------------------------
// After loader.ts's side-effect imports run, every `window.<Component>` is set.
// We narrow the unknown globalThis to typed React.ComponentType.

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
  SAMPLE_APIS: readonly LockedSample[];
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

// SAMPLE_APIS — the 5 fake APIs locked in screen-landing.jsx. Routes select one.
export const SAMPLE_APIS: readonly LockedSample[] = w.SAMPLE_APIS;
