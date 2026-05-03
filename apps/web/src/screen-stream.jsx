// screen-stream.jsx — Screen 2: generation streaming log

// M-4 FLOW: Stream steps mirror the 7 visible stages of the engine pipeline
// (A=parse, B=architect, then 4 inner Author/Shape passes, then E=codegen).
// SSE drives `stepIdx` via `currentStage`; `note` is filled from
// partial_result.note when the engine emits one, otherwise default copy.
const STREAM_STEPS = [
  { id: 'parse',   stage: 'A',  label: 'parsed openapi spec',         note: '' },
  { id: 'auth',    stage: 'B',  label: 'detected auth strategy',      note: '' },
  { id: 'prune',   stage: 'C',  label: 'pruned deprecated paths',     note: '' },
  { id: 'compress',stage: 'C',  label: 'compressing descriptions',    note: '', examples: true },
  { id: 'cluster', stage: 'D',  label: 'clustering similar endpoints',note: '' },
  { id: 'compose', stage: 'E',  label: 'generating composite tools',  note: '' },
  { id: 'finalize',stage: 'F1', label: 'finalizing typescript module',note: '' },
];

// Map SSE stage code → step index (highest stage seen wins).
const STAGE_TO_STEP = {
  A: 0,
  B: 1,
  C: 3,
  D: 4,
  E: 5,
  F1: 6,
  F2: 6,
  F3: 6,
  validation_complete: 7,
  completed: 7,
};

function StreamLog({ onDone, onCancel, sample, events, cacheHit, currentStage }) {
  // Determine current step from SSE `currentStage`. Falls back to 0 when no
  // events have arrived yet (loading state).
  const stepIdx = React.useMemo(() => {
    if (typeof currentStage === 'string' && currentStage in STAGE_TO_STEP) {
      return STAGE_TO_STEP[currentStage];
    }
    return 0;
  }, [currentStage]);

  // Detect terminal failure from an event with status === 'error' or
  // stage === 'failed'. Surface the same recovery UI the design demo had.
  const failedEvent = React.useMemo(() => {
    if (!Array.isArray(events)) return null;
    return events.find((e) => e && (e.status === 'error' || e.stage === 'failed'));
  }, [events]);
  const errored = Boolean(failedEvent);
  // Best-effort mapping of failure to the step that owned it. Engine emits
  // `stage` on the failed event; map back via STAGE_TO_STEP, default 0.
  const failStep = errored
    ? (STAGE_TO_STEP[failedEvent?.stage] ?? 0)
    : -1;

  // Progress bar: linear by step index. With 7 steps + completion, each
  // completed step = 100/7 % progress.
  const progress = Math.min(100, (stepIdx / STREAM_STEPS.length) * 100);
  // Total duration (for ETA) — engine runs ~30–60s; estimate 8s per remaining step.
  const total = (STREAM_STEPS.length - stepIdx) * 8 * 1000;

  React.useEffect(() => {
    if (currentStage === 'completed' || currentStage === 'validation_complete') {
      const id = setTimeout(() => onDone && onDone(), 400);
      return () => clearTimeout(id);
    }
  }, [currentStage, onDone]);

  // Compression examples — sourced from event partial_result when the engine
  // surfaces them; empty otherwise. No mock fallback (per §6.2).
  const compressionExamples = React.useMemo(() => {
    if (!Array.isArray(events)) return [];
    const examples = [];
    for (const e of events) {
      const ex = e?.partial_result?.compression_examples;
      if (Array.isArray(ex)) examples.push(...ex);
    }
    return examples;
  }, [events]);
  const [exampleIdx, setExampleIdx] = React.useState(0);
  React.useEffect(() => {
    if (STREAM_STEPS[stepIdx]?.examples && compressionExamples.length > 0) {
      const id = setInterval(() => setExampleIdx(i => (i + 1) % compressionExamples.length), 700);
      return () => clearInterval(id);
    }
  }, [stepIdx, compressionExamples.length]);

  const eta = Math.max(0, Math.round(((100 - progress) / 100) * (total / 1000)));
  const spinFrames = ['⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
  const [frame, setFrame] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % spinFrames.length), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`generating ${sample?.name || 'spec'}-mcp${cacheHit ? ' · cache hit' : ''}`}
        right={<Btn kind="ghost" size="sm" icon="x" onClick={onCancel}>cancel</Btn>}
      />

      <main style={{ maxWidth: 880, margin: '0 auto', padding: '40px 28px', position: 'relative', zIndex: 2 }}>
        <div className="mc-progress" style={{ marginBottom: 8 }}>
          <div style={{ width: progress + '%' }} />
        </div>
        <div className="row-bw mc-mono" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 28 }}>
          <span>step {Math.min(stepIdx + 1, STREAM_STEPS.length)} of {STREAM_STEPS.length} · {Math.round(progress)}%</span>
          <span>about {eta} sec remaining</span>
        </div>

        {/* Log */}
        <Card padding={false}>
          <div className="mc-log" style={{ padding: 24 }}>
            {STREAM_STEPS.map((st, i) => {
              const done = i < stepIdx;
              const live = i === stepIdx && !errored;
              const failed = errored && i === failStep;
              const next = i > stepIdx || (errored && i > failStep);
              return (
                <div key={st.id}>
                  <div className="row-bw" style={{ alignItems: 'baseline' }}>
                    <span>
                      {done && <span className="ok">✓ </span>}
                      {live && <span className="live mc-mono">{spinFrames[frame]} </span>}
                      {failed && <span style={{ color: 'var(--accent)' }}>✕ </span>}
                      {next && <span className="next">· </span>}
                      <span className={next ? 'next' : ''} style={{ color: failed ? 'var(--accent)' : undefined, fontWeight: failed ? 600 : undefined }}>{st.label}</span>
                    </span>
                    <span className={`mc-mono ${next ? 'next' : 'muted'}`} style={{ fontSize: 12, color: failed ? 'var(--accent)' : undefined }}>
                      {failed
                        ? (failedEvent?.error?.code || failedEvent?.error?.message || 'failed')
                        : done ? st.note : live ? st.note : 'next'}
                    </span>
                  </div>
                  {live && st.examples && compressionExamples.length > 0 && (
                    <div style={{ paddingLeft: 24, marginTop: 6, marginBottom: 8, borderLeft: '2px solid var(--primary)', paddingLeft: 12 }}>
                      {compressionExamples.slice(0, 3).map((_, idx) => {
                        const e = compressionExamples[(exampleIdx + idx) % compressionExamples.length];
                        return (
                          <div key={idx} className="mc-mono" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, opacity: 1 - idx * 0.3 }}>
                            └─ <span style={{ color: 'var(--text)' }}>{e.from}</span>  →  {e.to}
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
          <Card style={{ marginTop: 24, borderColor: 'var(--accent)', borderLeftWidth: 4 }}>
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
                <span className="mc-h3" style={{ color: 'var(--accent)' }}>
                  generation failed{failedEvent?.error?.code ? ` · ${failedEvent.error.code}` : ''}
                </span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
                {failedEvent?.error?.message || 'the engine reported an error during this stage. fix the upstream spec or credentials and try again.'}
              </div>
              {typeof failedEvent?.error?.retry_after_seconds === 'number' && (
                <div className="mc-banner" style={{ marginBottom: 14 }}>
                  <Icon name="lock" size={11} />
                  <span>retry after {failedEvent.error.retry_after_seconds}s</span>
                </div>
              )}
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ghost" size="sm" onClick={onCancel}>start over</Btn>
              </div>
            </div>
          </Card>
        )}

        {/* Did you know */}
        {!errored && (
          <div style={{ marginTop: 24, padding: 20, border: '1px dashed var(--border-sharp)', borderRadius: 'var(--radius)', background: 'var(--paper-alt)' }}>
            <div className="mc-caption-up" style={{ marginBottom: 8 }}>did you know?</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>
              most MCP servers waste 70% of their token budget on verbose
              descriptions copied straight from openapi specs.
              this is exactly what we're fixing right now.
            </div>
          </div>
        )}

        {!errored && (
          <div style={{ marginTop: 20, textAlign: 'center' }}>
            <Btn kind="ghost" size="sm" icon="bell" onClick={() => window.mcpToast("we'll email you when it's done")}>notify me when done — i'll do something else</Btn>
          </div>
        )}
      </main>
    </div>
  );
}

window.StreamLog = StreamLog;
