// screen-playground.jsx — Screen 5: Playground with live trace

const SUGGESTED_PROMPTS = [
  'show last 5 transactions',
  'find account by email rio@example.com',
  'refund charge ch_8a2f',
  'list active plans',
];

const FAKE_TRANSACTIONS = [
  { amt: '$42.00',  date: 'apr 23' },
  { amt: '$18.50',  date: 'apr 22' },
  { amt: '$9.99',   date: 'apr 22' },
  { amt: '$204.00', date: 'apr 21' },
  { amt: '$12.00',  date: 'apr 20' },
];

function Playground({ onBack, onDeploy, sample }) {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [traces, setTraces] = React.useState([]);
  const [running, setRunning] = React.useState(false);
  const [keyTtl, setKeyTtl] = React.useState(47 * 60); // 47 minutes in seconds

  React.useEffect(() => {
    const id = setInterval(() => setKeyTtl(t => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  const fmtTtl = () => {
    const m = Math.floor(keyTtl / 60);
    const s = keyTtl % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  const send = (text) => {
    if (!text.trim() || running) return;
    setRunning(true);
    setMessages(m => [...m, { role: 'user', text }]);
    setInput('');

    // simulate streaming
    setTimeout(() => {
      setMessages(m => [...m, { role: 'agent', text: 'fetching…', tool: 'list_charges' }]);
    }, 400);

    setTimeout(() => {
      const total = 1240;
      setTraces(t => [...t, {
        n: t.length + 1,
        name: 'list_charges',
        in: 38, out: 180, lat: 240,
      }]);
      setMessages(m => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: 'agent',
          done: true,
          text: 'last 5 transactions:',
          rows: FAKE_TRANSACTIONS,
          totalAmount: '$286.49',
        };
        return copy;
      });
      setRunning(false);
    }, 1600);
  };

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 0, minHeight: 'calc(100vh - 56px)' }}>
        {/* left: chat */}
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
            <SectionLabel>conversation</SectionLabel>
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
                        <div className="mc-mono" style={{ fontSize: 13.5, lineHeight: 1.7, paddingLeft: 14, borderLeft: '2px solid var(--border)' }}>
                          {m.rows.map(r => (
                            <div key={r.amt}>• {r.amt}  <span className="muted">{r.date}</span></div>
                          ))}
                          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--border)' }}>
                            total: <strong>{m.totalAmount}</strong>
                          </div>
                        </div>
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
              <a className="mc-link" style={{ fontSize: 11 }}>delete now</a>
            </div>
          </div>
        </div>

        {/* right: trace */}
        <aside style={{ borderLeft: '1px solid var(--border)', background: 'var(--paper-alt)', padding: 24, overflowY: 'auto' }}>
          <SectionLabel>live trace</SectionLabel>

          <div className="mc-trace" style={{ marginBottom: 20 }}>
            <div className="row-bw" style={{ paddingBottom: 8, marginBottom: 8 }}>
              <span className="muted">tools called</span>
              <span><CountUp value={traces.length} /></span>
            </div>
            {traces.length === 0 && (
              <div className="muted" style={{ fontSize: 12, fontStyle: 'italic', padding: '12px 0' }}>nothing yet. send a prompt.</div>
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
    </div>
  );
}

if (typeof window !== 'undefined') {
  window.Playground = Playground;
}