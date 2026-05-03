// admin-marketplace.jsx
function MarketplaceScreen({ ctx }) {
  const D = window.ADM_DATA;
  const [tab, setTab] = React.useState('queue');
  const [sel, setSel] = React.useState(D.queue[0]);
  const [showTakedown, setShowTakedown] = React.useState(false);
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">marketplace moderation</h1>
          <p className="adm-page-sub">listings, reports, featured queue. takedowns are 4-eyes.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" icon="filter" onClick={() => window.mcpDrawer('moderation filters', (
            <div className="col" style={{ gap: 12, fontSize: 13 }}>
              {[
                ['risk', ['any', 'low', 'med', 'high']],
                ['waiting', ['any', '<1h', '1-4h', '>4h']],
                ['submitter', ['any', 'first-time', 'verified', 'enterprise']],
                ['category', ['any', 'payments', 'data', 'devtools', 'productivity']],
              ].map(([k, opts]) => (
                <div key={k}>
                  <div className="adm-kpi-label" style={{ marginBottom: 4 }}>{k}</div>
                  <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{opts.map(o => <button key={o} className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => window.mcpToast(`${k}: ${o}`)} style={{ fontSize: 11 }}>{o}</button>)}</div>
                </div>
              ))}
            </div>
          ), { eyebrow: 'narrow the queue' })}>filters</Btn>
          <Btn kind="ink" size="sm" onClick={() => ctx.showToast('approving 12 listings · 4-eyes required')}>bulk approve · 12</Btn>
        </div>
      </div>
      <div className="adm-tabs">
        {[['queue','review queue · 14'],['reports','user reports · 7'],['featured','featured'],['categories','categories'],['policy','policy']].map(([k, l]) => (
          <div key={k} className={`adm-tab ${tab === k ? 'sel' : ''}`} onClick={() => setTab(k)}>{l}</div>
        ))}
      </div>
      {tab === 'queue' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 18 }}>
          <Card>
            <SectionLabel><span>review queue · oldest first</span><span className="adm-page-sub" style={{ fontSize: 11 }}>14 pending · sla 4h</span></SectionLabel>
            <Table headers={['server', 'submitted by', 'risk', 'waiting', '']} rows={D.queue.map(q => [
              <div key="s"><div style={{ fontWeight: 600 }}>{q.name}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{q.id}</div></div>,
              <span className="mc-mono" style={{ fontSize: 12 }}>{q.submitter}</span>,
              <Pill kind={q.risk === 'high' ? 'alert' : q.risk === 'med' ? 'warn' : 'ok'}>{q.risk}</Pill>,
              <span className="mc-mono">{q.waiting}</span>,
              <Btn kind="ghost" size="sm" onClick={() => setSel(q)}>review</Btn>
            ])} />
          </Card>
          <Card>
            <SectionLabel><span>{sel.name}</span><Pill kind={sel.risk === 'high' ? 'alert' : 'warn'}>{sel.risk} risk</Pill></SectionLabel>
            <div className="mc-mono muted" style={{ fontSize: 12, marginBottom: 12 }}>{sel.id} · submitted {sel.waiting} ago by {sel.submitter}</div>
            <SectionLabel><span>auto-checks</span></SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
              {[['license file present', true], ['no known cves in deps', true], ['oauth scopes minimal', false], ['no pii in examples', true], ['name not trademark-conflicting', true]].map(([l, ok], i) => (
                <div key={i} className="row" style={{ gap: 8, fontSize: 12.5, fontFamily: 'JetBrains Mono, monospace' }}>
                  <span style={{ color: ok ? 'var(--ok)' : 'var(--accent)', fontWeight: 700 }}>{ok ? '✓' : '✗'}</span>
                  <span>{l}</span>
                </div>
              ))}
            </div>
            <div className="adm-approval" style={{ marginBottom: 12 }}>policy hit: <strong>oauth scope `admin:org`</strong> exceeds least-privilege guideline. owner asked to justify in description but did not.</div>
            <SectionLabel><span>moderator notes</span></SectionLabel>
            <textarea className="mc-input" style={{ height: 60, padding: 10, marginBottom: 12 }} placeholder="visible to other moderators" />
            <div className="row" style={{ gap: 8 }}>
              <Btn kind="ink" size="sm" onClick={() => ctx.showToast('approved · listed in marketplace')}>approve & list</Btn>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('returned to author with notes')}>request changes</Btn>
              <Btn kind="ghost" size="sm" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={() => setShowTakedown(true)}>reject</Btn>
            </div>
          </Card>
        </div>
      )}
      {tab !== 'queue' && <Card style={{ marginTop: 18 }}><EmptyState title={`${tab} — preview only`} /></Card>}
      {showTakedown && (
        <div className="mc-modal-veil" onClick={() => setShowTakedown(false)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-head"><span className="mc-h3">reject · {sel.name}</span></div>
            <div className="mc-modal-body">
              <SectionLabel><span>policy violated</span></SectionLabel>
              <select className="mc-input mc-mono" style={{ marginBottom: 10 }}>
                <option>excessive oauth scopes</option><option>misleading description</option><option>tos violation</option><option>security · vulnerable dep</option><option>impersonation · trademark</option>
              </select>
              <SectionLabel><span>message to author</span></SectionLabel>
              <textarea className="mc-input" style={{ height: 80, padding: 10 }} defaultValue="hi — the requested oauth scope `admin:org` is broader than what your tools document. please reduce to `read:org` or document why elevated access is needed." />
              <div className="adm-approval" style={{ marginTop: 12 }}>requires <strong>2 moderators</strong>. ali (you) + 1 more. sasha is on-call.</div>
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowTakedown(false)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowTakedown(false); ctx.showToast('rejection sent · awaiting 2nd moderator'); }}>send & request 4-eyes</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.MarketplaceScreen = MarketplaceScreen;
