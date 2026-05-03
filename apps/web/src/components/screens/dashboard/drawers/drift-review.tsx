// apps/web/src/components/screens/dashboard/drawers/drift-review.tsx
//
// Phase 2 / B2 — Drift review drawer body.
//
// Renders a compact, read-only list of drift events for a deployment. The
// dashboard screen also exposes a full modal-based "review changes" UI; this
// drawer body is a lightweight alternative entry point for opening drift
// from contexts (dashboard-list, notifications) where a modal would feel
// heavy.
//
// Wires `useDriftEvents(deploymentId)` from `lib/api/deployments.ts` —
// real BFF endpoint `GET /api/v1/deployments/:id/drift-events` exists.
// Flag-gated via `ui_dashboard_drift_perm` (OFF by default → drawer shows
// the canon "drift detection — coming soon" state).

'use client';

import type { ReactElement } from 'react';

import { Btn, Icon } from '@/components/ui';
import { useDriftEvents } from '@/lib/api/deployments';
import { toast } from '@/lib/toast';

export interface DriftReviewBodyProps {
  readonly deploymentId: string;
  readonly serverName: string;
  /** `ui_dashboard_drift_perm` — gates regenerate action. */
  readonly regenerateEnabled?: boolean;
  /** `ui_dashboard_drift_snooze_perm` — gates snooze action. */
  readonly snoozeEnabled?: boolean;
}

export function DriftReviewBody({
  deploymentId,
  serverName,
  regenerateEnabled = false,
  snoozeEnabled = false,
}: DriftReviewBodyProps): ReactElement {
  const { data, isLoading } = useDriftEvents(deploymentId);

  if (isLoading) {
    return (
      <div
        className="muted mc-mono"
        style={{ fontSize: 12, padding: 8 }}
      >
        loading drift events…
      </div>
    );
  }

  const events = data && data.ok ? data.data.drift_events : [];

  return (
    <div>
      <div
        className="muted mc-mono"
        style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}
      >
        upstream spec changes detected for{' '}
        <strong style={{ color: 'var(--text)' }}>{serverName}</strong>. accept to
        regenerate this server with the new endpoints, or pin to freeze.
      </div>

      {events.length === 0 ? (
        <div
          className="mc-banner"
          style={{ background: 'var(--paper-alt)' }}
        >
          <Icon name="check" size={12} />
          <span style={{ fontSize: 12 }}>
            no drift detected · server is in sync with upstream
          </span>
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          {events.map((ev, i) => (
            <div
              key={ev.id}
              style={{
                padding: '12px 14px',
                borderBottom:
                  i < events.length - 1 ? '1px solid var(--border)' : 'none',
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
              }}
            >
              <div className="row-bw">
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                  drift · {ev.status}
                </span>
                <span className="muted">
                  {ev.detected_at !== undefined ? ev.detected_at : '—'}
                </span>
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 11 }}>
                event {ev.id}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn
          kind="ink"
          size="sm"
          icon="spark"
          onClick={(): void => {
            if (regenerateEnabled) {
              // TODO: POST /api/v1/deployments/:id/drift/regenerate
              toast('regenerating with latest spec · ~60s', { kind: 'info' });
              return;
            }
            toast('regenerating with latest spec · ~60s', { kind: 'info' });
          }}
        >
          regenerate now
        </Btn>
        <Btn
          kind="ghost"
          size="sm"
          onClick={(): void => {
            if (snoozeEnabled) {
              // TODO: POST /api/v1/deployments/:id/drift/snooze
              toast("snoozed 7 days · we'll re-check on the way out");
              return;
            }
            toast("snoozed 7 days · we'll re-check on the way out");
          }}
        >
          snooze 7 days
        </Btn>
      </div>
    </div>
  );
}
