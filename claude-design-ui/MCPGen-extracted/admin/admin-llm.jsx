// admin-llm.jsx
function LLMScreen({ ctx }) {
  const [tab, setTab] = React.useState('routing');
  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">ai / llm ops</h1>
          <p className="adm-page-sub">model routing, eval suites, rate-limit pools, prompt versions.</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" icon="play" onClick={() => ctx.showToast('eval queued · starting in ~3s')}>run eval</Btn>
          <Btn kind="ink" size="sm" onClick={() => window.mcpDrawer('propose route change', (
            <div className="col" style={{ gap: 12, fontSize: 13 }}>
              <div>route changes require 2 approvers and an audit trail.</div>
              <div className="adm-kpi-label">route</div>
              <select className="mc-input mc-mono" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }}><option>tool-calls/standard</option><option>tool-calls/cheap</option><option>spec-synth</option></select>
              <div className="adm-kpi-label">new model</div>
              <select className="mc-input mc-mono" style={{ width: '100%', padding: 10, fontSize: 12, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }}><option>sonnet-4.5 (current)</option><option>opus-4.1</option><option>haiku-4</option></select>
              <div className="adm-kpi-label">justification</div>
              <textarea className="mc-input" placeholder="why this change?" style={{ width: '100%', padding: 10, fontSize: 12, height: 60, border: '1px solid var(--border)', background: 'var(--paper)', borderRadius: 4 }} />
              <Btn kind="ink" size="sm" full onClick={() => window.mcpToast('proposal submitted · awaiting 2 approvers')}>submit for review</Btn>
            </div>
          ), { eyebrow: '2 approvers required' })}>propose route change</Btn>
        </div>
      </div>
      <div className="adm-grid">
        {[['tokens · 24h', '184.2 m', 'in 102m · out 82m'], ['model spend · 30d', '$48,210', 'sonnet 71% · haiku 18%'], ['avg latency', '742 ms', 'p95 1.4s'], ['eval pass rate', '94.2%', '↑ 1.8 pp wow']].map(([l, v, s], i) => (
          <Card key={i}><div className="adm-kpi-label">{l}</div><div className="adm-kpi-num">{v}</div><div className="muted mc-mono" style={{ fontSize: 11 }}>{s}</div></Card>
        ))}
      </div>
      <div className="adm-tabs" style={{ marginTop: 16 }}>
        {['routing','evals','rate-limits','prompts','safety'].map(t => <div key={t} className={`adm-tab ${tab === t ? 'sel' : ''}`} onClick={() => setTab(t)}>{t}</div>)}
      </div>
      {tab === 'routing' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <Card>
            <SectionLabel><span>active routes</span></SectionLabel>
            <Table headers={['route', 'model', 'fallback', 'share']} rows={[
              [<span className="mc-mono" key="a">tool-calls/standard</span>, 'sonnet-4.5', 'haiku-3.5', '71%'],
              [<span className="mc-mono" key="b">tool-calls/cheap</span>, 'haiku-4', 'haiku-3.5', '18%'],
              [<span className="mc-mono" key="c">spec-synth</span>, 'opus-4.1', 'sonnet-4.5', '6%'],
              [<span className="mc-mono" key="d">moderation</span>, 'haiku-3.5', '—', '5%'],
            ]} />
          </Card>
          <Card>
            <SectionLabel><span>provider mix · 24h</span></SectionLabel>
            <BarRow label="anthropic"  pct={72} hue="ok" />
            <BarRow label="openai"     pct={18} hue="info" />
            <BarRow label="google"     pct={7}  hue="warn" />
            <BarRow label="self-host"  pct={3}  hue="" />
            <div className="muted mc-mono" style={{ fontSize: 11, marginTop: 10 }}>auto-failover triggered 2× this week · both recovered &lt; 30s.</div>
          </Card>
          <Card style={{ gridColumn: '1 / -1' }}>
            <SectionLabel><span>proposed change · pending review</span><Pill kind="warn">2 approvers needed</Pill></SectionLabel>
            <div className="adm-diff">
              <div className="adm-diff-line del"><span className="ln">042</span><span>- tool-calls/standard → sonnet-4.5</span></div>
              <div className="adm-diff-line add"><span className="ln">042</span><span>+ tool-calls/standard → sonnet-4.5 · canary 5% to opus-4.1</span></div>
              <div className="adm-diff-line del"><span className="ln">043</span><span>- fallback: haiku-3.5</span></div>
              <div className="adm-diff-line add"><span className="ln">043</span><span>+ fallback: haiku-4 (cheaper, equal quality on bench)</span></div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <Btn kind="ink" size="sm" onClick={() => ctx.showToast('approved · 1 of 2 approvals · awaiting noor')}>approve</Btn>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('change request sent to author')}>request changes</Btn>
              <Btn kind="ghost" size="sm" onClick={() => ctx.showToast('rejected · author notified', { kind: 'warn' })}>reject</Btn>
            </div>
          </Card>
        </div>
      )}
      {tab === 'evals' && (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel><span>recent eval runs</span></SectionLabel>
          <Table headers={['run', 'suite', 'started', 'duration', 'pass', 'delta']} rows={[
            [<span className="mc-mono" key="1">eval_8a91</span>, 'tool-calls/standard · 240', '14 min ago', '4m 12s', <Pill kind="ok" key="p">94.2%</Pill>, <span style={{ color: 'var(--ok)' }}>+1.8</span>],
            [<span className="mc-mono" key="2">eval_8a90</span>, 'spec-synth · 88',          '2 hr ago',   '6m 02s', <Pill kind="ok" key="p">91.0%</Pill>, '+0.0'],
            [<span className="mc-mono" key="3">eval_8a89</span>, 'safety · 412',             '5 hr ago',   '2m 41s', <Pill kind="warn" key="p">82.1%</Pill>, <span style={{ color: 'var(--accent)' }}>−4.2</span>],
            [<span className="mc-mono" key="4">eval_8a88</span>, 'tool-calls/cheap · 240',   '11 hr ago',  '3m 18s', <Pill kind="ok" key="p">93.7%</Pill>, '+0.4'],
          ]} />
        </Card>
      )}
      {(tab !== 'routing' && tab !== 'evals') && <Card style={{ marginTop: 14 }}><EmptyState title={`${tab} — preview only`} /></Card>}
    </div>
  );
}

function BarRow({ label, pct, hue }) {
  const colorMap = { ok: 'var(--ok)', warn: 'var(--warn)', info: 'var(--info)', '': 'var(--muted)' };
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row-bw" style={{ marginBottom: 4 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{label}</span>
        <span className="muted mc-mono" style={{ fontSize: 11 }}>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--surface-soft)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: colorMap[hue] || 'var(--muted)' }} />
      </div>
    </div>
  );
}

window.LLMScreen = LLMScreen;
window.BarRow = BarRow;
