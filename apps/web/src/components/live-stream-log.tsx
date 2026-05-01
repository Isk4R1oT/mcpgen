// apps/web/src/components/live-stream-log.tsx
//
// POST-09.1 patch: real-data replacement for the canned screen-stream.jsx
// animation. Subscribes to useGenerationSSE and renders the actual Stage A→F
// timeline as engine events arrive. Visual treatment mirrors the locked
// screen-stream visual (mc-stamp card, ✓/✗/⟳ icons, DID YOU KNOW? footer)
// so the live screen feels identical to what the canned mock looked like
// — only the data is real now. The locked screen-stream.jsx is preserved
// untouched on disk; this component is wired in via StreamLogWrapper.

'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useGenerationSSE } from '@/lib/sse/use-generation-sse';

interface StageDef {
  id: string;
  label: string;
  hint: string;
}

const STAGES: ReadonlyArray<StageDef> = [
  { id: 'A', label: 'parsed openapi spec', hint: 'reads paths, schemas, security schemes' },
  { id: 'B', label: 'inventory + consolidation', hint: 'pass 0 picks tools, pass 1 collapses to six-tool pattern' },
  { id: 'C', label: 'descriptions + parameters + annotations', hint: 'pass 2/3/4 — most expensive LLM stage' },
  { id: 'D', label: 'response shaping', hint: 'pass 5 — output schemas + pagination + truncation' },
  { id: 'E', label: 'codegen typescript bundle', hint: 'jinja2 templates → ~25 files, $0 deterministic' },
  { id: 'F1', label: 'static validation', hint: 'tsc + lint + bundle gate' },
  { id: 'F2', label: 'smell scan', hint: '5-shuffle averaged rubric (single judge mode)' },
  { id: 'F3', label: 'agent eval', hint: 'golden tasks via real claude (sample run)' },
];

const TIPS = [
  'most MCP servers waste 70% of their token budget on verbose descriptions copied straight from openapi specs. this is exactly what we\'re fixing right now.',
  '84.3% of existing MCP servers have opaque parameters (paper finding). we generate rich per-parameter docs in pass 3.',
  'the six-tool pattern (search/fetch/list_collections/list_objects/upsert/delete) is industry consensus from Anthropic + OpenAI + MCP Bundles, October 2025.',
  'tool annotations (readOnly/destructive/idempotent/openWorld) decide whether claude desktop auto-runs your tool or asks first.',
  'we run a real claude agent against golden tasks in F3 — pass rate ≥0.7 is the launch criterion.',
];

interface Props {
  jobId: string;
  onDone: () => void;
  onCancel: () => void;
}

interface StageState {
  status: 'pending' | 'running' | 'completed' | 'error';
  detail: string;
  startedAt: number | null;
  finishedAt: number | null;
}

const formatDetailValue = (key: string, value: unknown): string => {
  if (typeof value === 'string') {
    if (key.endsWith('_pct') || key.endsWith('_percent')) return `${value}%`;
    return value;
  }
  if (typeof value === 'number') {
    if (key.endsWith('_pct') || key.endsWith('_percent')) return `${value}%`;
    return String(value);
  }
  return JSON.stringify(value);
};

const formatDetail = (partial: Record<string, unknown> | undefined): string => {
  if (!partial) return '';
  const entries = Object.entries(partial)
    .filter(([k]) => k !== 'phase' && k !== 'sub_status')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${formatDetailValue(k, v)}`);
  return entries.join(' · ');
};

export default function LiveStreamLog({ jobId, onDone, onCancel }: Props): ReactElement {
  const { events, status } = useGenerationSSE(jobId);
  const [tipIdx, setTipIdx] = useState(0);

  // Rotate "did you know?" tip every 6s.
  useEffect(() => {
    const id = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 6000);
    return () => clearInterval(id);
  }, []);

  const stageState: Record<string, StageState> = useMemo(() => {
    const map: Record<string, StageState> = {};
    for (const def of STAGES) {
      map[def.id] = { status: 'pending', detail: '', startedAt: null, finishedAt: null };
    }
    for (const ev of events) {
      const slot = map[ev.stage];
      if (slot === undefined) continue;
      if (ev.status === 'started') {
        slot.status = 'running';
        slot.startedAt = Date.now();
        slot.detail = formatDetail(ev.partial_result);
      } else if (ev.status === 'completed') {
        slot.status = 'completed';
        slot.finishedAt = Date.now();
        slot.detail = formatDetail(ev.partial_result) || slot.detail;
      } else if (ev.status === 'error') {
        slot.status = 'error';
        slot.finishedAt = Date.now();
        slot.detail = ev.error?.message ?? formatDetail(ev.partial_result);
      }
    }
    return map;
  }, [events]);

  // Auto-navigate when terminal.
  useEffect(() => {
    if (status === 'completed') onDone();
  }, [status, onDone]);

  const stageStatus = (id: string): StageState['status'] =>
    stageState[id]?.status ?? 'pending';
  const completedCount = STAGES.filter((s) => stageStatus(s.id) === 'completed').length;
  const runningStage = STAGES.find((s) => stageStatus(s.id) === 'running');
  const progressPct = (completedCount / STAGES.length) * 100;
  const stepNum = runningStage
    ? STAGES.findIndex((s) => s.id === runningStage.id) + 1
    : completedCount;

  // Crude time estimate: average stage takes ~20s; remaining = (total - completed) * 20.
  const remainingSec = Math.max(0, (STAGES.length - completedCount) * 20);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 28px 80px' }}>
        {/* Progress bar */}
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
              transition: 'width 600ms cubic-bezier(0.22, 0.61, 0.36, 1)',
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
            step {stepNum} of {STAGES.length} · {Math.round(progressPct)}%
          </span>
          <span>
            {status === 'completed'
              ? 'done'
              : status === 'failed'
                ? 'failed'
                : `about ${remainingSec} sec remaining`}
          </span>
        </div>

        {/* Stage list */}
        <div
          className="mc-stamp"
          style={{
            padding: '20px 28px',
            background: 'var(--card)',
            marginBottom: 24,
          }}
        >
          {STAGES.map((def) => {
            const s: StageState = stageState[def.id] ?? {
              status: 'pending',
              detail: '',
              startedAt: null,
              finishedAt: null,
            };
            const icon =
              s.status === 'completed'
                ? '✓'
                : s.status === 'error'
                  ? '✗'
                  : s.status === 'running'
                    ? '⟳'
                    : '·';
            const labelColor =
              s.status === 'completed'
                ? 'var(--ink)'
                : s.status === 'error'
                  ? 'var(--accent)'
                  : s.status === 'running'
                    ? 'var(--ink)'
                    : 'var(--text-faint)';
            const detailColor =
              s.status === 'pending' ? 'var(--text-faint)' : 'var(--text-muted)';
            return (
              <div
                key={def.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '10px 0',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  borderBottom: '1px dashed var(--border)',
                  transition: 'color 200ms ease',
                }}
              >
                <span style={{ color: labelColor, display: 'flex', gap: 12, alignItems: 'baseline' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 14,
                      textAlign: 'center',
                      animation: s.status === 'running' ? 'mc-spin 1.4s linear infinite' : 'none',
                    }}
                  >
                    {icon}
                  </span>
                  {def.label}
                </span>
                <span style={{ color: detailColor, fontSize: 12, textAlign: 'right' }}>
                  {s.detail || (s.status === 'pending' ? 'next' : '')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Currently-running hint */}
        {runningStage && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-muted)',
              marginBottom: 16,
              paddingLeft: 28,
            }}
          >
            ↳ {runningStage.hint}
          </div>
        )}

        {/* Did you know? */}
        <div
          className="mc-stamp"
          style={{
            padding: '18px 22px',
            background: 'var(--paper-alt)',
            border: '1px dashed var(--border)',
            marginBottom: 24,
            transition: 'opacity 400ms ease',
          }}
        >
          <div
            className="mc-mono"
            style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}
          >
            DID YOU KNOW?
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text)' }}>
            {TIPS[tipIdx]}
          </div>
        </div>

        {/* Cancel */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={onCancel}
            className="mc-btn mc-mono"
            style={{
              fontSize: 12,
              padding: '6px 18px',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            cancel and start over
          </button>
        </div>

        {events.length > 0 && (
          <details
            style={{
              marginTop: 32,
              padding: '12px 16px',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--radius)',
            }}
          >
            <summary
              className="mc-mono"
              style={{ cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)' }}
            >
              raw event log ({events.length} events) · job {jobId.slice(0, 14)}…
            </summary>
            <div
              style={{
                marginTop: 10,
                maxHeight: 240,
                overflowY: 'auto',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
              }}
            >
              {events.map((ev) => (
                <div key={ev.event_id} style={{ padding: '3px 0' }}>
                  <span style={{ color: 'var(--text-faint)' }}>{ev.event_id.slice(0, 8)}</span>
                  {' · '}
                  <span style={{ color: 'var(--ink)' }}>{ev.stage}</span>
                  {' · '}
                  <span>{ev.status}</span>
                  {ev.partial_result
                    ? ` · ${JSON.stringify(ev.partial_result).slice(0, 140)}`
                    : ''}
                </div>
              ))}
            </div>
          </details>
        )}
      </main>

      <style jsx>{`
        @keyframes mc-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
