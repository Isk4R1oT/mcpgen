// admin-obs.jsx
function ObservabilityScreen({ ctx }) {
  const [tab, setTab] = React.useState('errors');
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">observability</h1>
          <p className="adm-page-sub">errors, latency, traces. last 24h.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <span className="mc-chip">live</span>
          <Btn kind="ghost" size="sm" icon="filter" onClick={() => window.mcpDrawer('observability filters', (
            <div className="col" style={{ gap: 12, fontSize: 13 }}>
              {[['env', ['prod', 'staging', 'dev']], ['region', ['all', 'sfo', 'cdg', 'fra', 'sin', 'lhr']], ['service', ['all', 'gateway', 'runtime', 'auth', 'webhooks']]].map(([k, opts]) => (
                <div key={k}>
                  <div className="adm-kpi-label" style={{ marginBottom: 4 }}>{k}</div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{opts.map(o => <button key={o} className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => window.mcpToast(`${k}: ${o}`)} style={{ fontSize: 11 }}>{o}</button>)}</div>
                </div>
              ))}
            </div>
          ), { eyebrow: 'narrow scope' })}>env: prod</Btn>
          <Btn kind="ink" size="sm" icon="external" onClick={() => window.mcpToast('opening datadog · mcpgen-prod dashboard')}>open in datadog</Btn>
        </div>
      </div>
      <div className="adm-grid">
        {[['errors · 24h', '4,210', '0.18% of requests'], ['p95 · global', '742 ms', 'sla 1500 ms'], ['p99 · global', '1.8 s', '↑ 84 ms wow'], ['saturated regions', '1', 'lhr · cpu 78%']].map(([l, v, s], i) => (
          <Card key={i}><div className="adm-kpi-label">{l}</div><div className="adm-kpi-num">{v}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{s}</div></Card>
        ))}
      </div>
      <div className="adm-tabs" style={{ marginTop: 16 }}>
        {['errors','latency','traces','sessions'].map(t => <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      {tab === 'errors' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>top error groups</span><span className="adm-page-sub" style={{ fontSize: 11 }}>grouped by stack hash</span></SectionLabel>
          <Table headers={['type', 'message', 'count · 24h', 'first seen', 'owner', '']} rows={[
            ['UpstreamTimeoutError', 'request to api.acme.com timed out after 30s', <span className="mc-mono" key="c" style={{ color: 'var(--accent)' }}>1,841</span>, '14 min ago', 'sasha k.', <Btn kind="ghost" size="sm" key="b" onClick={() => ctx.showToast('UpstreamTimeoutError silenced · 24h')}>silence</Btn>],
            ['SchemaValidationError', 'param `order_id` failed uuid format', <span className="mc-mono" key="c">412</span>, '2 hr ago', 'jordan p.', <Btn kind="ghost" size="sm" key="b" onClick={() => ctx.showToast('SchemaValidationError silenced · 24h')}>silence</Btn>],
            ['RateLimitExceeded', '429 from anthropic · pool tool-calls/std', <span className="mc-mono" key="c">288</span>, '6 hr ago', 'mira o.', <Btn kind="ghost" size="sm" key="b" onClick={() => ctx.showToast('RateLimitExceeded silenced · 24h')}>silence</Btn>],
            ['OauthTokenRevoked', 'github token revoked by user · u_4f81', <span className="mc-mono" key="c">142</span>, '11 hr ago', '—', <Btn kind="ghost" size="sm" key="b" onClick={() => ctx.showToast('OauthTokenRevoked silenced · 24h')}>silence</Btn>],
            ['DatabaseConnectionError', 'pool exhausted · region lhr', <span className="mc-mono" key="c">71</span>, '1 day ago', 'on-call', <Btn kind="ghost" size="sm" key="b" onClick={() => ctx.showToast('DatabaseConnectionError silenced · 24h')}>silence</Btn>],
          ]} />
        </Card>
      )}
      {tab !== 'errors' && <Card style={{ marginTop: 14 }}><EmptyState title={`${tab} — preview only`} /></Card>}
    </div>
  );
}
window.ObservabilityScreen = ObservabilityScreen;
