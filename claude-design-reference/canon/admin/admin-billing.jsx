// admin-billing.jsx
function BillingScreen({ ctx }) {
  const D = window.ADM_DATA;
  const [tab, setTab] = React.useState('invoices');
  const [showRefund, setShowRefund] = React.useState(null);
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">billing & plans</h1>
          <p className="adm-page-sub">invoices, refunds, credits, dunning. stripe sync 2 min ago.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" icon="download" onClick={() => ctx.showToast('exporting billing csv · 14 invoices')}>export csv</Btn>
          <Btn kind="ink" size="sm" onClick={() => window.mcpDrawer('issue credit', (
            <div className="col" style={{ gap: 12, fontSize: 13 }}>
              <div className="adm-kpi-label">org</div>
              <input className="mc-input mc-mono" placeholder="search org…" defaultValue="lumen-payments" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
              <div className="adm-kpi-label">amount (usd)</div>
              <input className="mc-input mc-mono" defaultValue="50.00" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
              <div className="adm-kpi-label">reason</div>
              <select className="mc-input mc-mono" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }}>
                <option>customer goodwill</option><option>incident credit</option><option>onboarding</option>
              </select>
              <Btn kind="ink" size="sm" full onClick={() => window.mcpToast('credit issued · audit row written')}>issue credit</Btn>
            </div>
          ), { eyebrow: 'one-time account credit' })}>issue credit</Btn>
        </div>
      </div>
      <div className="adm-grid">
        {[
          ['mrr', '$284,902', '+4.1% mom'],
          ['failed payments · 24h', '14', '$2,840 at risk'],
          ['refunds · 30d', '$1,294', '6 issued'],
          ['credits · outstanding', '$8,102', '23 accounts'],
        ].map(([l, v, s], i) => (
          <Card key={i}><div className="adm-kpi-label">{l}</div><div className="adm-kpi-num">{v}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{s}</div></Card>
        ))}
      </div>
      <div className="adm-tabs" style={{ marginTop: 16 }}>
        {['invoices','refunds','dunning','plans','tax'].map(t => <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      {tab === 'invoices' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>recent invoices</span><span className="adm-page-sub" style={{ fontSize: 11 }}>14 failed · 4 disputed</span></SectionLabel>
          <Table headers={['invoice', 'org', 'amount', 'status', 'attempts', 'next retry', '']} rows={D.invoices.map(inv => [
            <span className="mc-mono" key="i">{inv.id}</span>,
            <span style={{ fontWeight: 600 }} key="o">{inv.org}</span>,
            <span className="mc-mono" key="a">${inv.amount}</span>,
            <Pill kind={inv.status === 'paid' ? 'ok' : inv.status === 'failed' ? 'alert' : inv.status === 'disputed' ? 'warn' : 'info'} key="s">{inv.status}</Pill>,
            <span className="mc-mono" key="t">{inv.attempts}</span>,
            <span className="mc-mono muted" key="n">{inv.nextRetry || '—'}</span>,
            <div key="x" className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
              <Btn kind="ghost" size="sm" onClick={() => setShowRefund(inv)}>refund</Btn>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`retrying ${inv.id} · ${inv.org}`)}>retry</Btn>
            </div>
          ])} />
        </Card>
      )}
      {tab === 'dunning' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>dunning sequence</span></SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              ['day 0', 'auto-charge fails', 'nothing visible to customer'],
              ['day 1', 'email · soft notice', 'subject: payment didn\'t go through'],
              ['day 3', 'in-app banner', 'amber · update payment cta'],
              ['day 7', 'email · firm notice', 'subject: action needed in 7 days'],
              ['day 14', 'restrict new deploys', 'existing servers keep running'],
              ['day 30', 'suspend org', 'sessions revoked, servers paused'],
            ].map(([d, e, n], i) => (
              <div key={i} className="row" style={{ gap: 12, padding: '10px 12px', background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 6 }}>
                <span className="mc-mono" style={{ fontSize: 12, fontWeight: 700, width: 60 }}>{d}</span>
                <span style={{ fontWeight: 600, fontSize: 13, width: 200 }}>{e}</span>
                <span className="muted mc-mono" style={{ fontSize: 11.5, flex: 1 }}>{n}</span>
                <Btn kind="ghost" size="sm" onClick={() => ctx.showToast(`editing copy for ${d}`)}>edit copy</Btn>
              </div>
            ))}
          </div>
        </Card>
      )}
      {(tab !== 'invoices' && tab !== 'dunning') && <Card style={{ marginTop: 14 }}><EmptyState title={`${tab} — preview only`} /></Card>}
      {showRefund && (
        <div className="mc-modal-veil" onClick={() => setShowRefund(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-head"><span className="mc-h3">refund {showRefund.id}</span></div>
            <div className="mc-modal-body">
              <div className="adm-detail-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', padding: 0, marginBottom: 14 }}>
                <div><div className="adm-kpi-label">org</div><div className="adm-kpi-num" style={{ fontSize: 16 }}>{showRefund.org}</div></div>
                <div><div className="adm-kpi-label">original</div><div className="adm-kpi-num" style={{ fontSize: 16 }}>${showRefund.amount}</div></div>
                <div><div className="adm-kpi-label">stripe</div><div className="adm-kpi-num mc-mono" style={{ fontSize: 12 }}>ch_3Nx4Lq…</div></div>
              </div>
              <SectionLabel><span>amount</span></SectionLabel>
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <input className="mc-input mc-mono" defaultValue={showRefund.amount} style={{ width: 140 }} />
                <Btn kind="ghost" size="sm" onClick={(e) => { e.target.previousSibling.previousSibling.value = showRefund.amount; }}>full</Btn>
                <Btn kind="ghost" size="sm" onClick={(e) => { e.target.previousSibling.previousSibling.previousSibling.value = (showRefund.amount/2).toFixed(2); }}>half</Btn>
                <span className="muted mc-mono" style={{ fontSize: 12, alignSelf: 'center' }}>usd</span>
              </div>
              <SectionLabel><span>method</span></SectionLabel>
              <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                <span className="mc-chip" style={{ background: 'var(--ink)', color: 'var(--ink-on)', borderColor: 'var(--ink)' }}>back to card</span>
                <span className="mc-chip">credit on account</span>
              </div>
              <SectionLabel><span>reason</span></SectionLabel>
              <select className="mc-input mc-mono" style={{ marginBottom: 8 }}>
                <option>customer goodwill</option><option>incident · service degraded</option><option>billing error</option><option>duplicate charge</option>
              </select>
              <textarea className="mc-input" style={{ height: 60, padding: 10 }} placeholder="internal note" />
              <div className="adm-approval" style={{ marginTop: 12 }}>refunds &gt; $500 require 4-eyes. this is ${showRefund.amount} — single approver ok.</div>
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowRefund(null)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowRefund(null); ctx.showToast(`refunded $${showRefund.amount} · ${showRefund.org}`); }}>refund ${showRefund.amount}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.BillingScreen = BillingScreen;
