// screen-playground.jsx — Screen 5: Playground with live trace + run history

const SUGGESTED_PROMPTS = [
  'show last 5 transactions',
  'find account by email rio@example.com',
  'refund charge ch_8a2f',
  'list active plans',
];

// Real-data props (all optional — fall back to canon-shaped defaults for
// snapshot testing / pure-visual storybook):
//   - tools: list of `{ name }` for the locked agent dropdown / trace
//   - history: prior runs from the BFF (history endpoint TBD; default [])
//   - onRunTool({ tool_name, args, prompt }): wired tool-execution callback;
//     wrapper resolves with `{ result, latency_ms, tokens }` so the trace
//     panel can render real metrics. When undefined the locked component
//     uses its visual-only fake-trace path (single FAKE_RESULT row).
function Playground({
  onBack,
  onDeploy,
  sample,
  tools,
  history: historyProp,
  onRunTool,
}) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [traces, setTraces] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const [keyTtl, setKeyTtl] = React.useState(47 * 60);
  // History rail: real history (from prop) when present; empty state
  // otherwise. Newer entries are unshifted as runs complete.
  const seedHistory = Array.isArray(historyProp) ? historyProp : [];
  const [history, setHistory] = React.useState(seedHistory);
  const [historyFilter, setHistoryFilter] = React.useState('all'); // all | tests
  const [activeRunId, setActiveRunId] = React.useState(null);
  const [savedToast, setSavedToast] = React.useState('');

  React.useEffect(() => {
    const id = setInterval(() => setKeyTtl(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtTtl = () => {
    const m = Math.floor(keyTtl / 60);
    const s = keyTtl % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  // Default tool name for visual-fallback path: prefer first prop-supplied
  // tool, then fall back to the locked screen's `list_charges` cue.
  const fallbackToolName =
    Array.isArray(tools) && tools.length > 0 && typeof tools[0]?.name === 'string'
      ? tools[0].name
      : 'list_charges';

  const send = async (text, opts = {}) => {
    if (!text.trim() || running) return;
    setRunning(true);
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');
    setActiveRunId(null);

    if (typeof onRunTool === 'function') {
      const toolName = opts.toolName || fallbackToolName;
      setMessages(m => [...m, { role: 'agent', text: 'running…', tool: toolName }]);
      const t0 = Date.now();
      try {
        const out = await onRunTool({ tool_name: toolName, args: { prompt: text }, prompt: text });
        const elapsed = (out && typeof out.latency_ms === 'number') ? out.latency_ms : (Date.now() - t0);
        const tokens = (out && typeof out.tokens === 'number') ? out.tokens : 0;
        const resultText = (out && typeof out.text === 'string')
          ? out.text
          : (out && out.result !== undefined ? JSON.stringify(out.result, null, 2) : 'done.');
        setTraces(t => [...t, { n: t.length + 1, name: toolName, in: 0, out: tokens, lat: elapsed }]);
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: 'agent', done: true, text: resultText,
            rows: [], totalAmount: '',
          };
          return copy;
        });
        const newId = 'h' + Date.now();
        setHistory(h => [{
          id: newId,
          label: text.length > 40 ? text.slice(0, 38) + '…' : text,
          prompt: text,
          tools: [toolName],
          tk: tokens, ms: elapsed, when: 'just now', savedAsTest: !!opts.test,
        }, ...h].slice(0, 24));
        setActiveRunId(newId);
      } catch (e) {
        setMessages(m => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: 'agent', done: true, text: `error: ${e?.message || String(e)}`,
            rows: [], totalAmount: '',
          };
          return copy;
        });
      } finally {
        setRunning(false);
      }
      return;
    }

    // Visual-only fallback (no wired tool runner — used in storybook /
    // canon snapshots).
    setTimeout(() => {
      setMessages(m => [...m, { role: 'agent', text: 'fetching…', tool: fallbackToolName }]);
    }, 400);

    setTimeout(() => {
      setTraces(t => [...t, { n: t.length + 1, name: fallbackToolName, in: 38, out: 180, lat: 240 }]);
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: 'agent', done: true, text: 'no tool runner attached — connect a wrapper to execute.',
          rows: [], totalAmount: '',
        };
        return copy;
      });
      // Push run to history (newest first)
      const newId = 'h' + Date.now();
      setHistory(h => [{
        id: newId,
        label: text.length > 40 ? text.slice(0, 38) + '…' : text,
        prompt: text,
        tools: [fallbackToolName],
        tk: 0, ms: 240, when: 'just now', savedAsTest: !!opts.test,
      }, ...h].slice(0, 24));
      setActiveRunId(newId);
      setRunning(false);
    }, 1600);
  };

  const replay = (run) => {
    if (running) return;
    setMessages([]);
    setTraces([]);
    send(run.prompt);
  };

  const saveAsTest = (id) => {
    setHistory(h => h.map(r => r.id === id ? { ...r, savedAsTest: true } : r));
    setSavedToast('saved as test');
    setTimeout(() => setSavedToast(''), 1800);
  };

  const filteredHistory = history.filter(r => historyFilter === 'all' || r.savedAsTest);
  const testCount = history.filter(r => r.savedAsTest).length;

  const totalNew = traces.reduce((s, t) => s + t.in + t.out + 1022, 0);
  const totalNaive = traces.length ? totalNew * 3.9 : 0;
  const cost = (totalNew / 1e6 * 15).toFixed(3);
  const naiveCost = (totalNaive / 1e6 * 15).toFixed(3);

  return (
    <div className="mc-screen" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`${sample?.name || 'lumen-payments'}-mcp · playground`}
        onLogo={onBack}
        right={
          <>
            <Btn kind="ghost" size="sm" icon="arrow-l" onClick={onBack}>back to canvas</Btn>
            <Btn kind="primary" size="sm" icon="cloud" onClick={onDeploy}>deploy</Btn>
          </>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr 340px', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
        {/* LEFT: history rail */}
        <aside style={{ borderRight: '1px solid var(--border)', padding: 18, overflowY: 'auto' }}>
          <div className="row-bw" style={{ marginBottom: 10 }}>
            <span className="mc-caption-up">history</span>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>{history.length}</span>
          </div>

          <div className="mc-chiprow" style={{ marginBottom: 12 }}>
            <button className={`mc-chip ${historyFilter === 'all' ? 'active' : ''}`} onClick={() => setHistoryFilter('all')} style={{ height: 26, fontSize: 11 }}>all · {history.length}</button>
            <button className={`mc-chip ${historyFilter === 'tests' ? 'active' : ''}`} onClick={() => setHistoryFilter('tests')} style={{ height: 26, fontSize: 11 }}>tests · {testCount}</button>
          </div>

          <div className="col" style={{ gap: 6 }}>
            {filteredHistory.length === 0 && (
              <div className="muted" style={{ fontSize: 12, fontStyle: 'italic', padding: '14px 6px', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center' }}>
                no saved tests yet. star a run below.
              </div>
            )}
            {filteredHistory.map(r => {
              const isActive = activeRunId === r.id;
              return (
                <div
                  key={r.id}
                  className="mc-card"
                  style={{
                    padding: '10px 12px',
                    borderColor: isActive ? 'var(--border-sharp)' : 'var(--border)',
                    borderRadius: 'var(--radius)',
                    background: isActive ? 'var(--card)' : 'var(--paper)',
                    boxShadow: isActive ? 'var(--shadow)' : 'none',
                    cursor: 'pointer',
                  }}
                  onClick={() => setActiveRunId(r.id)}
                >
                  <div className="row-bw" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                    {r.savedAsTest && <span title="saved as test" style={{ color: 'var(--primary)', fontSize: 12, lineHeight: 1, flexShrink: 0, marginLeft: 4 }}>★</span>}
                  </div>
                  <div className="mc-mono muted" style={{ fontSize: 10.5, marginBottom: 6 }}>
                    {r.tools[0]} · {r.tk} tk · {r.ms}ms · {r.when}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      className="mc-btn mc-btn-ghost mc-btn-sm"
                      onClick={(e) => { e.stopPropagation(); replay(r); }}
                      disabled={running}
                      style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                      title="replay"
                    >
                      <Icon name="play" size={9} /> replay
                    </button>
                    {!r.savedAsTest ? (
                      <button
                        className="mc-btn mc-btn-ghost mc-btn-sm"
                        onClick={(e) => { e.stopPropagation(); saveAsTest(r.id); }}
                        style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                        title="save as test"
                      >
                        ☆ save
                      </button>
                    ) : (
                      <span className="mc-mono muted" style={{ fontSize: 10, padding: '0 6px', alignSelf: 'center' }}>saved</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {testCount > 0 && (
            <div style={{ marginTop: 16, padding: 12, background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              <div className="mc-caption-up" style={{ marginBottom: 6, fontSize: 10 }}>regression suite</div>
              <div className="mc-mono" style={{ fontSize: 11.5, marginBottom: 8, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                run all {testCount} tests on every spec change. fails block auto-regenerate.
              </div>
              <button className="mc-btn mc-btn-ink mc-btn-sm mc-btn-full" style={{ height: 28, fontSize: 11 }} onClick={() => window.mcpToast(`running ${testCount} tests… ~12s`)}>
                <Icon name="play" size={9} /> run suite
              </button>
            </div>
          )}
        </aside>

        {/* MIDDLE: chat */}
        <div style={{ padding: 28, overflowY: 'auto' }}>
          <div className="row-bw" style={{ marginBottom: 18 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="mc-caption-up">agent</span>
              <select className="mc-input mc-mono" style={{ width: 'auto', height: 30, fontSize: 12, padding: '0 28px 0 10px' }} defaultValue="sonnet">
                <option value="sonnet">claude sonnet 4.7 — yours</option>
                <option value="opus">claude opus 4.1 — yours</option>
                <option value="gpt">gpt-5 — yours</option>
              </select>
              <Badge kind="success">connected</Badge>
            </div>
            <div className="mc-caption">streaming · runs on <strong>your</strong> tokens</div>
          </div>

          <SectionLabel>try a prompt</SectionLabel>
          <div className="mc-chiprow" style={{ marginBottom: 24 }}>
            {SUGGESTED_PROMPTS.map(p => (
              <button key={p} className="mc-chip" onClick={() => send(p)}>▸ {p}</button>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <div className="row-bw" style={{ marginBottom: 12 }}>
              <span className="mc-caption-up">conversation</span>
              {messages.length > 0 && activeRunId && (
                <button
                  className="mc-btn mc-btn-ghost mc-btn-sm"
                  onClick={() => saveAsTest(activeRunId)}
                  style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                >
                  ☆ save this run as test
                </button>
              )}
            </div>

            {messages.length === 0 && (
              <div className="muted" style={{ fontSize: 14, padding: 24, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                pick a prompt or type below to start.
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <div className="mc-caption-up" style={{ marginBottom: 4 }}>{m.role}</div>
                {m.role === 'user' && <div style={{ fontSize: 15 }}>{m.text}</div>}
                {m.role === 'agent' && (
                  <div>
                    {!m.done ? (
                      <div className="mc-mono" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        <span className="mc-spin" style={{ display: 'inline-block' }}>⠹</span> {m.text} <span className="acid-text">[{m.tool}]</span>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 15, marginBottom: 8 }}>{m.text}</div>
                        {Array.isArray(m.rows) && m.rows.length > 0 && (
                          <div className="mc-mono" style={{ fontSize: 13.5, lineHeight: 1.7, paddingLeft: 14, borderLeft: '2px solid var(--border)' }}>
                            {m.rows.map(r => (
                              <div key={r.amt}>• {r.amt}  <span className="muted">{r.date}</span></div>
                            ))}
                            {m.totalAmount && (
                              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                                total: <strong>{m.totalAmount}</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <form
              onSubmit={(e) => { e.preventDefault(); send(input); }}
              style={{ display: 'flex', gap: 8, marginTop: 12 }}
            >
              <input
                className="mc-input"
                placeholder="type message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={running}
              />
              <Btn kind="ink" iconR="arrow-r" onClick={() => send(input)} disabled={running || !input.trim()}>send</Btn>
            </form>

            <div className="mc-caption" style={{ marginTop: 14, padding: '8px 12px', background: 'var(--paper-alt)', borderRadius: 'var(--radius)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span><Icon name="lock" size={11} /> using your lumen key · encrypted · deletes in <strong className="mc-mono">{fmtTtl()}</strong></span>
              <a className="mc-link" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => window.mcpToast('credential wiped from this session')}>delete now</a>
            </div>
          </div>
        </div>

        {/* RIGHT: trace */}
        <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--paper-alt)', padding: 24, overflowY: 'auto' }}>
          <SectionLabel>live trace</SectionLabel>

          <div className="mc-trace" style={{ marginBottom: 20 }}>
            <div className="row-bw" style={{ paddingBottom: 8, marginBottom: 8 }}>
              <span className="muted">tools called</span>
              <span><CountUp value={traces.length} /></span>
            </div>
            {traces.length === 0 && (
              <div className="muted" style={{ fontSize: 12, fontStyle: 'italic', padding: '12px 0' }}>nothing yet. send a prompt or replay from history.</div>
            )}
            {traces.map((tr, i) => (
              <div key={i} className="mc-trace-row">
                <div className="mc-trace-name">{i + 1}. {tr.name}</div>
                <div className="mc-trace-meta" style={{ marginLeft: 14, marginTop: 4, lineHeight: 1.7 }}>
                  in: <span style={{ color: 'var(--text)' }}>{tr.in} tk</span><br/>
                  out: <span style={{ color: 'var(--text)' }}>{tr.out} tk</span><br/>
                  ↻ <span style={{ color: 'var(--text)' }}>{tr.lat} ms</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ borderTop: '1px solid var(--border-sharp)', paddingTop: 16, marginTop: 20 }}>
            <SectionLabel>session totals</SectionLabel>
            <div className="mc-mono" style={{ marginBottom: 16 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="muted">this run</span>
                <span><CountUp value={totalNew} /> tk</span>
              </div>
              <div className="row-bw">
                <span className="muted">cost</span>
                <span>${cost}</span>
              </div>
            </div>
            <div className="mc-mono" style={{ marginBottom: 16, opacity: traces.length ? 1 : 0.4 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="muted">same on naive</span>
                <span><CountUp value={Math.round(totalNaive)} /> tk</span>
              </div>
              <div className="row-bw">
                <span className="muted">would cost</span>
                <span>${naiveCost}</span>
              </div>
            </div>

            {traces.length > 0 && (
              <div style={{ padding: 14, background: 'var(--primary)', color: 'var(--primary-ink)', borderRadius: 'var(--radius)', border: '1px solid var(--border-sharp)' }}>
                <div className="mc-caption-up" style={{ color: 'var(--primary-ink)', opacity: .7 }}>saved this session</div>
                <div className="mc-mono" style={{ fontSize: 26, fontWeight: 500, marginTop: 4 }}>
                  ${(naiveCost - cost).toFixed(3)} <span style={{ fontSize: 14 }}>· ↓75%</span>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Tiny toast for "saved as test" */}
      {savedToast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', background: 'var(--ink)', color: 'var(--paper)',
          border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)', fontFamily: 'var(--font-mono)', fontSize: 12.5,
          zIndex: 100, animation: 'mc-fadein .2s',
        }}>
          ★ {savedToast}
        </div>
      )}
    </div>
  );
}

window.Playground = Playground;
