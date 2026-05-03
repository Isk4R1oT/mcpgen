// admin-deploys.jsx
function DeploysScreen({ ctx }) {
  const D = window.ADM_DATA;
  const [showKill, setShowKill] = React.useState(false);
  const [showFlag, setShowFlag] = React.useState(false);
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">deploys & infra</h1>
          <p className="adm-page-sub">edge regions, kill switches, recent rollouts.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" icon="refresh" onClick={() => ctx.showToast('region health resynced')}>resync</Btn>
          <Btn kind="primary" size="sm" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={() => setShowKill(true)}>kill switch</Btn>
        </div>
      </div>
      <Card style={{ marginBottom: 14 }}>
        <SectionLabel><span>edge regions · 8</span><span className="adm-page-sub" style={{ fontSize: 11 }}>3 healthy · 1 degraded · 0 down</span></SectionLabel>
        <div className="adm-region-grid">
          {D.regions.map(r => (
            <div key={r.code} className="adm-region">
              <div className="row-bw" style={{ marginBottom: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{r.code} · {r.city}</span>
                <Pill kind={r.status === 'healthy' ? 'ok' : r.status === 'degraded' ? 'warn' : 'alert'}>{r.status}</Pill>
              </div>
              <div className="muted mc-mono" style={{ fontSize: 11 }}>p95 {r.p95} · err {r.errors} · {r.servers} servers · {r.qps} qps</div>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <Card>
          <SectionLabel><span>recent deploys · 24h</span><a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast('opening full deploy history…')}>view all</a></SectionLabel>
          <Table headers={['time', 'server', 'version', 'status', 'by', '']} rows={D.deploys.map(d => [
            <span className="mc-mono" key="t">{d.time}</span>,
            <span style={{ fontWeight: 600 }} key="s">{d.server}</span>,
            <span className="mc-mono" key="v">{d.from} → <strong>{d.to}</strong></span>,
            <Pill kind={d.status === 'success' ? 'ok' : d.status === 'in-progress' ? 'info' : 'alert'} key="p">{d.status}</Pill>,
            <span className="mc-mono" style={{ fontSize: 11 }} key="b">{d.by}</span>,
            <Btn kind="ghost" size="sm" key="x" onClick={() => ctx.showToast(`rolling back ${d.server} · ${d.from}`)}>rollback</Btn>
          ])} />
        </Card>
        <Card>
          <SectionLabel><span>kill switches</span></SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['accept new signups', true],
              ['accept new server publishes', true],
              ['allow tool invocations · global', true],
              ['allow oauth installs · github', true],
              ['allow stripe charges', true],
            ].map(([l, on], i) => (
              <div key={i} className="row-bw" style={{ padding: '10px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>{l}</span>
                <Toggle on={on} onChange={() => setShowFlag(true)} />
              </div>
            ))}
          </div>
          <div className="adm-approval" style={{ marginTop: 12, fontSize: 12 }}>flipping any switch requires 4-eyes. all flips broadcast to #ops-incident.</div>
        </Card>
      </div>
      {showKill && (
        <div className="mc-modal-veil" onClick={() => setShowKill(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-head"><span className="mc-h3">global kill switch</span><Btn kind="ghost" size="sm" onClick={() => setShowKill(false)}>esc</Btn></div>
            <div className="mc-modal-body">
              <div className="adm-danger">
                <div className="adm-danger-title">⚠ this stops all tool invocations across all regions immediately</div>
                <ul style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                  <li>~1.4M qps will start receiving 503</li>
                  <li>auto-broadcast to #ops-incident, #eng-leads, status page</li>
                  <li>requires 4-eyes (you + 1 more)</li>
                  <li>logged with full context — any caller can subpoena</li>
                </ul>
              </div>
              <div style={{ marginTop: 14 }}>
                <SectionLabel><span>incident reference · required</span></SectionLabel>
                <input className="mc-input mc-mono" placeholder="INC-2025-0742" />
              </div>
              <div style={{ marginTop: 12 }}>
                <SectionLabel><span>type 'kill all invocations' to confirm</span></SectionLabel>
                <input className="mc-input mc-mono" />
              </div>
            </div>
            <div className="mc-modal-foot">
              <span className="mc-mono muted" style={{ fontSize: 11 }}>4-eyes pending · ali → sasha</span>
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ghost" onClick={() => setShowKill(false)}>cancel</Btn>
                <Btn kind="ink" disabled onClick={() => window.mcpToast('approval request sent to sasha · awaiting 2nd hand', { kind: 'warn' })}>request approval</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
      {showFlag && (
        <div className="mc-modal-veil" onClick={() => setShowFlag(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()} style={{ width: 460 }}>
            <div className="mc-modal-head"><span className="mc-h3">request approval to flip</span></div>
            <div className="mc-modal-body">
              <div className="adm-approval">flipping a kill switch is destructive. another admin must confirm. paging on-call (sasha k.).</div>
              <SectionLabel style={{ marginTop: 12 }}><span>reason</span></SectionLabel>
              <textarea className="mc-input" style={{ height: 60, padding: 10 }} placeholder="why now?" />
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowFlag(false)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowFlag(false); ctx.showToast('paged sasha k. · awaiting 2nd approval'); }}>page approver</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.DeploysScreen = DeploysScreen;
