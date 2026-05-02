// apps/web/sentry.client.config.ts
//
// Browser-side Sentry init for Next.js (FND-10 / D-19).
// Phase 1: NEXT_PUBLIC_SENTRY_DSN may be empty — Sentry.init MUST NOT crash.
// Phase 9 fills DSN per environment.
//
// Phase 7 (Plan 07-06): beforeSend body extracted to shared lib/sentry/redact + ?key=/?token=
// query-param redaction added per CONTEXT D-30 + Pitfall #12 (P0).

import * as Sentry from '@sentry/nextjs';
import { featureFlagsIntegration } from '@sentry/core';
import { redactSentryEvent } from '@/lib/sentry/redact';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
  tracesSampleRate: 0.1,
  // Buffers Flipt flag evaluations and attaches them to error events / spans
  // automatically. See docs/mcpgen-feature-flags-contract.md §9.1.
  integrations: [featureFlagsIntegration()],
  beforeSend(event) {
    return redactSentryEvent(event);
  },
});
