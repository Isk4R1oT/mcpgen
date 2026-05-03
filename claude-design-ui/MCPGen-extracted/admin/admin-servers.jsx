// admin-servers.jsx
function ServersScreen({ ctx }) {
  const D = window.ADM_DATA;
  const [sel, setSel] = React.useState(D.servers[7]);
  const [tab, setTab] = React.useState('overview');
  const [showRollback, setShowRollback] = React.useState(false);
  return (
    <div className="adm-split">
      <div className="left">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input className="mc-input mc-mono" placeholder="slug, id, org…" style={{ height: 30, fontSize: 12 }} />
        </div>
        <div style={{ padding: '6px 14px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {['all','live','flagged','incident','suspended','drift'].map(s => <span key={s} className="mc-chip" style={{ height: 24, fontSize: 11, padding: '0 8px' }}>{s}</span>)}
        </div>
        {D.servers.map(s => (
          <div key={s.id} className={`adm-trow ${sel?.id === s.id ? 'sel' : ''}`} style={{ gridTemplateColumns: '1fr auto', padding: '10px 14px' }} onClick={() => setSel(s)}>
            <div className="adm-cell-stack">
              <div className="row" style={{ gap: 6 }}>
                <span className="pri">{s.name}</span>
                {s.drift && <Pill kind="warn" dot={false}>drift</Pill>}
                {s.featured && <Pill kind="ink" dot={false}>featured</Pill>}
              </div>
              <span className="sec">{s.org} · v{s.version} · {s.tools} tools · {s.invocations24}/24h</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {StatusDotForServer(s.status)}
              <div className="sec" style={{ fontSize: 10.5, marginTop: 2 }}>{s.region} · p95 {s.p95}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="right">
        <div className="adm-detail-head">
          <div className="row-bw" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 6 }}>
                <h1 className="adm-page-title" style={{ fontSize: 26 }}>{sel.name}</h1>
                {StatusDotForServer(sel.status)}
                {sel.status === 'incident' && <Pill kind="alert">8.2% errors · investigating</Pill>}
              </div>
              <div className="mc-mono muted" style={{ fontSize: 12 }}>{sel.id} · {sel.org} · v{sel.version} · {sel.tools} tools · {sel.region}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`opening ${sel.name} listing in marketplace…`)}>view in marketplace</Btn>
              <Btn kind="ghost" size="sm" icon="refresh" onClick={() => ctx.showToast(`re-deploy queued · ${sel.name}`)}>force re-publish</Btn>
              <Btn kind="ink" size="sm" onClick={() => setShowRollback(true)}>rollback</Btn>
              <Btn kind="primary" size="sm" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }} onClick={() => ctx.showToast(`takedown queued · ${sel.name}`)}>takedown</Btn>
            </div>
          </div>
        </div>
        <div className="adm-detail-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div><div className="adm-kpi-label">invocations · 24h</div><div className="adm-kpi-num" style={{ fontSize: 20 }}>{sel.invocations24}</div></div>
          <div><div className="adm-kpi-label">p95</div><div className="adm-kpi-num" style={{ fontSize: 20 }}>{sel.p95}</div></div>
          <div><div className="adm-kpi-label">error rate</div><div className="adm-kpi-num" style={{ fontSize: 20, color: parseFloat(sel.errorRate) > 1 ? 'var(--accent)' : 'inherit' }}>{sel.errorRate}</div></div>
          <div><div className="adm-kpi-label">deploys</div><div className="adm-kpi-num" style={{ fontSize: 20 }}>{sel.deploys}</div></div>
          <div><div className="adm-kpi-label">flags</div><div className="adm-kpi-num" style={{ fontSize: 20, color: sel.flags > 0 ? 'var(--accent)' : 'inherit' }}>{sel.flags}</div></div>
        </div>
        <div className="adm-tabs">
          {['overview','tools','deploys','traffic','drift','listing','danger'].map(t => <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}{t === 'drift' && sel.drift && <span className="count" style={{ background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }}>!</span>}</div>)}
        </div>
        <div className="adm-page" style={{ paddingTop: 18 }}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Card>
                <SectionLabel><span>raw entity</span></SectionLabel>
                <div className="mc-code" style={{ fontSize: 11.5 }}>{`{
  "id": "${sel.id}",
  "slug": "${sel.name}",
  "org": "${sel.org}",
  "owner_id": "${sel.ownerId}",
  "version": "${sel.version}",
  "status": "${sel.status}",
  "region": "${sel.region}",
  "tools_count": ${sel.tools},
  "listed": ${sel.listed},
  "featured": ${sel.featured},
  "spec_drift": ${sel.drift}
}`}</div>
              </Card>
              <Card>
                <SectionLabel><span>linked entities</span></SectionLabel>
                <div className="mc-mono" style={{ fontSize: 12, lineHeight: 2 }}>
                  → owner · <a className="adm-link" onClick={() => ctx.setScreen('users')}>{sel.ownerId}</a><br/>
                  → {sel.deploys} deploys · last 2 min ago<br/>
                  → {sel.tools} tools · 3 composite<br/>
                  → marketplace listing · {sel.listed ? 'published' : 'unlisted'}<br/>
                  → 12 evals · last pass-rate 87%
                </div>
              </Card>
              {sel.status === 'incident' && (
                <div className="adm-incident" style={{ gridColumn: '1 / -1' }}>
                  <span className="strong">⚠ ongoing incident</span>
                  <span style={{ flex: 1 }}>upstream timeouts since 14 min ago. auto-rolled back to v1.4.1 in sfo. customer paged.</span>
                  <Btn kind="ghost" size="sm" onClick={() => window.mcpDrawer('runbook · upstream timeout', (
                    <div className="col" style={{ gap: 10, fontSize: 13, lineHeight: 1.6 }}>
                      <div><strong>1. confirm</strong> — check status.acme.com and our edge probes for {sel.name}.</div>
                      <div><strong>2. mitigate</strong> — if upstream confirmed down, flip kill switch <span className="mc-mono">tool-calls/{sel.name}</span> to fallback.</div>
                      <div><strong>3. rollback</strong> — if mitigation insufficient, rollback to v1.4.1 (last good).</div>
                      <div><strong>4. communicate</strong> — page on-call · update status page · broadcast to affected orgs.</div>
                      <div><strong>5. post-incident</strong> — file incident doc within 24h · schedule rca review.</div>
                    </div>
                  ), { eyebrow: 'INC-0742 · ongoing' })}>view runbook</Btn>
                </div>
              )}
            </div>
          )}
          {tab === 'drift' && sel.drift && (
            <Card style={{ maxWidth: 800 }}>
              <SectionLabel><span>spec drift detected · 4 endpoints</span></SectionLabel>
              <div className="adm-diff">
                {[
                  ['del','412','- "POST /v3/orders/{id}/cancel"'],
                  ['add','412','+ "POST /v4/orders/{id}/cancel"'],
                  ['del','088','- "param: order_id (string)"'],
                  ['add','088','+ "param: order_id (string, uuid format)"'],
                ].map((l, i) => <div key={i} className={`adm-diff-line ${l[0]}`}><span className="ln">{l[1]}</span><span>{l[2]}</span></div>)}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <Btn kind="ink" size="sm" onClick={() => ctx.showToast(`force-regenerating ${sel.name} from new spec…`)}>force regenerate</Btn>
                <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`pinned ${sel.name} to old spec · drift suppressed`)}>pin to old spec</Btn>
                <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`owner ${sel.ownerId} notified by email`)}>notify owner</Btn>
              </div>
            </Card>
          )}
          {(tab !== 'overview' && !(tab === 'drift' && sel.drift)) && <EmptyState title={`${tab} — preview only`} sub="full table view in production" />}
        </div>
      </div>
      {showRollback && (
        <div className="mc-modal-veil" onClick={() => setShowRollback(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-head"><span className="mc-h3">rollback {sel.name}</span></div>
            <div className="mc-modal-body">
              <SectionLabel><span>pick a version</span></SectionLabel>
              {[`${sel.version} · current`, '1.4.1 · 14 hr ago', '1.4.0 · 3 days ago', '1.3.7 · 8 days ago'].map((v, i) => (
                <div key={i} className={`mc-radio-row ${i === 1 ? 'sel' : ''}`} style={{ marginBottom: 6 }}>
                  <span className="mc-radio-glyph">{i === 1 ? '◉' : '○'}</span>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>v{v}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{i === 0 ? 'live' : i === 1 ? 'last good · 0 errors at deploy' : ''}</div></div>
                </div>
              ))}
              <div className="adm-approval" style={{ marginTop: 12 }}>active traffic ({sel.invocations24}/24h) will see ~30s of mixed responses during the swap. customer will be notified.</div>
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowRollback(false)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowRollback(false); ctx.showToast(`rolling back ${sel.name} to v1.4.1`); }}>rollback</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.ServersScreen = ServersScreen;
