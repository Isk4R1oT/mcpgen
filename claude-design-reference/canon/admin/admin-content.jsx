// admin-content.jsx
function ContentScreen({ ctx }) {
  const [tab, setTab] = React.useState('docs');
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">content</h1>
          <p className="adm-page-sub">docs, marketplace listings, email & in-app templates.</p>
        </div>
        <div className="row" style={{ gap: 8 }}><Btn kind="ghost" size="sm" onClick={() => window.mcpToast('opening edit history…')}>history</Btn><Btn kind="ink" size="sm" onClick={() => window.mcpToast(`new ${tab} draft created`)}>+ new</Btn></div>
      </div>
      <div className="adm-tabs">
        {['docs','listings','email','in-app','status page'].map(t => <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      {tab === 'docs' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>doc pages · 142</span><div className="row" style={{ gap: 6 }}><span className="mc-chip">all</span><span className="mc-chip">published</span><span className="mc-chip">draft · 8</span></div></SectionLabel>
          <Table headers={['path', 'title', 'state', 'updated', 'by']} rows={[
            [<span className="mc-mono" key="p">/docs/quickstart</span>, 'quickstart · publish your first server', <Pill kind="ok" key="s">published</Pill>, '2 hr ago', 'noor f.'],
            [<span className="mc-mono" key="p">/docs/auth/oauth</span>, 'oauth providers', <Pill kind="ok" key="s">published</Pill>, '1 day ago', 'mira o.'],
            [<span className="mc-mono" key="p">/docs/billing/usage</span>, 'usage-based pricing', <Pill kind="warn" key="s">draft</Pill>, '14 min ago', 'jordan p.'],
            [<span className="mc-mono" key="p">/docs/spec-drift</span>, 'how spec drift detection works', <Pill kind="ok" key="s">published</Pill>, '3 days ago', 'mira o.'],
            [<span className="mc-mono" key="p">/docs/runbooks/incident</span>, 'incident response · internal', <Pill kind="info" key="s">internal</Pill>, '8 hr ago', 'sasha k.'],
          ]} />
        </Card>
      )}
      {tab === 'email' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <Card>
            <SectionLabel><span>templates · 28</span></SectionLabel>
            {[
              ['account-suspended', 'sent 14× / 30d',  'last edit 6 days ago'],
              ['payment-failed',    'sent 184× / 30d', 'last edit 2 days ago'],
              ['payment-failed-2',  'sent 71× / 30d',  'last edit 2 days ago'],
              ['gdpr-export-ready', 'sent 4× / 30d',   'last edit 14 days ago'],
              ['oauth-token-revoked', 'sent 41× / 30d','last edit 3 days ago'],
              ['welcome-pro',       'sent 88× / 30d',  'last edit 1 month ago'],
            ].map(([n, c, e], i) => (
              <div key={i} className={`adm-trow ${i === 1 ? 'sel' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
                <div className="adm-cell-stack"><span className="pri" style={{ fontFamily: 'JetBrains Mono, monospace' }}>{n}</span><span className="sec mc-mono">{c} · {e}</span></div>
                <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`opening ${n} editor`)}>edit</Btn>
              </div>
            ))}
          </Card>
          <Card>
            <SectionLabel><span>preview · payment-failed</span><div className="row" style={{ gap: 6 }}><span className="mc-chip">html</span><span className="mc-chip">plain</span></div></SectionLabel>
            <div style={{ background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 6, padding: 18, fontSize: 13.5, lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>your payment didn't go through</div>
              <p style={{ margin: '0 0 10px' }}>hi {`{{first_name}}`} —</p>
              <p style={{ margin: '0 0 10px' }}>we couldn't charge {`{{card_last4}}`} for your {`{{plan_name}}`} subscription on {`{{attempt_date}}`}. usually this is a temporary issue.</p>
              <p style={{ margin: '0 0 14px' }}>your servers are still running. update your payment method by {`{{deadline}}`} to avoid interruption.</p>
              <div style={{ display: 'inline-block', padding: '8px 14px', background: 'var(--ink)', color: 'var(--ink-on)', borderRadius: 4, fontWeight: 600, fontSize: 13 }}>update payment method →</div>
              <p style={{ margin: '14px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>we'll try again {`{{next_retry_human}}`}.</p>
            </div>
            <div className="row-bw" style={{ marginTop: 10 }}>
              <span className="muted mc-mono" style={{ fontSize: 11 }}>variables: 6 · subject test pass: 87/100</span>
              <div className="row" style={{ gap: 6 }}><Btn kind="ghost" size="sm" onClick={() => ctx.showToast('test sent to ali@mcpgen.dev')}>send test</Btn><Btn kind="ink" size="sm" onClick={() => ctx.showToast('opening payment-failed in editor')}>edit</Btn></div>
            </div>
          </Card>
        </div>
      )}
      {(tab === 'listings' || tab === 'in-app' || tab === 'status page') && <Card style={{ marginTop: 14 }}><EmptyState title={`${tab} — preview only`} /></Card>}
    </div>
  );
}
window.ContentScreen = ContentScreen;
