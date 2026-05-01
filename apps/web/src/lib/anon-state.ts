// apps/web/src/lib/anon-state.ts
//
// Plan 09.1-07 — `useAnonState()` client hook. Probes the BFF for the current
// session and reports whether the caller is anonymous (no Logto JWT) or
// authenticated.
//
// CONTEXT D-10 §"useAnonState hook shape" — we treat any 401 response from
// the protected probe as proof of anonymous status. A 2xx response means the
// caller is authenticated.
//
// Probe target rationale: there is no dedicated `/api/v1/me` route in the BFF
// (Phase 8 + Phase 9.1). Instead the hook hits `/api/v1/dashboard/list` —
// part of the protectedApp mount (plan 09.1-02), which returns 401 for
// anonymous callers and 200 for signed-in users with at least one deployment
// record visible. The route is read-only and idempotent so probing it has
// no side effects. The path must continue to be protected for this hook to
// behave correctly; if a future plan ungates dashboard listings we MUST
// add a dedicated `/api/v1/me` endpoint.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-10
//   - apps/api/src/index.ts (protectedApp mounting — plan 09.1-02)

'use client';

import { useEffect, useState } from 'react';

export interface AnonState {
  /** true when the BFF reports no Logto session for the caller. */
  readonly isAnonymous: boolean;
  /** true while the probe request is in flight; consumers should render
   *  null OR a skeleton during this window to avoid flashing the wrong CTA. */
  readonly loading: boolean;
}

// Exported for tests to mock-via-spy without coupling to the literal path.
export const ANON_PROBE_PATH = '/api/v1/dashboard/list';

export function useAnonState(): AnonState {
  const [loading, setLoading] = useState<boolean>(true);
  // Default-anon: until the probe responds we render the anonymous chrome.
  // Conservative bias — better to show a sign-up nudge to a signed-in user
  // for ~50ms than to hide the disclosure from an anon user for the same.
  const [isAnonymous, setIsAnonymous] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const probe = async (): Promise<void> => {
      try {
        const res = await fetch(ANON_PROBE_PATH, {
          credentials: 'include',
          signal: controller.signal,
          // Browsers cache 401s; bypass for an authoritative read.
          cache: 'no-store',
        });
        if (cancelled) return;
        // 401 = anonymous; any successful response = authenticated.
        // Treat 5xx as "unknown" → keep default-anon (we surface the sign-up
        // CTA which is the safer fallback for users who can't keep their
        // generation server-side).
        setIsAnonymous(res.status === 401);
      } catch {
        // Network errors / aborts → keep default-anon. We deliberately do NOT
        // surface the error to the user; the anon chrome is the safe default.
        if (!cancelled) setIsAnonymous(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void probe();

    return (): void => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return { isAnonymous, loading };
}
