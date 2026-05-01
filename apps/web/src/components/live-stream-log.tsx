// apps/web/src/components/live-stream-log.tsx
//
// POST-09.1 patch: real-data replacement for the canned screen-stream.jsx
// animation. Subscribes to useGenerationSSE and renders the actual Stage A→F
// timeline as engine events arrive. The locked screen-stream.jsx is preserved
// untouched on disk; this component is wired in via StreamLogWrapper as the
// runtime substitute when the env flag enables it (currently unconditional).

'use client';

import { useEffect, useMemo, type ReactElement } from 'react';
import { useGenerationSSE } from '@/lib/sse/use-generation-sse';

const STAGE_LABELS: Record<string, string> = {
  A: 'parse openapi spec',
  B: 'pass 0/1 — inventory + consolidation',
  C: 'pass 2/3/4 — descriptions + parameters + annotations',
  D: 'pass 5 — response shaping',
  E: 'codegen typescript bundle',
  F1: 'static validation (tsc + lint + bundle gate)',
  F2: 'smell scan (5-shuffle averaged)',
  F3: 'agent eval (golden tasks)',
  validation_complete: 'pipeline complete',
  completed: 'pipeline complete',
  failed: 'pipeline failed',
};

const STAGE_ORDER = ['A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3'];

interface Props {
  jobId: string;
  onDone: () => void;
  onCancel: () => void;
}

export default function LiveStreamLog({ jobId, onDone, onCancel }: Props): ReactElement {
  const { events, status } = useGenerationSSE(jobId);

  // Per-stage status: 'pending' | 'running' | 'completed' | 'error'
  const stageState = useMemo(() => {
    const map: Record<string, { status: string; detail: string }> = {};
    for (const ev of events) {
      const detail = ev.partial_result
        ? Object.entries(ev.partial_result)
            .filter(([k]) => k !== 'phase')
            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
            .join(' · ')
        : '';
      map[ev.stage] = { status: ev.status, detail };
    }
    return map;
  }, [events]);

  // Auto-navigate when terminal
  useEffect(() => {
    if (status === 'completed') onDone();
  }, [status, onDone]);

  const completedCount = STAGE_ORDER.filter(
    (s) => stageState[s]?.status === 'completed',
  ).length;
  const progressPct = Math.round((completedCount / STAGE_ORDER.length) * 100);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh', padding: '64px 28px 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div
          style={{
            height: 4,
            background: 'var(--smoke)',
            borderRadius: 2,
            marginBottom: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'var(--ink)',
              transition: 'width 200ms ease-out',
            }}
          />
        </div>
        <div
          className="mc-mono"
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 32,
          }}
        >
          <span>
            stage {completedCount} of {STAGE_ORDER.length} · {progressPct}% · job {jobId.slice(0, 14)}…
          </span>
          <span>
            sse: {status}
          </span>
        </div>

        <div
          className="mc-stamp"
          style={{ padding: 24, marginBottom: 24, background: 'var(--card)' }}
        >
          {STAGE_ORDER.map((stage) => {
            const s = stageState[stage];
            const stageStatus = s?.status ?? 'pending';
            const icon =
              stageStatus === 'completed'
                ? '✓'
                : stageStatus === 'error'
                ? '✗'
                : stageStatus === 'started'
                ? '⟳'
                : '·';
            const color =
              stageStatus === 'completed'
                ? 'var(--ink)'
                : stageStatus === 'error'
                ? 'var(--accent)'
                : stageStatus === 'started'
                ? 'var(--primary)'
                : 'var(--text-faint)';
            return (
              <div
                key={stage}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                }}
              >
                <span style={{ color }}>
                  {icon} stage {stage} — {STAGE_LABELS[stage] ?? stage}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {s?.detail ?? (stageStatus === 'pending' ? 'next' : '')}
                </span>
              </div>
            );
          })}
        </div>

        {events.length > 0 && (
          <details
            className="mc-stamp"
            style={{ padding: 16, background: 'var(--paper-alt)' }}
          >
            <summary
              className="mc-mono"
              style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}
            >
              raw event log ({events.length} events)
            </summary>
            <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {events.map((ev) => (
                <div
                  key={ev.event_id}
                  style={{ padding: '4px 0', color: 'var(--text-muted)' }}
                >
                  {ev.event_id.slice(0, 8)} · {ev.stage} · {ev.status}
                  {ev.partial_result ? ` · ${JSON.stringify(ev.partial_result).slice(0, 120)}` : ''}
                </div>
              ))}
            </div>
          </details>
        )}

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <button
            type="button"
            onClick={onCancel}
            className="mc-link mc-mono"
            style={{ fontSize: 12, color: 'var(--text-muted)' }}
          >
            cancel and start over
          </button>
        </div>
      </div>
    </div>
  );
}
