// admin-users.jsx — users & orgs split view

function UsersScreen({ ctx }) {
  const D = window.ADM_DATA;
  const [sel, setSel] = React.useState(D.users[2]);
  const [tab, setTab] = React.useState('overview');
  const [showImp, setShowImp] = React.useState(false);
  const [showSusp, setShowSusp] = React.useState(false);
  const empty = ctx.demoState === 'empty';

  return (
    <div className="adm-split">
      <div className="left">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="mc-input mc-mono" placeholder="email, id, org…" style={{ height: 30, fontSize: 12 }} />
          <Btn kind="ghost" size="sm" onClick={() => window.mcpDrawer('user filters', (
            <div className="col" style={{ gap: 12, fontSize: 13 }}>
              {[['plan', ['free', 'pro', 'enterprise']], ['country', ['US', 'CA', 'GB', 'DE', 'JP', 'BR']], ['mfa', ['enabled', 'disabled']], ['signup', ['<7d', '<30d', '<90d', '>90d']]].map(([k, opts]) => (
                <div key={k}>
                  <div className="adm-kpi-label" style={{ marginBottom: 4 }}>{k}</div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{opts.map(o => <span key={o} className="mc-chip" onClick={() => window.mcpToast(`${k}: ${o}`)} style={{ cursor: 'pointer' }}>{o}</span>)}</div>
                </div>
              ))}
            </div>
          ), { eyebrow: 'narrow user list' })}>filter</Btn>
        </div>
        <div style={{ padding: '6px 14px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
          {['all','active','flagged','suspended','pending'].map(s => (
            <span key={s} className="mc-chip" style={{ height: 24, fontSize: 11, padding: '0 8px' }}>{s}</span>
          ))}
        </div>
        {empty ? <EmptyState title="no users match" /> : D.users.map(u => (
          <div key={u.id} className={`adm-trow ${sel?.id === u.id ? 'sel' : ''}`} style={{ gridTemplateColumns: '1fr auto', padding: '10px 14px' }} onClick={() => setSel(u)}>
            <div className="adm-cell-stack">
              <div className="row" style={{ gap: 6 }}>
                <span className="pri">{u.name}</span>
                {!u.mfa && <Pill kind="warn" dot={false}>no mfa</Pill>}
              </div>
              <span className="sec">{u.email} · {u.org}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {u.status === 'active' && <Pill kind="ok">active</Pill>}
              {u.status === 'flagged' && <Pill kind="warn">flagged</Pill>}
              {u.status === 'suspended' && <Pill kind="alert">suspended</Pill>}
              {u.status === 'pending' && <Pill kind="info">pending</Pill>}
              <div className="sec" style={{ fontSize: 10.5, marginTop: 2 }}>{u.lastSeen}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="right">
        <div className="adm-detail-head">
          <div className="row-bw" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 6 }}>
                <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--primary)', color: 'var(--primary-ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14 }}>{sel.name.split(' ').map(s=>s[0]).join('').slice(0,2).toUpperCase()}</span>
                <h1 className="adm-page-title" style={{ fontSize: 26 }}>{sel.name}</h1>
                {sel.status === 'flagged' && <Pill kind="warn">flagged · 3 chargebacks</Pill>}
                {sel.status === 'suspended' && <Pill kind="alert">suspended</Pill>}
              </div>
              <div className="mc-mono muted" style={{ fontSize: 12 }}>{sel.email} · {sel.id} · {fmtCountry(sel.country)} · joined {sel.created}</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Btn kind="ghost" size="sm" icon="copy" onClick={() => { navigator.clipboard?.writeText(sel.id); ctx.showToast('user id copied'); }}>copy id</Btn>
              <Btn kind="ink" size="sm" icon="eye" onClick={() => setShowImp(true)}>impersonate</Btn>
              <Btn kind="primary" size="sm" onClick={() => setShowSusp(true)}>{sel.status === 'suspended' ? 'unsuspend' : 'suspend'}</Btn>
            </div>
          </div>
        </div>

        <div className="adm-detail-grid">
          <div><div className="adm-kpi-label">plan</div><div className="adm-kpi-num" style={{ fontSize: 18 }}>{sel.plan}</div><div className="mc-mono muted" style={{ fontSize: 11 }}>${sel.spend} / 30d</div></div>
          <div><div className="adm-kpi-label">servers</div><div className="adm-kpi-num" style={{ fontSize: 18 }}>{sel.servers}</div><div className="mc-mono muted" style={{ fontSize: 11 }}>{sel.servers > 0 ? `${Math.round(sel.servers * 0.6)} live · ${sel.servers - Math.round(sel.servers*0.6)} draft` : 'none'}</div></div>
          <div><div className="adm-kpi-label">role · org</div><div className="adm-kpi-num" style={{ fontSize: 18 }}>{sel.role}</div><div className="mc-mono muted" style={{ fontSize: 11 }}>{sel.org} · 4 members</div></div>
        </div>

        <div className="adm-tabs">
          {['overview','servers','sessions','billing','audit','danger'].map(t => (
            <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}</div>
          ))}
        </div>

        <div className="adm-page" style={{ paddingTop: 18 }}>
          {tab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Card>
                <SectionLabel><span>raw entity</span></SectionLabel>
                <div className="mc-code" style={{ fontSize: 11.5 }}>{`{
  "id": "${sel.id}",
  "email": "${sel.email}",
  "org_id": "org_${sel.org}",
  "role": "${sel.role}",
  "status": "${sel.status}",
  "plan": "${sel.plan}",
  "mfa": ${sel.mfa},
  "country": "${sel.country}",
  "created_at": "${sel.created}T08:14:22Z",
  "last_seen_at": "${sel.lastSeen}",
  "stripe_customer": "cus_${sel.id.slice(2)}LXa"
}`}</div>
              </Card>
              <Card>
                <SectionLabel><span>linked entities</span></SectionLabel>
                <div className="mc-mono" style={{ fontSize: 12, lineHeight: 2 }}>
                  → <a className="adm-link" onClick={() => ctx.setScreen('servers')}>{sel.servers} servers</a><br/>
                  → <a className="adm-link" onClick={() => ctx.setScreen('billing')}>2 invoices · 1 overdue</a><br/>
                  → <a className="adm-link" onClick={() => ctx.setScreen('support')}>3 tickets · 1 open</a><br/>
                  → <a className="adm-link" onClick={() => ctx.setScreen('audit')}>14 audit events (30d)</a><br/>
                  → 4 oauth tokens · github, slack, google, microsoft
                </div>
              </Card>
              <Card style={{ gridColumn: '1 / -1' }}>
                <SectionLabel><span>recent sessions</span></SectionLabel>
                <div className="mc-mono" style={{ fontSize: 12 }}>
                  {[
                    ['2 min ago',  'macOS · Chrome 121',  '74.125.x.x · CA',     'active'],
                    ['1 hr ago',   'iOS · Safari',        '203.0.113.x · CA',    'active'],
                    ['3 days ago', 'Windows · Firefox',   '198.51.100.x · US',   'expired'],
                  ].map((r, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr 90px 80px', gap: 12, padding: '8px 0', borderBottom: '1px dashed var(--border)' }}>
                      <span className="muted">{r[0]}</span><span>{r[1]}</span><span className="muted">{r[2]}</span>
                      <Pill kind={r[3] === 'active' ? 'ok' : ''}>{r[3]}</Pill>
                      <a className="adm-link" style={{ textAlign: 'right', cursor: 'pointer' }} onClick={() => ctx.showToast(`session ${i+1} revoked · user signed out`)}>revoke</a>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {tab === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
              <Card>
                <SectionLabel><span>gdpr · data subject rights</span></SectionLabel>
                <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <Btn kind="ink" size="sm" icon="download" onClick={() => ctx.showToast(`gdpr export queued for ${sel.email} · ETA 2 min`)}>export all data</Btn>
                  <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('opening previous exports · 14 records')}>view previous exports</Btn>
                </div>
                <div className="muted" style={{ fontSize: 12 }}>last export: <span className="mc-mono">exp_aa881</span> · 4 hr ago · 14.2 mb · sla 24h</div>
              </Card>
              <div className="adm-danger">
                <div className="adm-danger-title">⚠ destructive · audited · 4-eyes required</div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`password reset email sent to ${sel.email}`)}>force password reset</Btn>
                  <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('all sessions revoked · user must re-authenticate')}>revoke all sessions</Btn>
                  <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('all api keys rotated · user notified by email')}>rotate all api keys</Btn>
                  <Btn kind="ghost" size="sm" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={() => window.mcpToast('confirm: type the email to delete · 4-eyes required', { kind: 'warn' })}>delete account (gdpr)</Btn>
                </div>
              </div>
            </div>
          )}
          {(tab !== 'overview' && tab !== 'danger') && <EmptyState title={`${tab} — coming up`} sub="full table view in production. preview shown on overview." />}
        </div>
      </div>

      {showImp && <ImpersonateModal user={sel} onClose={() => setShowImp(false)} onConfirm={() => { setShowImp(false); ctx.showToast(`impersonating ${sel.email} · session imp_${Math.random().toString(36).slice(2,7)}`); }} />}
      {showSusp && <SuspendModal user={sel} onClose={() => setShowSusp(false)} onConfirm={() => { setShowSusp(false); ctx.showToast(`${sel.status === 'suspended' ? 'unsuspended' : 'suspended'} ${sel.email}`); }} />}
    </div>
  );
}

function ImpersonateModal({ user, onClose, onConfirm }) {
  const [reason, setReason] = React.useState('');
  return (
    <div className="mc-modal-veil" onClick={onClose}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <div className="mc-modal-head"><span className="mc-h3">impersonate {user.name}</span><Btn kind="ghost" size="sm" onClick={onClose}>esc</Btn></div>
        <div className="mc-modal-body">
          <div className="adm-approval">
            <div style={{ marginBottom: 8 }}><strong>this is logged.</strong> the user sees a banner. session expires in 30 min. all your actions are tied to your account in audit.</div>
            <div className="muted">your colleague will be paged for 4-eyes if you take any destructive action while impersonating.</div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SectionLabel><span>reason · required</span></SectionLabel>
            <textarea className="mc-input" style={{ height: 76, padding: 10 }} value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. investigating ticket #t_882 — oauth callback issue" />
          </div>
          <div style={{ marginTop: 12 }}>
            <SectionLabel><span>related ticket</span></SectionLabel>
            <input className="mc-input mc-mono" placeholder="#t_882 (optional)" />
          </div>
        </div>
        <div className="mc-modal-foot">
          <span className="muted mc-mono" style={{ fontSize: 11 }}>session imp_xxxx · 30 min</span>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" onClick={onClose}>cancel</Btn>
            <Btn kind="ink" disabled={!reason} onClick={onConfirm}>start session</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function SuspendModal({ user, onClose, onConfirm }) {
  const suspending = user.status !== 'suspended';
  const [reason, setReason] = React.useState('');
  const [notify, setNotify] = React.useState(true);
  return (
    <div className="mc-modal-veil" onClick={onClose}>
      <div className="adm-modal" onClick={e => e.stopPropagation()}>
        <div className="mc-modal-head"><span className="mc-h3">{suspending ? 'suspend' : 'unsuspend'} {user.name}</span><Btn kind="ghost" size="sm" onClick={onClose}>esc</Btn></div>
        <div className="mc-modal-body">
          {suspending && (
            <div className="adm-danger" style={{ marginBottom: 14 }}>
              <div className="adm-danger-title">⚠ this will</div>
              <ul style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>revoke all active sessions ({user.servers} servers will keep running but stop accepting new traffic)</li>
                <li>disable api keys</li>
                <li>send an email to {user.email}</li>
                <li>mark org as suspended in billing</li>
              </ul>
            </div>
          )}
          <SectionLabel><span>reason · required</span></SectionLabel>
          <select className="mc-input mc-mono" style={{ marginBottom: 8 }}>
            <option>card chargebacks</option><option>tos violation · spam</option><option>tos violation · abuse</option>
            <option>security · suspected compromise</option><option>billing · failed payments</option><option>other (specify below)</option>
          </select>
          <textarea className="mc-input" style={{ height: 60, padding: 10 }} value={reason} onChange={e=>setReason(e.target.value)} placeholder="additional context" />
          <div style={{ marginTop: 10 }}>
            <Toggle on={notify} onChange={setNotify} label="send notification email" />
          </div>
        </div>
        <div className="mc-modal-foot">
          <span className="muted mc-mono" style={{ fontSize: 11 }}>logged · diff in audit</span>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" onClick={onClose}>cancel</Btn>
            <Btn kind="ink" onClick={onConfirm}>confirm {suspending ? 'suspend' : 'unsuspend'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

window.UsersScreen = UsersScreen;
