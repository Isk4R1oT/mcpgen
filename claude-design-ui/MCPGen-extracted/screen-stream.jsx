// screen-stream.jsx — Screen 2: generation streaming log

const STREAM_STEPS = [
  { id: 'parse',   label: 'parsed openapi spec',         note: '348 endpoints, 12 cats',     dur: 800 },
  { id: 'auth',    label: 'detected auth strategy',      note: 'oauth + api key',            dur: 900 },
  { id: 'prune',   label: 'pruned deprecated paths',     note: 'removed 14',                 dur: 1100 },
  { id: 'compress',label: 'compressing descriptions',    note: '247 / 348 done',             dur: 4200, examples: true },
  { id: 'cluster', label: 'clustering similar endpoints',note: 'found 12 clusters',          dur: 1600 },
  { id: 'compose', label: 'generating composite tools',  note: '3 created',                  dur: 1400 },
  { id: 'finalize',label: 'finalizing typescript module',note: '4.2 kb minified',            dur: 1000 },
];

const COMPRESSION_EXAMPLES = [
  { from: '"create_charge"',   to: '"charges a customer\'s card."' },
  { from: '"list_charges"',    to: '"lists charges; supports filters."' },
  { from: '"refund_charge"',   to: '"refunds a charge by id."' },
  { from: '"create_customer"', to: '"creates a customer record."' },
  { from: '"update_subscription"', to: '"updates a subscription plan."' },
];

function StreamLog({ onDone, onCancel, sample }) {
  const [errorMode] = window.useErrorMode();
  // Spec-fail / auth-fail freeze the streaming at the relevant step and show
  // a recovery card. Other modes are pass-through (rate-limit / deploy-fail
  // are surfaced on later screens).
  const failStep =
    errorMode === 'spec-fail' ? 0 :
    errorMode === 'auth-fail' ? 1 : -1;

  const [stepIdx, setStepIdx] = React.useState(0);
  const [progress, setProgress] = React.useState(0);
  const [exampleIdx, setExampleIdx] = React.useState(0);
  const [errored, setErrored] = React.useState(false);
  const total = STREAM_STEPS.reduce((s, st) => s + st.dur, 0);

  React.useEffect(() => {
    let cancelled = false;
    let elapsedTotal = 0;
    let i = 0;
    const next = () => {
      if (cancelled) return;
      // Halt at the failing step
      if (failStep >= 0 && i > failStep) {
        setErrored(true);
        return;
      }
      if (i >= STREAM_STEPS.length) {
        setTimeout(() => !cancelled && onDone(), 400);
        return;
      }
      const start = performance.now();
      const dur = STREAM_STEPS[i].dur;
      const tick = (now) => {
        if (cancelled) return;
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
    return () => { cancelled = true; };
  }, [failStep]);

  React.useEffect(() => {
    if (STREAM_STEPS[stepIdx]?.examples) {
      const id = setInterval(() => setExampleIdx(i => (i + 1) % COMPRESSION_EXAMPLES.length), 700);
      return () => clearInterval(id);
    }
  }, [stepIdx]);

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
        crumb={`generating ${sample?.name || 'lumen-payments'}-mcp`}
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
                        ? (failStep === 0 ? 'parse error · line 412' : '401 unauthorized')
                        : done ? st.note : live ? st.note : 'next'}
                    </span>
                  </div>
                  {live && st.examples && (
                    <div style={{ paddingLeft: 24, marginTop: 6, marginBottom: 8, borderLeft: '2px solid var(--primary)', paddingLeft: 12 }}>
                      {COMPRESSION_EXAMPLES.slice(0, 3).map((ex, idx) => {
                        const e = COMPRESSION_EXAMPLES[(exampleIdx + idx) % COMPRESSION_EXAMPLES.length];
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
            {failStep === 0 ? (
              <div>
                <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                  <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
                  <span className="mc-h3" style={{ color: 'var(--accent)' }}>spec failed to parse</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
                  unexpected token at <span className="mc-mono">line 412, col 18</span> — looks like an unbalanced quote in a description string. we stopped before generating anything.
                </div>
                <div className="mc-code" style={{ marginBottom: 14, fontSize: 11.5, padding: 12 }}>
                  <span className="muted">  410 |   "$ref": "#/components/schemas/Charge"</span>{'\n'}
                  <span className="muted">  411 | }</span>{'\n'}
                  <span style={{ color: 'var(--accent)' }}>  412 | "description": "refunds a customer's charge — partial</span>{'\n'}
                  <span className="muted">                                                ^^^^^^^^^^^^</span>{'\n'}
                  <span style={{ color: 'var(--accent)' }}>      |   unterminated string</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn kind="primary" size="sm" icon="spark" onClick={() => window.mcpToast('ai re-parsing spec… this usually takes 6s')}>try repair with ai</Btn>
                  <Btn kind="ink" size="sm" onClick={() => window.mcpToast('opening inline spec editor')}>edit spec inline</Btn>
                  <Btn kind="ghost" size="sm" onClick={onCancel}>upload new spec</Btn>
                </div>
              </div>
            ) : (
              <div>
                <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                  <Icon name="warn" size={14} style={{ color: 'var(--accent)' }} />
                  <span className="mc-h3" style={{ color: 'var(--accent)' }}>auth probe returned 401</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}>
                  we tested your api key against <span className="mc-mono">GET /v1/charges</span> and got rejected. the rest of the generation is paused — fixing the credential will resume from here.
                </div>
                <div className="mc-banner" style={{ marginBottom: 14 }}>
                  <Icon name="lock" size={11} />
                  <span>most common cause: copied <span className="mc-mono">sk_test_…</span> when the endpoint expects <span className="mc-mono">sk_live_…</span></span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn kind="primary" size="sm" icon="spark" onClick={() => window.mcpToast('credential vault opening…')}>re-enter credential</Btn>
                  <Btn kind="ink" size="sm" onClick={() => window.mcpToast('switching to oauth2 client_credentials')}>use a different scheme</Btn>
                  <Btn kind="ghost" size="sm" onClick={() => window.mcpToast('skipping auth · read-only mode')}>skip auth (read-only)</Btn>
                </div>
              </div>
            )}
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
            <Btn kind="ghost" size="sm" icon="bell" onClick={() => window.mcpToast("we'll email kira@dolla.io when it's done")}>notify me when done — i'll do something else</Btn>
          </div>
        )}
      </main>
    </div>
  );
}

window.StreamLog = StreamLog;
