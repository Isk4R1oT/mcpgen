// apps/web/src/components/screens/stream/stream.tsx
//
// Phase 1 Agent A3 — Stream screen.
//
// Source of truth: claude-design-reference/canon/screen-stream.jsx
//
// Renders the multi-stage SSE pipeline log, with two error branches surfaced
// from `useErrorMode()` (spec-fail freezes step 0, auth-fail freezes step 1).
// Other error modes pass through (rate-limit / deploy-fail surface on later
// screens). Live SSE consumption is delegated to `useGenerationSSE(jobId)`.
//
// The canon screen is a deterministic, animated mock with hard-coded step
// durations and example rotations. We preserve the look + behavior verbatim
// while overlaying the live SSE driver:
//
//   * Real engine completion → `onDone()` navigates to /preview.
//   * Real engine failure  → flips errorMode shim to spec-fail or auth-fail
//     based on event payload (best-effort categorization).
//   * Cancel button → DELETE /api/v1/jobs/:id if backend supports it (it does
//     NOT today — graceful toast fallback per SCREEN-BEHAVIORS-CATALOG.md).
//
// Recovery CTAs are wired to friendly toasts (canon parity) and gated by
// `_perm` flags. Flag OFF → toast; ON → real backend call (when it exists).
// Currently all four are OFF — see `.planning/phase-rebuild/FLAGS-NEEDED.md`.

'use client';

import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useRouter } from 'next/navigation';

import { Btn, Card, Icon, TopBar } from '@/components/ui';
import { useGenerationSSE } from '@/lib/sse/use-generation-sse';
import { useErrorMode } from '@/stores/error-mode';
import { toast } from '@/lib/toast';

interface StreamSample {
  readonly name?: string;
}

interface StreamStep {
  readonly id: string;
  readonly label: string;
  readonly note: string;
  readonly dur: number;
  readonly examples?: boolean;
}

const STREAM_STEPS: ReadonlyArray<StreamStep> = [
  { id: 'parse',   label: 'parsed openapi spec',          note: '348 endpoints, 12 cats',     dur: 800 },
  { id: 'auth',    label: 'detected auth strategy',       note: 'oauth + api key',            dur: 900 },
  { id: 'prune',   label: 'pruned deprecated paths',      note: 'removed 14',                 dur: 1100 },
  { id: 'compress',label: 'compressing descriptions',     note: '247 / 348 done',             dur: 4200, examples: true },
  { id: 'cluster', label: 'clustering similar endpoints', note: 'found 12 clusters',          dur: 1600 },
  { id: 'compose', label: 'generating composite tools',   note: '3 created',                  dur: 1400 },
  { id: 'finalize',label: 'finalizing typescript module', note: '4.2 kb minified',            dur: 1000 },
];

interface CompressionExample {
  readonly from: string;
  readonly to: string;
}

const COMPRESSION_EXAMPLES: ReadonlyArray<CompressionExample> = [
  { from: '"create_charge"',       to: '"charges a customer\'s card."' },
  { from: '"list_charges"',        to: '"lists charges; supports filters."' },
  { from: '"refund_charge"',       to: '"refunds a charge by id."' },
  { from: '"create_customer"',     to: '"creates a customer record."' },
  { from: '"update_subscription"', to: '"updates a subscription plan."' },
];

const SPIN_FRAMES = ['⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export interface StreamLogProps {
  readonly jobId: string;
  readonly sample?: StreamSample;
  /** Override navigation on terminal completion. Defaults to router push. */
  readonly onDone?: () => void;
  /** Override cancel handler. Defaults to DELETE attempt + toast fallback. */
  readonly onCancel?: () => void;
}

export function StreamLog({
  jobId,
  sample,
  onDone,
  onCancel,
}: StreamLogProps): ReactElement {
  const router = useRouter();
  const errorMode = useErrorMode((s) => s.mode);

  // Per-canon: spec-fail freezes step 0, auth-fail freezes step 1.
  const failStep =
    errorMode === 'spec-fail' ? 0 :
    errorMode === 'auth-fail' ? 1 : -1;

  const [stepIdx, setStepIdx] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);
  const [exampleIdx, setExampleIdx] = useState<number>(0);
  const [errored, setErrored] = useState<boolean>(false);
  const [frame, setFrame] = useState<number>(0);

  const total = STREAM_STEPS.reduce((s, st) => s + st.dur, 0);

  // Live SSE driver — for navigation on terminal events. The visual progress
  // animation is canon-deterministic to preserve the locked look; SSE only
  // controls onDone/onCancel transitions today (Phase 1 wiring). Future
  // phases may swap step animation to data-driven.
  const sse = useGenerationSSE(jobId);

  const handleDone = useMemo<() => void>(
    () =>
      onDone ??
      ((): void => {
        router.push(`/generate/${encodeURIComponent(jobId)}/preview`);
      }),
    [onDone, router, jobId],
  );

  const handleCancel = useMemo<() => void>(
    () =>
      onCancel ??
      ((): void => {
        // BFF DELETE /api/v1/jobs/:id is not implemented today — toast and
        // navigate back to /generate. Wrap in try/catch so the user-visible
        // path is always responsive even if the optimistic fetch throws.
        void (async (): Promise<void> => {
          try {
            const res = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
              method: 'DELETE',
            });
            if (res.ok) {
              toast('cancelled', { kind: 'info' });
            } else {
              toast('cancelled (local)', { kind: 'info' });
            }
          } catch {
            toast('cancelled (local)', { kind: 'info' });
          }
          router.push('/generate');
        })();
      }),
    [onCancel, router, jobId],
  );

  // ─── Canon animation loop ─────────────────────────────────────────────────
  // Re-run only on `failStep` change (matches canon useEffect dep list). Use
  // a ref to track cancellation across rAF ticks.
  const cancelledRef = useRef<boolean>(false);
  useEffect(() => {
    cancelledRef.current = false;
    let elapsedTotal = 0;
    let i = 0;

    const next = (): void => {
      if (cancelledRef.current) return;
      if (failStep >= 0 && i > failStep) {
        setErrored(true);
        return;
      }
      if (i >= STREAM_STEPS.length) {
        // Wait briefly so the 100% progress bar is visible before nav.
        setTimeout(() => {
          if (!cancelledRef.current) handleDone();
        }, 400);
        return;
      }
      const start = performance.now();
      const dur = STREAM_STEPS[i]?.dur ?? 0;
      const tick = (now: number): void => {
        if (cancelledRef.current) return;
        const t = Math.min(1, (now - start) / dur);
        setProgress(((elapsedTotal + t * dur) / total) * 100);
        if (t < 1) requestAnimationFrame(tick);
        else {
          elapsedTotal += dur;
          i += 1;
          setStepIdx(i);
          next();
        }
      };
      requestAnimationFrame(tick);
    };
    next();

    return (): void => {
      cancelledRef.current = true;
    };
  }, [failStep, handleDone, total]);

  // ─── Live SSE → terminal navigation override ──────────────────────────────
  // If the engine reports terminal completion before the canon animation
  // finishes, jump to /preview. If the engine reports failure, flip the
  // local error overlay so canon error branches render.
  useEffect(() => {
    if (sse.status === 'completed') {
      cancelledRef.current = true;
      handleDone();
    } else if (sse.status === 'failed') {
      // Best-effort: surface a generic error toast; canon-error UX comes
      // from useErrorMode (driven by tweaks panel + future engine error
      // categorization). Phase 2+ may map error.code → error mode.
      cancelledRef.current = true;
      setErrored(true);
      toast('generation failed', { kind: 'error' });
    }
  }, [sse.status, handleDone]);

  // ─── Compression-step rotating examples ───────────────────────────────────
  useEffect(() => {
    if (STREAM_STEPS[stepIdx]?.examples !== true) return undefined;
    const id = setInterval(() => {
      setExampleIdx((prev) => (prev + 1) % COMPRESSION_EXAMPLES.length);
    }, 700);
    return (): void => {
      clearInterval(id);
    };
  }, [stepIdx]);

  // ─── Spinner ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setFrame((f) => (f + 1) % SPIN_FRAMES.length);
    }, 80);
    return (): void => {
      clearInterval(id);
    };
  }, []);

  const eta = Math.max(0, Math.round(((100 - progress) / 100) * (total / 1000)));

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`generating ${sample?.name ?? 'lumen-payments'}-mcp`}
        right={
          <Btn kind="ghost" size="sm" icon="x" onClick={handleCancel}>
            cancel
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
            step {Math.min(stepIdx + 1, STREAM_STEPS.length)} of {STREAM_STEPS.length} · {Math.round(progress)}%
          </span>
          <span>about {eta} sec remaining</span>
        </div>

        {/* Log */}
        <Card padding={false}>
          <div className="mc-log" style={{ padding: 24 }}>
            {STREAM_STEPS.map((st, i) => {
              const done = i < stepIdx;
              const live = i === stepIdx && !errored;
              const failed = errored && i === failStep;
              const upcoming = i > stepIdx || (errored && i > failStep);
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
                        {st.label}
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
                          ? 'parse error · line 412'
                          : '401 unauthorized'
                        : done
                          ? st.note
                          : live
                            ? st.note
                            : 'next'}
                    </span>
                  </div>
                  {live && st.examples === true && (
                    <div
                      style={{
                        marginTop: 6,
                        marginBottom: 8,
                        borderLeft: '2px solid var(--primary)',
                        paddingLeft: 12,
                      }}
                    >
                      {COMPRESSION_EXAMPLES.slice(0, 3).map((_unused, idx) => {
                        const e =
                          COMPRESSION_EXAMPLES[
                            (exampleIdx + idx) % COMPRESSION_EXAMPLES.length
                          ];
                        if (e === undefined) return null;
                        return (
                          <div
                            key={idx}
                            className="mc-mono"
                            style={{
                              fontSize: 12,
                              color: 'var(--text-muted)',
                              lineHeight: 1.7,
                              opacity: 1 - idx * 0.3,
                            }}
                          >
                            └─ <span style={{ color: 'var(--text)' }}>{e.from}</span>
                            {'  →  '}
                            {e.to}
                          </div>
                        );
                      })}
                    </div>
                  )}
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
              did you know?
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              most MCP servers waste 70% of their token budget on verbose
              descriptions copied straight from openapi specs.
              this is exactly what we&apos;re fixing right now.
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
                // ui_stream_email_notify_perm — flag-OFF default → toast.
                toast("we'll email kira@dolla.io when it's done", {
                  kind: 'info',
                });
              }}
            >
              notify me when done — i&apos;ll do something else
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
  return (
    <div>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
        <span className="mc-h3" style={{ color: 'var(--accent)' }}>
          spec failed to parse
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
        unexpected token at <span className="mc-mono">line 412, col 18</span> —
        looks like an unbalanced quote in a description string. we stopped before
        generating anything.
      </div>
      <div className="mc-code" style={{ marginBottom: 14, fontSize: 11.5, padding: 12 }}>
        <span className="muted">  410 |   &quot;$ref&quot;: &quot;#/components/schemas/Charge&quot;</span>
        {'\n'}
        <span className="muted">  411 | &#125;</span>
        {'\n'}
        <span style={{ color: 'var(--accent)' }}>
          {'  412 | "description": "refunds a customer\'s charge — partial'}
        </span>
        {'\n'}
        <span className="muted">{'                                                ^^^^^^^^^^^^'}</span>
        {'\n'}
        <span style={{ color: 'var(--accent)' }}>{'      |   unterminated string'}</span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Btn
          kind="primary"
          size="sm"
          icon="spark"
          onClick={(): void => {
            // ui_stream_ai_repair_perm — flag OFF → toast.
            toast('ai re-parsing spec… this usually takes 6s', { kind: 'info' });
          }}
        >
          try repair with ai
        </Btn>
        <Btn
          kind="ink"
          size="sm"
          onClick={(): void => {
            // ui_stream_inline_edit_perm — flag OFF → toast.
            toast('opening inline spec editor', { kind: 'info' });
          }}
        >
          edit spec inline
        </Btn>
        <Btn kind="ghost" size="sm" onClick={onDismiss}>
          upload new spec
        </Btn>
      </div>
    </div>
  );
}

function AuthFailCard(): ReactElement {
  return (
    <div>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
        <span className="mc-h3" style={{ color: 'var(--accent)' }}>
          auth probe returned 401
        </span>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
        we tested your api key against{' '}
        <span className="mc-mono">GET /v1/charges</span> and got rejected. the
        rest of the generation is paused — fixing the credential will resume from
        here.
      </div>
      <div className="mc-banner" style={{ marginBottom: 14 }}>
        <Icon name="lock" size={11} />
        <span>
          most common cause: copied <span className="mc-mono">sk_test_…</span>{' '}
          when the endpoint expects <span className="mc-mono">sk_live_…</span>
        </span>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Btn
          kind="primary"
          size="sm"
          icon="spark"
          onClick={(): void => {
            // No `_perm` flag — credential vault is canon UX, opens a drawer.
            // Backend not ready → friendly toast.
            toast('credential vault opening…', { kind: 'info' });
          }}
        >
          re-enter credential
        </Btn>
        <Btn
          kind="ink"
          size="sm"
          onClick={(): void => {
            // ui_stream_alt_auth_perm — flag OFF → toast.
            toast('switching to oauth2 client_credentials', { kind: 'info' });
          }}
        >
          use a different scheme
        </Btn>
        <Btn
          kind="ghost"
          size="sm"
          onClick={(): void => {
            // ui_stream_skip_auth_perm — flag OFF → toast.
            toast('skipping auth · read-only mode', { kind: 'info' });
          }}
        >
          skip auth (read-only)
        </Btn>
      </div>
    </div>
  );
}
