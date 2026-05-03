// apps/web/src/lib/jsx-bridge/wrapper.tsx
//
// Phase M-4-INFRA — Anon-chrome compatibility shim.
//
// In the previous (pre-M-3) tree this file composed the AnonBanner /
// AnonCacheHitBadge / AnonSignupCta / AnonDeployCta components around
// the locked screens. M-3 removed those marketing components on the
// rebuild contract's instruction; new canon screens absorb the anon
// chrome as part of their layout via props/i18n keys.
//
// However, three existing page client files still import names from
// here:
//
//     app/generate/[jobId]/quality/_quality-client.tsx
//         → QualityScreenWithAnonChrome
//     app/generate/[jobId]/preview/_preview-client.tsx
//         → PreviewScreenWithAnonChrome
//     app/generate/[jobId]/deploy/_deploy-client.tsx
//         → DeployScreenWithAnonChrome
//
// Per the M-4-INFRA brief I (M-4-INFRA) am Forbidden from touching
// app/generate/**. To keep typecheck + runtime green, this module
// simply re-exports the corresponding *Wrapper from screens.tsx.
// Wave-2 owners of those three pages will switch their imports
// directly to `screens.tsx` (or to a new client component) and this
// file may then be deleted.

'use client';

export {
  DeployScreenWithAnonChrome,
  PreviewScreenWithAnonChrome,
  QualityScreenWithAnonChrome,
} from './screens';
