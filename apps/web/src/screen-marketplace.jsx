// screen-marketplace.jsx — public marketplace of MCP servers (github-for-mcp)

const MARKETPLACE_SERVERS = [
  { id: 'stripe-official',  name: 'stripe-mcp',          author: 'stripe', verified: true,  tools: 64, stars: 4280, installs: 42100, weekly: 8200, desc: 'official mcp server for stripe payments. charges, customers, subscriptions, and disputes.', tags: ['payments','official','stripe'], updated: '2 days ago', license: 'mit', forks: 38 },
  { id: 'github-explorer',  name: 'github-explorer-mcp', author: 'octocat',verified: true,  tools: 38, stars: 3120, installs: 28400, weekly: 5400, desc: 'browse repositories, read files, search code, and review PRs. token-optimized for big monorepos.', tags: ['developer','github','popular'], updated: '4 hours ago', license: 'mit', forks: 142 },
  { id: 'linear-issues',    name: 'linear-mcp',          author: 'linear', verified: true,  tools: 22, stars: 1840, installs: 14200, weekly: 3100, desc: 'manage linear issues, cycles, and projects from your agent.', tags: ['productivity','linear','official'], updated: '1 week ago', license: 'mit', forks: 24 },
  { id: 'helio-commerce',   name: 'helio-commerce-mcp',  author: 'kira',   verified: false, tools: 52, stars: 142,  installs: 2840,  weekly: 380,  desc: 'unofficial helio commerce wrapper. orders, products, inventory, with tool composition for multi-step lifecycle.', tags: ['ecommerce','helio'], updated: '5 days ago', license: 'mit', forks: 6, mine: true },
  { id: 'nimbus-storage',   name: 'nimbus-storage-mcp',  author: 'kira',   verified: false, tools: 28, stars: 89,   installs: 1212,  weekly: 188,  desc: 'object-storage operations: upload, list, signed urls, and lifecycle rules.', tags: ['storage','nimbus'], updated: '1 day ago', license: 'mit', forks: 2, mine: true },
  { id: 'notion-pages',     name: 'notion-mcp',          author: 'midnight-co', verified: false, tools: 19, stars: 928, installs: 9100, weekly: 1240, desc: 'read and write notion pages, databases, and blocks.', tags: ['productivity','notion'], updated: '6 days ago', license: 'mit', forks: 41 },
  { id: 'shopify-store',    name: 'shopify-mcp',         author: 'shopify', verified: true,  tools: 71, stars: 2210, installs: 18600, weekly: 4100, desc: 'shopify admin api as mcp. products, orders, customers, fulfillment.', tags: ['ecommerce','shopify','official'], updated: '3 days ago', license: 'mit', forks: 28 },
  { id: 'pg-explorer',      name: 'postgres-explorer-mcp', author: 'darkhorse', verified: false, tools: 14, stars: 612, installs: 8400, weekly: 1820, desc: 'safe read-only postgres explorer with query plans and schema inspection.', tags: ['database','postgres'], updated: '2 weeks ago', license: 'mit', forks: 34 },
  { id: 'twilio-msg',       name: 'twilio-mcp',          author: 'twilio', verified: true,  tools: 31, stars: 1140, installs: 9800, weekly: 1620, desc: 'sms, voice, and verify api as tools. zero-token-bloat schemas.', tags: ['communications','twilio','official'], updated: '5 days ago', license: 'mit', forks: 12 },
];

const CATEGORIES = [
  { id: 'all',           label: 'all',           count: MARKETPLACE_SERVERS.length },
  { id: 'official',      label: 'official',      count: MARKETPLACE_SERVERS.filter(s => s.verified).length },
  { id: 'payments',      label: 'payments',      count: 1 },
  { id: 'developer',     label: 'developer tools', count: 2 },
  { id: 'productivity',  label: 'productivity',  count: 2 },
  { id: 'ecommerce',     label: 'ecommerce',     count: 2 },
  { id: 'database',      label: 'database',      count: 1 },
  { id: 'communications',label: 'communications',count: 1 },
];

function Marketplace({ onBack, onDashboard, onOpen, onLanding }) {
  const { t } = window.useI18n();
  const [cat, setCat] = React.useState('all');
  const [sort, setSort] = React.useState('popular'); // popular|recent|installs|tools
  const [query, setQuery] = React.useState('');
  const [scope, setScope] = React.useState('all'); // all|verified|mine
  const [acFocus, setAcFocus] = React.useState(false);
  const [acIdx, setAcIdx] = React.useState(0);
  const acRef = React.useRef(null);

  // Autocomplete: blend of name matches, tag matches, and recent searches
  const RECENT = ['stripe', 'github', 'postgres'];
  const SUGGEST_TAGS = ['payments', 'official', 'database', 'github', 'storage'];
  const acQuery = query.toLowerCase().trim();
  const acItems = (() => {
    if (!acQuery) {
      return [
        ...RECENT.map(q => ({ kind: 'recent', label: q, hint: 'recent' })),
        ...SUGGEST_TAGS.slice(0, 4).map(t => ({ kind: 'tag', label: `#${t}`, q: t, hint: 'tag' })),
      ];
    }
    const matches = [];
    MARKETPLACE_SERVERS.forEach(s => {
      if (s.name.toLowerCase().includes(acQuery)) matches.push({ kind: 'server', label: s.name, hint: `by ${s.author} · ${s.tools} tools`, server: s });
      else if (s.author.toLowerCase().includes(acQuery)) matches.push({ kind: 'server', label: s.name, hint: `by ${s.author}`, server: s });
    });
    SUGGEST_TAGS.forEach(t => {
      if (t.includes(acQuery) && t !== acQuery) matches.push({ kind: 'tag', label: `#${t}`, q: t, hint: 'tag' });
    });
    if (matches.length === 0) matches.push({ kind: 'fallback', label: `search "${query}"`, hint: 'no exact match', q: query });
    return matches.slice(0, 6);
  })();

  React.useEffect(() => { setAcIdx(0); }, [query]);

  const pickAc = (item) => {
    if (item.kind === 'server') {
      onOpen(item.server);
    } else if (item.kind === 'tag') {
      setQuery('');
      setCat(item.q);
    } else {
      setQuery(item.q || item.label);
    }
    setAcFocus(false);
  };

  const onAcKey = (e) => {
    if (!acFocus) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAcIdx(i => Math.min(i + 1, acItems.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setAcIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter')     { e.preventDefault(); if (acItems[acIdx]) pickAc(acItems[acIdx]); }
    if (e.key === 'Escape')    { setAcFocus(false); }
  };

  // close autocomplete when clicking outside
  React.useEffect(() => {
    const onClick = (e) => {
      if (acRef.current && !acRef.current.contains(e.target)) setAcFocus(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // expanded filters
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [licenseFilter, setLicenseFilter] = React.useState('any'); // any|mit|apache
  const [minStars, setMinStars] = React.useState(0);
  const [updatedWithin, setUpdatedWithin] = React.useState('any'); // any|week|month

  const filtered = MARKETPLACE_SERVERS.filter(s => {
    if (cat !== 'all' && cat !== 'official' && !s.tags.includes(cat)) return false;
    if (cat === 'official' && !s.verified) return false;
    if (scope === 'verified' && !s.verified) return false;
    if (scope === 'mine' && !s.mine) return false;
    if (licenseFilter !== 'any' && s.license !== licenseFilter) return false;
    if (minStars > 0 && s.stars < minStars) return false;
    if (updatedWithin === 'week' && !/(hour|day)s?\s+ago|^[1-6]\s+days?/.test(s.updated)) return false;
    if (updatedWithin === 'month' && /weeks? ago/.test(s.updated) && parseInt(s.updated, 10) > 4) return false;
    if (query) {
      const q = query.toLowerCase();
      if (!s.name.toLowerCase().includes(q) && !s.desc.toLowerCase().includes(q) && !s.tags.some(t => t.includes(q))) return false;
    }
    return true;
  }).sort((a, b) => {
    if (sort === 'recent')   return 0; // assume already
    if (sort === 'installs') return b.installs - a.installs;
    if (sort === 'tools')    return b.tools - a.tools;
    return b.stars - a.stars;
  });

  const featured = MARKETPLACE_SERVERS.find(s => s.id === 'stripe-official');
  const trending = [...MARKETPLACE_SERVERS].sort((a,b) => b.weekly - a.weekly).slice(0, 3);
  const activeFilterCount = (licenseFilter !== 'any' ? 1 : 0) + (minStars > 0 ? 1 : 0) + (updatedWithin !== 'any' ? 1 : 0);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="marketplace"
        onLogo={onLanding}
        right={
          <>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onDashboard}>{t('myServers')}</button>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => window.mcpToast('opening billing…')}>{t('billing')}</button>
            <LangSwitcher />
            <Btn kind="primary" size="sm" icon="plus" onClick={onLanding}>{t('publish')}</Btn>
          </>
        }
      />

      <main style={{ maxWidth: 1240, margin: '0 auto', padding: '32px 28px 64px', position: 'relative', zIndex: 2 }}>
        {/* Hero search */}
        <div style={{ marginBottom: 32 }}>
          <div className="mc-display-l" style={{ marginBottom: 8 }}>{t('marketplaceTitle')}</div>
          <div className="mc-mono muted" style={{ fontSize: 13, marginBottom: 20 }}>
            {t('marketplaceSub')} · {MARKETPLACE_SERVERS.length} {t('servers')} · {(MARKETPLACE_SERVERS.reduce((a,s) => a + s.installs, 0)).toLocaleString()} installs
          </div>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <div ref={acRef} style={{ flex: 1, position: 'relative' }}>
              <div className="mc-stamp">
                <input
                  className="mc-input mc-mono"
                  placeholder={t('searchSrv')}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setAcFocus(true); }}
                  onFocus={() => setAcFocus(true)}
                  onKeyDown={onAcKey}
                  style={{ height: 48, fontSize: 14 }}
                />
              </div>

              {/* Autocomplete dropdown */}
              {acFocus && acItems.length > 0 && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                  background: 'var(--card)',
                  border: '1px solid var(--border-sharp)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow)',
                  zIndex: 30, overflow: 'hidden',
                }}>
                  {!acQuery && (
                    <div className="mc-caption-up" style={{
                      padding: '8px 12px 4px', fontSize: 10, opacity: .7,
                    }}>recent &amp; popular</div>
                  )}
                  {acItems.map((item, i) => (
                    <div
                      key={i}
                      className="mc-cmdk-item"
                      onMouseEnter={() => setAcIdx(i)}
                      onMouseDown={(e) => { e.preventDefault(); pickAc(item); }}
                      style={{
                        background: i === acIdx ? 'var(--ink)' : 'transparent',
                        color: i === acIdx ? 'var(--paper)' : 'var(--text)',
                        borderRadius: 0, padding: '10px 14px', fontSize: 13,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      }}
                    >
                      <Icon name={item.kind === 'server' ? 'cloud' : item.kind === 'tag' ? 'spark' : 'search'} size={11} />
                      <span style={{ flex: 1, fontFamily: 'var(--font-mono)' }}>{item.label}</span>
                      <span style={{ fontSize: 10.5, opacity: .65 }}>{item.hint}</span>
                    </div>
                  ))}
                  <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>↑↓ navigate · ⏎ open · esc close</span>
                    <span>{acItems.length} results</span>
                  </div>
                </div>
              )}
            </div>

            <div className="mc-chiprow" style={{ alignItems: 'stretch' }}>
              {[['all',t('all')],['verified',t('verifiedOnly')],['mine',t('myPublished')]].map(([id, label]) => (
                <button key={id} className={`mc-chip ${scope === id ? 'active' : ''}`} onClick={() => setScope(id)} style={{ height: 48, padding: '0 14px' }}>{label}</button>
              ))}
            </div>

            {/* Advanced filters toggle */}
            <button
              className={`mc-chip ${filtersOpen || activeFilterCount > 0 ? 'active' : ''}`}
              onClick={() => setFiltersOpen(o => !o)}
              style={{ height: 48, padding: '0 14px' }}
              title="advanced filters"
            >
              <Icon name="filter" size={11} /> filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </button>
          </div>

          {/* Expandable advanced filter panel */}
          {filtersOpen && (
            <div className="mc-card" style={{ marginTop: 10, padding: 16 }}>
              <div className="row-bw" style={{ marginBottom: 14 }}>
                <span className="mc-caption-up">advanced filters</span>
                {activeFilterCount > 0 && (
                  <a className="mc-link" style={{ fontSize: 11 }} onClick={() => { setLicenseFilter('any'); setMinStars(0); setUpdatedWithin('any'); }}>clear all</a>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
                <div>
                  <div className="mc-caption" style={{ fontSize: 11, marginBottom: 6 }}>license</div>
                  <div className="mc-chiprow">
                    {[['any','any'],['mit','mit'],['apache','apache']].map(([id, label]) => (
                      <button key={id} className={`mc-chip ${licenseFilter === id ? 'active' : ''}`} onClick={() => setLicenseFilter(id)} style={{ height: 28, fontSize: 11 }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mc-caption" style={{ fontSize: 11, marginBottom: 6 }}>minimum stars</div>
                  <div className="mc-chiprow">
                    {[[0,'any'],[100,'100+'],[1000,'1k+'],[2000,'2k+']].map(([v, label]) => (
                      <button key={v} className={`mc-chip ${minStars === v ? 'active' : ''}`} onClick={() => setMinStars(v)} style={{ height: 28, fontSize: 11 }}>{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mc-caption" style={{ fontSize: 11, marginBottom: 6 }}>updated within</div>
                  <div className="mc-chiprow">
                    {[['any','any'],['week','week'],['month','month']].map(([id, label]) => (
                      <button key={id} className={`mc-chip ${updatedWithin === id ? 'active' : ''}`} onClick={() => setUpdatedWithin(id)} style={{ height: 28, fontSize: 11 }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Featured banner */}
        {!query && cat === 'all' && scope === 'all' && (
          <div className="mc-card" style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 0 }}>
              <div style={{ padding: 28 }}>
                <div className="mc-caption-up" style={{ marginBottom: 12 }}>featured this week</div>
                <div className="mc-h1" style={{ marginBottom: 8 }}>{featured.name}</div>
                <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 16, maxWidth: 480 }}>
                  {featured.desc} written by the {featured.author} platform team. token-optimized down to 76% fewer tokens vs naive 1:1 generation.
                </div>
                <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {featured.tags.map(t => <Badge key={t} mono={false}>#{t}</Badge>)}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn kind="primary" size="md" iconR="arrow-r" onClick={() => onOpen(featured)}>view server</Btn>
                  <Btn kind="ghost" size="md" icon="copy" onClick={() => { navigator.clipboard?.writeText(`mcpgen install ${featured.author}/${featured.name}`); window.mcpToast('install command copied'); }}>install</Btn>
                </div>
              </div>
              <div style={{ background: 'var(--primary)', color: 'var(--primary-ink)', padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div className="mc-caption-up" style={{ color: 'var(--primary-ink)', opacity: .7 }}>this week</div>
                  <div className="mc-mono" style={{ fontSize: 56, fontWeight: 500, lineHeight: 1, marginTop: 8, letterSpacing: '-0.02em' }}>+{featured.weekly.toLocaleString()}</div>
                  <div className="mc-mono" style={{ fontSize: 12 }}>installs</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontFamily: 'var(--font-mono)' }}>
                  <div><div style={{ fontSize: 11, opacity: .7 }}>stars</div><div style={{ fontSize: 18, fontWeight: 500 }}>★ {featured.stars.toLocaleString()}</div></div>
                  <div><div style={{ fontSize: 11, opacity: .7 }}>tools</div><div style={{ fontSize: 18, fontWeight: 500 }}>{featured.tools}</div></div>
                  <div><div style={{ fontSize: 11, opacity: .7 }}>forks</div><div style={{ fontSize: 18, fontWeight: 500 }}>{featured.forks}</div></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28 }}>
          {/* Sidebar */}
          <aside>
            <div className="mc-caption-up" style={{ marginBottom: 10 }}>{t('categories')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 24 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCat(c.id)} className="mc-tool-item" style={{
                  background: cat === c.id ? 'var(--ink)' : 'transparent',
                  color:      cat === c.id ? 'var(--paper)' : 'var(--text)',
                  fontSize: 13, padding: '7px 10px', cursor: 'pointer',
                  border: 0, textAlign: 'left',
                }}>
                  <span className="name">{c.label}</span>
                  <span className="tk">{c.count}</span>
                </button>
              ))}
            </div>

            <div className="mc-caption-up" style={{ marginBottom: 10 }}>{t('trending')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trending.map((s, i) => (
                <div key={s.id} onClick={() => onOpen(s)} style={{ cursor: 'pointer' }}>
                  <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                    <span className="mc-mono" style={{ fontSize: 11, color: 'var(--text-faint)', minWidth: 16 }}>#{i+1}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="mc-mono" style={{ fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div className="mc-mono muted" style={{ fontSize: 10.5 }}>+{s.weekly.toLocaleString()} this week</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mc-rule" />

            <div className="mc-caption-up" style={{ marginBottom: 8 }}>{t('publishOwn')}</div>
            <div className="mc-mono muted" style={{ fontSize: 11.5, lineHeight: 1.5, marginBottom: 10 }}>
              {t('publishHint')}
            </div>
            <Btn kind="ghost" size="sm" icon="plus" onClick={onLanding} full>{t('buildPub')}</Btn>
          </aside>

          {/* Listings */}
          <section>
            <div className="row-bw" style={{ marginBottom: 12 }}>
              <span className="mc-caption-up">{filtered.length} {t('servers')} · {cat}</span>
              <div className="mc-chiprow">
                {[['popular',t('popular')],['installs',t('mostInstalled')],['recent',t('recentUpd')]].map(([id,label]) => (
                  <button key={id} className={`mc-chip ${sort === id ? 'active' : ''}`} onClick={() => setSort(id)} style={{ height: 28, fontSize: 11.5 }}>{label}</button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(s => <MarketRow key={s.id} s={s} onOpen={() => onOpen(s)} />)}
            </div>

            {filtered.length === 0 && (
              <div style={{ padding: '48px 24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)' }}>
                <div className="mc-mono" style={{ fontSize: 14, color: 'var(--text-muted)' }}>no servers match.</div>
                <div className="mc-mono muted" style={{ fontSize: 12, marginTop: 6 }}>can't find what you need? <a className="mc-link" onClick={onLanding}>build it</a> in 60 seconds.</div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function MarketRow({ s, onOpen }) {
  return (
    <div className="mc-card" style={{ padding: 18, cursor: 'pointer' }} onClick={onOpen}>
      <div className="row-bw" style={{ alignItems: 'flex-start', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            <span className="mc-mono" style={{ fontSize: 15, fontWeight: 500 }}>{s.name}</span>
            <span className="mc-mono muted" style={{ fontSize: 12 }}>by {s.author}</span>
            {s.verified && <Badge kind="ink" mono={false}><Icon name="check" size={9} /> verified</Badge>}
            {s.mine && <Badge kind="primary" mono={false}>mine</Badge>}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text)', marginBottom: 10, maxWidth: 720 }}>{s.desc}</div>
          <div className="row" style={{ gap: 16, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>★ {s.stars.toLocaleString()}</span>
            <span>{s.installs.toLocaleString()} installs</span>
            <span>{s.tools} tools</span>
            <span>{s.license}</span>
            <span>updated {s.updated}</span>
            <div className="row" style={{ gap: 4 }}>
              {s.tags.slice(0, 3).map(t => <span key={t} className="mc-tk-inline">#{t}</span>)}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
          <Btn kind="ink" size="sm" icon="copy" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(`mcpgen install ${s.author}/${s.name}`); window.mcpToast(`${s.name} · install command copied`); }}>install</Btn>
          <span className="mc-mono muted" style={{ fontSize: 11 }}>+{s.weekly.toLocaleString()}/wk</span>
        </div>
      </div>
    </div>
  );
}

window.Marketplace = Marketplace;
window.MARKETPLACE_SERVERS = MARKETPLACE_SERVERS;
