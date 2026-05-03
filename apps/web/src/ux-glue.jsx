// ux-glue.jsx — shared toast + simple drawer/popover so no button is dead.
// Mounted once by app.jsx. Components register globally and can be triggered
// from any screen via window.mcpToast(msg, opts) or window.mcpDrawer(node, title).

(function () {
  const listeners = { toast: [], drawer: [] };

  window.mcpToast = function (msg, opts = {}) {
    listeners.toast.forEach(fn => fn({ msg, kind: opts.kind || 'info', icon: opts.icon }));
  };

  window.mcpDrawer = function (title, body, opts = {}) {
    listeners.drawer.forEach(fn => fn({ title, body, opts }));
  };

  window._mcpRegister = function (kind, fn) {
    listeners[kind].push(fn);
    return () => { listeners[kind] = listeners[kind].filter(x => x !== fn); };
  };
})();

function ToastHost() {
  const [items, setItems] = React.useState([]);
  React.useEffect(() => window._mcpRegister('toast', ({ msg, kind, icon }) => {
    const id = Math.random().toString(36).slice(2);
    setItems(arr => [...arr, { id, msg, kind, icon }]);
    setTimeout(() => setItems(arr => arr.filter(x => x.id !== id)), 3200);
  }), []);
  return (
    <div style={{
      position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none',
    }}>
      {items.map(it => (
        <div key={it.id} style={{
          background: 'var(--ink)', color: 'var(--paper)',
          padding: '10px 16px', borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-mono)', fontSize: 12.5,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: 'var(--shadow)', maxWidth: 420,
          animation: 'mcp-toast-in .18s ease-out',
          pointerEvents: 'auto',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: it.kind === 'error' ? 'var(--accent)' : it.kind === 'warn' ? '#FCD34D' : 'var(--success)',
          }} />
          <span>{it.msg}</span>
        </div>
      ))}
      <style>{`@keyframes mcp-toast-in { from { transform: translateY(8px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}

function DrawerHost() {
  const [open, setOpen] = React.useState(null);
  React.useEffect(() => window._mcpRegister('drawer', (args) => setOpen(args)), []);
  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <div className="mc-modal-veil" onClick={close} style={{ alignItems: 'flex-start', justifyContent: 'flex-end' }}>
      <div
        className="mc-card"
        onClick={e => e.stopPropagation()}
        style={{
          width: 480, maxWidth: '92vw', height: '100vh',
          background: 'var(--card)', borderLeft: '1px solid var(--border-sharp)',
          display: 'flex', flexDirection: 'column', borderRadius: 0,
          animation: 'mcp-drawer-in .22s ease-out',
        }}
      >
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div className="mc-caption-up">{open.opts?.eyebrow || 'details'}</div>
            <div className="mc-h2" style={{ marginTop: 2 }}>{open.title}</div>
          </div>
          <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={close} style={{ padding: '0 8px' }}>
            <Icon name="x" size={11} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {open.body}
        </div>
      </div>
      <style>{`@keyframes mcp-drawer-in { from { transform: translateX(20px); opacity: 0 } to { transform: none; opacity: 1 } }`}</style>
    </div>
  );
}

// ── shared content fragments used by many "dead" buttons ────────────────────
window.AccessLogBody = function ({ keyName }) {
  const rows = [
    { t: '12:42 utc · 3 min',  who: 'agent · claude desktop · v0.7.2', act: 'list_charges',     via: 'jana@team.dev', ip: '10.0.4.21' },
    { t: '12:38 utc · 7 min',  who: 'agent · cursor · v0.42',          act: 'order_lifecycle',  via: 'jana@team.dev', ip: '10.0.4.21' },
    { t: '12:21 utc · 24 min', who: 'agent · claude desktop',          act: 'find_customer',    via: 'jana@team.dev', ip: '10.0.4.21' },
    { t: '11:54 utc · 51 min', who: 'system · drift check',            act: 'verify',           via: 'mcpgen worker',  ip: 'edge-cdg' },
    { t: '08:02 utc · 4 hr',   who: 'agent · cline · v1.4',            act: 'refund_charge',    via: 'kira@team.dev',  ip: '74.125.x.x' },
  ];
  return (
    <div>
      <div className="mc-mono muted" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>
        last 50 uses of <strong style={{ color: 'var(--text)' }}>{keyName}</strong>. for older entries, export full audit log.
      </div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {rows.map((r, i) => (
          <div key={i} style={{ padding: '10px 14px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            <div className="row-bw">
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{r.act}</span>
              <span className="muted">{r.t}</span>
            </div>
            <div className="muted" style={{ marginTop: 3, fontSize: 11 }}>{r.who} · ip {r.ip}</div>
            <div className="muted" style={{ fontSize: 11 }}>delegated by {r.via}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn kind="ghost" size="sm" icon="doc" onClick={() => window.mcpToast('csv export queued · email when ready')}>export csv</Btn>
        <Btn kind="ghost" size="sm" onClick={() => window.mcpToast('alert rule saved · pages on-call on suspicious ip')}>alert on anomalies</Btn>
      </div>
    </div>
  );
};

window.FullLogBody = function ({ serverName }) {
  const rows = [
    ['12:42:31', 'list_charges',     '218 tk · 240 ms', 'claude desktop'],
    ['12:42:28', 'list_charges',     '218 tk · 232 ms', 'claude desktop'],
    ['12:38:11', 'order_lifecycle',  '320 tk · 412 ms', 'cursor'],
    ['12:21:04', 'find_customer',    '156 tk · 198 ms', 'claude desktop'],
    ['12:18:02', 'list_charges',     '218 tk · 245 ms', 'cline'],
    ['12:14:50', 'refund_charge',    '180 tk · 280 ms', 'claude desktop'],
    ['12:11:33', 'list_plans',       '142 tk · 188 ms', 'claude desktop'],
    ['12:08:21', 'create_charge',    '298 tk · 352 ms', 'cursor'],
    ['12:04:09', 'list_charges',     '218 tk · 240 ms', 'claude desktop'],
    ['11:58:44', 'order_lifecycle',  '320 tk · 408 ms', 'cursor'],
  ];
  return (
    <div>
      <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <button className="mc-chip active" style={{ height: 26, fontSize: 11 }}>all · 12,840</button>
        <button className="mc-chip" style={{ height: 26, fontSize: 11 }}>errors · 24</button>
        <button className="mc-chip" style={{ height: 26, fontSize: 11 }}>slow (&gt;500ms) · 138</button>
      </div>
      <input className="mc-input mc-mono" placeholder="filter · tool, agent, status…" style={{ marginBottom: 12, fontSize: 12, height: 32 }} />
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
        {rows.map((r, i) => (
          <div key={i} className="row" style={{ gap: 12, padding: '8px 12px', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none', fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>
            <span className="muted" style={{ minWidth: 64 }}>{r[0]}</span>
            <span style={{ minWidth: 130 }}>{r[1]}</span>
            <span className="muted" style={{ flex: 1 }}>{r[2]}</span>
            <span className="muted">{r[3]}</span>
          </div>
        ))}
      </div>
      <div className="muted mc-mono" style={{ fontSize: 11, marginTop: 10, textAlign: 'center' }}>showing 10 of 12,840 · scroll loads more</div>
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <Btn kind="ghost" size="sm" icon="doc" onClick={() => window.mcpToast('jsonl export started · 12,840 rows')}>export jsonl</Btn>
        <Btn kind="ghost" size="sm" onClick={() => window.mcpToast('opening grafana dashboard…')}>open in grafana</Btn>
      </div>
    </div>
  );
};

window.SettingsBody = function ({ serverName }) {
  const [region, setRegion] = React.useState('multi');
  const [pin, setPin] = React.useState(false);
  const [visibility, setVisibility] = React.useState('private');
  return (
    <div className="col" style={{ gap: 22 }}>
      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>identity</div>
        <div className="mc-cred-row" style={{ marginBottom: 0 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{serverName}</div>
            <div className="mc-mono muted" style={{ fontSize: 11.5 }}>created 12 days ago · v1.2.0 · owner kira@team.dev</div>
          </div>
          <Btn kind="ghost" size="sm" icon="copy" onClick={() => { navigator.clipboard?.writeText(serverName); window.mcpToast('id copied'); }}>copy id</Btn>
        </div>
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>edge regions</div>
        <div className="col" style={{ gap: 6 }}>
          {[
            ['multi', 'multi-region · cdg, sfo, sin', 'lowest p95 globally · default'],
            ['eu',    'europe only · cdg, fra',       'data residency for EU customers'],
            ['us',    'us only · sfo, iad',           'closest to upstream lumen api'],
          ].map(([id, t, d]) => (
            <div key={id} className={`mc-radio-row ${region === id ? 'sel' : ''}`} onClick={() => setRegion(id)}>
              <span className="mc-radio-glyph">{region === id ? '◉' : '○'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
                <div className="muted" style={{ fontSize: 12 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>spec drift</div>
        <label className="row" style={{ gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
          <input type="checkbox" checked={pin} onChange={e => setPin(e.target.checked)} />
          <span className="glyph">{pin ? '☑' : '☐'}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>pause auto-checks while pinned</div>
            <div className="muted" style={{ fontSize: 12 }}>useful during release windows</div>
          </div>
        </label>
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8 }}>visibility</div>
        <div className="col" style={{ gap: 6 }}>
          {[
            ['private', 'private', 'only you and invited teammates can install or call this server', 'lock'],
            ['unlisted', 'unlisted · link only', 'anyone with the link can install · not shown in marketplace', 'eye-off'],
            ['public', 'public · listed in marketplace', 'discoverable to everyone · counts toward trending', 'globe'],
          ].map(([id, t, d]) => (
            <div key={id} className={`mc-radio-row ${visibility === id ? 'sel' : ''}`} onClick={() => {
              const prev = visibility;
              setVisibility(id);
              if (id === 'public' && prev !== 'public') {
                window.mcpToast('publishing to marketplace · review queue ~24h');
              } else if (prev === 'public' && id !== 'public') {
                window.mcpToast(`switched to ${id} · removed from marketplace`, { kind: 'warn' });
              } else {
                window.mcpToast(`visibility: ${id}`);
              }
            }}>
              <span className="mc-radio-glyph">{visibility === id ? '◉' : '○'}</span>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{t}</span>
                  {id === 'public' && visibility === 'public' && <Badge kind="success" mono={false}>live</Badge>}
                  {id === 'private' && visibility === 'private' && <Badge kind="soft" mono={false}>current</Badge>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>{d}</div>
              </div>
            </div>
          ))}
        </div>
        {visibility !== 'private' && (
          <div className="mc-banner" style={{ marginTop: 8, fontSize: 11.5 }}>
            <Icon name="warn" size={11} />
            <span>shareable link: <span className="mc-mono">mcpgen.app/i/{serverName.replace(/-mcp$/, '')}</span></span>
            <a className="mc-link mc-mono" style={{ marginLeft: 'auto', cursor: 'pointer', fontSize: 11 }} onClick={() => { navigator.clipboard?.writeText(`https://mcpgen.app/i/${serverName.replace(/-mcp$/, '')}`); window.mcpToast('install link copied'); }}>copy →</a>
          </div>
        )}
      </div>

      <div>
        <div className="mc-caption-up" style={{ marginBottom: 8, color: 'var(--accent)' }}>danger zone</div>
        <div style={{ border: '1px solid var(--accent)', borderRadius: 'var(--radius)' }}>
          {[
            ['transfer ownership', 'move this server to another teammate', () => window.mcpToast('transfer email sent · awaiting accept')],
            ['archive',            'pauses traffic, keeps config & history', () => window.mcpToast('server archived · agents will receive 503')],
            ['delete forever',     'irreversible · revokes all credentials', () => window.mcpToast('hold to confirm · type the name to delete', { kind: 'warn' })],
          ].map(([t, d, fn], i, arr) => (
            <div key={t} className="row-bw" style={{ padding: '12px 14px', borderBottom: i < arr.length - 1 ? '1px solid var(--accent)' : 'none', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{t}</div>
                <div className="muted" style={{ fontSize: 12 }}>{d}</div>
              </div>
              <Btn kind="ghost" size="sm" onClick={fn}>{t.split(' ')[0]}</Btn>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ gap: 8, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <Btn kind="ink" size="sm" icon="check" onClick={() => window.mcpToast('settings saved · region changes roll out in ~30s')}>save changes</Btn>
      </div>
    </div>
  );
};

window.VersionsBody = function ({ serverName }) {
  const versions = [
    { v: 'v1.2.0', date: 'now',       note: 'current · 3 new tools',     active: true },
    { v: 'v1.1.0', date: '12 days',   note: 'order_lifecycle composite', active: false },
    { v: 'v1.0.0', date: '2 months',  note: 'initial release',           active: false },
  ];
  return (
    <div>
      <div className="muted mc-mono" style={{ fontSize: 12, marginBottom: 14 }}>
        every regen creates an immutable version. you can pin or roll back at any time.
      </div>
      {versions.map(v => (
        <div key={v.v} className="row" style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 8, gap: 12 }}>
          <span className="mc-mono" style={{ fontSize: 13, fontWeight: 600, minWidth: 56 }}>{v.v}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13 }}>{v.note}</div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>{v.date} ago</div>
          </div>
          {v.active
            ? <Badge kind="success" mono={false}>live</Badge>
            : <Btn kind="ghost" size="sm" icon="undo" onClick={() => window.mcpToast(`rolled back to ${v.v} · zero downtime`)}>roll back</Btn>}
        </div>
      ))}
    </div>
  );
};

Object.assign(window, { ToastHost, DrawerHost });
