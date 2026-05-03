// admin-app.jsx — shell + screen routing

const NAV = [
  { group: 'ops',     items: [
    { id: 'overview',     label: 'overview',     glyph: '◐' },
    { id: 'observability',label: 'observability',glyph: '◇' },
    { id: 'deploys',      label: 'deploys & infra', glyph: '◆' },
    { id: 'audit',        label: 'audit log',    glyph: '※' },
  ]},
  { group: 'people',  items: [
    { id: 'users',        label: 'users & orgs', glyph: '◯' },
    { id: 'support',      label: 'support inbox',glyph: '✉', alertCount: 3 },
    { id: 'broadcast',    label: 'broadcast',    glyph: '◓' },
  ]},
  { group: 'product', items: [
    { id: 'servers',      label: 'servers',      glyph: '⊟' },
    { id: 'moderation',   label: 'moderation',   glyph: '⚑', alertCount: 8 },
    { id: 'flags',        label: 'flags & exp',  glyph: '⚐' },
    { id: 'content',      label: 'content',      glyph: '¶' },
  ]},
  { group: 'platform',items: [
    { id: 'billing',      label: 'billing',      glyph: '$' },
    { id: 'llm',          label: 'llm ops',      glyph: '∿' },
    { id: 'integrations', label: 'integrations', glyph: '⌬' },
  ]},
];

function App() {
  const [authed, setAuthed] = React.useState(false);
  const [screen, setScreen] = React.useState('overview');
  const [theme, setTheme]   = React.useState('dark');
  const [density, setDensity] = React.useState('compact');
  const [demoState, setDemoState] = React.useState('default'); // empty | loading | partial | incident | maintenance | default
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [env, setEnv] = React.useState('prod');
  const [toast, setToast] = React.useState(null);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
  }, [theme, density]);

  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setPaletteOpen(true); }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const ctx = { screen, setScreen, theme, setTheme, density, setDensity, demoState, setDemoState, env, setEnv, showToast };

  if (!authed) {
    const tokens = window.computeTokens
      ? window.computeTokens({ caseStyle: 'lower', titleFont: 'Instrument Serif', bodyFont: 'Inter', monoFont: 'JetBrains Mono', density: 'compact', radius: 'sharp', shadow: 'soft', borderWeight: 'normal', palette: 'paper' })
      : {};
    return <div style={tokens}><LoginScreen onIn={() => setAuthed(true)} /></div>;
  }

  const screenEl = (() => {
    switch (screen) {
      case 'overview':      return <Overview ctx={ctx} />;
      case 'users':         return <UsersScreen ctx={ctx} />;
      case 'servers':       return <ServersScreen ctx={ctx} />;
      case 'moderation':    return <MarketplaceScreen ctx={ctx} />;
      case 'deploys':       return <DeploysScreen ctx={ctx} />;
      case 'billing':       return <BillingScreen ctx={ctx} />;
      case 'llm':           return <LLMScreen ctx={ctx} />;
      case 'observability': return <ObservabilityScreen ctx={ctx} />;
      case 'flags':         return <FlagsScreen ctx={ctx} />;
      case 'support':       return <SupportScreen ctx={ctx} />;
      case 'audit':         return <AuditScreen ctx={ctx} />;
      case 'integrations':  return <IntegrationsScreen ctx={ctx} />;
      case 'content':       return <ContentScreen ctx={ctx} />;
      case 'broadcast':     return <BroadcastScreen ctx={ctx} />;
      default: return null;
    }
  })();

  const tokens = window.computeTokens
    ? window.computeTokens({ caseStyle: 'lower', titleFont: 'Instrument Serif', bodyFont: 'Inter', monoFont: 'JetBrains Mono', density: 'compact', radius: 'sharp', shadow: 'soft', borderWeight: 'normal', palette: 'paper' })
    : {};

  return (
    <div style={tokens}>
      <div className="adm-shell" data-screen-label={`admin · ${screen}`}>
        <div className="adm-logo">
          <span className="mark">m</span>
          <span>mcpgen</span>
          <span className="ops">ops</span>
        </div>

        <div className="adm-top">
          <div className="adm-search" onClick={() => setPaletteOpen(true)}>
            <span style={{ opacity: .5 }}>⌕</span>
            <span style={{ flex: 1 }}>search users, orgs, servers, tickets, deploys…</span>
            <Kbd>⌘</Kbd><Kbd>K</Kbd>
          </div>
          <div className="adm-top-actions">
            <select className="adm-env" value={env} onChange={e => setEnv(e.target.value)} style={{ borderColor: env === 'prod' ? 'var(--accent)' : env === 'staging' ? 'var(--info)' : 'var(--success)', color: env === 'prod' ? 'var(--accent)' : env === 'staging' ? 'var(--info)' : 'var(--success)' }}>
              <option value="prod">prod</option>
              <option value="staging">staging</option>
              <option value="dev">dev</option>
            </select>
            <select className="adm-env" value={demoState} onChange={e => setDemoState(e.target.value)} title="state preview">
              <option value="default">state: default</option>
              <option value="empty">state: empty</option>
              <option value="loading">state: loading</option>
              <option value="partial">state: partial</option>
              <option value="incident">state: incident</option>
              <option value="maintenance">state: maintenance</option>
            </select>
            <span className="adm-env" onClick={() => setDensity(d => d === 'compact' ? 'comfy' : 'compact')} title="toggle density">
              {density === 'compact' ? '◧ compact' : '◨ comfy'}
            </span>
            <span className="adm-env" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} title="toggle theme">
              {theme === 'dark' ? '◐ dark' : '◑ light'}
            </span>
            <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--primary)', color: 'var(--primary-ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 11 }}>JK</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>jana · ops</span>
            </span>
          </div>
        </div>

        <nav className="adm-side">
          {NAV.map(g => (
            <div key={g.group}>
              <div className="adm-nav-group">{g.group}</div>
              {g.items.map(it => (
                <div
                  key={it.id}
                  className={`adm-nav-item ${screen === it.id ? 'sel' : ''}`}
                  onClick={() => setScreen(it.id)}
                >
                  <span className="glyph">{it.glyph}</span>
                  <span className="label">{it.label}</span>
                  {it.alertCount && <span className="count alert">{it.alertCount}</span>}
                </div>
              ))}
            </div>
          ))}
          <div style={{ padding: '14px 14px 10px', borderTop: '1px solid var(--border)', marginTop: 12 }}>
            <a href="MCPGen.html" style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}>← back to product</a>
          </div>
        </nav>

        <main className="adm-main" data-screen-label={`screen-${screen}`}>
          {screenEl}
        </main>
      </div>

      <div className="adm-statusbar">
        <span><span className="dot" /> all systems · <span className="v">98.9%</span> uptime · 30d</span>
        <span>db <span className="v">12ms</span></span>
        <span>queue <span className="v">42</span></span>
        <span>active sessions <span className="v">1,204</span></span>
        <span style={{ marginLeft: 'auto' }}>build <span className="v">a91c4e2</span> · 2 min ago</span>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} go={(s) => { setScreen(s); setPaletteOpen(false); }} />}
      {toast && <div className="adm-toast">✓ {toast}</div>}
      <ToastHost />
      <DrawerHost />
    </div>
  );
}

function CommandPalette({ onClose, go }) {
  const groups = [
    { label: 'navigate', items: [
      { l: 'go to overview',         go: 'overview', kbd: 'g o' },
      { l: 'go to users & orgs',     go: 'users',    kbd: 'g u' },
      { l: 'go to servers',          go: 'servers',  kbd: 'g s' },
      { l: 'go to moderation queue', go: 'moderation', kbd: 'g m' },
      { l: 'go to deploys & infra',  go: 'deploys',  kbd: 'g d' },
      { l: 'go to billing',          go: 'billing',  kbd: 'g b' },
      { l: 'go to llm ops',          go: 'llm' },
      { l: 'go to observability',    go: 'observability' },
      { l: 'go to flags & exp',      go: 'flags' },
      { l: 'go to support inbox',    go: 'support' },
      { l: 'go to audit log',        go: 'audit' },
      { l: 'go to integrations',     go: 'integrations' },
      { l: 'go to content',          go: 'content' },
      { l: 'go to broadcast',        go: 'broadcast' },
    ]},
    { label: 'jump to', items: [
      { l: 'find user · mira@lumen.dev',    ctx: 'u_8f12 · lumen-payments' },
      { l: 'find user · priya@northwind.co',ctx: 'u_4b78 · flagged' },
      { l: 'find server · grove-knowledge', ctx: 's_gv01 · live · 4.0.0' },
      { l: 'find server · klipo-clip-tools',ctx: 's_kp01 · incident' },
      { l: 'find ticket · #t_881',          ctx: 'urgent · sla 52m' },
      { l: 'find deploy · a91c4e2',         ctx: '2 min ago · success' },
    ]},
    { label: 'actions', items: [
      { l: 'suspend user…',          ctx: 'requires reason' },
      { l: 'impersonate user…',      ctx: 'logged · 4-eyes' },
      { l: 'force re-deploy server…',ctx: 'choose region' },
      { l: 'rollback server…',       ctx: 'choose version' },
      { l: 'takedown listing…',      ctx: 'requires reason' },
      { l: 'issue refund…',          ctx: 'requires ticket id' },
      { l: 'rotate api key…',        ctx: 'audited' },
      { l: 'kill switch — region…',  ctx: 'requires 2 admins' },
      { l: 'gdpr export…',           ctx: '<24h sla' },
      { l: 'broadcast system message…' },
    ]},
  ];
  return (
    <div className="adm-palette-veil" onClick={onClose}>
      <div className="adm-palette" onClick={e => e.stopPropagation()}>
        <input className="adm-palette-input" placeholder="type a command, name, or id…" autoFocus />
        <div className="adm-palette-list">
          {groups.map(g => (
            <div key={g.label}>
              <div className="adm-palette-cat">{g.label}</div>
              {g.items.map((it, i) => (
                <div key={i} className={`adm-palette-item ${g.label === 'navigate' && i === 0 ? 'sel' : ''}`} onClick={() => it.go && go(it.go)}>
                  <span className="glyph">›</span>
                  <span className="target">{it.l}</span>
                  {it.ctx && <span className="ctx">{it.ctx}</span>}
                  {it.kbd && <span className="kbd">{it.kbd}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
