// admin-integrations.jsx
function IntegrationsScreen({ ctx }) {
  const [tab, setTab] = React.useState('oauth');
  const [showRotate, setShowRotate] = React.useState(false);
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">integrations</h1>
          <p className="adm-page-sub">oauth providers, webhooks, secrets. rotate quarterly.</p>
        </div>
        <Btn kind="ink" size="sm" onClick={() => window.mcpDrawer('add oauth provider', (
          <div className="col" style={{ gap: 12, fontSize: 13 }}>
            <div className="adm-kpi-label">provider</div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{['linear','jira','figma','airtable','custom…'].map(p => <span key={p} className="mc-chip" onClick={() => window.mcpToast(`scaffold for ${p} created`)} style={{ cursor: 'pointer' }}>{p}</span>)}</div>
            <div className="adm-kpi-label">client id</div>
            <input className="mc-input mc-mono" placeholder="abc123-..." style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
            <div className="adm-kpi-label">client secret</div>
            <input className="mc-input mc-mono" type="password" placeholder="••••••••" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
            <div className="adm-kpi-label">scopes</div>
            <input className="mc-input mc-mono" placeholder="read:user, email" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
            <Btn kind="ink" size="sm" full onClick={() => window.mcpToast('provider added · secret encrypted in kms')}>add provider</Btn>
          </div>
        ), { eyebrow: 'oauth 2.0' })}>+ add provider</Btn>
      </div>
      <div className="adm-tabs">
        {['oauth','webhooks','secrets','smtp','dns'].map(t => <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      {tab === 'oauth' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>oauth providers · 6</span></SectionLabel>
          <Table headers={['provider', 'client id', 'scopes', 'tokens', 'last rotated', '']} rows={[
            ['github',     <span key="c" className="mc-mono" style={{ fontSize: 12 }}>Iv1.8a91qp4f3c2e</span>, 'read:user, user:email', '4,201', '14 days ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('github oauth rotated · 24h overlap')}>rotate</Btn>],
            ['google',     <span key="c" className="mc-mono" style={{ fontSize: 12 }}>4f81-x4qp.apps…</span>,  'openid, email, profile', '8,402', '21 days ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('google oauth rotated · 24h overlap')}>rotate</Btn>],
            ['slack',      <span key="c" className="mc-mono" style={{ fontSize: 12 }}>9442891.4f81qp4f</span>, 'chat:write, channels:read', '1,184', <span className="mc-mono" style={{ color: 'var(--accent)' }}>91 days ago</span>, <Btn key="x" kind="ink" size="sm" onClick={() => setShowRotate(true)}>rotate</Btn>],
            ['microsoft',  <span key="c" className="mc-mono" style={{ fontSize: 12 }}>8a91-qp4f-3c2e…</span>,  'openid, email', '742', '8 days ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('microsoft oauth rotated · 24h overlap')}>rotate</Btn>],
            ['discord',    <span key="c" className="mc-mono" style={{ fontSize: 12 }}>112488210442…</span>,    'identify, email', '88', '34 days ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('discord oauth rotated · 24h overlap')}>rotate</Btn>],
            ['notion',     <span key="c" className="mc-mono" style={{ fontSize: 12 }}>secret_8a91qp4f…</span>, 'read_content, update_content', '414', '12 days ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('notion oauth rotated · 24h overlap')}>rotate</Btn>],
          ]} />
        </Card>
      )}
      {tab === 'webhooks' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>outgoing webhooks · 9</span><Btn kind="ghost" size="sm" onClick={() => window.mcpToast('opening webhook editor…')}>+ add</Btn></SectionLabel>
          <Table headers={['url', 'events', 'success · 24h', 'last delivery', '']} rows={[
            [<span key="u" className="mc-mono" style={{ fontSize: 11.5 }}>https://hooks.slack.com/services/T0… (#ops-incident)</span>, 'incident.*, killswitch.*', '100%', '2 min ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('opening slack webhook · incident channel')}>edit</Btn>],
            [<span key="u" className="mc-mono" style={{ fontSize: 11.5 }}>https://api.acme.com/webhooks/billing</span>, 'invoice.failed, refund.issued', <span className="mc-mono" style={{ color: 'var(--warn)' }}>92%</span>, '14 min ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('opening acme billing webhook · 7 retries pending')}>edit</Btn>],
            [<span key="u" className="mc-mono" style={{ fontSize: 11.5 }}>https://internal.observe.co/ingest</span>, 'audit.*', '100%', '8 sec ago', <Btn key="x" kind="ghost" size="sm" onClick={() => ctx.showToast('opening observe.co audit ingest webhook')}>edit</Btn>],
          ]} />
        </Card>
      )}
      {tab === 'secrets' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>secrets · 14</span><span className="adm-page-sub mc-mono" style={{ fontSize: 11 }}>kms · aws-east-1</span></SectionLabel>
          <Table headers={['key', 'last access', 'rotated', 'envs', '']} rows={[
            [<span key="k" className="mc-mono">STRIPE_SECRET_KEY</span>, '4 sec ago', '14 days ago', 'prod', <Btn key="x" kind="ghost" size="sm" onClick={() => window.mcpToast('reveal logged · reason required', { kind: 'warn' })}>reveal</Btn>],
            [<span key="k" className="mc-mono">ANTHROPIC_API_KEY</span>, '12 sec ago', '6 days ago', 'prod, staging', <Btn key="x" kind="ghost" size="sm" onClick={() => window.mcpToast('reveal logged · reason required', { kind: 'warn' })}>reveal</Btn>],
            [<span key="k" className="mc-mono">SENDGRID_API_KEY</span>, '4 min ago', <span style={{ color: 'var(--accent)' }} className="mc-mono">112 days ago</span>, 'prod', <Btn key="x" kind="ink" size="sm" onClick={() => ctx.showToast('rotation queued · old key valid 24h')}>rotate now</Btn>],
            [<span key="k" className="mc-mono">DATABASE_URL_PRIMARY</span>, '0 sec ago', '34 days ago', 'prod', <Btn key="x" kind="ghost" size="sm" onClick={() => window.mcpToast('reveal logged · reason required', { kind: 'warn' })}>reveal</Btn>],
            [<span key="k" className="mc-mono">JWT_SIGNING_KEY</span>, '2 sec ago', '8 days ago', 'prod, staging', <Btn key="x" kind="ghost" size="sm" onClick={() => window.mcpToast('reveal logged · reason required', { kind: 'warn' })}>reveal</Btn>],
          ]} />
          <div className="adm-approval" style={{ marginTop: 12 }}>revealing a secret is logged with reason. rotation can be scheduled with overlap window — old key valid for 24h after new key issued.</div>
        </Card>
      )}
      {(tab === 'smtp' || tab === 'dns') && <Card style={{ marginTop: 14 }}><EmptyState title={`${tab} — preview only`} /></Card>}
      {showRotate && (
        <div className="mc-modal-veil" onClick={() => setShowRotate(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-head"><span className="mc-h3">rotate · slack oauth secret</span></div>
            <div className="mc-modal-body">
              <div className="adm-approval">a new secret will be issued. old secret remains valid for an overlap window so existing tokens keep working.</div>
              <div style={{ marginTop: 12 }}>
                <SectionLabel><span>overlap window</span></SectionLabel>
                <div className="row" style={{ gap: 6 }}>{['1h','6h','24h','7d'].map((w, i) => <span key={w} className="mc-chip" style={{ background: i === 2 ? 'var(--ink)' : 'var(--surface)', color: i === 2 ? 'var(--ink-on)' : 'var(--text)', borderColor: i === 2 ? 'var(--ink)' : 'var(--border)' }}>{w}</span>)}</div>
              </div>
              <div style={{ marginTop: 12 }}>
                <SectionLabel><span>reason</span></SectionLabel>
                <textarea className="mc-input" style={{ height: 50, padding: 10 }} placeholder="quarterly rotation per soc2-cc-7.2" />
              </div>
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowRotate(false)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowRotate(false); ctx.showToast('rotation queued · old secret valid 24h'); }}>rotate</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.IntegrationsScreen = IntegrationsScreen;
