// screen-preview.jsx — Screen 1: Live preview / bento + Tools Review + Generation Settings

const PREVIEW_CATEGORIES = [
  { id: 'charges',   label: 'transactions', count: 24, on: true,  rare: false },
  { id: 'customers', label: 'accounts',     count: 18, on: true,  rare: false },
  { id: 'subs',      label: 'plans',        count: 15, on: true,  rare: false },
  { id: 'reports',   label: 'reports',      count: 8,  on: false, rare: true },
  { id: 'issuing',   label: 'card-issuing', count: 32, on: false, rare: true },
];

const EXCLUDED_ENDPOINTS_INIT = [
  { method: 'POST',   path: '/v1/legacy_charges/migrate', reason: 'deprecated · sunsets 2026-Q3',           override: true  },
  { method: 'GET',    path: '/admin/internal_state',      reason: 'internal · /admin namespace',              override: false },
  { method: 'GET',    path: '/v1/charges/list',           reason: 'subsumed by /v1/charges/search',           override: true  },
  { method: 'POST',   path: '/v1/webhooks/test',          reason: 'side-effect: writes test data',            override: true  },
  { method: 'DELETE', path: '/v1/customers/:id/purge',    reason: 'destructive · GDPR-only',                  override: true  },
  { method: 'GET',    path: '/v1/_health',                reason: 'meta endpoint · no business value',        override: false },
  { method: 'PATCH',  path: '/v1/legacy_charges/:id',     reason: 'deprecated · use /v1/charges',             override: true  },
  { method: 'POST',   path: '/v1/admin/regenerate_keys',  reason: 'internal · /admin namespace',              override: false },
];

function Preview({ sample, onMakeIt, onBack }) {
  const [cats, setCats] = React.useState(PREVIEW_CATEGORIES);
  const [combine, setCombine] = React.useState(null);
  const [excludedOpen, setExcludedOpen] = React.useState(false);
  const [included, setIncluded] = React.useState(new Set()); // ids that user manually re-included
  const [excluded] = React.useState(EXCLUDED_ENDPOINTS_INIT);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [complexity, setComplexity] = React.useState('standard');
  const [serverName, setServerName] = React.useState(`${sample?.id || 'lumen'}-mcp`);
  const [advancedOpen, setAdvancedOpen] = React.useState(false);

  const toggle = (id) => setCats(cs => cs.map(c => c.id === id ? { ...c, on: !c.on } : c));
  const includeEndpoint = (path) => setIncluded(s => new Set([...s, path]));

  const totalEndpoints = sample?.endpoints || 348;
  const naiveTokens = 14200;
  const baseOptTokens = combine === 'yes' ? 2800 : 3400;
  const optTokens = baseOptTokens + included.size * 42; // each re-included endpoint adds tokens
  const pct = Math.round((1 - optTokens / naiveTokens) * 100);
  const dollars = ((naiveTokens - optTokens) / 1000 * 0.015).toFixed(2);

  const COMPLEXITY = {
    minimal:       { tools: 15, label: 'minimal',       desc: 'core ops only — list / get / create essentials' },
    standard:      { tools: 47, label: 'standard',      desc: 'balanced for most use cases' },
    comprehensive: { tools: 92, label: 'comprehensive', desc: 'every non-internal endpoint, including edge cases' },
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`${sample?.name || 'lumen-payments'}-mcp · draft`}
        onLogo={onBack}
        right={
          <>
            <span className="mc-caption">step 01 of 04</span>
            <Btn kind="ghost" size="sm" onClick={onBack}>discard</Btn>
          </>
        }
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '40px 28px 64px', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 32 }}>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>step 01 · review</div>
          <div className="mc-display-l">we read your spec.<br/>here's what we'd build.</div>
        </div>

        {/* Bento */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20, marginBottom: 20 }}>
          {/* Detected */}
          <Card>
            <SectionLabel right={
              <button onClick={() => setSettingsOpen(true)} className="mc-link mc-mono" style={{ background: 'none', border: 0, fontSize: 11, padding: 0, cursor: 'pointer' }}>
                tune settings →
              </button>
            }>detected</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 18px', marginBottom: 18 }} className="mc-mono">
              <span className="muted">format</span><span>OpenAPI 3.1</span>
              <span className="muted">endpoints</span><span>{totalEndpoints} · <span className="muted">{COMPLEXITY[complexity].tools} included</span></span>
              <span className="muted">categories</span><span>{cats.length}</span>
              <span className="muted">complexity</span><span>{COMPLEXITY[complexity].label}</span>
              <span className="muted">auth</span><span>oauth + api key</span>
            </div>

            <div className="mc-caption-up" style={{ marginBottom: 10 }}>categories — toggle to include</div>
            <div className="col" style={{ gap: 6 }}>
              {cats.map(c => (
                <label key={c.id} className="mc-tcb row-bw" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span className="row" style={{ gap: 8 }}>
                    <input type="checkbox" checked={c.on} onChange={() => toggle(c.id)} />
                    <span className="glyph">{c.on ? '☑' : '☐'}</span>
                    <span style={{ fontSize: 13 }}>{c.label}</span>
                    <span className="muted" style={{ fontSize: 12 }}>({c.count})</span>
                  </span>
                  {c.rare && <span className="muted" style={{ fontSize: 11 }}>rare · skip by default</span>}
                </label>
              ))}
            </div>
          </Card>

          {/* Token budget */}
          <Card>
            <SectionLabel right={<span className="mc-mono" style={{ fontSize: 11 }}>opus pricing</span>}>token budget</SectionLabel>

            <div style={{ marginBottom: 18 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="mc-caption">naive 1:1</span>
                <span className="mc-mono">{naiveTokens.toLocaleString()} tk</span>
              </div>
              <BlockBar value={naiveTokens} max={naiveTokens} width={28} dim />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="mc-caption" style={{ color: 'var(--text)' }}>with mcpgen</span>
                <span className="mc-mono"><CountUp value={optTokens} /> tk</span>
              </div>
              <BlockBar value={optTokens} max={naiveTokens} width={28} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div className="mc-mono" style={{ fontSize: 28, fontWeight: 500, color: 'var(--success)', letterSpacing: '-0.02em', lineHeight: 1 }}>
                ↓ <CountUp value={pct} />%
              </div>
              <div className="mc-caption" style={{ marginTop: 4 }}>
                ≈ ${dollars} saved per session
              </div>
            </div>
          </Card>
        </div>

        {/* AI suggestion */}
        <div className="mc-ai-strip" style={{ marginBottom: 16 }}>
          <Icon name="spark" size={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
              12 endpoints look like they belong together.
            </div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              <span className="mc-mono">orders.create</span>, <span className="mc-mono">orders.get</span>, <span className="mc-mono">orders.update</span>, … combine into 3 composite tools? saves another 600 tk.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Btn kind="ghost" size="sm" onClick={() => setCombine('no')}>keep separate</Btn>
              <Btn kind="ink" size="sm" onClick={() => setCombine('yes')} icon={combine === 'yes' ? 'check' : null}>
                {combine === 'yes' ? 'merge applied' : 'combine — show me the merge'}
              </Btn>
            </div>
          </div>
        </div>

        {/* Excluded endpoints (collapsible) */}
        <div className="mc-excluded">
          <div className="mc-excluded-head" onClick={() => setExcludedOpen(o => !o)}>
            <div className="row" style={{ gap: 10 }}>
              <Icon name={excludedOpen ? 'caret-d' : 'caret-r'} size={11} />
              <span className="mc-caption-up">endpoints not included</span>
              <Badge kind="soft">{excluded.length - included.size}</Badge>
              {included.size > 0 && <Badge kind="accent">+{included.size} restored</Badge>}
            </div>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>
              {excludedOpen ? 'hide' : 'show'} →
            </span>
          </div>
          {excludedOpen && (
            <div className="mc-excluded-table">
              {excluded.map(e => {
                const isIncluded = included.has(e.path);
                return (
                  <div key={e.path} className="mc-excluded-row" style={{ opacity: isIncluded ? .55 : 1 }}>
                    <span className={`mc-method ${e.method}`}>{e.method}</span>
                    <span title={e.path} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.path}</span>
                    <span className="muted" style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5 }}>{e.reason}</span>
                    <div style={{ textAlign: 'right' }}>
                      {isIncluded ? (
                        <span className="mc-caption" style={{ color: 'var(--success)' }}>✓ added</span>
                      ) : e.override ? (
                        <Btn kind="ghost" size="sm" onClick={() => includeEndpoint(e.path)}>include</Btn>
                      ) : (
                        <span className="mc-caption" title="locked — internal endpoint" style={{ opacity: .5 }}>locked</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Re-gen banner */}
        {included.size > 0 && (
          <div className="mc-banner" style={{ marginTop: 12 }}>
            <Icon name="warn" size={14} />
            <span style={{ flex: 1 }}>
              you added <strong>{included.size}</strong> endpoint{included.size === 1 ? '' : 's'}. re-run generation to include {included.size === 1 ? 'it' : 'them'}?
            </span>
            <Btn kind="ink" size="sm" onClick={() => window.mcpToast(`re-running with ${included.size} new endpoint${included.size===1?'':'s'}…`)}>re-generate</Btn>
            <Btn kind="ghost" size="sm" onClick={onMakeIt}>continue without</Btn>
          </div>
        )}

        <div style={{ height: 24 }} />

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={onMakeIt}>continue · auth setup</Btn>
        <div className="mc-caption" style={{ textAlign: 'center', marginTop: 12 }}>
          you can always tune individual tools after generation.
        </div>
      </main>

      {/* Generation Settings modal */}
      {settingsOpen && (
        <div className="mc-modal-veil" onClick={() => setSettingsOpen(false)}>
          <div className="mc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mc-modal-head">
              <div>
                <div className="mc-caption-up">generation settings</div>
                <div className="mc-h2" style={{ marginTop: 2 }}>tune the build</div>
              </div>
              <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => setSettingsOpen(false)} style={{ padding: '0 8px' }}><Icon name="x" size={11} /></button>
            </div>
            <div className="mc-modal-body">
              <SectionLabel>target complexity</SectionLabel>
              <div className="col" style={{ gap: 8, marginBottom: 20 }}>
                {Object.entries(COMPLEXITY).map(([k, v]) => (
                  <button key={k} onClick={() => setComplexity(k)} className={`mc-mode ${complexity === k ? 'sel' : ''}`}>
                    <span className="mc-mode-radio">{complexity === k ? '◉' : '○'}</span>
                    <div style={{ flex: 1 }}>
                      <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{v.label}</span>
                        <span className="mc-caption nowrap" style={{ fontSize: 11 }}>~{v.tools}&nbsp;tools</span>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{v.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              <SectionLabel>categories</SectionLabel>
              <div className="col" style={{ gap: 4, marginBottom: 20 }}>
                {cats.map(c => (
                  <label key={c.id} className="mc-tcb row-bw" style={{ padding: '5px 0' }}>
                    <span className="row" style={{ gap: 8 }}>
                      <input type="checkbox" checked={c.on} onChange={() => toggle(c.id)} />
                      <span className="glyph">{c.on ? '☑' : '☐'}</span>
                      <span style={{ fontSize: 13 }}>{c.label}</span>
                      <span className="muted" style={{ fontSize: 12 }}>({c.count} endpoints)</span>
                    </span>
                    {c.rare && <span className="muted" style={{ fontSize: 11 }}>⚠ rarely used</span>}
                  </label>
                ))}
              </div>

              <div className="mc-rule-dashed" style={{ margin: '12px 0' }} />

              <button onClick={() => setAdvancedOpen(o => !o)} className="row" style={{ gap: 6, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--text)', marginBottom: advancedOpen ? 12 : 0 }}>
                <Icon name={advancedOpen ? 'caret-d' : 'caret-r'} size={11} />
                <span className="mc-caption-up">advanced</span>
              </button>

              {advancedOpen && (
                <div className="col" style={{ gap: 14 }}>
                  <div>
                    <div className="mc-caption-up" style={{ marginBottom: 6 }}>server name</div>
                    <input className="mc-input mc-mono" value={serverName} onChange={(e) => setServerName(e.target.value)} style={{ height: 36, fontSize: 12.5 }} />
                  </div>
                  <div>
                    <div className="row-bw" style={{ marginBottom: 6 }}>
                      <span className="mc-caption-up">override max-tools cap</span>
                      <Badge kind="accent">pro</Badge>
                    </div>
                    <input className="mc-input mc-mono" placeholder="default · 100" disabled style={{ height: 36, fontSize: 12.5, opacity: .5 }} />
                  </div>
                </div>
              )}
            </div>
            <div className="mc-modal-foot">
              <span className="mc-caption">applies on next generation</span>
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ghost" size="sm" onClick={() => setSettingsOpen(false)}>cancel</Btn>
                <Btn kind="ink" size="sm" onClick={() => setSettingsOpen(false)}>apply</Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.Preview = Preview;
