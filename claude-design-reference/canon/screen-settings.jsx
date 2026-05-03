// screen-settings.jsx — full-bleed account / settings cabinet
// Sections: profile · security · api keys · sso · notifications ·
//           integrations · usage & billing · audit log · danger zone
//
// All helpers prefixed `St*` to avoid global collisions with other screens.

const ST_SECTIONS = [
  { id: 'profile',       label: 'profile',          glyph: '◐' },
  { id: 'security',      label: 'security',         glyph: '✦' },
  { id: 'keys',          label: 'api keys',         glyph: '⌘' },
  { id: 'sso',           label: 'sso & saml',       glyph: '◇' },
  { id: 'notifications', label: 'notifications',    glyph: '✉' },
  { id: 'integrations',  label: 'integrations',     glyph: '⌥' },
  { id: 'usage',         label: 'usage & billing',  glyph: '$' },
  { id: 'audit',         label: 'audit log',        glyph: '∎' },
  { id: 'danger',        label: 'danger zone',      glyph: '⚠' },
];

function SettingsScreen({ onBack, onMarketplace, onDashboard, onBilling }) {
  const [active, setActive] = React.useState('profile');
  const [sticky, setSticky] = React.useState(null); // floating "save" bar payload

  // Demo state, exposed via Tweaks
  const tw = (window.__settingsTweaks?.value) || ST_DEFAULT_TWEAKS;

  const sectionRefs = React.useRef({});
  const scrollTo = (id) => {
    setActive(id);
    const el = sectionRefs.current[id];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  // Scroll-spy
  React.useEffect(() => {
    const onScroll = () => {
      let curr = active;
      for (const s of ST_SECTIONS) {
        const el = sectionRefs.current[s.id];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top < 140) curr = s.id;
      }
      if (curr !== active) setActive(curr);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [active]);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="settings"
        onLogo={onBack}
        right={
          <>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onDashboard}>my servers</button>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onMarketplace}>marketplace</button>
            <LangSwitcher />
            <span className="mc-caption" style={{ marginRight: 4 }}>kira@dolla.io</span>
          </>
        }
      />

      <main style={{
        maxWidth: 1200, margin: '0 auto', padding: '32px 28px 96px',
        display: 'grid', gridTemplateColumns: '232px minmax(0, 1fr)',
        gap: 40, alignItems: 'start', position: 'relative', zIndex: 2,
      }}>
        {/* SIDEBAR */}
        <aside style={{ position: 'sticky', top: 24, alignSelf: 'start' }}>
          <div className="mc-caption-up" style={{ marginBottom: 14, paddingLeft: 6 }}>account · kira</div>

          {/* identity card */}
          <StSidebarIdentity tw={tw} />

          <nav className="col" style={{ gap: 2, marginTop: 18 }}>
            {ST_SECTIONS.map(s => (
              <StNavItem key={s.id} item={s} active={active === s.id} onClick={() => scrollTo(s.id)} />
            ))}
          </nav>

          <div className="mc-rule-dashed" style={{ margin: '18px 0' }} />

          <div className="col" style={{ gap: 2 }}>
            <StNavItem item={{ glyph: '⌂', label: 'back to dashboard' }} onClick={onBack} muted />
            <StNavItem item={{ glyph: '?', label: 'help · keyboard shortcuts' }} onClick={() => window.mcpToast?.('opening shortcuts…')} muted />
            <StNavItem item={{ glyph: '⏏', label: 'sign out' }} onClick={() => window.mcpToast?.('signed out')} muted danger />
          </div>
        </aside>

        {/* CONTENT */}
        <section style={{ minWidth: 0 }}>
          <StHeader tw={tw} />

          <div ref={el => sectionRefs.current.profile = el}>
            <StProfile tw={tw} onDirty={setSticky} />
          </div>
          <div ref={el => sectionRefs.current.security = el}>
            <StSecurity tw={tw} />
          </div>
          <div ref={el => sectionRefs.current.keys = el}>
            <StApiKeys tw={tw} />
          </div>
          <div ref={el => sectionRefs.current.sso = el}>
            <StSso tw={tw} />
          </div>
          <div ref={el => sectionRefs.current.notifications = el}>
            <StNotifications tw={tw} />
          </div>
          <div ref={el => sectionRefs.current.integrations = el}>
            <StIntegrations tw={tw} />
          </div>
          <div ref={el => sectionRefs.current.usage = el}>
            <StUsage tw={tw} onBilling={onBilling} />
          </div>
          <div ref={el => sectionRefs.current.audit = el}>
            <StAudit tw={tw} />
          </div>
          <div ref={el => sectionRefs.current.danger = el}>
            <StDanger tw={tw} />
          </div>
        </section>
      </main>

      {/* Floating dirty-bar */}
      {sticky && <StStickyBar payload={sticky} onSave={() => { setSticky(null); window.mcpToast?.('changes saved'); }} onCancel={() => setSticky(null)} />}
    </div>
  );
}

// ─── Tweaks store (read-only here, panel mutates window.__settingsTweaks) ────
const ST_DEFAULT_TWEAKS = {
  plan: 'pro',           // free / pro / team / enterprise
  twoFa: 'totp',         // off / totp / passkey
  state: 'full',         // empty / full
  layout: 'sidebar',     // sidebar / topbar / single
};

// ─── HEADER ──────────────────────────────────────────────────────────────────
function StHeader({ tw }) {
  const planMeta = ST_PLAN_META[tw.plan] || ST_PLAN_META.pro;
  return (
    <div style={{ marginBottom: 28 }}>
      <div className="mc-caption-up" style={{ marginBottom: 6 }}>step · settings</div>
      <div className="row-bw" style={{ gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, maxWidth: 720 }}>
          <div className="mc-h1" style={{ fontSize: 36, lineHeight: 1.1, letterSpacing: '-0.01em' }}>
            account & <span style={{ fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>workspace.</span>
          </div>
          <div className="muted" style={{ fontSize: 14, marginTop: 10, lineHeight: 1.5 }}>
            everything about you, your keys, your team's safety net.
          </div>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
          <StPlanBadge plan={tw.plan} />
          <span style={{ whiteSpace: 'nowrap' }}><Badge kind="soft">since apr 12</Badge></span>
          <span style={{ whiteSpace: 'nowrap' }}>
            <Badge kind={tw.twoFa === 'off' ? 'accent' : 'success'}>
              {tw.twoFa === 'off' ? '2fa off' : `2fa · ${tw.twoFa}`}
            </Badge>
          </span>
        </div>
      </div>

      {/* Quick stats strip */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, marginTop: 22,
        border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
        background: 'var(--card)',
      }}>
        <StStat k="plan" v={planMeta.label} sub={planMeta.price} />
        <StStat k="tool calls · this month" v="284,512" sub={`of ${planMeta.calls}`} progress={284512 / parsePlanCalls(planMeta.calls)} />
        <StStat k="active servers" v="7" sub="3 production" />
        <StStat k="last login" v="2h ago" sub="moscow · 188.130.•••.42" />
      </div>
    </div>
  );
}

const ST_PLAN_META = {
  free:       { label: 'free',       price: '$0/mo',    calls: '50k/mo' },
  pro:        { label: 'pro',        price: '$29/mo',   calls: '500k/mo' },
  team:       { label: 'team',       price: '$99/mo',   calls: '5m/mo' },
  enterprise: { label: 'enterprise', price: 'custom',   calls: 'unlimited' },
};
function parsePlanCalls(s) {
  if (!s) return 1;
  if (s === 'unlimited') return Infinity;
  const m = s.match(/([\d.]+)([km])/i);
  if (!m) return 1;
  const n = parseFloat(m[1]);
  return n * (m[2].toLowerCase() === 'k' ? 1e3 : 1e6);
}

// ─── PROFILE ─────────────────────────────────────────────────────────────────
function StProfile({ tw, onDirty }) {
  const [name, setName] = React.useState('kira okonkwo');
  const [handle, setHandle] = React.useState('kira');
  const [email, setEmail] = React.useState('kira@dolla.io');
  const [tz, setTz] = React.useState('Europe/Moscow');
  const [lang, setLang] = React.useState('en');
  const [bio, setBio] = React.useState('shipping payments infra at dolla. previously stripe, fly. mcp early adopter.');

  const fire = () => onDirty?.({ section: 'profile', name });

  return (
    <StSection id="profile" title="profile" desc="how you appear in collaboration views, audit logs, and email.">
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 24, alignItems: 'flex-start' }}>
        <StAvatar />
        <div className="col" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 12 }}>
            <StField label="full name" style={{ flex: 1 }}>
              <input className="mc-input" value={name} onChange={e => { setName(e.target.value); fire(); }} />
            </StField>
            <StField label="handle" hint="@kira on shared servers" style={{ flex: 1 }}>
              <div className="row" style={{ gap: 0 }}>
                <span className="mc-mono" style={{
                  border: '1px solid var(--border-sharp)', borderRight: 'none',
                  padding: '0 10px', display: 'flex', alignItems: 'center',
                  background: 'var(--paper-alt)', fontSize: 12, color: 'var(--text-muted)',
                  borderRadius: 'var(--radius) 0 0 var(--radius)', height: 36,
                }}>mcpgen.dev/@</span>
                <input className="mc-input mc-mono" value={handle}
                  onChange={e => { setHandle(e.target.value); fire(); }}
                  style={{ borderRadius: '0 var(--radius) var(--radius) 0' }} />
              </div>
            </StField>
          </div>

          <StField label="email · primary" right={<a className="mc-link mc-mono" style={{ fontSize: 11, cursor: 'pointer' }}
            onClick={() => window.mcpToast?.('change email · email confirmation flow')}>change email</a>}>
            <div className="row" style={{ gap: 8 }}>
              <input className="mc-input mc-mono" value={email}
                onChange={e => { setEmail(e.target.value); fire(); }}
                style={{ flex: 1 }} />
              <Badge kind="success">verified</Badge>
            </div>
          </StField>

          <div className="row" style={{ gap: 12 }}>
            <StField label="timezone" style={{ flex: 1 }}>
              <select className="mc-input" value={tz} onChange={e => { setTz(e.target.value); fire(); }}>
                {['Europe/Moscow','Europe/London','Europe/Berlin','America/New_York','America/Los_Angeles','Asia/Tokyo','Asia/Singapore'].map(z => <option key={z}>{z}</option>)}
              </select>
            </StField>
            <StField label="language" style={{ flex: 1 }}>
              <select className="mc-input" value={lang} onChange={e => { setLang(e.target.value); fire(); }}>
                <option value="en">english</option>
                <option value="ru">русский</option>
                <option value="de">deutsch</option>
                <option value="fr">français</option>
                <option value="es">español</option>
                <option value="zh">中文</option>
              </select>
            </StField>
          </div>

          <StField label="bio · optional" hint="shown on shared marketplace listings">
            <textarea className="mc-input" rows="2" value={bio}
              onChange={e => { setBio(e.target.value); fire(); }}
              style={{ resize: 'vertical', fontFamily: 'var(--font-sans)', padding: 10 }} />
          </StField>
        </div>
      </div>
    </StSection>
  );
}

function StAvatar() {
  return (
    <div className="col" style={{ gap: 8, alignItems: 'center' }}>
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        border: '1px solid var(--border-sharp)',
        background: 'var(--paper-alt)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 38, color: 'var(--text)',
        position: 'relative',
      }}>
        K
        <span style={{
          position: 'absolute', bottom: -2, right: -2,
          width: 18, height: 18, borderRadius: '50%',
          background: 'var(--success)', border: '2px solid var(--card)',
        }} />
      </div>
      <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('upload avatar…')}>upload</button>
      <a className="mc-link mc-mono" style={{ fontSize: 11, cursor: 'pointer' }}
        onClick={() => window.mcpToast?.('avatar removed')}>remove</a>
    </div>
  );
}

// ─── SECURITY ────────────────────────────────────────────────────────────────
function StSecurity({ tw }) {
  return (
    <StSection id="security" title="security" desc="passwords, two-factor, recovery codes, and active sessions.">
      <StPasswordRow />
      <StTwoFactor mode={tw.twoFa} />
      <StRecoveryRow />
      <StSessionsRow tw={tw} />
    </StSection>
  );
}

function StPasswordRow() {
  return (
    <StRow
      title="password"
      meta="last changed 84 days ago · we'll nudge at 90"
      action={<button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('opening change-password drawer…')}>change password</button>}
    />
  );
}

function StTwoFactor({ mode }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
      <div className="row-bw" style={{ marginBottom: 10, gap: 12 }}>
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>two-factor authentication</span>
            {mode === 'off'
              ? <Badge kind="accent">disabled</Badge>
              : <Badge kind="success">enabled · {mode}</Badge>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            required for production deploys, key rotation, and team transfers.
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 8 }}>
        <St2faMethod
          glyph="◉"
          name="authenticator app · totp"
          desc="1password, raycast, authy, google authenticator"
          status={mode === 'totp' ? 'active' : (mode === 'off' ? 'off' : 'available')}
        />
        <St2faMethod
          glyph="◈"
          name="passkeys · webauthn"
          desc="touch id, windows hello, hardware keys (yubikey, solo)"
          status={mode === 'passkey' ? 'active · 2 devices' : 'recommended'}
          recommended
        />
        <St2faMethod
          glyph="✉"
          name="sms · backup only"
          desc="not allowed as the only factor — phishable"
          status="off"
          locked
        />
      </div>
    </div>
  );
}

function St2faMethod({ glyph, name, desc, status, recommended, locked }) {
  return (
    <div className="row" style={{
      gap: 14, padding: '12px 14px',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      background: status === 'off' ? 'transparent' : 'var(--paper-alt)',
      alignItems: 'flex-start',
    }}>
      <span className="mc-mono" style={{
        flexShrink: 0, width: 28, height: 28,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border-sharp)', borderRadius: 4,
        background: 'var(--card)', fontSize: 13,
      }}>{glyph}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{name}</span>
          {recommended && <Badge kind="soft">recommended</Badge>}
          {locked && <Badge kind="default">policy: backup only</Badge>}
        </div>
        <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <div className="col" style={{ gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
        <span className="mc-caption" style={{ fontSize: 11, color: status.startsWith('active') ? 'var(--success)' : 'var(--text-muted)' }}>{status}</span>
        {!locked && (
          <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.(status.startsWith('active') ? 'manage method…' : 'enrolling method…')}>
            {status.startsWith('active') ? 'manage' : 'enroll'}
          </button>
        )}
      </div>
    </div>
  );
}

function StRecoveryRow() {
  return (
    <StRow
      title="recovery codes"
      meta="8 of 10 unused · last regenerated mar 4"
      action={
        <div className="row" style={{ gap: 8 }}>
          <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('downloading codes.txt…')}>download</button>
          <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('regenerating · old codes invalidated')}>regenerate</button>
        </div>
      }
    />
  );
}

const ST_SESSIONS_FULL = [
  { id: 's1', this: true,  device: 'macbook · arc · macos 14',     ip: '188.130.•••.42', loc: 'moscow, ru',         when: 'now',         os: '◐' },
  { id: 's2', this: false, device: 'iphone 15 · safari · ios 17',  ip: '188.130.•••.42', loc: 'moscow, ru',         when: '4h ago',      os: '◑' },
  { id: 's3', this: false, device: 'thinkpad · firefox · ubuntu',  ip: '37.193.•••.118', loc: 'belgrade, rs',       when: '2d ago',      os: '◐' },
  { id: 's4', this: false, device: 'cli · mcpgen v0.18.4',          ip: '188.130.•••.42', loc: 'moscow, ru',         when: '3d ago',      os: '◇' },
  { id: 's5', this: false, device: 'ipad pro · safari · ipados 17', ip: '5.62.•••.219',   loc: 'lisbon, pt',         when: '11d ago',     os: '◑' },
];

function StSessionsRow({ tw }) {
  const [revoked, setRevoked] = React.useState(new Set());
  const sessions = tw.state === 'empty' ? ST_SESSIONS_FULL.slice(0, 1) : ST_SESSIONS_FULL;

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '16px 0' }}>
      <div className="row-bw" style={{ marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>active sessions · {sessions.length - revoked.size}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>signed-in devices and CLIs. revoke anything you don't recognize.</div>
        </div>
        <button className="mc-btn mc-btn-sm" onClick={() => {
          setRevoked(new Set(sessions.filter(s => !s.this).map(s => s.id)));
          window.mcpToast?.('all other sessions revoked');
        }}>sign out everywhere else</button>
      </div>

      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {sessions.map((s, i) => {
          const gone = revoked.has(s.id);
          return (
            <div key={s.id} className="row" style={{
              gap: 14, padding: '10px 14px',
              borderTop: i ? '1px dashed var(--border)' : 'none',
              opacity: gone ? .4 : 1,
              alignItems: 'center',
            }}>
              <span className="mc-mono" style={{
                width: 24, height: 24, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--border-sharp)', borderRadius: 4, background: 'var(--paper-alt)', fontSize: 12,
              }}>{s.os}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13 }}>{s.device}</span>
                  {s.this && <Badge kind="success">this device</Badge>}
                  {gone && <Badge kind="accent">revoked</Badge>}
                </div>
                <div className="mc-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  {s.ip} · {s.loc} · {s.when}
                </div>
              </div>
              {!s.this && !gone && (
                <button className="mc-btn mc-btn-sm" onClick={() => {
                  setRevoked(r => new Set([...r, s.id]));
                  window.mcpToast?.(`session revoked · ${s.device.split(' · ')[0]}`);
                }}>revoke</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── API KEYS ────────────────────────────────────────────────────────────────
const ST_KEYS_FULL = [
  { id: 'k1', name: 'production · prod-runner',  prefix: 'mcp_live_4F8A',  scopes: ['servers:run', 'tools:invoke'],     expires: 'no expiry', last: '2 min ago', ips: '10.0.•••.0/16', state: 'active' },
  { id: 'k2', name: 'staging · ci/cd',           prefix: 'mcp_live_82BC',  scopes: ['servers:deploy', 'tests:run'],     expires: 'sep 12, 2026', last: '14 min ago', ips: 'github actions', state: 'active' },
  { id: 'k3', name: 'kira · personal · cli',     prefix: 'mcp_live_91DA',  scopes: ['*'],                                expires: 'no expiry', last: 'today, 09:42', ips: 'any', state: 'active' },
  { id: 'k4', name: 'old vercel webhook',        prefix: 'mcp_live_3E70',  scopes: ['webhooks:read'],                    expires: 'expired',  last: '47 days ago', ips: 'vercel', state: 'expired' },
];

function StApiKeys({ tw }) {
  const [showCreate, setShowCreate] = React.useState(false);
  const [keys, setKeys] = React.useState(ST_KEYS_FULL);
  const list = tw.state === 'empty' ? [] : keys;

  return (
    <StSection
      id="keys"
      title="api keys"
      desc="programmatic access to the mcpgen control plane. for tool invocation use server-level deploy keys."
      action={<button className="mc-btn mc-btn-primary mc-btn-sm" onClick={() => setShowCreate(true)}>+ new api key</button>}
    >
      {list.length === 0 ? (
        <StEmpty
          glyph="⌘"
          title="no api keys yet"
          body="create a key to deploy from ci, run scripts, or hand off to a teammate. you can scope and expire each one."
          action={<button className="mc-btn mc-btn-primary" onClick={() => setShowCreate(true)}>+ create your first key</button>}
        />
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          {list.map((k, i) => (
            <StKeyRow key={k.id} k={k} first={i === 0}
              onRevoke={() => {
                setKeys(arr => arr.map(x => x.id === k.id ? { ...x, state: 'revoked' } : x));
                window.mcpToast?.(`revoked · ${k.prefix}…`);
              }}
              onRotate={() => window.mcpToast?.(`rotated · new key shown once`)}
            />
          ))}
        </div>
      )}

      {showCreate && <StCreateKeyDrawer onClose={() => setShowCreate(false)} />}
    </StSection>
  );
}

function StKeyRow({ k, first, onRevoke, onRotate }) {
  return (
    <div style={{
      padding: '12px 14px', borderTop: first ? 'none' : '1px dashed var(--border)',
      opacity: k.state === 'revoked' ? .35 : 1,
    }}>
      <div className="row-bw" style={{ gap: 12, marginBottom: 6, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{k.name}</span>
            {k.state === 'expired' && <Badge kind="accent">expired</Badge>}
            {k.state === 'revoked' && <Badge kind="accent">revoked</Badge>}
            {k.scopes.includes('*') && <Badge kind="accent">full access</Badge>}
          </div>
          <div className="mc-mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {k.prefix}_••••••••••••••
            <button className="mc-mono" onClick={() => window.mcpToast?.(`copied ${k.prefix}…`)}
              style={{ marginLeft: 8, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 10.5 }}>
              [copy]
            </button>
          </div>
        </div>
        <div className="row" style={{ gap: 6, flexShrink: 0 }}>
          {k.state === 'active' && (
            <>
              <button className="mc-btn mc-btn-sm" onClick={onRotate}>rotate</button>
              <button className="mc-btn mc-btn-sm" onClick={onRevoke}>revoke</button>
            </>
          )}
          {k.state !== 'active' && (
            <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('deleted')}>delete</button>
          )}
        </div>
      </div>
      <div className="row" style={{ gap: 14, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
        <span>scopes: {k.scopes.join(', ')}</span>
        <span>·</span>
        <span>expires: {k.expires}</span>
        <span>·</span>
        <span>last used: {k.last}</span>
        <span>·</span>
        <span>ip allowlist: {k.ips}</span>
      </div>
    </div>
  );
}

function StCreateKeyDrawer({ onClose }) {
  const [name, setName] = React.useState('');
  const [scopes, setScopes] = React.useState({ 'servers:run': true, 'tools:invoke': true, 'servers:deploy': false, 'tests:run': false, 'webhooks:read': false });
  const [expiry, setExpiry] = React.useState('90');
  const [ipAllow, setIpAllow] = React.useState('');
  const [created, setCreated] = React.useState(null);

  const create = () => {
    setCreated('mcp_live_' + Math.random().toString(36).slice(2, 6).toUpperCase() + Math.random().toString(36).slice(2, 14));
  };

  return (
    <StDrawer title={created ? 'key created' : 'new api key'} onClose={onClose}>
      {!created && (
        <div className="col" style={{ gap: 14 }}>
          <StField label="name · for your records">
            <input className="mc-input" placeholder="ci · github actions · prod" autoFocus
              value={name} onChange={e => setName(e.target.value)} />
          </StField>

          <StField label="scopes" hint="principle of least privilege — uncheck what you don't need">
            <div className="col" style={{ gap: 6 }}>
              {Object.entries(scopes).map(([s, v]) => (
                <label key={s} className="row" style={{ gap: 8, padding: '6px 10px', background: v ? 'var(--paper-alt)' : 'transparent', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={v} onChange={() => setScopes(x => ({ ...x, [s]: !x[s] }))} />
                  <span className="mc-mono" style={{ fontSize: 12 }}>{s}</span>
                  <span className="mc-caption" style={{ fontSize: 11, marginLeft: 'auto' }}>
                    {ST_SCOPE_DESC[s] || ''}
                  </span>
                </label>
              ))}
            </div>
          </StField>

          <div className="row" style={{ gap: 12 }}>
            <StField label="expires in" style={{ flex: 1 }}>
              <select className="mc-input" value={expiry} onChange={e => setExpiry(e.target.value)}>
                <option value="30">30 days</option>
                <option value="90">90 days · recommended</option>
                <option value="365">1 year</option>
                <option value="never">no expiry</option>
              </select>
            </StField>
            <StField label="ip allowlist · cidr · optional" style={{ flex: 1 }}>
              <input className="mc-input mc-mono" placeholder="10.0.0.0/16, 1.2.3.4/32"
                value={ipAllow} onChange={e => setIpAllow(e.target.value)} />
            </StField>
          </div>

          <button className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full" onClick={create}
            disabled={!name.trim()} style={{ justifyContent: 'center' }}>
            create key
          </button>
        </div>
      )}

      {created && (
        <div className="col" style={{ gap: 14 }}>
          <div className="mc-card" style={{
            padding: 16, background: 'var(--paper-alt)',
            borderColor: 'var(--accent)', borderLeftWidth: 4,
          }}>
            <div className="mc-caption-up" style={{ marginBottom: 8 }}>copy this key now</div>
            <div className="mc-mono" style={{ fontSize: 13, wordBreak: 'break-all', marginBottom: 10 }}>
              {created}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('copied')}>[copy]</button>
              <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('downloaded .env')}>download .env</button>
            </div>
            <div className="mc-caption" style={{ marginTop: 10, fontSize: 11.5, color: 'var(--accent)' }}>
              ! you won't see this key again. we only store the prefix.
            </div>
          </div>
          <button className="mc-btn mc-btn-full" onClick={onClose} style={{ justifyContent: 'center' }}>done</button>
        </div>
      )}
    </StDrawer>
  );
}

const ST_SCOPE_DESC = {
  'servers:run':    'invoke any deployed server',
  'tools:invoke':   'call individual tools',
  'servers:deploy': 'create / update / rollback',
  'tests:run':      'run quality + drift tests',
  'webhooks:read':  'read webhook delivery logs',
};

// ─── SSO & SAML ──────────────────────────────────────────────────────────────
function StSso({ tw }) {
  const enterprise = tw.plan === 'enterprise';
  return (
    <StSection
      id="sso"
      title="sso & saml"
      desc="enforce single sign-on for your domain. requires enterprise."
    >
      {!enterprise ? (
        <div style={{
          border: '1px dashed var(--border-sharp)', borderRadius: 'var(--radius-lg)',
          padding: 24, background: 'var(--paper-alt)',
          display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'center',
        }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 6 }}>
              <Badge kind="accent">enterprise</Badge>
              <span style={{ fontSize: 14, fontWeight: 500 }}>SAML / OIDC, scim provisioning, domain capture</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 600 }}>
              connect okta, microsoft entra, jumpcloud, google workspace, or any saml 2.0 idp. provision and deprovision users automatically via scim 2.0.
            </div>
          </div>
          <button className="mc-btn mc-btn-primary" onClick={() => window.mcpToast?.('contacting sales…')}>talk to sales</button>
        </div>
      ) : (
        <div className="col" style={{ gap: 12 }}>
          <StRow
            title="identity provider"
            meta="okta · acme.okta.com · last sync 4 min ago"
            action={<button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('opening idp config…')}>configure</button>}
            badge={<Badge kind="success">connected</Badge>}
          />
          <StRow
            title="domain capture"
            meta="dolla.io · 142 users auto-provisioned"
            action={<button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('verifying dns…')}>verify dns</button>}
            badge={<Badge kind="success">verified</Badge>}
          />
          <StRow
            title="scim 2.0 provisioning"
            meta="endpoint: /scim/v2 · token: scim_•••• · last push 2h ago"
            action={
              <div className="row" style={{ gap: 6 }}>
                <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('rotating scim token…')}>rotate token</button>
                <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('opening scim logs…')}>logs</button>
              </div>
            }
            badge={<Badge kind="success">active</Badge>}
          />
          <StRow
            title="enforce SSO for everyone"
            meta="if on, password login is disabled for @dolla.io accounts"
            action={<StToggle on={true} onChange={() => window.mcpToast?.('SSO enforcement updated')} />}
          />
        </div>
      )}
    </StSection>
  );
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
function StNotifications({ tw }) {
  const [prefs, setPrefs] = React.useState({
    drift: { email: true,  slack: true,  in_app: true,  pager: false },
    errors: { email: true, slack: true,  in_app: true,  pager: true  },
    deploys: { email: false, slack: true, in_app: true,  pager: false },
    digest: { email: true,  slack: false, in_app: false, pager: false },
    quotas: { email: true,  slack: false, in_app: true,  pager: false },
    security: { email: true, slack: true, in_app: true,  pager: true },
  });
  const set = (row, ch) => setPrefs(p => ({ ...p, [row]: { ...p[row], [ch]: !p[row][ch] } }));

  return (
    <StSection
      id="notifications"
      title="notifications"
      desc="we believe in fewer, better pings. each row is a class of event; pick the channels."
    >
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        <div className="row" style={{
          padding: '8px 14px', background: 'var(--paper-alt)',
          borderBottom: '1px solid var(--border)',
          fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase',
        }}>
          <div style={{ flex: 1 }}>event</div>
          <div style={{ width: 70, textAlign: 'center' }}>email</div>
          <div style={{ width: 70, textAlign: 'center' }}>slack</div>
          <div style={{ width: 70, textAlign: 'center' }}>in-app</div>
          <div style={{ width: 80, textAlign: 'center' }}>pager</div>
        </div>

        {[
          { id: 'drift',    name: 'spec drift detected',     hint: 'upstream openapi changed shape' },
          { id: 'errors',   name: 'tool error rate ↑',       hint: 'p95 errors crosses your slo' },
          { id: 'deploys',  name: 'deploys & rollbacks',     hint: 'every push to production' },
          { id: 'digest',   name: 'weekly digest',           hint: 'usage, cost, top tools, mondays 9am' },
          { id: 'quotas',   name: 'quota at 80% / 100%',     hint: 'before we throttle you' },
          { id: 'security', name: 'security · key rotated, new login, 2fa change', hint: 'always on for the email channel' },
        ].map((r, i) => (
          <div key={r.id} className="row" style={{
            padding: '12px 14px', borderTop: i ? '1px dashed var(--border)' : 'none',
            alignItems: 'center', gap: 8,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, marginBottom: 2 }}>{r.name}</div>
              <div className="mc-caption" style={{ fontSize: 11 }}>{r.hint}</div>
            </div>
            <StCheckCell on={prefs[r.id].email}  onClick={() => set(r.id, 'email')}  />
            <StCheckCell on={prefs[r.id].slack}  onClick={() => set(r.id, 'slack')}  />
            <StCheckCell on={prefs[r.id].in_app} onClick={() => set(r.id, 'in_app')} />
            <StCheckCell on={prefs[r.id].pager}  onClick={() => set(r.id, 'pager')} width={80} />
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <span className="mc-caption">channels:</span>
        <StTag>email · kira@dolla.io</StTag>
        <StTag>slack · #mcp-alerts <span style={{ color: 'var(--success)' }}>·  connected</span></StTag>
        <StTag>pagerduty · prod-on-call <span style={{ color: 'var(--success)' }}>·  connected</span></StTag>
        <a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }}
          onClick={() => window.mcpToast?.('opening channel manager…')}>+ add a channel</a>
      </div>
    </StSection>
  );
}

function StCheckCell({ on, onClick, width = 70 }) {
  return (
    <div style={{ width, display: 'flex', justifyContent: 'center' }}>
      <button onClick={onClick} className="mc-mono" style={{
        width: 22, height: 22, padding: 0,
        border: '1px solid var(--border-sharp)', borderRadius: 4,
        background: on ? 'var(--ink)' : 'var(--card)',
        color: on ? 'var(--paper)' : 'transparent',
        cursor: 'pointer', fontSize: 12, lineHeight: 1,
      }}>✓</button>
    </div>
  );
}

// ─── INTEGRATIONS ────────────────────────────────────────────────────────────
const ST_INTEGRATIONS = [
  { id: 'slack',     glyph: '#',  name: 'slack',          desc: 'send alerts and digests to channels',          state: 'connected', meta: 'workspace: dolla · 4 channels' },
  { id: 'github',    glyph: 'GH', name: 'github',         desc: 'auto-deploy from prs · status checks',         state: 'connected', meta: 'org: dolla-io · 12 repos' },
  { id: 'pagerduty', glyph: 'PD', name: 'pagerduty',      desc: 'page on-call when error rate spikes',          state: 'connected', meta: 'service: prod-on-call' },
  { id: 'sentry',    glyph: 'S',  name: 'sentry',         desc: 'mirror tool errors to your sentry project',    state: 'available' },
  { id: 'datadog',   glyph: 'DD', name: 'datadog',        desc: 'export metrics: latency, calls, cost',         state: 'available' },
  { id: 'linear',    glyph: 'L',  name: 'linear',         desc: 'auto-file issues for drift events',            state: 'available' },
  { id: 'webhook',   glyph: '⌁',  name: 'generic webhook', desc: 'post events to any url · hmac signed',        state: 'connected', meta: '2 endpoints active' },
];

function StIntegrations({ tw }) {
  return (
    <StSection
      id="integrations"
      title="integrations"
      desc="connect mcpgen to the rest of your stack. all integrations support per-event filtering."
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {ST_INTEGRATIONS.map(i => (
          <StIntegrationCard key={i.id} i={i} />
        ))}
      </div>
    </StSection>
  );
}

function StIntegrationCard({ i }) {
  return (
    <div style={{
      border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
      background: 'var(--card)', padding: 14,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
        <span className="mc-mono" style={{
          flexShrink: 0, width: 32, height: 32,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--border-sharp)', borderRadius: 4,
          background: 'var(--paper-alt)', fontSize: 12, fontWeight: 600,
        }}>{i.glyph}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>{i.name}</span>
            {i.state === 'connected' && <Badge kind="success">connected</Badge>}
          </div>
          <div className="muted" style={{ fontSize: 12, lineHeight: 1.5 }}>{i.desc}</div>
        </div>
      </div>
      {i.meta && (
        <div className="mc-caption" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{i.meta}</div>
      )}
      <div className="row" style={{ gap: 6, marginTop: 'auto' }}>
        {i.state === 'connected' ? (
          <>
            <button className="mc-btn mc-btn-sm" style={{ flex: 1, justifyContent: 'center' }}
              onClick={() => window.mcpToast?.(`opening ${i.name} settings…`)}>configure</button>
            <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.(`disconnected ${i.name}`)}>disconnect</button>
          </>
        ) : (
          <button className="mc-btn mc-btn-primary mc-btn-sm" style={{ flex: 1, justifyContent: 'center' }}
            onClick={() => window.mcpToast?.(`connecting ${i.name}…`)}>connect</button>
        )}
      </div>
    </div>
  );
}

// ─── USAGE & BILLING ─────────────────────────────────────────────────────────
function StUsage({ tw, onBilling }) {
  const planMeta = ST_PLAN_META[tw.plan] || ST_PLAN_META.pro;
  const used = 284512, cap = parsePlanCalls(planMeta.calls);
  const pct = Math.min(used / cap * 100, 100);

  return (
    <StSection
      id="usage"
      title="usage & billing"
      desc="this is the lite view. for invoices, payment methods, and tax info, see billing."
      action={<button className="mc-btn mc-btn-sm" onClick={onBilling}>open full billing →</button>}
    >
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StPlanBadge plan={tw.plan} />
        <span className="mc-caption">renews on may 18 · auto-charge · visa •••• 4242</span>
      </div>

      {/* Big progress bar */}
      <div style={{
        border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
        padding: 18, background: 'var(--card)', marginBottom: 14,
      }}>
        <div className="row-bw" style={{ marginBottom: 8 }}>
          <div>
            <div className="mc-caption-up" style={{ fontSize: 10.5, marginBottom: 4 }}>tool calls · this month</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, lineHeight: 1, letterSpacing: '-0.02em' }}>
              {used.toLocaleString()}<span style={{ color: 'var(--text-faint)', fontSize: 18 }}> / {planMeta.calls}</span>
            </div>
          </div>
          <div className="mc-caption" style={{ fontSize: 11 }}>
            {pct.toFixed(1)}% used · 14 days into cycle
          </div>
        </div>
        <div style={{ height: 8, background: 'var(--paper-alt)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: pct + '%', background: pct > 80 ? 'var(--accent)' : 'var(--primary)' }} />
        </div>
        <div className="row" style={{ gap: 16, marginTop: 10, fontSize: 11.5, color: 'var(--text-muted)' }}>
          <span>burn rate: 20.3k/day</span>
          <span>·</span>
          <span>projected: 609k by may 18 ({tw.plan === 'pro' ? <span style={{ color: 'var(--accent)' }}>over by 109k</span> : 'within plan'})</span>
        </div>
      </div>

      {/* Mini cost split */}
      <div className="row" style={{ gap: 0, border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', flexWrap: 'wrap' }}>
        <StCostCell glyph="∎" k="this month" v="$184.20" sub="all servers · 7" />
        <StCostCell glyph="◐" k="forecast" v="$394.10" sub="at current rate" />
        <StCostCell glyph="◇" k="last month" v="$162.40" sub="−12% vs march" />
        <StCostCell glyph="$" k="byok savings" v="$1,284" sub="vs no-byok" tint />
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button className="mc-btn mc-btn-sm" onClick={onBilling}>change plan</button>
        <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('downloading invoices…')}>download invoices</button>
        <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('opening tax info…')}>tax info</button>
      </div>
    </StSection>
  );
}

function StCostCell({ k, v, sub, tint }) {
  return (
    <div style={{
      flex: 1, minWidth: 160, padding: 14,
      borderRight: '1px solid var(--border)',
      background: tint ? 'var(--paper-alt)' : 'transparent',
    }}>
      <div className="mc-caption-up" style={{ fontSize: 10, marginBottom: 6 }}>{k}</div>
      <div className="mc-mono" style={{ fontSize: 18, fontWeight: 500 }}>{v}</div>
      <div className="mc-caption" style={{ fontSize: 11, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ─── AUDIT LOG ───────────────────────────────────────────────────────────────
const ST_AUDIT_FULL = [
  { ts: 'today, 10:14',   actor: 'kira@dolla.io',     event: 'api_key.create',          target: 'mcp_live_4F8A · prod-runner',     ip: '188.130.•••.42', sev: 'info' },
  { ts: 'today, 09:42',   actor: 'kira@dolla.io',     event: 'session.signin',          target: 'macbook · arc',                   ip: '188.130.•••.42', sev: 'info' },
  { ts: 'yesterday',      actor: 'system',            event: 'drift.detected',          target: 'lumen-payments-mcp',              ip: '—',              sev: 'warn' },
  { ts: '2d ago',         actor: 'jordan@dolla.io',   event: 'server.deploy',           target: 'helio-commerce-mcp v0.18.4',      ip: 'github actions', sev: 'info' },
  { ts: '2d ago',         actor: 'kira@dolla.io',     event: '2fa.enrolled',            target: 'totp · authenticator',            ip: '188.130.•••.42', sev: 'info' },
  { ts: '4d ago',         actor: 'jordan@dolla.io',   event: 'api_key.revoke',          target: 'mcp_live_3E70 · old vercel hook', ip: '37.193.•••.118', sev: 'warn' },
  { ts: '7d ago',         actor: 'system',            event: 'quota.reached_80',        target: 'tool calls · 400k/500k',          ip: '—',              sev: 'warn' },
  { ts: '12d ago',        actor: 'kira@dolla.io',     event: 'sso.config_changed',      target: 'okta · acme.okta.com',            ip: '188.130.•••.42', sev: 'critical' },
];

function StAudit({ tw }) {
  const [filter, setFilter] = React.useState('all');
  const rows = (tw.state === 'empty' ? [] : ST_AUDIT_FULL).filter(r =>
    filter === 'all' || r.sev === filter
  );

  return (
    <StSection
      id="audit"
      title="audit log"
      desc="every privileged action across your account. retained for 12 months on pro, indefinitely on enterprise."
      action={
        <div className="row" style={{ gap: 6 }}>
          {['all', 'info', 'warn', 'critical'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`mc-chip ${filter === f ? 'sel' : ''}`}>{f}</button>
          ))}
          <button className="mc-btn mc-btn-sm" onClick={() => window.mcpToast?.('exporting audit log → csv…')}>export csv</button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <StEmpty glyph="∎" title="no audit events" body="we'll log every privileged action — sign-ins, key rotations, policy changes — and you can export it on demand." />
      ) : (
        <div style={{
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          fontFamily: 'var(--font-mono)', fontSize: 12, overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '120px 1fr 1.4fr 1.6fr 1fr 70px',
            gap: 8, padding: '8px 12px', background: 'var(--paper-alt)',
            borderBottom: '1px solid var(--border)',
            fontSize: 10.5, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase',
          }}>
            <div>when</div><div>actor</div><div>event</div><div>target</div><div>ip</div><div>sev</div>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '120px 1fr 1.4fr 1.6fr 1fr 70px',
              gap: 8, padding: '8px 12px',
              borderTop: i ? '1px dashed var(--border)' : 'none',
              alignItems: 'center',
            }}>
              <span style={{ color: 'var(--text-muted)' }}>{r.ts}</span>
              <span>{r.actor}</span>
              <span>{r.event}</span>
              <span style={{ color: 'var(--text-muted)' }}>{r.target}</span>
              <span style={{ color: 'var(--text-muted)' }}>{r.ip}</span>
              <Badge kind={r.sev === 'critical' ? 'accent' : r.sev === 'warn' ? 'soft' : 'default'}>{r.sev}</Badge>
            </div>
          ))}
        </div>
      )}
    </StSection>
  );
}

// ─── DANGER ZONE ─────────────────────────────────────────────────────────────
function StDanger({ tw }) {
  const [confirm, setConfirm] = React.useState(null); // 'pause' | 'transfer' | 'delete' | 'export'

  return (
    <StSection
      id="danger"
      title="danger zone"
      desc="reversible and irreversible actions. we ask for explicit confirmation on each."
    >
      <div style={{
        border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)',
        background: 'color-mix(in oklch, var(--accent) 4%, var(--card))',
        overflow: 'hidden',
      }}>
        <StDangerRow
          title="export all your data"
          body="full GDPR export — servers, configs, logs, audit trail. delivered as a signed url, expires in 24h."
          cta="request export"
          kind="ghost"
          onClick={() => setConfirm('export')}
        />
        <StDangerRow
          title="transfer ownership"
          body="hand the workspace to another user. you'll be downgraded to admin."
          cta="transfer ownership"
          kind="ghost"
          onClick={() => setConfirm('transfer')}
        />
        <StDangerRow
          title="pause account"
          body="all servers go offline · billing pauses · reversible from settings within 30 days."
          cta="pause account"
          kind="ghost"
          onClick={() => setConfirm('pause')}
        />
        <StDangerRow
          title="delete account"
          body="permanent. all servers, keys, audit logs, and configs are scrubbed within 24h. no undo."
          cta="delete account"
          kind="danger"
          onClick={() => setConfirm('delete')}
          last
        />
      </div>

      {confirm && <StConfirmDrawer kind={confirm} onClose={() => setConfirm(null)} />}
    </StSection>
  );
}

function StDangerRow({ title, body, cta, kind, onClick, last }) {
  return (
    <div className="row-bw" style={{
      padding: '16px 18px', gap: 16, alignItems: 'flex-start',
      borderBottom: last ? 'none' : '1px dashed color-mix(in oklch, var(--accent) 30%, var(--border))',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{title}</div>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, maxWidth: 600 }}>{body}</div>
      </div>
      <button className={`mc-btn mc-btn-sm ${kind === 'danger' ? 'mc-btn-danger' : ''}`}
        onClick={onClick}
        style={kind === 'danger' ? { background: 'var(--accent)', color: 'white', borderColor: 'var(--accent)' } : null}>
        {cta}
      </button>
    </div>
  );
}

function StConfirmDrawer({ kind, onClose }) {
  const meta = {
    export:   { title: 'request data export',  body: 'we will email a signed download link to kira@dolla.io within 5 minutes.', need: false, cta: 'request export' },
    transfer: { title: 'transfer ownership',   body: 'you will be downgraded to admin and lose billing rights. the new owner must accept within 7 days.', need: 'TRANSFER', cta: 'transfer' },
    pause:    { title: 'pause this account',   body: 'all 7 servers go offline immediately. you can resume within 30 days from any device.', need: 'PAUSE', cta: 'pause account' },
    delete:   { title: 'delete this account',  body: 'this is permanent. typing the phrase below confirms you understand.', need: 'delete dolla', cta: 'delete forever' },
  }[kind];
  const [phrase, setPhrase] = React.useState('');
  const [email, setEmail] = React.useState('');
  const ok = !meta.need || phrase === meta.need;

  return (
    <StDrawer title={meta.title} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 0, marginBottom: 14 }}>{meta.body}</p>

      {kind === 'transfer' && (
        <StField label="new owner email · must already have an account">
          <input className="mc-input mc-mono" placeholder="new-owner@dolla.io"
            value={email} onChange={e => setEmail(e.target.value)} autoFocus />
        </StField>
      )}

      {meta.need && (
        <StField label={`type "${meta.need}" to confirm`} style={{ marginTop: 14 }}>
          <input className="mc-input mc-mono" placeholder={meta.need}
            value={phrase} onChange={e => setPhrase(e.target.value)}
            autoFocus={kind !== 'transfer'} />
        </StField>
      )}

      <div className="row" style={{ gap: 8, marginTop: 18 }}>
        <button className="mc-btn mc-btn-full" onClick={onClose} style={{ justifyContent: 'center' }}>cancel</button>
        <button className="mc-btn mc-btn-full" disabled={!ok}
          onClick={() => { window.mcpToast?.(`${meta.cta} · queued`); onClose(); }}
          style={{
            justifyContent: 'center',
            background: kind === 'delete' ? 'var(--accent)' : 'var(--ink)',
            color: kind === 'delete' ? 'white' : 'var(--paper)',
            borderColor: kind === 'delete' ? 'var(--accent)' : 'var(--ink)',
            opacity: ok ? 1 : .4,
          }}>
          {meta.cta}
        </button>
      </div>
    </StDrawer>
  );
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function StSection({ id, title, desc, action, children }) {
  return (
    <section id={`section-${id}`} style={{ marginBottom: 56 }}>
      <div className="row-bw" style={{ marginBottom: 14, gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>· {id} ·</div>
          <div className="mc-h1" style={{ fontSize: 28, lineHeight: 1.1, marginBottom: 4 }}>{title}</div>
          {desc && <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 640 }}>{desc}</div>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
      <div className="mc-rule-dashed" style={{ marginBottom: 14 }} />
      {children}
    </section>
  );
}

function StRow({ title, meta, action, badge }) {
  return (
    <div className="row-bw" style={{
      gap: 14, padding: '14px 0',
      borderTop: '1px solid var(--border)',
      alignItems: 'center', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{title}</span>
          {badge}
        </div>
        {meta && <div className="muted" style={{ fontSize: 12.5 }}>{meta}</div>}
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  );
}

function StField({ label, hint, right, children, style }) {
  return (
    <div style={style}>
      <div className="row-bw" style={{ marginBottom: 6, gap: 8, minHeight: 16 }}>
        <label className="mc-caption-up" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{label}</label>
        {right}
      </div>
      {children}
      {hint && <div className="mc-caption" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function StNavItem({ item, active, onClick, muted, danger }) {
  return (
    <button onClick={onClick} className="row" style={{
      gap: 10, padding: '7px 10px', alignItems: 'center',
      border: 'none', cursor: 'pointer', textAlign: 'left',
      borderRadius: 'var(--radius)',
      background: active ? 'var(--ink)' : 'transparent',
      color: active ? 'var(--paper)' : (danger ? 'var(--accent)' : (muted ? 'var(--text-muted)' : 'var(--text)')),
      fontSize: 13, lineHeight: 1.2, fontFamily: 'var(--font-sans)',
    }}>
      <span className="mc-mono" style={{
        width: 18, textAlign: 'center', fontSize: 12,
        opacity: active ? 1 : .7,
      }}>{item.glyph}</span>
      <span>{item.label}</span>
      {active && <span className="mc-mono" style={{ marginLeft: 'auto', fontSize: 11, opacity: .7 }}>→</span>}
    </button>
  );
}

function StSidebarIdentity({ tw }) {
  const planMeta = ST_PLAN_META[tw.plan] || ST_PLAN_META.pro;
  return (
    <div style={{
      padding: 12, border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
      background: 'var(--card)', display: 'flex', gap: 10, alignItems: 'center',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '1px solid var(--border-sharp)', background: 'var(--paper-alt)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18,
        flexShrink: 0,
      }}>K</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>kira okonkwo</div>
        <div className="mc-mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{planMeta.label} · @kira</div>
      </div>
    </div>
  );
}

function StPlanBadge({ plan }) {
  const meta = ST_PLAN_META[plan] || ST_PLAN_META.pro;
  return (
    <span className="mc-mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px',
      border: '1px solid var(--border-sharp)', borderRadius: 4,
      background: plan === 'enterprise' ? 'var(--ink)' : 'var(--paper-alt)',
      color: plan === 'enterprise' ? 'var(--paper)' : 'var(--text)',
      fontSize: 11.5, letterSpacing: '.04em', whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      <span style={{ textTransform: 'uppercase', fontWeight: 600 }}>{meta.label}</span>
      <span style={{ opacity: .65 }}>{meta.price}</span>
    </span>
  );
}

function StStat({ k, v, sub, progress }) {
  return (
    <div style={{
      padding: 14, borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <div className="mc-caption-up" style={{ fontSize: 10 }}>{k}</div>
      <div className="mc-mono" style={{ fontSize: 16, fontWeight: 500, lineHeight: 1.2 }}>{v}</div>
      {sub && <div className="mc-caption" style={{ fontSize: 11 }}>{sub}</div>}
      {progress != null && (
        <div style={{ height: 3, background: 'var(--paper-alt)', borderRadius: 1.5, marginTop: 4 }}>
          <div style={{ height: '100%', width: Math.min(progress * 100, 100) + '%', background: progress > .8 ? 'var(--accent)' : 'var(--primary)' }} />
        </div>
      )}
    </div>
  );
}

function StTag({ children }) {
  return (
    <span className="mc-mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px',
      border: '1px solid var(--border)', borderRadius: 4,
      background: 'var(--paper-alt)', fontSize: 11.5, color: 'var(--text-muted)',
    }}>{children}</span>
  );
}

function StToggle({ on, onChange }) {
  const [v, setV] = React.useState(!!on);
  return (
    <button onClick={() => { const nx = !v; setV(nx); onChange?.(nx); }}
      style={{
        width: 36, height: 20, padding: 0, border: '1px solid var(--border-sharp)',
        borderRadius: 999, background: v ? 'var(--ink)' : 'var(--paper-alt)',
        position: 'relative', cursor: 'pointer',
      }}>
      <span style={{
        position: 'absolute', top: 1, left: v ? 17 : 1,
        width: 16, height: 16, borderRadius: '50%',
        background: v ? 'var(--paper)' : 'var(--ink)',
        transition: 'left .12s',
      }} />
    </button>
  );
}

function StEmpty({ glyph, title, body, action }) {
  return (
    <div style={{
      border: '1px dashed var(--border-sharp)', borderRadius: 'var(--radius-lg)',
      padding: '32px 24px', textAlign: 'center', background: 'var(--paper-alt)',
    }}>
      <div className="mc-mono" style={{
        width: 44, height: 44, margin: '0 auto 10px',
        border: '1px solid var(--border-sharp)', borderRadius: '50%',
        background: 'var(--card)', fontSize: 18,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>{glyph}</div>
      <div className="mc-h2" style={{ fontSize: 18, marginBottom: 6 }}>{title}</div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.5, maxWidth: 440, margin: '0 auto 14px' }}>{body}</div>
      {action}
    </div>
  );
}

function StDrawer({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'color-mix(in oklch, var(--ink) 40%, transparent)',
      zIndex: 60, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(520px, 100%)', height: '100%', background: 'var(--card)',
        borderLeft: '1px solid var(--border-sharp)', boxShadow: 'var(--shadow)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div className="row-bw" style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border-sharp)',
          background: 'var(--paper-alt)',
        }}>
          <div className="mc-caption-up">{title}</div>
          <button onClick={onClose} className="mc-mono" style={{
            width: 28, height: 28, padding: 0, border: '1px solid var(--border)',
            borderRadius: 4, background: 'var(--card)', cursor: 'pointer', fontSize: 13,
          }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function StStickyBar({ payload, onSave, onCancel }) {
  return (
    <div style={{
      position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)',
      zIndex: 55, padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center',
      background: 'var(--ink)', color: 'var(--paper)',
      border: '1px solid var(--ink)', borderRadius: 'var(--radius)',
      boxShadow: '0 12px 32px rgba(0,0,0,.18)',
      fontFamily: 'var(--font-mono)', fontSize: 12,
    }}>
      <span>· unsaved changes in {payload.section}</span>
      <button onClick={onCancel} className="mc-btn mc-btn-sm"
        style={{ borderColor: 'var(--paper)', color: 'var(--paper)', background: 'transparent' }}>discard</button>
      <button onClick={onSave} className="mc-btn mc-btn-primary mc-btn-sm">save changes</button>
    </div>
  );
}

window.SettingsScreen = SettingsScreen;
