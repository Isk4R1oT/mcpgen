// landing.jsx — Screen 0: Landing

const SAMPLE_APIS = [
  { id: 'lumen',    name: 'lumen payments', endpoints: 348, tools: 47, save: 76 },
  { id: 'helio',    name: 'helio commerce', endpoints: 412, tools: 52, save: 78 },
  { id: 'nimbus',   name: 'nimbus storage', endpoints: 167, tools: 28, save: 71 },
  { id: 'rookery',  name: 'rookery issues', endpoints: 234, tools: 31, save: 73 },
  { id: 'parley',   name: 'parley chat',    endpoints: 198, tools: 24, save: 75 },
];

function Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText }) {
  const [counter, setCounter] = React.useState({ endpoints: 348, tools: 47, save: 76 });

  React.useEffect(() => {
    if (sample) setCounter({ endpoints: sample.endpoints, tools: sample.tools, save: sample.save });
  }, [sample?.id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onMakeIt();
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        right={
          <>
            <a className="mc-link mc-mono" style={{ fontSize: 12 }}>docs</a>
            <a className="mc-link mc-mono" style={{ fontSize: 12 }}>pricing</a>
            <a className="mc-link mc-mono" style={{ fontSize: 12 }}>github</a>
            <Btn kind="ink" size="sm">sign in</Btn>
          </>
        }
      />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 28px 80px', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 48 }}>
          <div className="mc-display-xl" style={{ marginBottom: 12 }}>
            any API.<br/>
            production MCP.<br/>
            in <span style={{ background: 'var(--hero-grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', padding: '0 8px', fontStyle: 'italic' }}>sixty seconds</span>.
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--text-muted)', maxWidth: 540, margin: 0 }}>
            token-optimized by default. open-source CLI plus managed cloud.
            no naive 1:1 conversions allowed.
          </p>
        </div>

        {/* Big input */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div className="mc-stamp" style={{ flex: 1 }}>
            <input
              className="mc-input mc-mono"
              placeholder="paste OpenAPI / GraphQL / Postman URL..."
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              autoFocus
            />
          </div>
          <Btn kind="primary" size="lg" iconR="arrow-r" onClick={onMakeIt}>make it</Btn>
        </form>
        <div className="mc-caption" style={{ marginBottom: 36 }}>
          or drop file · paste curl examples · enter github repo URL
        </div>

        {/* Sample chips */}
        <div style={{ marginBottom: 56 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>try with</div>
          <div className="mc-chiprow">
            {SAMPLE_APIS.map(s => (
              <button
                key={s.id}
                className={`mc-chip ${sample?.id === s.id ? 'active' : ''}`}
                onClick={() => onSelectSample(s)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* CLI line */}
        <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '20px 0', marginBottom: 40 }}>
          <div className="mc-caption-up" style={{ marginBottom: 8 }}>on the command line</div>
          <div className="mc-mono" style={{ fontSize: 15 }}>
            <span style={{ color: 'var(--text-faint)' }}>$ </span>npx mcpgen init
          </div>
        </div>

        {/* Live counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '32px 0', flexWrap: 'wrap' }}>
          <CounterCell value={counter.endpoints} label="endpoints" />
          <Arrow />
          <CounterCell value={counter.tools} label="tools" />
          <Arrow />
          <CounterCell value={counter.save} label="fewer tokens" suffix="%" tint />
        </div>
        <div className="mc-caption" style={{ marginTop: -16 }}>
          live counter — keeps recalculating as you paste a URL above
        </div>

        {/* tiny brag */}
        <div style={{ marginTop: 80, padding: 24, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--paper-alt)' }}>
          <div className="mc-caption-up" style={{ marginBottom: 12 }}>featured in</div>
          <div className="mc-mono" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span>HN front page #1 · apr 18</span>
            <span>show HN top 5</span>
            <span>producthunt #1 dev tools</span>
          </div>
        </div>

        <footer style={{ marginTop: 80, paddingTop: 24, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 12 }} className="mc-mono">
          <span>© 2026 mcpgen. open source under MIT.</span>
          <span>v0.4.2 · changelog</span>
        </footer>
      </main>
    </div>
  );
}

function CounterCell({ value, label, suffix = '', tint = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        className="mc-mono"
        style={{
          fontSize: 32, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em',
          background: tint ? 'var(--primary)' : 'transparent',
          color: tint ? 'var(--primary-ink)' : 'var(--text)',
          padding: tint ? '4px 10px' : 0,
          display: 'inline-block',
          width: 'fit-content',
        }}
      >
        <CountUp value={value} />{suffix}
      </div>
      <div className="mc-caption-up">{label}</div>
    </div>
  );
}

function Arrow() {
  return <span className="mc-mono faint" style={{ fontSize: 22, fontWeight: 300 }}>→</span>;
}

if (typeof window !== 'undefined') {
  window.Landing = Landing;
  window.SAMPLE_APIS = SAMPLE_APIS;
}