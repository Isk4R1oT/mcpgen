// apps/web/sentry.server.config.ts
//
// Server-side (Node) Sentry init for Next.js (FND-10 / D-19).
// Phase 1: SENTRY_DSN may be empty — Sentry.init MUST NOT crash.
// Phase 9 fills DSN per environment.

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? '',
  tracesSampleRate: 0.1,
  beforeSend(event) {
    const headers = event.request?.headers as Record<string, string> | undefined;
    if (headers) {
      for (const k of ['Authorization', 'X-Upstream-Auth', 'Cookie']) {
        if (k in headers) headers[k] = '[REDACTED]';
      }
    }
    return event;
  },
});
