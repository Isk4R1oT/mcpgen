// admin-support.jsx
function SupportScreen({ ctx }) {
  const tickets = [
    { id: 't_882', subject: 'oauth callback fails · github org install', from: 'p.alvarez@stripe.com',     org: 'stripe',     status: 'open',    prio: 'p1', age: '14 min', assignee: 'ali m.' },
    { id: 't_881', subject: 'invoice charged twice for september',       from: 'finance@notion.so',         org: 'notion',     status: 'open',    prio: 'p2', age: '1 hr',   assignee: 'jordan p.' },
    { id: 't_880', subject: 'spec drift on /v3/orders/{id}/cancel',      from: 'k.sato@shopify.com',        org: 'shopify',    status: 'pending', prio: 'p2', age: '3 hr',   assignee: 'mira o.' },
    { id: 't_879', subject: 'rate-limit feels too aggressive on free',   from: 'hello@indiehackers.co',     org: 'indie',      status: 'open',    prio: 'p3', age: '5 hr',   assignee: '—' },
    { id: 't_878', subject: 'how do i export gdpr data for an account',  from: 'dpo@linear.app',            org: 'linear',     status: 'pending', prio: 'p3', age: '8 hr',   assignee: 'noor f.' },
    { id: 't_877', subject: 'feature request · per-tool rate limits',    from: 'eng@vercel.com',            org: 'vercel',     status: 'open',    prio: 'p4', age: '1 day',  assignee: '—' },
  ];
  const [sel, setSel] = React.useState(tickets[0]);
  return (
    <div className="adm-split">
      <div className="left">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <input className="mc-input mc-mono" placeholder="search tickets…" style={{ height: 30, fontSize: 12 }} />
        </div>
        <div style={{ padding: '6px 14px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
          {['inbox · 14','assigned to me · 3','p1 · 1','pending','closed'].map(s => <span key={s} className="mc-chip" style={{ height: 24, fontSize: 11, padding: '0 8px' }}>{s}</span>)}
        </div>
        {tickets.map(t => (
          <div key={t.id} className={`adm-trow ${sel?.id === t.id ? 'sel' : ''}`} style={{ gridTemplateColumns: 'auto 1fr auto', padding: '12px 14px' }} onClick={() => setSel(t)}>
            <Pill kind={t.prio === 'p1' ? 'alert' : t.prio === 'p2' ? 'warn' : ''}>{t.prio}</Pill>
            <div className="adm-cell-stack" style={{ minWidth: 0 }}>
              <span className="pri" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</span>
              <span className="sec mc-mono">{t.from} · {t.org}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="mc-mono" style={{ fontSize: 11 }}>{t.age}</span>
              <div className="sec" style={{ fontSize: 10.5 }}>{t.assignee}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="right">
        <div className="adm-detail-head">
          <div className="row-bw" style={{ alignItems: 'flex-start' }}>
            <div>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <span className="mc-mono muted" style={{ fontSize: 12 }}>{sel.id}</span>
                <Pill kind={sel.prio === 'p1' ? 'alert' : 'warn'}>{sel.prio}</Pill>
                <Pill kind="info">{sel.status}</Pill>
              </div>
              <h1 className="adm-page-title" style={{ fontSize: 22, marginBottom: 4 }}>{sel.subject}</h1>
              <div className="muted mc-mono" style={{ fontSize: 12 }}>from <a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => ctx.showToast(`opening profile for ${sel.from}`)}>{sel.from}</a> · org <a className="adm-link" onClick={() => ctx.setScreen('users')}>{sel.org}</a> · {sel.age} ago</div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('assignee picker · ali, jordan, mira, noor…')}>assign…</Btn>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`${sel.id} snoozed for 4h`)}>snooze</Btn>
              <Btn kind="ink" size="sm" onClick={() => ctx.showToast(`${sel.id} resolved · csat survey sent`)}>resolve</Btn>
            </div>
          </div>
        </div>
        <div className="adm-page" style={{ paddingTop: 14, display: 'grid', gridTemplateColumns: '1fr 320px', gap: 14 }}>
          <div>
            <Card style={{ marginBottom: 10 }}>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--ink)', color: 'var(--ink-on)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>PA</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>p. alvarez · stripe</div>
                  <div className="muted mc-mono" style={{ fontSize: 11 }}>{sel.age} ago</div>
                </div>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0, color: 'var(--text)' }}>hey — we just installed the stripe connector for our org and the github oauth callback hangs at "redirecting…" for ~30s then 500s. happens for everyone. we have ~40 ppl waiting to onboard. logs attached.</p>
              <div className="row" style={{ gap: 6, marginTop: 10 }}><span className="mc-chip">📎 oauth-callback.log · 14kb</span><span className="mc-chip">📎 har-export.zip · 240kb</span></div>
            </Card>
            <Card style={{ marginBottom: 10, background: 'var(--surface-soft)' }}>
              <div className="row" style={{ gap: 10, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: 'var(--primary-ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600 }}>AM</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>ali m. · staff</div>
                  <div className="muted mc-mono" style={{ fontSize: 11 }}>2 min ago · internal note</div>
                </div>
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.7, margin: 0 }}>looks like the github redirect_uri whitelist hasn't propagated to lhr edge — checking with @sasha. will impersonate to confirm scope.</p>
            </Card>
            <Card>
              <SectionLabel><span>reply</span><div className="row" style={{ gap: 6 }}><span className="mc-chip">macro: oauth-debug</span><span className="mc-chip">macro: refund-offer</span></div></SectionLabel>
              <textarea className="mc-input" style={{ height: 120, padding: 12 }} placeholder="reply to customer…" />
              <div className="row-bw" style={{ marginTop: 10 }}>
                <div className="row" style={{ gap: 6 }}><Btn kind="ghost" size="sm" icon="paperclip" onClick={() => ctx.showToast('opening file picker…')}>attach</Btn><Btn kind="ghost" size="sm" onClick={() => ctx.showToast('switched to internal note · not visible to customer')}>internal note</Btn></div>
                <div className="row" style={{ gap: 6 }}><Btn kind="ghost" size="sm" onClick={() => ctx.showToast('reply sent · ticket snoozed 24h')}>reply & snooze</Btn><Btn kind="ink" size="sm" onClick={() => ctx.showToast('reply sent to customer')}>send reply</Btn></div>
              </div>
            </Card>
          </div>
          <div>
            <Card style={{ marginBottom: 10 }}>
              <SectionLabel><span>customer</span></SectionLabel>
              <div className="mc-mono" style={{ fontSize: 12, lineHeight: 2 }}>
                <div className="muted">org</div><div><a className="adm-link" onClick={() => ctx.setScreen('users')}>stripe</a> · enterprise</div>
                <div className="muted">mrr</div><div>$8,400 / mo</div>
                <div className="muted">since</div><div>2024-01-14</div>
                <div className="muted">tickets · 90d</div><div>4 · 0 escalated</div>
                <div className="muted">csat</div><div>4.8 / 5 (12 surveys)</div>
              </div>
            </Card>
            <Card>
              <SectionLabel><span>related signals</span></SectionLabel>
              <div className="mc-mono" style={{ fontSize: 12, lineHeight: 1.9 }}>
                → <a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => ctx.setScreen('obs')}>14 errors</a> matching `OauthCallback*` last 1h<br/>
                → flag <span className="mc-chip" style={{ height: 20, fontSize: 10 }}>fl_oauth_lhr_v2</span> rolled out 6h ago<br/>
                → 2 other orgs reporting similar
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
window.SupportScreen = SupportScreen;
