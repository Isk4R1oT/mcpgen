// apps/web/sentry.server.config.ts
//
// Server-side (Node) Sentry init for Next.js (FND-10 / D-19).
// Phase 1: SENTRY_DSN may be empty — Sentry.init MUST NOT crash.
// Phase 9 fills DSN per environment.
//
// Phase 7 (Plan 07-06): beforeSend body extracted to shared lib/sentry/redact + ?key=/?token=
// query-param redaction added per CONTEXT D-30 + Pitfall #12 (P0).

import * as Sentry from '@sentry/nextjs';
import { redactSentryEvent } from '@/lib/sentry/redact';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  tracesSampleRate: 0.1,
  beforeSend(event) {
    return redactSentryEvent(event);
  },
});
