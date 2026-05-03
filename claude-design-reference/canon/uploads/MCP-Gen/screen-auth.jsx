// screen-auth.jsx — Auth Detection screen (between preview and stream)

const AUTH_TYPES = {
  apikey: {
    code: 'A',
    label: 'API Key',
    desc: 'uses an api key sent as a bearer token in the authorization header. typical for server-to-server.',
    sample: 'authorization: bearer sk_live_•••••8421',
    modes: ['passthrough', 'stored'],
  },
  basic: {
    code: 'B',
    label: 'Basic Auth',
    desc: 'username + password encoded in the authorization header. older, but still common.',
    sample: 'authorization: basic dXNlcjpwYXNz',
    modes: ['passthrough', 'stored'],
  },
  oauth: {
    code: 'D',
    label: 'OAuth · user-delegated',
    desc: 'each user authorizes via the provider. tokens are short-lived and refreshable.',
    sample: 'authorization: bearer ya29.•••• (per-user)',
    modes: ['oauth'],
    provider: 'Stripe',
  },
  hmac: {
    code: 'E',
    label: 'HMAC signature',
    desc: 'each request is signed with a shared secret. requires server-side key handling.',
    sample: 'x-signature: t=1714, v1=•••• (computed per request)',
    modes: ['stored'],
  },
};

function AuthScreen({ sample, onContinue, onBack }) {
  const [authType, setAuthType] = React.useState('apikey');
  const [mode, setMode] = React.useState('passthrough');
  const [secret, setSecret] = React.useState('');
  const [tested, setTested] = React.useState(false);
  const [scopes, setScopes] = React.useState({
    read: true, write: true, refunds: true, customers_read: true, reports: false, webhooks: false,
  });

  const auth = AUTH_TYPES[authType];

  // Reset mode when auth type changes
  React.useEffect(() => {
    if (auth.modes && !auth.modes.includes(mode)) setMode(auth.modes[0]);
  }, [authType]);

  const SCOPES_LIST = [
    { id: 'read', label: 'read transactions', rec: true },
    { id: 'write', label: 'create / capture charges', rec: true },
    { id: 'refunds', label: 'issue refunds', rec: true },
    { id: 'customers_read', label: 'read customer records', rec: true },
    { id: 'reports', label: 'access reports & analytics', rec: false },
    { id: 'webhooks', label: 'manage webhooks', rec: false },
  ];

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`${sample?.name || 'lumen-payments'}-mcp · auth`}
        onLogo={onBack}
        right={<span className="mc-caption">step 02 of 04</span>}
      />

      <main style={{ maxWidth: 980, margin: '0 auto', padding: '36px 28px 64px', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 28 }}>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>step 02 · authentication</div>
          <div className="mc-display-l">your api needs auth.<br/>how should agents prove it?</div>
        </div>

        {/* Detection card */}
        <Card style={{ marginBottom: 18, borderLeftWidth: 4, borderLeftColor: 'var(--accent)' }}>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <div style={{
              width: 44, height: 44, border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              background: 'var(--paper-alt)', fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600,
            }}>{auth.code}</div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <span className="mc-caption-up">detected</span>
                <Badge kind="soft">type {auth.code}</Badge>
              </div>
              <div style={{ fontSize: 18, fontWeight: 500, marginBottom: 6 }}>{auth.label}</div>
              <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}>
                {sample?.name || 'lumen'} api uses {auth.label.toLowerCase()}. {auth.desc}
              </div>
              <div className="mc-code" style={{ fontSize: 12, padding: '8px 10px', background: 'var(--paper-alt)' }}>
                {auth.sample}
              </div>
            </div>
          </div>

          {/* Type switcher (so users can preview each type's UI) */}
          <div className="mc-rule-dashed" style={{ margin: '16px 0 12px' }} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="mc-caption" style={{ marginRight: 8 }}>simulate other types:</span>
            {Object.entries(AUTH_TYPES).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setAuthType(k)}
                className={`mc-chip ${authType === k ? 'sel' : ''}`}
              >{v.code} · {v.label.split(' ')[0].toLowerCase()}</button>
            ))}
          </div>
        </Card>

        {/* OAuth mode */}
        {auth.modes.includes('oauth') && (
          <Card style={{ marginBottom: 18 }}>
            <SectionLabel>connect with {auth.provider || 'provider'}</SectionLabel>
            <div className="muted" style={{ fontSize: 13.5, marginBottom: 16, lineHeight: 1.5 }}>
              you'll be redirected to {auth.provider}. we only request the scopes you check below — and never see the user's password.
            </div>

            <button className="mc-btn mc-btn-ink mc-btn-lg mc-btn-full" style={{ marginBottom: 16, justifyContent: 'center' }}>
              <span className="mc-mono" style={{ fontSize: 11, opacity: .7 }}>[ ◐ ]</span>
              <span style={{ marginLeft: 6 }}>connect with {auth.provider}</span>
            </button>

            <div className="mc-caption-up" style={{ marginBottom: 8 }}>scopes requested</div>
            <div className="col" style={{ gap: 4 }}>
              {SCOPES_LIST.map(s => (
                <label key={s.id} className="row-bw" style={{ padding: '6px 8px', background: scopes[s.id] ? 'var(--paper-alt)' : 'transparent', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
                  <span className="row" style={{ gap: 8 }}>
                    <input type="checkbox" checked={scopes[s.id]} onChange={() => setScopes(x => ({ ...x, [s.id]: !x[s.id] }))} />
                    <span className="glyph">{scopes[s.id] ? '☑' : '☐'}</span>
                    <span style={{ fontSize: 13.5 }}>{s.label}</span>
                  </span>
                  {s.rec ? (
                    <span className="mc-caption" style={{ fontSize: 11 }}>recommended</span>
                  ) : (
                    <span className="mc-caption" style={{ fontSize: 11, color: 'var(--accent)' }}>extra · review</span>
                  )}
                </label>
              ))}
            </div>
          </Card>
        )}

        {/* Pass-through / Stored radio */}
        {(auth.modes.includes('passthrough') || auth.modes.includes('stored')) && (
          <Card style={{ marginBottom: 18 }}>
            <SectionLabel>credential mode</SectionLabel>

            {auth.modes.includes('passthrough') && (
              <button
                onClick={() => setMode('passthrough')}
                className={`mc-mode ${mode === 'passthrough' ? 'sel' : ''}`}
              >
                <span className="mc-mode-radio">{mode === 'passthrough' ? '◉' : '○'}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>pass-through</span>
                    <Badge kind="success">most secure</Badge>
                    <span className="mc-caption" style={{ fontSize: 11 }}>recommended</span>
                  </div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    the agent passes credentials in each request. we never see, log, or store your keys. requires the agent to hold the secret.
                  </div>
                </div>
              </button>
            )}

            {auth.modes.includes('stored') && (
              <button
                onClick={() => setMode('stored')}
                className={`mc-mode ${mode === 'stored' ? 'sel' : ''}`}
                style={{ marginTop: 8 }}
              >
                <span className="mc-mode-radio">{mode === 'stored' ? '◉' : '○'}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>stored</span>
                    <Badge kind="accent">easier to use</Badge>
                  </div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    we hold an encrypted copy in our vault. all agent calls reuse it — rotate any time from the dashboard.
                  </div>
                </div>
              </button>
            )}

            {mode === 'stored' && (
              <div style={{ marginTop: 16, padding: 14, background: 'var(--paper-alt)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                <div className="mc-caption-up" style={{ marginBottom: 6 }}>{auth.label.toLowerCase()} secret</div>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    type="password"
                    className="mc-input mc-mono"
                    placeholder="sk_live_••••"
                    value={secret}
                    onChange={(e) => { setSecret(e.target.value); setTested(false); }}
                    style={{ flex: 1, height: 36, fontSize: 12.5 }}
                  />
                  <Btn kind="ghost" size="sm" icon={tested ? 'check' : null} onClick={() => secret && setTested(true)}>
                    {tested ? 'verified' : 'test'}
                  </Btn>
                </div>
                <div className="mc-caption" style={{ marginTop: 8, fontSize: 11.5 }}>
                  {tested
                    ? <span style={{ color: 'var(--success)' }}>✓ key reached the api · returned 200 in 184ms</span>
                    : 'we encrypt at rest with aes-256. keys never appear in logs.'}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Continue */}
        <div className="row-bw" style={{ marginTop: 24 }}>
          <Btn kind="ghost" size="md" icon="arrow-l" onClick={onBack}>back</Btn>
          <Btn kind="primary" size="lg" iconR="arrow-r" onClick={onContinue}>
            continue · generate
          </Btn>
        </div>

        <div className="mc-caption" style={{ textAlign: 'center', marginTop: 14 }}>
          you can switch modes any time from the server dashboard.
        </div>
      </main>
    </div>
  );
}

window.AuthScreen = AuthScreen;
