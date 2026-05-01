// apps/web/src/lib/jsx-bridge/wrapper.tsx
//
// Plan 09.1-07 — Anon-state chrome wrappers per CONTEXT D-10 (Phase 9.1).
//
// These wrappers compose the existing `*Wrapper` components from `./screens`
// with anon-state chrome (banner / cache-hit badge / signup CTA / deploy CTA).
// They do NOT modify the locked JSX modules (apps/web/src/screen-*.jsx) and
// they do NOT modify `./screens.tsx` — they sit ABOVE it as a second wrapping
// layer. This keeps the FE-05 visual-lock invariant intact: when the anon
// chrome decides to render null (signed-in user OR loading) the page output
// is byte-identical to the pre-09.1 baseline.
//
// Pattern:
//   <QualityScreenWithAnonChrome jobId={...} qualityReport={...} cacheHit={...}>
//     ↓
//     <AnonBanner /> (renders only when isAnonymous)
//     <AnonCacheHitBadge cacheHit={...} /> (renders only when cacheHit truthy)
//     <QualityReportWrapper jobId={...} ... /> (existing locked-screen wrapper)
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-10
//   - apps/web/src/lib/jsx-bridge/screens.tsx (existing *Wrapper components)

'use client';

import type { ReactElement } from 'react';
import { Fragment } from 'react';

import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

import { AnonBanner } from '@/components/anon-banner';
import { AnonCacheHitBadge, type CacheHitMetadata } from '@/components/anon-cache-hit-badge';
import { AnonDeployCta } from '@/components/anon-deploy-cta';
import { AnonSignupCta } from '@/components/anon-signup-cta';

import { type LockedSample } from './index';
import { DeployWrapper, PreviewWrapper, QualityReportWrapper } from './screens';

// --- QualityScreenWithAnonChrome ------------------------------------------
//
// Injected ABOVE the locked QualityReport screen. Surfaces the anon disclosure
// banner and the cache-hit badge when applicable.

export interface QualityScreenWithAnonChromeProps {
  readonly jobId: string;
  readonly sample: LockedSample;
  readonly qualityReport?: QualityReportType;
  readonly cacheHit?: CacheHitMetadata | null;
}

export function QualityScreenWithAnonChrome({
  jobId,
  sample,
  qualityReport,
  cacheHit,
}: QualityScreenWithAnonChromeProps): ReactElement {
  return (
    <Fragment>
      <AnonBanner />
      <AnonCacheHitBadge cacheHit={cacheHit ?? null} />
      <QualityReportWrapper
        jobId={jobId}
        sample={sample}
        {...(qualityReport !== undefined ? { qualityReport } : {})}
      />
    </Fragment>
  );
}

// --- PreviewScreenWithAnonChrome ------------------------------------------
//
// Locked Preview screen + footer signup CTA below.

export interface PreviewScreenWithAnonChromeProps {
  readonly jobId: string;
  readonly sample: LockedSample;
  readonly finalTools?: ReadonlyArray<FinalTool>;
  readonly qualityReport?: QualityReportType;
  readonly codeSource?: string | null;
}

export function PreviewScreenWithAnonChrome({
  jobId,
  sample,
  finalTools,
  qualityReport,
  codeSource,
}: PreviewScreenWithAnonChromeProps): ReactElement {
  return (
    <Fragment>
      <PreviewWrapper
        jobId={jobId}
        sample={sample}
        {...(finalTools !== undefined ? { finalTools } : {})}
        {...(qualityReport !== undefined ? { qualityReport } : {})}
        {...(codeSource !== undefined ? { codeSource } : {})}
      />
      <AnonSignupCta />
    </Fragment>
  );
}

// --- DeployScreenWithAnonChrome -------------------------------------------
//
// Locked Deploy screen + an anon-aware deploy CTA above it. The wrapper
// keeps the locked Deploy rendering intact (so the screenshot baseline does
// not shift); the anon CTA exists as an ADDITIONAL affordance above it.
// Anon users get both the locked CTA (which routes through the existing
// fixture/live deploy pipeline) and the explicit "Deploy to free 24h URL"
// button calling the ephemeral endpoint directly.

export interface DeployScreenWithAnonChromeProps {
  readonly jobId: string;
  readonly sample: LockedSample;
}

export function DeployScreenWithAnonChrome({
  jobId,
  sample,
}: DeployScreenWithAnonChromeProps): ReactElement {
  return (
    <Fragment>
      <div
        className="mc-mono"
        style={{
          maxWidth: 1180,
          margin: '24px auto 0',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <AnonDeployCta generationId={jobId} />
      </div>
      <DeployWrapper jobId={jobId} sample={sample} />
    </Fragment>
  );
}
