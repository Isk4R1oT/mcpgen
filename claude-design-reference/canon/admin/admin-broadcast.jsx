// admin-broadcast.jsx
function BroadcastScreen({ ctx }) {
  const [audience, setAudience] = React.useState('plan_pro');
  const [chKind, setChKind] = React.useState('email');
  const [showSend, setShowSend] = React.useState(false);
  const audiences = [
    { id: 'all',         label: 'all users',                count: 48210 },
    { id: 'plan_pro',    label: 'plan = pro or team',       count: 8842  },
    { id: 'plan_ent',    label: 'plan = enterprise',        count: 142   },
    { id: 'failed_pay',  label: 'failed payment last 7d',   count: 184   },
    { id: 'incident',    label: 'affected by INC-0742',     count: 4201  },
    { id: 'custom',      label: 'custom segment…',          count: 0     },
  ];
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">broadcast composer</h1>
          <p className="adm-page-sub">incident comms, product news, scheduled sends. requires 2 approvers.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('draft saved · ali · just now')}>save draft</Btn>
          <Btn kind="ghost" size="sm" onClick={() => window.mcpDrawer('broadcast history', (
            <div className="col" style={{ gap: 8 }}>
              {[
                ['oauth installs disruption', 'sent', '4,201 recipients', 'oct 14, 15:02'],
                ['scheduled maintenance · syd', 'sent', '48,210', 'oct 12, 09:00'],
                ['feature: drift detection', 'sent', '8,842 (pro+)', 'oct 7, 11:30'],
                ['eu data residency', 'draft', '—', 'noor · not sent'],
              ].map(([t, st, r, d], i) => (
                <div key={i} className="row" style={{ gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
                    <div className="muted mc-mono" style={{ fontSize: 11 }}>{r} · {d}</div>
                  </div>
                  <Pill kind={st === 'sent' ? 'ok' : 'info'}>{st}</Pill>
                </div>
              ))}
            </div>
          ), { eyebrow: 'last 30 days' })}>history</Btn>
          <Btn kind="ink" size="sm" onClick={() => setShowSend(true)}>request approval</Btn>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card>
            <SectionLabel><span>1 · audience</span><span className="mc-mono muted" style={{ fontSize: 11 }}>{audiences.find(a => a.id === audience)?.count.toLocaleString()} recipients</span></SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {audiences.map(a => (
                <div key={a.id} className={`mc-radio-row ${audience === a.id ? 'sel' : ''}`} onClick={() => setAudience(a.id)}>
                  <span className="mc-radio-glyph">{audience === a.id ? '◉' : '○'}</span>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{a.label}</div></div>
                  <span className="mc-mono muted" style={{ fontSize: 11 }}>{a.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
            {audience === 'custom' && (
              <div style={{ marginTop: 12 }}>
                <SectionLabel><span>sql segment</span><span className="adm-page-sub mc-mono" style={{ fontSize: 11 }}>read-only · audited</span></SectionLabel>
                <div className="mc-code">{`SELECT u.id FROM users u
JOIN orgs o ON o.id = u.org_id
WHERE o.plan IN ('pro','team')
  AND u.last_seen_at > NOW() - INTERVAL '14 days'
  AND u.country IN ('US','CA','GB');`}</div>
                <Btn kind="ghost" size="sm" style={{ marginTop: 8 }} onClick={() => ctx.showToast('dry-run: 1,402 recipients match')}>dry-run · count</Btn>
              </div>
            )}
          </Card>

          <Card>
            <SectionLabel><span>2 · channel</span></SectionLabel>
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              {['email','in-app banner','both'].map(k => (
                <span key={k} className="mc-chip" onClick={() => setChKind(k)} style={{ background: chKind === k ? 'var(--ink)' : 'var(--surface)', color: chKind === k ? 'var(--ink-on)' : 'var(--text)', borderColor: chKind === k ? 'var(--ink)' : 'var(--border)', cursor: 'pointer' }}>{k}</span>
              ))}
            </div>
            <SectionLabel><span>subject</span></SectionLabel>
            <input className="mc-input" defaultValue="brief disruption to oauth installs · resolved" style={{ marginBottom: 10 }} />
            <SectionLabel><span>preheader</span></SectionLabel>
            <input className="mc-input" defaultValue="some users couldn't complete github sign-in between 14:11–14:38 utc." style={{ marginBottom: 10 }} />
            <SectionLabel><span>body</span></SectionLabel>
            <textarea className="mc-input" style={{ height: 180, padding: 12 }} defaultValue={`hi {{first_name}} —

between 14:11 and 14:38 utc today, some users were unable to complete oauth installs through github. the issue was a stale redirect_uri in our london edge cluster.

we rolled back the affected change at 14:38. all installs are working again.

if you saw a "redirecting…" page that hung, please retry. no action is needed otherwise. invoices and tool invocations were unaffected.

thanks for your patience —
the platform team`} />
            <div className="row-bw" style={{ marginTop: 10 }}>
              <span className="muted mc-mono" style={{ fontSize: 11 }}>variables resolved: first_name · 1,402 unique values</span>
              <div className="row" style={{ gap: 6 }}>
                <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('test sent to ali@mcpgen.dev')}>send test to me</Btn>
                <Btn kind="ghost" size="sm" onClick={() => window.mcpToast('spam score: 2.1/10 · deliverable')}>spam-score</Btn>
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel><span>3 · schedule</span></SectionLabel>
            <div className="row" style={{ gap: 8 }}>
              <span className="mc-chip" style={{ background: 'var(--ink)', color: 'var(--ink-on)', borderColor: 'var(--ink)' }}>send now</span>
              <span className="mc-chip">in 1 hr</span>
              <span className="mc-chip">tomorrow 09:00 utc</span>
              <span className="mc-chip">custom…</span>
            </div>
            <div className="adm-approval" style={{ marginTop: 12 }}>
              <strong>requires 2 approvers</strong> · ali (you, drafter) + 1 more from {'{'}sasha k., noor f., jordan p.{'}'}
              <br/>once approved, send is final and can't be unsent. recipients above 10k auto-page on-call.
            </div>
          </Card>
        </div>

        <div>
          <Card style={{ marginBottom: 14, padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-soft)' }}>
              <span className="mc-mono" style={{ fontSize: 11.5, fontWeight: 700 }}>preview · email · light client</span>
              <div className="row" style={{ gap: 6 }}><span className="mc-chip" style={{ height: 20, fontSize: 10 }}>desktop</span><span className="mc-chip" style={{ height: 20, fontSize: 10 }}>mobile</span></div>
            </div>
            <div style={{ padding: 18, fontSize: 13.5, lineHeight: 1.7, background: '#fff', color: '#222', minHeight: 380 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>brief disruption to oauth installs · resolved</div>
              <div style={{ color: '#777', fontSize: 11.5, marginBottom: 14, fontFamily: 'JetBrains Mono, monospace' }}>from: platform team &lt;hello@…&gt; · to: pat.alvarez@stripe.com</div>
              <p style={{ margin: '0 0 10px' }}>hi pat —</p>
              <p style={{ margin: '0 0 10px' }}>between 14:11 and 14:38 utc today, some users were unable to complete oauth installs through github…</p>
              <p style={{ margin: '0 0 10px', color: '#777' }}>(body continues — content matches editor)</p>
              <div style={{ display: 'inline-block', padding: '8px 14px', background: '#222', color: '#fff', borderRadius: 4, fontWeight: 600, fontSize: 13, marginTop: 6 }}>view incident details →</div>
            </div>
          </Card>
          <Card>
            <SectionLabel><span>safety checks</span></SectionLabel>
            {[
              ['unsubscribe link present', true],
              ['no urls on blocklist', true],
              ['variables all resolved (1)', true],
              ['rate-limit ok · 1.4k/min', true],
              ['no overlapping send last 24h', true],
              ['recipients &gt; 10k requires 4-eyes', false, 'this send is 8,842 — single 2nd approver fine'],
            ].map(([l, ok, n], i) => (
              <div key={i} className="row" style={{ gap: 8, padding: '6px 0', borderBottom: i < 5 ? '1px dashed var(--border)' : 'none', fontSize: 12.5 }}>
                <span style={{ color: ok ? 'var(--ok)' : 'var(--muted)', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{ok ? '✓' : 'i'}</span>
                <span style={{ flex: 1 }} dangerouslySetInnerHTML={{ __html: l }} />
                {n && <span className="muted mc-mono" style={{ fontSize: 11 }}>{n}</span>}
              </div>
            ))}
          </Card>
        </div>
      </div>

      {showSend && (
        <div className="mc-modal-veil" onClick={() => setShowSend(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()} style={{ width: 520 }}>
            <div className="mc-modal-head"><span className="mc-h3">request approval to send</span></div>
            <div className="mc-modal-body">
              <div className="adm-detail-grid" style={{ padding: 0, gridTemplateColumns: '1fr 1fr', marginBottom: 12 }}>
                <div><div className="adm-kpi-label">audience</div><div style={{ fontWeight: 600 }}>{audiences.find(a => a.id === audience)?.label}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{audiences.find(a => a.id === audience)?.count.toLocaleString()} people</div></div>
                <div><div className="adm-kpi-label">channel</div><div style={{ fontWeight: 600 }}>{chKind}</div></div>
              </div>
              <SectionLabel><span>pick 2nd approver</span></SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['sasha k.', 'on-call · slack online'], ['noor f.', 'available'], ['jordan p.', 'in meeting · responds in 30m']].map(([n, s], i) => (
                  <div key={i} className={`mc-radio-row ${i === 1 ? 'sel' : ''}`}>
                    <span className="mc-radio-glyph">{i === 1 ? '◉' : '○'}</span>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{n}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{s}</div></div>
                  </div>
                ))}
              </div>
              <div className="adm-approval" style={{ marginTop: 12 }}>they'll get a slack ping with full diff and preview. you'll be notified when they approve or reject.</div>
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowSend(false)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowSend(false); ctx.showToast('approval requested · noor f. pinged on slack'); }}>request approval</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.BroadcastScreen = BroadcastScreen;
