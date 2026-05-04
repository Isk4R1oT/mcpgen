// apps/web/src/components/screens/stream/stream.tsx
//
// Stream screen — SSE pipeline log driven by REAL backend events.
//
// Layout/visual: canon `screen-stream.jsx` (locked). Step labels preserved
// verbatim to keep visual parity, but progress, completion, the right-column
// notes, and the ETA are all derived from `useGenerationSSE(jobId)` +
// `useJob(jobId)` — no hardcoded counts, no canon static rotation timer.
//
// Stage → step mapping (canon has 7 visible steps; backend has 9 stages —
// we collapse pass_2/pass_3/pass_4 into the canon "compressing descriptions"
// step which is its longest visible item, and split pass_1 + pass_5 across
// "clustering" + "composite" canon labels for parity):
//
//   canon step idx   backend stage               trigger
//   0  parse         A:completed                  endpoint_count appears
//   1  auth          B/pass_0:completed           tool_plan_count appears
//   2  prune         B/pass_0:completed           dropped_count appears (same event as auth)
//   3  compress      C/pass_2..pass_4:completed   description/param/annotation counts
//   4  cluster       B/pass_1:completed           final_tool_count appears
//   5  compose       D/pass_5:completed           tool_count appears
//   6  finalize      E:completed                  bundle_size_kb appears
//
// Visible note (right column) is set from each step's underlying
// `partial_result` numbers. While a step is upcoming or has no live data we
// render "—" (canon's `next` style) instead of canon's mock literals.
//
// Errors surface via `useErrorMode` (tweaks panel) and via SSE `failed`
// events. spec-fail freezes step 0; auth-fail freezes step 1.

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { Btn, Card, Icon, TopBar } from '@/components/ui';
import { useGenerationSSE } from '@/lib/sse/use-generation-sse';
import type { GenerationSseEvent } from '@mcpgen/contracts';
import { useErrorMode } from '@/stores/error-mode';
import { useJob } from '@/lib/api/jobs';
import { toast } from '@/lib/toast';
import { deriveServerNameFromSpecUrl } from '../canvas/canvas';

interface StreamSample {
  readonly name?: string;
}

interface StreamStep {
  readonly id: string;
  /**
   * i18n key under the `stream` namespace ("stepParse" → "parsed openapi spec"
   * in en, "openapi спецификация распарсена" in ru). The component resolves
   * this via t() at render time so locale changes take effect without
   * rebuilding the constant.
   */
  readonly labelKey: string;
}

// Canon step labels — visual parity with screen-stream.jsx. Right-column
// `note` is computed live from SSE events, NOT a canon constant.
const STREAM_STEPS: ReadonlyArray<StreamStep> = [
  { id: 'parse',    labelKey: 'stepParse' },
  { id: 'auth',     labelKey: 'stepAuth' },
  { id: 'prune',    labelKey: 'stepPrune' },
  { id: 'compress', labelKey: 'stepCompress' },
  { id: 'cluster',  labelKey: 'stepCluster' },
  { id: 'compose',  labelKey: 'stepCompose' },
  { id: 'finalize', labelKey: 'stepFinalize' },
];

const SPIN_FRAMES = ['⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

// Helpers — read a string/number field out of a free-form `partial_result`.
function getNumber(pr: Readonly<Record<string, unknown>> | undefined, key: string): number | null {
  if (pr === undefined) return null;
  const v = pr[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Pick the latest `*:completed` event matching `stage` and (optional) `phase`.
function findCompleted(
  events: ReadonlyArray<GenerationSseEvent>,
  stage: GenerationSseEvent['stage'],
  phase?: string,
): GenerationSseEvent | null {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e === undefined) continue;
    if (e.stage !== stage) continue;
    if (e.status !== 'completed') continue;
    if (phase !== undefined) {
      const p = e.partial_result?.['phase'];
      if (p !== phase) continue;
    }
    return e;
  }
  return null;
}

interface StepView {
  readonly note: string | null; // null → render canon's faint "—"
  readonly state: 'done' | 'live' | 'upcoming';
}

// Derive per-step view (note + state) from the full SSE history.
function computeStepViews(
  events: ReadonlyArray<GenerationSseEvent>,
  failStep: number,
): { views: ReadonlyArray<StepView>; activeIdx: number } {
  const A_done = findCompleted(events, 'A');
  const B0_done = findCompleted(events, 'B', 'pass_0');
  const B1_done = findCompleted(events, 'B', 'pass_1');
  const C2_done = findCompleted(events, 'C', 'pass_2');
  const C3_done = findCompleted(events, 'C', 'pass_3');
  const C4_done = findCompleted(events, 'C', 'pass_4');
  const D_done = findCompleted(events, 'D', 'pass_5');
  const E_done = findCompleted(events, 'E');

  // Notes — only filled when the underlying events have arrived.
  const endpointCount = A_done !== null ? getNumber(A_done.partial_result, 'endpoint_count') : null;
  const droppedCount = B0_done !== null ? getNumber(B0_done.partial_result, 'dropped_count') : null;
  const finalToolCount = B1_done !== null ? getNumber(B1_done.partial_result, 'final_tool_count') : null;
  const descCount = C2_done !== null ? getNumber(C2_done.partial_result, 'tool_count') : null;
  const paramCount = C3_done !== null ? getNumber(C3_done.partial_result, 'param_count') : null;
  const annotationCount = C4_done !== null ? getNumber(C4_done.partial_result, 'annotation_count') : null;
  const shapedToolCount = D_done !== null ? getNumber(D_done.partial_result, 'tool_count') : null;
  const bundleKb = E_done !== null ? getNumber(E_done.partial_result, 'bundle_size_kb') : null;
  const fileCount = E_done !== null ? getNumber(E_done.partial_result, 'file_count') : null;

  // Step done flags (in canon order).
  const doneFlags: ReadonlyArray<boolean> = [
    A_done !== null,
    B0_done !== null,
    B0_done !== null,
    C2_done !== null && C3_done !== null && C4_done !== null,
    B1_done !== null,
    D_done !== null,
    E_done !== null,
  ];

  // Active step = first not-done. If all done → STREAM_STEPS.length (terminal).
  let activeIdx = doneFlags.findIndex((d) => !d);
  if (activeIdx === -1) activeIdx = STREAM_STEPS.length;

  // If we have a forced fail step (errorMode), nothing past it can run.
  const hardCap = failStep >= 0 ? failStep : STREAM_STEPS.length;
  if (activeIdx > hardCap) activeIdx = hardCap;

  const notes: ReadonlyArray<string | null> = [
    endpointCount !== null ? `${endpointCount} endpoints` : null,
    B0_done !== null ? 'auth detected' : null,
    droppedCount !== null ? `removed ${droppedCount}` : null,
    descCount !== null
      ? `${descCount} desc · ${paramCount ?? 0} params · ${annotationCount ?? 0} hints`
      : C2_done !== null
        ? `${descCount ?? '…'} desc`
        : null,
    finalToolCount !== null ? `${finalToolCount} final tools` : null,
    shapedToolCount !== null ? `${shapedToolCount} shaped` : null,
    bundleKb !== null ? `${bundleKb} kb · ${fileCount ?? '…'} files` : null,
  ];

  const views: ReadonlyArray<StepView> = STREAM_STEPS.map((_, i) => {
    const done = doneFlags[i] === true && i < activeIdx;
    const live = i === activeIdx;
    return {
      note: notes[i] ?? null,
      state: done ? 'done' : live ? 'live' : 'upcoming',
    };
  });

  return { views, activeIdx };
}

export interface StreamLogProps {
  readonly jobId: string;
  readonly sample?: StreamSample;
  /** Spec URL used to seed a derived server name when the job has not yet
   * surfaced spec_name (Pass 1 not done). When omitted, falls back to a
   * generic "mcp-server" slug instead of the legacy "lumen-payments" canon
   * literal. */
  readonly specUrl?: string | undefined;
  /** Override navigation on terminal completion. Defaults to router push. */
  readonly onDone?: () => void;
  /** Override cancel handler. Defaults to DELETE attempt + toast fallback. */
  readonly onCancel?: () => void;
}

export function StreamLog({
  jobId,
  sample,
  specUrl,
  onDone,
  onCancel,
}: StreamLogProps): ReactElement {
  const router = useRouter();
  const t = useTranslations('stream');
  const errorMode = useErrorMode((s) => s.mode);

  // Derive a real server name: prefer the live job's spec_name (set by Pass 1),
  // else a slug from the spec URL, else generic. Never default to a hardcoded
  // brand literal like "lumen-payments".
  const jobQuery = useJob(jobId, { refetchIntervalMs: 2000 });
  const job = jobQuery.data?.ok === true ? jobQuery.data.data : null;
  const partial = job?.partial_result ?? null;
  const specNameFromJob =
    partial !== null && typeof partial.spec_name === 'string' && partial.spec_name !== ''
      ? partial.spec_name
      : null;
  const derivedServerName: string =
    sample?.name ?? specNameFromJob ?? deriveServerNameFromSpecUrl(specUrl);

  // Per-canon: spec-fail freezes step 0, auth-fail freezes step 1.
  const failStep =
    errorMode === 'spec-fail' ? 0 :
    errorMode === 'auth-fail' ? 1 : -1;

  const sse = useGenerationSSE(jobId);
  const [errored, setErrored] = useState<boolean>(false);
  const [frame, setFrame] = useState<number>(0);

  // Compute progression from real SSE events.
  const { views, activeIdx } = useMemo(
    () => computeStepViews(sse.events, failStep),
    [sse.events, failStep],
  );

  // Progress = completed-step ratio. Caps at 100 on terminal completion.
  const progress = useMemo(() => {
    if (sse.status === 'completed') return 100;
    return Math.round((activeIdx / STREAM_STEPS.length) * 100);
  }, [activeIdx, sse.status]);

  const handleDone = useMemo<() => void>(
    () =>
      onDone ??
      ((): void => {
        // Canon flow: stream-done lands on the post-generation CANVAS
        // (tools editor + refinement chat). The /preview (review) screen
        // is a pre-generation step and is no longer the terminal target.
        router.push(`/generate/${encodeURIComponent(jobId)}/canvas`);
      }),
    [onDone, router, jobId],
  );

  const handleCancel = useMemo<() => void>(
    () =>
      onCancel ??
      ((): void => {
        void (async (): Promise<void> => {
          try {
            const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
              method: 'DELETE',
            });
            if (res.ok) {
              toast(t('toastCancelled'), { kind: 'info' });
            } else {
              toast(t('toastCancelledLocal'), { kind: 'info' });
            }
          } catch {
            toast(t('toastCancelledLocal'), { kind: 'info' });
          }
          router.push('/generate');
        })();
      }),
    [onCancel, router, jobId],
  );

  // ─── Live SSE → terminal navigation ───────────────────────────────────────
  const navigatedRef = useRef<boolean>(false);
  useEffect(() => {
    if (navigatedRef.current) return;
    if (sse.status === 'completed') {
      navigatedRef.current = true;
      // Brief delay so the user sees the 100% bar.
      setTimeout(() => handleDone(), 400);
    } else if (sse.status === 'failed') {
      navigatedRef.current = true;
      setErrored(true);
      toast(t('toastGenerationFailed'), { kind: 'error' });
    }
  }, [sse.status, handleDone]);

  // Surface forced error mode (tweaks-panel manual triggers).
  // Canon UX: when an error mode is active, the corresponding step renders
  // its failure card immediately — there is no animated wait.
  useEffect(() => {
    if (failStep >= 0) {
      setErrored(true);
    }
  }, [failStep]);

  // ─── Spinner ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPIN_FRAMES.length);
    }, 80);
    return (): void => {
      clearInterval(id);
    };
  }, []);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={t('crumb', { name: derivedServerName })}
        right={
          <Btn kind="ghost" size="sm" icon="x" onClick={handleCancel}>
            {t('cancel')}
          </Btn>
        }
      />

      <main
        style={{
          maxWidth: 880,
          margin: '0 auto',
          padding: '40px 28px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div className="mc-progress" style={{ marginBottom: 8 }}>
          <div style={{ width: progress + '%' }} />
        </div>
        <div
          className="row-bw mc-mono"
          style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 28 }}
        >
          <span>
            {t('stepProgress', {
              current: Math.min(activeIdx + 1, STREAM_STEPS.length),
              total: STREAM_STEPS.length,
              percent: progress,
            })}
          </span>
          <span>
            {sse.status === 'streaming' || sse.status === 'connecting'
              ? t('statusStreaming')
              : sse.status === 'completed'
                ? t('statusCompleted')
                : sse.status === 'failed'
                  ? t('statusFailed')
                  : sse.status}
          </span>
        </div>

        {/* Log */}
        <Card padding={false}>
          <div className="mc-log" style={{ padding: 24 }}>
            {STREAM_STEPS.map((st, i) => {
              const view = views[i] ?? { note: null, state: 'upcoming' as const };
              const done = view.state === 'done';
              const live = view.state === 'live' && !errored;
              const failed = errored && i === failStep;
              const upcoming = view.state === 'upcoming' || (errored && i > failStep);
              return (
                <div key={st.id}>
                  <div className="row-bw" style={{ alignItems: 'baseline' }}>
                    <span>
                      {done && <span className="ok">✓ </span>}
                      {live && <span className="live mc-mono">{SPIN_FRAMES[frame]} </span>}
                      {failed && <span style={{ color: 'var(--accent)' }}>✕ </span>}
                      {upcoming && <span className="next">· </span>}
                      <span
                        className={upcoming ? 'next' : ''}
                        style={{
                          color: failed ? 'var(--accent)' : undefined,
                          fontWeight: failed ? 600 : undefined,
                        }}
                      >
                        {t(st.labelKey)}
                      </span>
                    </span>
                    <span
                      className={`mc-mono ${upcoming ? 'next' : 'muted'}`}
                      style={{
                        fontSize: 12,
                        color: failed ? 'var(--accent)' : undefined,
                      }}
                    >
                      {failed
                        ? failStep === 0
                          ? t('noteParseError')
                          : t('noteAuthError')
                        : view.note ?? (upcoming ? t('noteNext') : t('noteEllipsis'))}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Error recovery card */}
        {errored && (
          <Card
            style={{
              marginTop: 24,
              borderColor: 'var(--accent)',
              borderLeftWidth: 4,
            }}
          >
            {failStep === 0 ? <SpecFailCard onDismiss={handleCancel} /> : null}
            {failStep === 1 ? <AuthFailCard /> : null}
          </Card>
        )}

        {/* Did you know? — only when not errored */}
        {!errored && (
          <div
            style={{
              marginTop: 24,
              padding: 20,
              border: '1px dashed var(--border-sharp)',
              borderRadius: 'var(--radius)',
              background: 'var(--paper-alt)',
            }}
          >
            <div className="mc-caption-up" style={{ marginBottom: 8 }}>
              {t('didYouKnow')}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              {t('didYouKnowBody')}
            </div>
          </div>
        )}

        {!errored && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Btn
              kind="ghost"
              size="sm"
              icon="bell"
              onClick={(): void => {
                toast(t('notifyEmailToast'), { kind: 'info' });
              }}
            >
              {t('notifyMeWhenDone')}
            </Btn>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Error branch sub-components ────────────────────────────────────────────

function SpecFailCard({
  onDismiss,
}: {
  readonly onDismiss: () => void;
}): ReactElement {
  const t = useTranslations('stream');
  return (
    <div>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
        <span className="mc-h3" style={{ color: 'var(--accent)' }}>
          {t('specFailTitle')}
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
        {t('specFailBody')}
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Btn
          kind="primary"
          size="sm"
          icon="spark"
          onClick={(): void => {
            toast(t('specFailRepairToast'), { kind: 'info' });
          }}
        >
          {t('specFailTryRepair')}
        </Btn>
        <Btn
          kind="ink"
          size="sm"
          onClick={(): void => {
            toast(t('specFailEditorToast'), { kind: 'info' });
          }}
        >
          {t('specFailEditInline')}
        </Btn>
        <Btn kind="ghost" size="sm" onClick={onDismiss}>
          {t('specFailUploadNew')}
        </Btn>
      </div>
    </div>
  );
}

function AuthFailCard(): ReactElement {
  const t = useTranslations('stream');
  return (
    <div>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
        <span className="mc-h3" style={{ color: 'var(--accent)' }}>
          {t('authFailTitle')}
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
        {t('authFailBody')}
      </div>
      <div className="mc-banner" style={{ marginBottom: 14 }}>
        <Icon name="lock" size={11} />
        <span>
          {t.rich('authFailHint', {
            code: (chunks) => <span className="mc-mono">{chunks}</span>,
          })}
        </span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Btn
          kind="primary"
          size="sm"
          icon="spark"
          onClick={(): void => {
            toast(t('authFailVaultToast'), { kind: 'info' });
          }}
        >
          {t('authFailReEnter')}
        </Btn>
        <Btn
          kind="ink"
          size="sm"
          onClick={(): void => {
            toast(t('authFailSchemeToast'), { kind: 'info' });
          }}
        >
          {t('authFailDifferentScheme')}
        </Btn>
        <Btn
          kind="ghost"
          size="sm"
          onClick={(): void => {
            toast(t('authFailSkipToast'), { kind: 'info' });
          }}
        >
          {t('authFailSkip')}
        </Btn>
      </div>
    </div>
  );
}
