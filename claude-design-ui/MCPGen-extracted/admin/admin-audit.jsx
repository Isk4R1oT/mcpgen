// admin-audit.jsx
function AuditScreen({ ctx }) {
  const [showDiff, setShowDiff] = React.useState(null);
  const events = [
    { ts: '2025-10-14 14:42:08', actor: 'ali m.',     ip: '74.125.x.x',  action: 'user.suspend',         target: 'u_4f81 · k.lieber@…',    fourEyes: true,  hasDiff: true },
    { ts: '2025-10-14 14:38:21', actor: 'sasha k.',   ip: '203.0.113.x', action: 'flag.flip',            target: 'fl_haiku_router → 5%',   fourEyes: true,  hasDiff: true },
    { ts: '2025-10-14 14:31:55', actor: 'ali m.',     ip: '74.125.x.x',  action: 'user.impersonate',     target: 'u_2a14 · stripe',         fourEyes: false, hasDiff: false, ticket: 't_882' },
    { ts: '2025-10-14 14:11:02', actor: 'jordan p.',  ip: '198.51.100.x',action: 'billing.refund',       target: 'inv_8841 · $240',         fourEyes: false, hasDiff: true },
    { ts: '2025-10-14 13:54:18', actor: 'mira o.',    ip: '74.125.x.x',  action: 'server.takedown',      target: 'srv_3f12 · prompt-injector', fourEyes: true, hasDiff: true },
    { ts: '2025-10-14 13:42:41', actor: 'system',     ip: '—',           action: 'auto.rollback',        target: 'srv_8a91 · 1.4.2 → 1.4.1',fourEyes: false, hasDiff: true },
    { ts: '2025-10-14 13:18:09', actor: 'noor f.',    ip: '74.125.x.x',  action: 'marketplace.approve',  target: 'srv_pending_002',         fourEyes: false, hasDiff: false },
    { ts: '2025-10-14 12:55:33', actor: 'ali m.',     ip: '74.125.x.x',  action: 'user.export.gdpr',     target: 'u_8s10 · linear',         fourEyes: false, hasDiff: false, ticket: 't_878' },
    { ts: '2025-10-14 12:42:11', actor: 'sasha k.',   ip: '203.0.113.x', action: 'killswitch.flip',      target: 'allow_signups → false',   fourEyes: true,  hasDiff: true },
  ];
  const cols = ['kind:', 'actor:', 'target:', 'date:'];
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">audit log</h1>
          <p className="adm-page-sub">every privileged action. immutable. exportable for soc2 reviewers.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" icon="download" onClick={() => ctx.showToast('exporting 90d audit log · csv emailed to ali')}>export · 90d</Btn>
          <Btn kind="ghost" size="sm" onClick={() => window.mcpDrawer('audit webhook config', (
            <div className="col" style={{ gap: 12, fontSize: 13 }}>
              <div>stream every audit row to your siem in real time. signed with hmac-sha256.</div>
              <input className="mc-input mc-mono" defaultValue="https://splunk.mcpgen.dev/audit" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
              <div className="mc-mono muted" style={{ fontSize: 11 }}>signing secret: whsec_a91c•4e2f · <a className="mc-link" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast('signing secret rotated')}>rotate</a></div>
              <Btn kind="ink" size="sm" full onClick={() => window.mcpToast('webhook updated · test event sent')}>save</Btn>
            </div>
          ), { eyebrow: 'soc2 · stream every action' })}>webhook config</Btn>
        </div>
      </div>
      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {cols.map((label, i) => (
            <div key={i}>
              <div className="adm-kpi-label">{label.replace(':','')}</div>
              <input className="mc-input mc-mono" placeholder={['user.*, billing.*, …', 'ali, sasha, system', 'u_…, srv_…, fl_…', 'today'][i]} style={{ height: 30, fontSize: 12 }} />
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SectionLabel><span>events · 9 of 14,402</span><span className="mc-mono muted" style={{ fontSize: 11 }}>showing 24h · all envs</span></SectionLabel>
        <Table headers={['ts (utc)', 'actor', 'action', 'target', 'flags', '']} rows={events.map(e => [
          <span key="t" className="mc-mono" style={{ fontSize: 11.5 }}>{e.ts}</span>,
          <div key="a"><div style={{ fontWeight: 600 }}>{e.actor}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{e.ip}</div></div>,
          <span className="mc-chip" key="ac" style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{e.action}</span>,
          <span key="tg" className="mc-mono" style={{ fontSize: 12 }}>{e.target}</span>,
          <div key="f" className="row" style={{ gap: 4 }}>
            {e.fourEyes && <Pill kind="warn" dot={false}>4-eyes</Pill>}
            {e.ticket && <Pill kind="info" dot={false}>{e.ticket}</Pill>}
          </div>,
          <Btn key="x" kind="ghost" size="sm" onClick={() => e.hasDiff ? setShowDiff(e) : ctx.showToast('no diff for this event')}>{e.hasDiff ? 'view diff' : 'view'}</Btn>
        ])} />
      </Card>
      {showDiff && (
        <div className="mc-modal-veil" onClick={() => setShowDiff(null)}>
          <div className="adm-modal" onClick={ev => ev.stopPropagation()} style={{ width: 720 }}>
            <div className="mc-modal-head"><span className="mc-h3">{showDiff.action} · {showDiff.target}</span><Btn kind="ghost" size="sm" onClick={() => setShowDiff(null)}>esc</Btn></div>
            <div className="mc-modal-body">
              <div className="adm-detail-grid" style={{ padding: 0, gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 12 }}>
                <div><div className="adm-kpi-label">actor</div><div style={{ fontWeight: 600 }}>{showDiff.actor}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{showDiff.ip}</div></div>
                <div><div className="adm-kpi-label">timestamp</div><div className="mc-mono" style={{ fontSize: 12 }}>{showDiff.ts}</div></div>
                <div><div className="adm-kpi-label">request id</div><div className="mc-mono" style={{ fontSize: 12 }}>req_8a91qp4f</div></div>
                <div><div className="adm-kpi-label">approvers</div><div style={{ fontWeight: 600 }}>{showDiff.fourEyes ? 'ali m. + sasha k.' : 'ali m. only'}</div></div>
              </div>
              <SectionLabel><span>state diff</span></SectionLabel>
              <div className="adm-diff">
                <div className="adm-diff-line del"><span className="ln">412</span><span>{`-  "status": "active",`}</span></div>
                <div className="adm-diff-line add"><span className="ln">412</span><span>{`+  "status": "suspended",`}</span></div>
                <div className="adm-diff-line del"><span className="ln">418</span><span>{`-  "suspended_at": null,`}</span></div>
                <div className="adm-diff-line add"><span className="ln">418</span><span>{`+  "suspended_at": "2025-10-14T14:42:08Z",`}</span></div>
                <div className="adm-diff-line del"><span className="ln">419</span><span>{`-  "suspended_reason": null,`}</span></div>
                <div className="adm-diff-line add"><span className="ln">419</span><span>{`+  "suspended_reason": "card chargebacks",`}</span></div>
                <div className="adm-diff-line add"><span className="ln">420</span><span>{`+  "suspended_by": "u_admin_ali",`}</span></div>
              </div>
              <SectionLabel style={{ marginTop: 14 }}><span>side effects</span></SectionLabel>
              <ul style={{ fontSize: 12.5, lineHeight: 1.9, margin: 0, paddingLeft: 18, color: 'var(--text-muted)' }}>
                <li>3 active sessions revoked (sess_4a..., sess_4b..., sess_4c...)</li>
                <li>2 api keys disabled (key_7s..., key_7t...)</li>
                <li>email sent to k.lieber@… (template `account-suspended`)</li>
                <li>org `kraken-labs` marked suspended in stripe (cus_M3xQ…)</li>
              </ul>
            </div>
            <div className="mc-modal-foot">
              <span className="mc-mono muted" style={{ fontSize: 11 }}>signed · sha256:8a91qp4f…3c2e</span>
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ghost" onClick={() => ctx.showToast('downloaded as json')}>export json</Btn>
                <Btn kind="ink" onClick={() => setShowDiff(null)}>close</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.AuditScreen = AuditScreen;
