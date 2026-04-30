// apps/web/src/lib/api/error-mapper.ts
//
// Plan 07-02 — FE-01 error mapping from BFF GenerationErrorCode + HTTP status
// to user-readable strings rendered by the locked landing screen via inline
// `var(--accent-red)` CSS-var styling (no new visual elements).
//
// References:
//   - packages/contracts/src/generation-api.ts (GenerationErrorCode enum)
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md FE-01 acceptance
//
// Pure function. Caller decides display surface.

import type { GenerationErrorCode } from '@mcpgen/contracts';

interface MappedError {
  code: string;
  userMessage: string;
}

interface MapInput {
  status: number;
  code: string;
}

export const mapGenerationError = ({ status, code }: MapInput): MappedError => {
  switch (code as GenerationErrorCode | string) {
    case 'invalid_spec':
      return {
        code,
        userMessage:
          "We couldn't parse this spec. Try a direct URL to an OpenAPI 3.x JSON or YAML file.",
      };
    case 'spec_too_large':
      return {
        code,
        userMessage:
          'This spec is larger than 10MB. Use a smaller spec or split into a multi-server setup.',
      };
    case 'spec_endpoint_count_too_large':
      return {
        code,
        userMessage:
          'This spec has more than 80 endpoints. Use the Pro `max_tools_override` option or split.',
      };
    case 'rate_limited':
      return {
        code,
        userMessage: 'Too many generations in a short window. Try again in a minute.',
      };
    case 'cost_cap_exceeded':
      return {
        code,
        userMessage:
          'This generation would exceed the cost cap for your plan. Upgrade or simplify the spec.',
      };
    case 'idempotency_key_replay':
      return {
        code,
        userMessage:
          'This generation is already running. Open the existing job from the dashboard.',
      };
    case 'internal_error':
      return {
        code,
        userMessage: "Something went wrong on our side. We're investigating.",
      };
    case 'not_implemented_phase_8':
      // Phase-1 BFF stub returns this; surface a calm placeholder in live mode
      // until Plan 07-03's fixtures handler covers the dev path.
      return {
        code,
        userMessage:
          'Engine not yet wired (Phase 5 deferred). Run with MCPGEN_FRONTEND_MODE=fixtures locally to demo Wave 1.',
      };
    default:
      // Unknown code from a future BFF version — fail safe with a calm fallback
      // that includes the HTTP status to aid debugging without leaking details.
      return {
        code: 'internal_error',
        userMessage: `Unexpected error (HTTP ${status}) — see browser console for details.`,
      };
  }
};
