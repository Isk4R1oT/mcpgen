// admin-flags.jsx
function FlagsScreen({ ctx }) {
  const [showEdit, setShowEdit] = React.useState(null);
  const flags = [
    { id: 'fl_drift_v2',     name: 'spec-drift detector v2', stage: 'rolling out', target: '40% of orgs', changed: '2 hr ago',  changedBy: 'mira o.' },
    { id: 'fl_mp_featured',  name: 'marketplace featured carousel', stage: 'on', target: 'all', changed: '3 days ago', changedBy: 'noor f.' },
    { id: 'fl_haiku_router', name: 'cheap-route haiku-4', stage: 'experiment', target: '5% canary', changed: '14 min ago', changedBy: 'sasha k.' },
    { id: 'fl_billing_v3',   name: 'usage-based pricing v3', stage: 'off', target: 'internal only', changed: '8 days ago', changedBy: 'ali m.' },
    { id: 'fl_admin_panel',  name: 'admin: bulk approve queue', stage: 'on', target: 'staff', changed: '1 day ago', changedBy: 'jordan p.' },
  ];
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">feature flags & experiments</h1>
          <p className="adm-page-sub">staged rollouts, kill switches per feature, a/b tests.</p>
        </div>
        <Btn kind="ink" size="sm" onClick={() => window.mcpDrawer('new feature flag', (
          <div className="col" style={{ gap: 12, fontSize: 13 }}>
            <div className="adm-kpi-label">key</div>
            <input className="mc-input mc-mono" placeholder="my_new_flag" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
            <div className="adm-kpi-label">description</div>
            <textarea className="mc-input" placeholder="what does this flag do?" style={{ width: '100%', padding: 10, fontSize: 12, height: 60, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
            <div className="adm-kpi-label">starting stage</div>
            <div className="row" style={{ gap: 6 }}>{['off','internal','experiment'].map(s => <span key={s} className="mc-chip" onClick={() => window.mcpToast(`stage: ${s}`)} style={{ cursor: 'pointer' }}>{s}</span>)}</div>
            <Btn kind="ink" size="sm" full onClick={() => window.mcpToast('flag created · audit row written')}>create flag</Btn>
          </div>
        ), { eyebrow: 'staged rollout' })}>new flag</Btn>
      </div>
      <Card>
        <SectionLabel><span>active flags · 5 of 28</span><a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast('opening full flag list · 28')}>show all</a></SectionLabel>
        <Table headers={['flag', 'stage', 'target', 'last change', '']} rows={flags.map(f => [
          <div key="n"><div style={{ fontWeight: 600 }}>{f.name}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{f.id}</div></div>,
          <Pill key="p" kind={f.stage === 'on' ? 'ok' : f.stage === 'off' ? '' : f.stage === 'experiment' ? 'info' : 'warn'}>{f.stage}</Pill>,
          <span className="mc-mono" key="t" style={{ fontSize: 12 }}>{f.target}</span>,
          <span className="muted mc-mono" key="c" style={{ fontSize: 11 }}>{f.changed} · {f.changedBy}</span>,
          <Btn key="x" kind="ghost" size="sm" onClick={() => setShowEdit(f)}>edit</Btn>
        ])} />
      </Card>
      <Card style={{ marginTop: 14 }}>
        <SectionLabel><span>active experiment · cheap-route haiku-4</span><Pill kind="info">canary 5%</Pill></SectionLabel>
        <div className="adm-detail-grid" style={{ padding: 0, gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div><div className="adm-kpi-label">control</div><div className="adm-kpi-num" style={{ fontSize: 18 }}>92.1%</div><div className="muted mc-mono" style={{ fontSize: 11 }}>n=18,400</div></div>
          <div><div className="adm-kpi-label">variant</div><div className="adm-kpi-num" style={{ fontSize: 18, color: 'var(--ok)' }}>93.7%</div><div className="muted mc-mono" style={{ fontSize: 11 }}>n=970</div></div>
          <div><div className="adm-kpi-label">latency Δ</div><div className="adm-kpi-num" style={{ fontSize: 18 }}>−14%</div><div className="muted mc-mono" style={{ fontSize: 11 }}>−104 ms</div></div>
          <div><div className="adm-kpi-label">cost Δ</div><div className="adm-kpi-num" style={{ fontSize: 18, color: 'var(--ok)' }}>−38%</div><div className="muted mc-mono" style={{ fontSize: 11 }}>$680/d saved</div></div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Btn kind="ink" size="sm" onClick={() => ctx.showToast('promoted to 25% · audit row written')}>promote to 25%</Btn>
          <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('experiment frozen at 5%')}>freeze</Btn>
          <Btn kind="ghost" size="sm" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }} onClick={() => window.mcpToast('confirm: type the flag name to kill', { kind: 'warn' })}>kill</Btn>
        </div>
      </Card>
      {showEdit && (
        <div className="mc-modal-veil" onClick={() => setShowEdit(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="mc-modal-head"><span className="mc-h3">edit · {showEdit.name}</span></div>
            <div className="mc-modal-body">
              <SectionLabel><span>stage</span></SectionLabel>
              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                {['off','internal','experiment','rolling out','on'].map(s => (
                  <span key={s} className="mc-chip" style={{ background: s === showEdit.stage ? 'var(--ink)' : 'var(--surface)', color: s === showEdit.stage ? 'var(--ink-on)' : 'var(--text)', borderColor: s === showEdit.stage ? 'var(--ink)' : 'var(--border)' }}>{s}</span>
                ))}
              </div>
              <SectionLabel><span>target audience</span></SectionLabel>
              <div className="mc-code" style={{ fontSize: 12 }}>{`org.plan in ('pro','team','enterprise') AND
  rand() < 0.40 AND
  NOT user.email LIKE '%@example.com'`}</div>
              <div className="adm-approval" style={{ marginTop: 12 }}>changes log to audit. flips above 25% require 4-eyes.</div>
            </div>
            <div className="mc-modal-foot">
              <Btn kind="ghost" onClick={() => setShowEdit(null)}>cancel</Btn>
              <Btn kind="ink" onClick={() => { setShowEdit(null); ctx.showToast(`updated ${showEdit.id}`); }}>save</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
window.FlagsScreen = FlagsScreen;
