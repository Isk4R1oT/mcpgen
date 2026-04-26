// app.jsx — main router + tweaks panel + cmdk

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "palette": "A",
  "fonts": "pp",
  "borders": "soft",
  "shadows": "block",
  "case": "lower",
  "density": "compact",
  "bg": "paper"
}/*EDITMODE-END*/;

const SCREENS = ['landing', 'preview', 'auth', 'stream', 'canvas', 'quality', 'playground', 'deploy', 'success', 'dashboard'];

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('landing');
  const [sample, setSample] = React.useState(window.SAMPLE_APIS[0]);
  const [urlText, setUrlText] = React.useState('');
  const [cmdkOpen, setCmdkOpen] = React.useState(false);

  // Apply CSS vars to root
  const cssVars = window.MCPTokens.makeCssVars(t);
  const rootStyle = Object.fromEntries(Object.entries(cssVars));

  // Cmd+K
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(o => !o);
      } else if (e.key === 'Escape') {
        setCmdkOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (s) => { setScreen(s); setCmdkOpen(false); window.scrollTo(0, 0); };

  const screenEl = (() => {
    switch (screen) {
      case 'landing':    return <Landing sample={sample} urlText={urlText} setUrlText={setUrlText}
                                onSelectSample={(s) => { setSample(s); setUrlText(`https://api.${s.id}.dev/openapi.json`); }}
                                onMakeIt={() => go('preview')} />;
      case 'preview':    return <Preview sample={sample} onMakeIt={() => go('auth')} onBack={() => go('landing')} />;
      case 'auth':       return <AuthScreen sample={sample} onContinue={() => go('stream')} onBack={() => go('preview')} />;
      case 'stream':     return <StreamLog sample={sample} onDone={() => go('canvas')} onCancel={() => go('preview')} />;
      case 'canvas':     return <Canvas sample={sample} onPlay={() => go('playground')} onDeploy={() => go('quality')} onCmdK={() => setCmdkOpen(true)} onBack={() => go('landing')} />;
      case 'quality':    return <QualityReport sample={sample} onContinue={() => go('deploy')} onBack={() => go('canvas')} />;
      case 'playground': return <Playground sample={sample} onBack={() => go('canvas')} onDeploy={() => go('quality')} />;
      case 'deploy':     return <Deploy sample={sample} onDeployed={() => go('success')} onBack={() => go('quality')} />;
      case 'success':    return <DeploySuccess sample={sample} onDashboard={() => go('dashboard')} />;
      case 'dashboard':  return <Dashboard sample={sample} onBack={() => go('landing')} onPlay={() => go('playground')} />;
      default: return null;
    }
  })();

  return (
    <div style={rootStyle} data-mcpgen-root data-case={t.case} className="mc-page">
      {screenEl}

      {/* Screen pip nav (always visible, bottom-left) */}
      <div style={{
        position: 'fixed', left: 16, bottom: screen === 'canvas' ? 44 : 16, zIndex: 50,
        background: 'var(--card)', border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: 'var(--font-mono)', fontSize: 11,
      }}>
        <span className="muted">flow</span>
        {SCREENS.map((s, i) => (
          <button
            key={s}
            onClick={() => go(s)}
            title={s}
            style={{
              width: 22, height: 22, padding: 0, border: '1px solid var(--border)',
              background: screen === s ? 'var(--ink)' : 'transparent',
              color: screen === s ? 'var(--paper)' : 'var(--text)',
              fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
              borderRadius: 'var(--radius)',
            }}
          >{i}</button>
        ))}
      </div>

      {/* Cmd+K palette */}
      {cmdkOpen && (
        <div className="mc-cmdk-veil" onClick={() => setCmdkOpen(false)}>
          <div className="mc-cmdk" onClick={(e) => e.stopPropagation()}>
            <input className="mc-cmdk-input" placeholder="search commands…" autoFocus />
            <div className="mc-cmdk-list">
              {[
                { l: '> paste new api spec',           go: 'landing' },
                { l: '> review preview',               go: 'preview' },
                { l: '> set up authentication',        go: 'auth' },
                { l: '> open server canvas',           go: 'canvas' },
                { l: '> view quality report',          go: 'quality' },
                { l: '> test in playground',           go: 'playground' },
                { l: '> deploy',                       go: 'deploy' },
                { l: '> open dashboard',               go: 'dashboard' },
              ].map((c, i) => (
                <div key={c.l} className={`mc-cmdk-item ${i === 0 ? 'sel' : ''}`} onClick={() => go(c.go)}>
                  <span>{c.l}</span>
                  <small>↩</small>
                </div>
              ))}
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>recent</div>
              <div className="mc-cmdk-item">{sample?.name}-mcp <small>just now</small></div>
            </div>
          </div>
        </div>
      )}

      {/* Tweaks panel removed — settings locked in via TWEAK_DEFAULTS */}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
