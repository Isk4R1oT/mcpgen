// admin-overview.jsx — ops dashboard

function Overview({ ctx }) {
  const D = window.ADM_DATA;
  const incident = ctx.demoState === 'incident';
  const maint = ctx.demoState === 'maintenance';
  const empty = ctx.demoState === 'empty';
  const loading = ctx.demoState === 'loading';

  return (
    <div className="adm-page">
      <PageHead
        title="ops · overview"
        sub="last 24h · prod · all regions"
        right={[
          <Btn key="r" kind="ghost" size="sm" icon="refresh" onClick={() => ctx.showToast('refreshed · 12s ago')}>refresh</Btn>,
          <Btn key="b" kind="ink" size="sm" icon="spark" onClick={() => ctx.setScreen('broadcast')}>broadcast</Btn>,
        ]}
      />

      {incident && (
        <IncidentBanner>
          <span><strong className="strong">cdg degraded</strong> — p95 342ms, error rate 1.4% · auto-rebalanced 14% of traffic to fra · </span>
          <a className="adm-link" onClick={() => ctx.setScreen('deploys')}>open infra →</a>
        </IncidentBanner>
      )}
      {maint && (
        <IncidentBanner>
          <span><strong className="strong">scheduled maintenance</strong> — syd region in maintenance window until 04:00 utc</span>
        </IncidentBanner>
      )}

      <div className="adm-kpis" style={{ marginBottom: 18 }}>
        <KPI label="active orgs"        value={loading ? '…' : '1,204'} delta="+38 (7d)"  deltaKind="up" spark={[18,22,28,30,34,40,42]} sparkKind="up" />
        <KPI label="servers · live"     value={loading ? '…' : '4,812'} delta="+212 (7d)" deltaKind="up" spark={[100,108,118,128,142,160,180]} sparkKind="up" />
        <KPI label="invocations · 24h"  value={loading ? '…' : '8.42m'} delta="+12% wow" deltaKind="up" spark={[42,55,38,68,72,80,84]} sparkKind="up" />
        <KPI label="error rate · p50"   value={loading ? '…' : '0.18%'} delta={incident ? '+0.14% spike' : '−0.02% wow'} deltaKind={incident ? 'down' : 'up'} spark={[20,18,22,24,18,16,14]} sparkKind={incident ? 'down' : 'up'} />
      </div>

      <div className="adm-kpis" style={{ marginBottom: 22 }}>
        <KPI label="mrr"                value="$284,440" delta="+8.4% mom" deltaKind="up" spark={[30,32,35,38,42,46,50]} sparkKind="up" />
        <KPI label="open tickets"       value="42"        delta="3 urgent · 2 over sla" deltaKind="down" spark={[20,22,28,32,38,40,42]} sparkKind="down" />
        <KPI label="moderation queue"   value="8"         delta="2 critical · oldest 6h" deltaKind="down" />
        <KPI label="failed deploys 24h" value="3"         delta="of 142 · 2.1%" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        {/* Recent activity */}
        <Card padding={false}>
          <SectionLabel right={<a className="adm-link" onClick={() => ctx.setScreen('audit')}>open audit log →</a>}>
            <span>recent ops activity</span>
          </SectionLabel>
          <div style={{ padding: '0 4px 8px' }}>
            {empty ? <EmptyState title="no activity in this window" /> : D.audit.slice(0, 6).map(a => (
              <div key={a.id} className="adm-log-row" style={{ gridTemplateColumns: '90px 130px 1fr 90px' }}>
                <span className="ts">{a.when}</span>
                <span className="lvl info" style={{ background: 'var(--paper-alt)', textTransform: 'none', fontFamily: 'var(--font-mono)' }}>{a.actor.split('@')[0]}</span>
                <span><span className="mc-mono" style={{ color: 'var(--text)' }}>{a.action}</span> <span style={{ color: 'var(--text-muted)' }}>· {a.target}</span></span>
                <span style={{ color: 'var(--text-faint)', textAlign: 'right' }}>{a.reason.length > 22 ? a.reason.slice(0, 22) + '…' : a.reason}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card padding={false}>
            <SectionLabel right={<a className="adm-link" onClick={() => ctx.setScreen('moderation')}>queue →</a>}>
              <span>moderation · top priority</span>
            </SectionLabel>
            <div>
              {D.moderation.filter(m => m.priority === 'critical' || m.priority === 'high').slice(0, 3).map(m => (
                <div key={m.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <Pill kind={m.priority === 'critical' ? 'alert' : 'warn'}>{m.priority}</Pill>
                    <span className="mc-mono" style={{ fontSize: 11.5 }}>{m.title}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>{m.submitted}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{m.reason}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card padding={false}>
            <SectionLabel right={<a className="adm-link" onClick={() => ctx.setScreen('deploys')}>regions →</a>}>
              <span>edge health</span>
            </SectionLabel>
            <div>
              {D.regions.slice(0, 5).map(r => (
                <div key={r.id} style={{ padding: '8px 14px', display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', borderBottom: '1px dashed var(--border)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                  <span>{r.name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{r.p95}</span>
                  <Pill kind={r.status === 'healthy' ? 'ok' : r.status === 'degraded' ? 'warn' : r.status === 'maint' ? 'info' : 'alert'}>{r.status}</Pill>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

window.Overview = Overview;
