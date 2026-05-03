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

const SCREENS = ['landing', 'preview', 'auth', 'stream', 'canvas', 'quality', 'playground', 'deploy', 'success', 'dashboard', 'dash-list', 'marketplace', 'server', 'billing'];

// Lightweight cross-screen demo error state — controlled by a tiny floating
// switch that shows on stream / quality / deploy. Values:
//   'none' | 'spec-fail' | 'auth-fail' | 'deploy-fail' | 'rate-limit'
window.MCPGEN_ERROR_BUS = window.MCPGEN_ERROR_BUS || { value: 'none', listeners: [] };
function useErrorMode() {
  const [v, setV] = React.useState(window.MCPGEN_ERROR_BUS.value);
  React.useEffect(() => {
    const fn = (val) => setV(val);
    window.MCPGEN_ERROR_BUS.listeners.push(fn);
    return () => {
      window.MCPGEN_ERROR_BUS.listeners = window.MCPGEN_ERROR_BUS.listeners.filter(l => l !== fn);
    };
  }, []);
  const set = (val) => {
    window.MCPGEN_ERROR_BUS.value = val;
    window.MCPGEN_ERROR_BUS.listeners.forEach(fn => fn(val));
  };
  return [v, set];
}
window.useErrorMode = useErrorMode;

function ErrorDemoSwitch({ screens }) {
  const [mode, setMode] = useErrorMode();
  const [open, setOpen] = React.useState(false);
  const opts = [
    ['none',        'happy path'],
    ['spec-fail',   'spec parse fails'],
    ['auth-fail',   'auth probe fails'],
    ['deploy-fail', 'deploy crashes'],
    ['rate-limit',  'rate limited'],
  ];
  const cur = opts.find(o => o[0] === mode) || opts[0];
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 60,
      fontFamily: 'var(--font-mono)', fontSize: 11.5,
    }}>
      {open && (
        <div style={{
          position: 'absolute', right: 0, bottom: 'calc(100% + 6px)',
          background: 'var(--card)', border: '1px solid var(--border-sharp)',
          borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
          minWidth: 200, overflow: 'hidden',
        }}>
          <div style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: '1px solid var(--border)' }}>
            demo error states
          </div>
          {opts.map(([id, label]) => (
            <div
              key={id}
              onClick={() => { setMode(id); setOpen(false); }}
              style={{
                padding: '8px 12px', cursor: 'pointer',
                background: mode === id ? 'var(--ink)' : 'transparent',
                color: mode === id ? 'var(--paper)' : 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: id === 'none' ? 'var(--success)' : 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
              {label}
            </div>
          ))}
          <div style={{ padding: '6px 12px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            applies to: {screens.join(' · ')}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '8px 12px',
          background: mode === 'none' ? 'var(--card)' : 'var(--accent)',
          color: mode === 'none' ? 'var(--text)' : '#fff',
          border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11.5,
          display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: mode === 'none' ? 'var(--success)' : '#fff', display: 'inline-block' }} />
        error: {cur[1]}
      </button>
    </div>
  );
}
window.ErrorDemoSwitch = ErrorDemoSwitch;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [screen, setScreen] = React.useState('landing');
  const [sample, setSample] = React.useState(window.SAMPLE_APIS[0]);
  const [urlText, setUrlText] = React.useState('');
  const [cmdkOpen, setCmdkOpen] = React.useState(false);
  const [marketServer, setMarketServer] = React.useState(null);
  const showErrorSwitch = ['stream', 'quality', 'deploy'].includes(screen);

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
                                onMakeIt={() => go('preview')}
                                onPricing={() => go('billing')}
                                onMarketplace={() => go('marketplace')}
                                onSignIn={() => go('dash-list')} />;
      case 'preview':    return <Preview sample={sample} onMakeIt={() => go('auth')} onBack={() => go('landing')} />;
      case 'auth':       return <AuthScreen sample={sample} onContinue={() => go('stream')} onBack={() => go('preview')} />;
      case 'stream':     return <StreamLog sample={sample} onDone={() => go('canvas')} onCancel={() => go('preview')} />;
      case 'canvas':     return <Canvas sample={sample} onPlay={() => go('playground')} onDeploy={() => go('quality')} onCmdK={() => setCmdkOpen(true)} onBack={() => go('landing')} />;
      case 'quality':    return <QualityReport sample={sample} onContinue={() => go('deploy')} onBack={() => go('canvas')} />;
      case 'playground': return <Playground sample={sample} onBack={() => go('canvas')} onDeploy={() => go('quality')} />;
      case 'deploy':     return <Deploy sample={sample} onDeployed={() => go('success')} onBack={() => go('quality')} />;
      case 'success':    return <DeploySuccess sample={sample} onDashboard={() => go('dash-list')} />;
      case 'dashboard':  return <Dashboard sample={sample} onBack={() => go('dash-list')} onPlay={() => go('playground')} />;
      case 'dash-list':  return <DashboardList
                            onLanding={() => go('landing')}
                            onOpen={(s) => { setSample(s); go('dashboard'); }}
                            onMarketplace={() => go('marketplace')}
                            onBilling={() => go('billing')}
                          />;
      case 'marketplace':return <Marketplace
                            onLanding={() => go('landing')}
                            onDashboard={() => go('dash-list')}
                            onOpen={(s) => { setMarketServer(s); go('server'); }}
                          />;
      case 'server':     return <ServerDetail
                            server={marketServer || window.MARKETPLACE_SERVERS[0]}
                            onMarketplace={() => go('marketplace')}
                            onDashboard={() => go('dash-list')}
                            onInstall={() => go('dash-list')}
                          />;
      case 'billing':    return <Billing
                            onLanding={() => go('landing')}
                            onDashboard={() => go('dash-list')}
                            onMarketplace={() => go('marketplace')}
                          />;
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
                { l: '> all my servers',               go: 'dash-list' },
                { l: '> open server detail',           go: 'dashboard' },
                { l: '> browse marketplace',           go: 'marketplace' },
                { l: '> view a marketplace listing',   go: 'server' },
                { l: '> billing & plans',              go: 'billing' },
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

      {/* Demo error-state switch (only visible on stream / quality / deploy) */}
      {showErrorSwitch && <ErrorDemoSwitch screens={['stream', 'quality', 'deploy']} />}

      {/* Global toast + drawer hosts (used by ux-glue helpers) */}
      <ToastHost />
      <DrawerHost />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider><App /></I18nProvider>
);
