// screen-canvas.jsx — Screen 3: Generated server canvas (three-pane) + Screen 4: Refinement diff

// M-4 FLOW: TOOL_DATA literal removed — tool inventory is now a prop (`tools`)
// passed by the wrapper from real generation results (post Stage E codegen).
// Until a generation completes the wrapper passes `null` and we render an
// empty/loading state below.

// Each tool has rawTk (naive 1:1 from the openapi spec) and tk (after our pass)
// — that delta is the killer feature, so it's surfaced everywhere.

// Inline mini-badge: shows "raw → tk" with a savings %. Used in the tools list and
// detail header. Color is muted by default; primary when % savings is high.
function TokenSaveBadge({ raw, tk, size = 'sm' }) {
  if (!raw || raw <= tk) return <span className="mc-tk">{tk} tk</span>;
  const pct = Math.round((1 - tk / raw) * 100);
  const big = size === 'md';
  return (
    <span
      className="mc-tk-save"
      title={`${raw} tokens raw → ${tk} after compression (${pct}% saved)`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontFamily: 'var(--font-mono)', fontSize: big ? 11.5 : 10.5,
        padding: big ? '2px 7px' : '1px 5px',
        borderRadius: 3, lineHeight: 1.4,
        border: '1px solid var(--border)',
        background: 'var(--paper-alt)',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ textDecoration: 'line-through', opacity: .55 }}>{raw}</span>
      <span style={{ color: 'var(--text)' }}>→</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{tk}</span>
      <span style={{ color: 'var(--success)', fontWeight: 600, marginLeft: 2 }}>↓{pct}%</span>
    </span>
  );
}

function Canvas({ sample, tools, onPlay, onDeploy, onCmdK, onBack }) {
  // M-4 FLOW: `tools` is the real generated tool inventory (replaces TOOL_DATA
  // mock). Shape: { [categoryId]: { label, icon?, tools: ToolPlan[] } }. When
  // the wrapper has no data yet (loading / no spec) we render with an empty
  // shape so the canvas chrome still mounts without throwing.
  const TOOL_DATA = tools || {};
  const firstCategory = Object.keys(TOOL_DATA)[0];
  const firstTool = firstCategory && TOOL_DATA[firstCategory].tools[0]
    ? TOOL_DATA[firstCategory].tools[0]
    : null;
  const initialOpenCats = Object.keys(TOOL_DATA).reduce((acc, k, i) => {
    acc[k] = i < 2;
    return acc;
  }, {});
  const [openCats, setOpenCats] = React.useState(initialOpenCats);
  const [selected, setSelected] = React.useState(firstTool ? firstTool.id : '');
  const [filter, setFilter] = React.useState('');
  const [chatOpen, setChatOpen] = React.useState(true);
  const [tool, setTool] = React.useState(firstTool);
  const [diff, setDiff] = React.useState(null);   // { id, before, after, beforeTk, afterTk }
  const [autoCountdown, setAutoCountdown] = React.useState(0);
  const [changedSet, setChangedSet] = React.useState(new Set());
  const [editing, setEditing] = React.useState(false);
  // First-visit summary card. Persisted via localStorage so a returning user
  // doesn't see it again, but a fresh tab does.
  const [showSummary, setShowSummary] = React.useState(() => {
    try { return localStorage.getItem('mcpgen_canvas_summary_seen') !== '1'; } catch (e) { return true; }
  });
  const dismissSummary = () => {
    setShowSummary(false);
    try { localStorage.setItem('mcpgen_canvas_summary_seen', '1'); } catch (e) {}
  };

  // Find tool by id
  const findTool = (id) => {
    for (const k of Object.keys(TOOL_DATA)) {
      const found = TOOL_DATA[k].tools.find(t => t.id === id);
      if (found) return found;
    }
    return null;
  };

  React.useEffect(() => {
    const t = findTool(selected);
    if (t) setTool(t);
  }, [selected]);

  const triggerDiff = () => {
    if (!tool) return;
    setDiff({
      id: tool.id,
      before: tool.desc,
      after: tool.short || tool.desc,
      beforeTk: tool.tk,
      afterTk: Math.max(1, Math.round(tool.tk * 0.5)),
    });
    setAutoCountdown(3);
  };

  React.useEffect(() => {
    if (autoCountdown > 0) {
      const id = setTimeout(() => setAutoCountdown(c => c - 1), 1000);
      return () => clearTimeout(id);
    } else if (autoCountdown === 0 && diff) {
      // auto-accept
      acceptDiff();
    }
  }, [autoCountdown]);

  const acceptDiff = () => {
    if (!diff) return;
    setChangedSet(s => new Set([...s, diff.id]));
    setTool(t => ({ ...t, tk: diff.afterTk, desc: diff.after }));
    setDiff(null);
    setAutoCountdown(0);
  };
  const revertDiff = () => { setDiff(null); setAutoCountdown(0); };

  const matchFilter = (t) => !filter || t.name.includes(filter.toLowerCase());

  const allTools = Object.values(TOOL_DATA).flatMap(c => c.tools);
  const totalTk = allTools.reduce((s, t) => s + (tool && changedSet.has(t.id) && t.id === tool.id ? tool.tk : t.tk), 0);

  return (
    <div className="mc-screen" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`${sample?.name || 'untitled'}-mcp · draft`}
        onLogo={onBack}
        right={
          <>
            <Btn kind="ghost" size="sm" icon="cmd" onClick={onCmdK}>K</Btn>
            <Btn kind="ghost" size="sm" icon="play" onClick={onPlay}>test</Btn>
            <Btn kind="ghost" size="sm" icon="share" onClick={() => window.mcpToast('share link copied · expires in 24 h')}>share</Btn>
            <Btn kind="primary" size="sm" icon="cloud" onClick={onDeploy}>review & deploy</Btn>
          </>
        }
      />

      <div className={`mc-three ${chatOpen ? '' : 'collapsed'}`}>
        {/* Left: tools list */}
        <aside className="mc-pane" style={{ background: 'var(--paper-alt)' }}>
          <div className="row-bw" style={{ marginBottom: 14 }}>
            <span className="mc-caption-up">tools · {allTools.length}</span>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>{totalTk} tk</span>
          </div>

          <div className="mc-tools-list">
            {Object.entries(TOOL_DATA).map(([key, cat]) => (
              <div key={key}>
                <div className="mc-tool-cat" onClick={() => setOpenCats(s => ({ ...s, [key]: !s[key] }))}>
                  <Icon name={openCats[key] ? 'caret-d' : 'caret-r'} size={10} />
                  {cat.icon && <Icon name={cat.icon} size={11} />}
                  <span>{cat.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, opacity: .6 }}>{cat.tools.length}</span>
                </div>
                {openCats[key] && cat.tools.filter(matchFilter).map(t => {
                  const isSel = selected === t.id;
                  const liveTk = isSel && t.id === tool.id ? tool.tk : t.tk;
                  const pct = t.rawTk ? Math.round((1 - liveTk / t.rawTk) * 100) : 0;
                  return (
                    <div
                      key={t.id}
                      className={`mc-tool-item ${isSel ? 'sel' : ''}`}
                      onClick={() => setSelected(t.id)}
                    >
                      {changedSet.has(t.id) && <span className="dot changed" />}
                      {t.composite && <Icon name="bolt" size={10} />}
                      <span className="name">{t.name}</span>
                      <span className="tk" title={t.rawTk ? `${t.rawTk} raw → ${liveTk} (↓${pct}%)` : `${liveTk} tk`}>
                        <span style={{ opacity: .55, textDecoration: 'line-through', marginRight: 3 }}>{t.rawTk}</span>
                        {liveTk}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div className="mc-caption-up" style={{ marginBottom: 6 }}>filter</div>
            <input
              className="mc-input mc-mono"
              placeholder="search ⌘F"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ height: 32, fontSize: 12 }}
            />
          </div>
        </aside>

        {/* Center: detail */}
        <main className="mc-pane" style={{ overflowY: 'auto' }}>
          {showSummary && (
            <div
              className="mc-card mc-screen"
              style={{
                marginBottom: 22, padding: 18,
                borderColor: 'var(--border-sharp)',
                background: 'linear-gradient(180deg, var(--card) 0%, var(--paper-alt) 100%)',
                position: 'relative',
              }}
            >
              <button
                onClick={dismissSummary}
                aria-label="dismiss"
                style={{
                  position: 'absolute', top: 10, right: 10,
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 4, lineHeight: 0,
                }}
              ><Icon name="x" size={12} /></button>

              <div className="mc-caption-up" style={{ marginBottom: 8 }}>
                <span className="mc-dot live" style={{ marginRight: 6 }} />
                here's what we made
              </div>
              <div className="mc-h2" style={{ marginBottom: 14, fontStyle: 'italic', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 26, lineHeight: 1.15 }}>
                {allTools.length} tools · {Object.keys(TOOL_DATA).length} categories · {totalTk} tk total
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 }}>
                <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--paper)' }}>
                  <div className="mc-mono" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{allTools.length}</div>
                  <div className="mc-caption" style={{ fontSize: 11, marginTop: 4 }}>tools{sample?.endpoints ? ` (from ${sample.endpoints} endpoints)` : ''}</div>
                </div>
                <div style={{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--paper)' }}>
                  <div className="mc-mono" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>
                    {Object.values(TOOL_DATA).reduce((s, c) => s + c.tools.filter(t => t.composite).length, 0)}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}> ⚡</span>
                  </div>
                  <div className="mc-caption" style={{ fontSize: 11, marginTop: 4 }}>composite (multi-step)</div>
                </div>
                <div style={{ padding: '10px 12px', border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)', background: 'var(--primary)', color: 'var(--primary-ink)' }}>
                  <div className="mc-mono" style={{ fontSize: 22, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em' }}>{sample?.save ? `↓${sample.save}%` : '—'}</div>
                  <div className="mc-mono" style={{ fontSize: 11, marginTop: 4, opacity: .8 }}>fewer tokens vs naive</div>
                </div>
              </div>

              <div className="row-bw" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="mc-mono muted" style={{ fontSize: 11.5 }}>
                  next: review tools (left), shorten with chat (right), then deploy.
                </span>
                <div className="row" style={{ gap: 6 }}>
                  <Btn kind="ghost" size="sm" onClick={dismissSummary}>skip tour</Btn>
                  <Btn kind="ink" size="sm" iconR="arrow-r" onClick={dismissSummary}>got it</Btn>
                </div>
              </div>
            </div>
          )}

          {tool ? (
          <>
          <div style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              {tool.composite && <Badge kind="primary" mono={false}><Icon name="bolt" size={10} /> composite</Badge>}
              {changedSet.has(tool.id) && <Badge kind="accent">edited</Badge>}
              <span className="mc-caption">tools / {tool.id}</span>
            </div>
            <div className="mc-h1 mc-mono" style={{ fontStyle: 'normal', fontFamily: 'var(--font-mono)', fontSize: 28 }}>{tool.name}</div>
          </div>

          <div className="mc-rule" style={{ margin: '20px 0' }} />

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel right={<TokenSaveBadge raw={tool.rawTk} tk={tool.tk} size="md" />}>description</SectionLabel>
            {!editing && !diff && (
              <div
                onClick={() => setEditing(true)}
                style={{ fontSize: 15, lineHeight: 1.6, cursor: 'text', padding: 8, marginLeft: -8, borderRadius: 'var(--radius)' }}
                title="click to edit"
              >
                "{tool.desc}"
              </div>
            )}
            {editing && (
              <textarea
                autoFocus
                defaultValue={tool.desc}
                onBlur={(e) => { setTool(t => ({ ...t, desc: e.target.value })); setEditing(false); }}
                style={{
                  width: '100%', minHeight: 60, padding: 10, border: '1px solid var(--border-sharp)',
                  borderRadius: 'var(--radius)', fontFamily: 'var(--font-sans)', fontSize: 15, outline: 'none',
                  background: 'var(--card)', color: 'var(--text)', resize: 'vertical',
                }}
              />
            )}
            {diff && (
              <div style={{ border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)', overflow: 'hidden', marginBottom: 12 }}>
                <div className="mc-diff-row mc-diff-del">
                  <span className="muted">−</span> "{diff.before}"
                </div>
                <div className="mc-diff-row mc-diff-add">
                  <span style={{ color: 'var(--success)' }}>+</span> "{diff.after}"
                </div>
                <div className="row-bw" style={{ padding: '8px 12px', background: 'var(--paper-alt)', borderTop: '1px solid var(--border)' }}>
                  <span className="mc-mono" style={{ fontSize: 11.5 }}>
                    {diff.beforeTk} → <span style={{ color: 'var(--success)', fontWeight: 600 }}>{diff.afterTk} tk</span> · ↓{Math.round((1 - diff.afterTk/diff.beforeTk) * 100)}%
                  </span>
                  <div className="row" style={{ gap: 6 }}>
                    <Btn kind="primary" size="sm" icon="check" onClick={acceptDiff}>
                      accept{autoCountdown > 0 ? ` (auto ${autoCountdown}s)` : ''}
                    </Btn>
                    <Btn kind="ghost" size="sm" icon="undo" onClick={revertDiff}>revert</Btn>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Params */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>parameters</SectionLabel>
            <div className="mc-mono" style={{ fontSize: 13 }}>
              {(!tool.params || tool.params.length === 0) && <div className="muted">none</div>}
              {(tool.params || []).map(p => (
                <div key={p.name} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--border)', gap: 12 }}>
                  <span style={{ minWidth: 140 }}>{p.name}</span>
                  <span className="muted" style={{ minWidth: 80 }}>{p.type}</span>
                  <span className={p.req ? '' : 'faint'}>{p.req ? 'required' : 'optional'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Source */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>source</SectionLabel>
            <div className="mc-code" style={{ background: 'var(--paper-alt)' }}>
              <span className="muted"># mapped from openapi spec</span>{'\n'}
              <span style={{ color: 'var(--accent)' }}>{(tool.source || '').split(' ')[0]}</span> {(tool.source || '').split(' ').slice(1).join(' ')}
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="spark" onClick={triggerDiff}>auto-shorten</Btn>
            <Btn kind="ghost" size="sm" onClick={() => setEditing(true)}>edit description</Btn>
            <Btn kind="ink" size="sm" icon="play" onClick={onPlay}>test in playground</Btn>
          </div>
          </>
          ) : (
            <div className="mc-caption" style={{ padding: 32, textAlign: 'center' }}>
              no tools yet — start a generation from the landing page.
            </div>
          )}
        </main>

        {/* Right: chat */}
        {chatOpen ? (
          <aside className="mc-pane" style={{ overflowY: 'auto' }}>
            <div className="row-bw" style={{ marginBottom: 14 }}>
              <SectionLabel>refinement chat</SectionLabel>
              <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => setChatOpen(false)} style={{ padding: '0 6px', height: 22 }}><Icon name="x" size={11} /></button>
            </div>

            <div className="mc-bubble user">
              <small>you · 10:42</small>
              make all descriptions in 'transactions' 30% shorter
            </div>
            <div className="mc-bubble">
              <small>mcpgen · 10:42</small>
              rewrote 5 descriptions. saved 124 tokens total.
              <br/><span className="muted" style={{ fontSize: 12 }}>review changes — orange dots in the list.</span>
            </div>
            <div className="mc-bubble user">
              <small>you · 10:43</small>
              add example usage to create_charge
            </div>
            <div className="mc-bubble">
              <small>mcpgen · 10:43</small>
              done. cost: +18 tk. <a className="mc-link" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast('opening diff inline…')}>show diff →</a>
            </div>

            <div style={{ marginTop: 18 }}>
              <input
                className="mc-input mc-mono"
                placeholder="ask anything about this server…"
                style={{ height: 38, fontSize: 12.5 }}
              />
              <div className="mc-caption" style={{ marginTop: 6 }}>scoped to the server. for one tool, click ✨ on it.</div>
            </div>

            <div className="mc-rule-dashed" />
            <div className="mc-caption-up" style={{ marginBottom: 8 }}>quick actions</div>
            <div className="col" style={{ gap: 6 }}>
              <Btn kind="ghost" size="sm" full onClick={triggerDiff}>shorten this tool</Btn>
              <Btn kind="ghost" size="sm" full onClick={() => window.mcpToast('drafted example · +18 tk')}>add example for this tool</Btn>
              <Btn kind="ghost" size="sm" full onClick={() => window.mcpToast('analyzing tool overlap… found 2 candidates')}>combine related tools…</Btn>
              <Btn kind="ghost" size="sm" full onClick={() => window.mcpToast('tone updated to formal across all tools')}>set tone: formal</Btn>
            </div>
          </aside>
        ) : (
          <aside style={{ borderLeft: '1px solid var(--border)', display: 'flex', justifyContent: 'center', paddingTop: 18 }}>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => setChatOpen(true)} style={{ padding: '0 8px', height: 32, writingMode: 'vertical-rl' }}>
              <Icon name="spark" size={12} /> chat
            </button>
          </aside>
        )}
      </div>

      {/* status bar */}
      <div className="mc-statusbar">
        <span>{allTools.length} tools</span>
        <span>{totalTk.toLocaleString()} tokens</span>
        {sample?.save ? <span style={{ color: 'var(--success)' }}>↓{sample.save}%</span> : null}
        <span style={{ marginLeft: 'auto' }}>last edit 10s ago</span>
        <span><Icon name="cmd" size={10} /> K</span>
      </div>
    </div>
  );
}

window.Canvas = Canvas;
