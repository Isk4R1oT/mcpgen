// screen-deploy.jsx — Screen 6: Deploy + Success

const DEPLOY_OPTIONS = [
  { id: 'cloud',  title: 'mcpgen cloud',          tag: 'recommended', desc: 'we host. you get a URL. we bill per tool-call.', meta: 'free: 100K calls/mo · pro: $19/mo + $0.0001/call' },
  { id: 'cf',     title: 'your cloudflare workers', tag: '',          desc: 'we deploy to your CF account. you pay CF directly.', meta: 'one-time setup: $0' },
  { id: 'docker', title: 'docker image',          tag: 'pro',         desc: 'docker pull mcpgen/lumen-mcp-abc123:latest', meta: 'run it anywhere.' },
  { id: 'src',    title: 'source + dockerfile',   tag: 'pro',         desc: 'we generate, you take, we never see runtime.', meta: 'for the truly paranoid.' },
];

function Deploy({ onDeployed, onBack, sample }) {
  const [opt, setOpt] = React.useState('cloud');
  const [auth, setAuth] = React.useState('passthrough');
  const [deploying, setDeploying] = React.useState(false);

  const go = () => {
    setDeploying(true);
    setTimeout(() => onDeployed(), 1800);
  };

  if (deploying) {
    return (
      <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
        <TopBar crumb="deploying…" onLogo={onBack} />
        <main style={{ maxWidth: 600, margin: '0 auto', padding: '120px 28px' }}>
          <div className="mc-display-l" style={{ marginBottom: 32 }}>shipping it.</div>
          <div className="mc-progress" style={{ marginBottom: 12 }}><div style={{ width: '60%' }} /></div>
          <div className="mc-mono muted" style={{ fontSize: 13 }}>
            <div>✓ bundling typescript module</div>
            <div>✓ generating mcp manifest</div>
            <div><span className="mc-spin" style={{ display: 'inline-block' }}>⠹</span> uploading to edge...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar crumb={`deploy ${sample?.name || 'lumen-payments'}-mcp`} onLogo={onBack}
        right={<Btn kind="ghost" size="sm" icon="arrow-l" onClick={onBack}>back</Btn>}
      />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px' }}>
        <div className="mc-display-l" style={{ marginBottom: 8 }}>where should this live?</div>
        <p className="muted" style={{ marginBottom: 32, fontSize: 15 }}>most people pick cloud and never look back. but the others are real.</p>

        <SectionLabel>deployment target</SectionLabel>
        <div className="col" style={{ gap: 8, marginBottom: 32 }}>
          {DEPLOY_OPTIONS.map(o => (
            <div key={o.id} className={`mc-radio-row ${opt === o.id ? 'sel' : ''}`} onClick={() => setOpt(o.id)}>
              <span className="mc-radio-glyph">{opt === o.id ? '◉' : '○'}</span>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</span>
                  {o.tag === 'recommended' && <Badge kind="primary" mono={false}>recommended</Badge>}
                  {o.tag === 'pro' && <Badge kind="ink" mono={false}>pro</Badge>}
                </div>
                <div className="mc-mono muted" style={{ fontSize: 12.5 }}>{o.desc}</div>
                <div className="mc-mono" style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{o.meta}</div>
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>server URL</SectionLabel>
        <div className="row" style={{ gap: 8, marginBottom: 32 }}>
          <div className="mc-mono mc-input" style={{ display: 'flex', alignItems: 'center', flex: 1, height: 44 }}>
            {sample?.id || 'lumen'}-mcp-abc123<span className="muted">.mcpgen.app</span>
          </div>
          <Btn kind="ghost">customize</Btn>
        </div>

        <SectionLabel>credentials forwarding</SectionLabel>
        <div className="col" style={{ gap: 8, marginBottom: 40 }}>
          <div className={`mc-radio-row ${auth === 'passthrough' ? 'sel' : ''}`} onClick={() => setAuth('passthrough')}>
            <span className="mc-radio-glyph">{auth === 'passthrough' ? '◉' : '○'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>pass-through <Badge kind="success">recommended</Badge></div>
              <div className="muted" style={{ fontSize: 12.5 }}>each agent passes its own key. we never see them.</div>
            </div>
          </div>
          <div className={`mc-radio-row ${auth === 'static' ? 'sel' : ''}`} onClick={() => setAuth('static')}>
            <span className="mc-radio-glyph">{auth === 'static' ? '◉' : '○'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>static, stored in vault <Badge kind="ink">pro</Badge></div>
              <div className="muted" style={{ fontSize: 12.5 }}>for SaaS-style agents acting on behalf of users. <a className="mc-link">why this is safe →</a></div>
            </div>
          </div>
        </div>

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={go}>deploy</Btn>
      </main>
    </div>
  );
}

function DeploySuccess({ onDashboard, sample }) {
  const [copied, setCopied] = React.useState(false);
  const url = `${sample?.id || 'lumen'}-mcp-abc123.mcpgen.app/mcp`;
  const config = `{
  "mcpServers": {
    "${sample?.id || 'lumen'}": {
      "url": "https://${url}",
      "headers": {
        "Authorization": "Bearer \${${(sample?.id || 'lumen').toUpperCase()}_KEY}"
      }
    }
  }
}`;

  const copy = () => {
    navigator.clipboard?.writeText('https://' + url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar onLogo={onDashboard} right={<Btn kind="ghost" size="sm" onClick={onDashboard}>dashboard →</Btn>} />

      <main style={{ maxWidth: 680, margin: '0 auto', padding: '60px 28px 80px' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="mc-caption-up" style={{ marginBottom: 8 }}>
            <span className="mc-dot live" style={{ marginRight: 6 }} />
            live · 1.4s ago
          </div>
          <div className="mc-display-xl" style={{ marginBottom: 0 }}>it's live.</div>
        </div>

        {/* URL card */}
        <Card style={{ marginBottom: 28 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>your endpoint</div>
          <div className="row-bw" style={{ gap: 12 }}>
            <span className="mc-mono" style={{ fontSize: 16, wordBreak: 'break-all' }}>
              <span className="muted">https://</span>{url}
            </span>
            <Btn kind="ink" size="sm" icon={copied ? 'check' : 'copy'} onClick={copy}>
              {copied ? 'copied' : 'copy'}
            </Btn>
          </div>
        </Card>

        <SectionLabel>connect to</SectionLabel>
        <div className="mc-connect" style={{ marginBottom: 32 }}>
          {[
            { name: 'claude desktop', hint: 'one-click' },
            { name: 'cursor',         hint: 'one-click' },
            { name: 'cline',          hint: 'one-click' },
            { name: 'langgraph',      hint: 'snippet ↓' },
          ].map(c => (
            <div key={c.name} className="mc-connect-card">
              <div className="name">{c.name}</div>
              <div className="hint">▶ {c.hint}</div>
            </div>
          ))}
        </div>

        <SectionLabel>or paste this anywhere</SectionLabel>
        <div className="mc-code" style={{ marginBottom: 32 }}>{config}</div>

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={onDashboard}>open dashboard</Btn>
      </main>
    </div>
  );
}

window.Deploy = Deploy;
window.DeploySuccess = DeploySuccess;
