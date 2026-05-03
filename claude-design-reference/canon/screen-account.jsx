// screen-account.jsx — sign in / sign up for the MCPGen account itself
// (separate from screen-auth.jsx which is the API-auth wizard step)

function AccountScreen({ mode: initialMode, onSignedIn, onBack, onMarketplace }) {
  const [mode, setMode] = React.useState(initialMode || 'signin'); // 'signin' | 'signup' | 'magic' | 'forgot'
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [name, setName] = React.useState('');
  const [company, setCompany] = React.useState('');
  const [agree, setAgree] = React.useState(true);
  const [showPw, setShowPw] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [magicSent, setMagicSent] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  const [err, setErr] = React.useState(null);

  // Password strength meter
  const pwScore = React.useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return Math.min(s, 4);
  }, [password]);
  const pwLabel = ['', 'weak', 'okay', 'good', 'strong'][pwScore];

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const submit = (e) => {
    e?.preventDefault?.();
    setErr(null);
    if (mode === 'magic') {
      if (!validEmail) return setErr('enter a valid email');
      setBusy(true);
      setTimeout(() => { setBusy(false); setMagicSent(true); window.mcpToast?.('magic link sent to ' + email); }, 700);
      return;
    }
    if (mode === 'forgot') {
      if (!validEmail) return setErr('enter a valid email');
      setBusy(true);
      setTimeout(() => { setBusy(false); setResetSent(true); window.mcpToast?.('reset link sent'); }, 700);
      return;
    }
    if (mode === 'signup') {
      if (!name.trim()) return setErr('your name is required');
      if (!validEmail) return setErr('enter a valid email');
      if (pwScore < 2) return setErr('password is too weak');
      if (!agree) return setErr('you must accept the terms to continue');
    } else {
      if (!validEmail) return setErr('enter a valid email');
      if (password.length < 1) return setErr('enter your password');
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      window.mcpToast?.(mode === 'signup' ? 'account created · welcome' : 'welcome back');
      onSignedIn?.();
    }, 800);
  };

  const sso = (provider) => {
    window.mcpToast?.(`opening ${provider} sso…`);
    setBusy(true);
    setTimeout(() => { setBusy(false); onSignedIn?.(); }, 900);
  };

  const isAuthForm = mode === 'signin' || mode === 'signup';

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="account"
        onLogo={onBack}
        right={<a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }} onClick={onMarketplace}>marketplace</a>}
      />

      <main style={{
        maxWidth: 1080, margin: '0 auto', padding: '40px 28px 64px',
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
        gap: 48, alignItems: 'start', position: 'relative', zIndex: 2,
      }}>
        {/* LEFT — pitch / proof */}
        <aside style={{ paddingTop: 24 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>mcpgen · account</div>
          <div className="mc-display-l" style={{ marginBottom: 14, lineHeight: 1.05 }}>
            {mode === 'signup' ? (
              <>start shipping<br/><span style={{ fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>production MCPs.</span></>
            ) : (
              <>welcome back to<br/><span style={{ fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>your servers.</span></>
            )}
          </div>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', maxWidth: 460, margin: '0 0 22px' }}>
            {mode === 'signup'
              ? 'free for the first 50k tool calls per month. no card required. all signups get an evaluation budget on opus and sonnet.'
              : 'pick up where you left off — your servers, drift alerts, and playground sessions are right where you parked them.'}
          </p>

          {/* Trust strip */}
          <div style={{ border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--card)' }}>
            <AcctRow glyph="✓" title="soc 2 type ii" body="audited annually · subprocessor list public" />
            <div className="mc-rule-dashed" />
            <AcctRow glyph="◐" title="single tenant on request" body="dedicated vpc on enterprise — eu, us, apac" />
            <div className="mc-rule-dashed" />
            <AcctRow glyph="◇" title="byok everywhere" body="bring your own anthropic / openai / bedrock keys" />
            <div className="mc-rule-dashed" />
            <AcctRow glyph="∎" title="zero log retention" body="prompts and responses never stored unless you opt-in" />
          </div>

          <div className="mc-caption" style={{ marginTop: 18, fontSize: 11.5 }}>
            trusted by teams at <span style={{ color: 'var(--text)' }}>linear · vercel · supabase · neon · resend · plaid</span>
          </div>
        </aside>

        {/* RIGHT — the form card */}
        <section>
          <div style={{
            border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius-lg)',
            background: 'var(--card)', boxShadow: 'var(--shadow)', overflow: 'hidden',
          }}>
            {/* Tabs (only for signin/signup) */}
            {isAuthForm && (
              <div className="row" style={{ borderBottom: '1px solid var(--border)' }}>
                <AcctTabBtn active={mode === 'signin'} onClick={() => { setMode('signin'); setErr(null); }}>sign in</AcctTabBtn>
                <AcctTabBtn active={mode === 'signup'} onClick={() => { setMode('signup'); setErr(null); }}>create account</AcctTabBtn>
              </div>
            )}

            <div style={{ padding: '26px 28px 24px' }}>
              {/* Magic-link sent state */}
              {mode === 'magic' && magicSent && (
                <AcctSentState
                  title="check your email"
                  body={<>we sent a one-time sign-in link to <span className="mc-mono">{email}</span>. it expires in 15 minutes.</>}
                  onBack={() => { setMode('signin'); setMagicSent(false); }}
                />
              )}

              {/* Reset sent state */}
              {mode === 'forgot' && resetSent && (
                <AcctSentState
                  title="reset link on the way"
                  body={<>if an account exists for <span className="mc-mono">{email}</span>, you'll get a link in a moment.</>}
                  onBack={() => { setMode('signin'); setResetSent(false); }}
                />
              )}

              {/* Magic-link form */}
              {mode === 'magic' && !magicSent && (
                <form onSubmit={submit}>
                  <SectionLabel>sign in with a magic link</SectionLabel>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 14 }}>
                    enter your email — we'll send you a one-time link. no password to remember.
                  </p>
                  <AcctField label="email">
                    <input className="mc-input mc-mono" type="email" placeholder="you@team.dev"
                      value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                  </AcctField>
                  {err && <AcctErrorLine>{err}</AcctErrorLine>}
                  <button className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full" disabled={busy} style={{ marginTop: 14, justifyContent: 'center' }}>
                    {busy ? 'sending…' : 'send magic link'}
                  </button>
                  <AcctBackLink onClick={() => { setMode('signin'); setErr(null); }}>← back to sign in</AcctBackLink>
                </form>
              )}

              {/* Forgot form */}
              {mode === 'forgot' && !resetSent && (
                <form onSubmit={submit}>
                  <SectionLabel>reset your password</SectionLabel>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 0, marginBottom: 14 }}>
                    enter the email on your account. we'll send a link to set a new password.
                  </p>
                  <AcctField label="email">
                    <input className="mc-input mc-mono" type="email" placeholder="you@team.dev"
                      value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                  </AcctField>
                  {err && <AcctErrorLine>{err}</AcctErrorLine>}
                  <button className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full" disabled={busy} style={{ marginTop: 14, justifyContent: 'center' }}>
                    {busy ? 'sending…' : 'send reset link'}
                  </button>
                  <AcctBackLink onClick={() => { setMode('signin'); setErr(null); }}>← back to sign in</AcctBackLink>
                </form>
              )}

              {/* Sign in / sign up form */}
              {isAuthForm && (
                <>
                  {/* SSO row */}
                  <div className="col" style={{ gap: 8 }}>
                    <AcctSsoBtn glyph="G" name="continue with google" onClick={() => sso('google')} />
                    <div className="row" style={{ gap: 8 }}>
                      <AcctSsoBtn glyph="GH" name="github" onClick={() => sso('github')} compact />
                      <AcctSsoBtn glyph="◆" name="microsoft" onClick={() => sso('microsoft')} compact />
                      <AcctSsoBtn glyph="SAML" name="sso" onClick={() => sso('saml')} compact />
                    </div>
                  </div>

                  {/* divider */}
                  <div className="row" style={{ gap: 12, alignItems: 'center', margin: '18px 0 14px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    <span className="mc-caption" style={{ fontSize: 10.5 }}>or with email</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  </div>

                  <form onSubmit={submit}>
                    {mode === 'signup' && (
                      <div className="row" style={{ gap: 10, marginBottom: 12 }}>
                        <AcctField label="full name" style={{ flex: 1 }}>
                          <input className="mc-input" type="text" placeholder="ada lovelace"
                            value={name} onChange={e => setName(e.target.value)} autoFocus />
                        </AcctField>
                        <AcctField label="company · optional" style={{ flex: 1 }}>
                          <input className="mc-input" type="text" placeholder="analytical engines, ltd"
                            value={company} onChange={e => setCompany(e.target.value)} />
                        </AcctField>
                      </div>
                    )}

                    <AcctField label="work email" style={{ marginBottom: 12 }}>
                      <input className="mc-input mc-mono" type="email" placeholder="you@team.dev"
                        value={email} onChange={e => setEmail(e.target.value)}
                        autoFocus={mode === 'signin'} />
                    </AcctField>

                    <AcctField
                      label="password"
                      right={mode === 'signin' && (
                        <a className="mc-link mc-mono" style={{ fontSize: 11, cursor: 'pointer' }}
                          onClick={() => { setMode('forgot'); setErr(null); }}>forgot?</a>
                      )}
                    >
                      <div style={{ position: 'relative' }}>
                        <input className="mc-input mc-mono" type={showPw ? 'text' : 'password'}
                          placeholder={mode === 'signup' ? 'at least 8 chars · mix it up' : '••••••••'}
                          value={password} onChange={e => setPassword(e.target.value)}
                          style={{ paddingRight: 56 }} />
                        <button type="button" onClick={() => setShowPw(s => !s)}
                          className="mc-mono"
                          style={{
                            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: 10.5, color: 'var(--text-muted)', padding: '4px 6px',
                            letterSpacing: '.06em', textTransform: 'uppercase',
                          }}>{showPw ? 'hide' : 'show'}</button>
                      </div>
                    </AcctField>

                    {/* Password strength (signup only) */}
                    {mode === 'signup' && password && (
                      <div style={{ marginTop: 8 }}>
                        <div className="row" style={{ gap: 4, marginBottom: 4 }}>
                          {[0,1,2,3].map(i => (
                            <div key={i} style={{
                              flex: 1, height: 3, borderRadius: 1.5,
                              background: i < pwScore
                                ? (pwScore <= 1 ? 'var(--accent)' : pwScore === 2 ? 'var(--warn, #c98a00)' : 'var(--success)')
                                : 'var(--border)',
                            }} />
                          ))}
                        </div>
                        <div className="mc-caption" style={{ fontSize: 10.5 }}>
                          strength: <span style={{ color: pwScore >= 3 ? 'var(--success)' : 'var(--text)' }}>{pwLabel || '—'}</span>
                          <span style={{ marginLeft: 8, color: 'var(--text-faint)' }}>
                            tip: 12+ chars · mix case · 1 number · 1 symbol
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Terms (signup) */}
                    {mode === 'signup' && (
                      <label className="row" style={{ gap: 8, alignItems: 'flex-start', marginTop: 14, cursor: 'pointer' }}>
                        <input type="checkbox" checked={agree} onChange={() => setAgree(a => !a)} style={{ marginTop: 3 }} />
                        <span className="mc-caption" style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                          i agree to the <a className="mc-link" style={{ cursor: 'pointer' }}>terms</a> and <a className="mc-link" style={{ cursor: 'pointer' }}>privacy policy</a>. you can delete your account at any time from settings.
                        </span>
                      </label>
                    )}

                    {err && <AcctErrorLine>{err}</AcctErrorLine>}

                    <button className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full" disabled={busy}
                      style={{ marginTop: 14, justifyContent: 'center' }}>
                      {busy
                        ? (mode === 'signup' ? 'creating account…' : 'signing in…')
                        : (mode === 'signup' ? 'create account' : 'sign in')}
                      {!busy && <Icon name="arrow-r" size={13} />}
                    </button>

                    {/* Magic link offer */}
                    <button type="button" className="mc-btn mc-btn-full"
                      style={{ marginTop: 8, justifyContent: 'center', background: 'transparent' }}
                      onClick={() => { setMode('magic'); setErr(null); }}>
                      <span className="mc-mono" style={{ fontSize: 11, opacity: .7 }}>[ ✉ ]</span>
                      <span style={{ marginLeft: 8 }}>email me a magic link instead</span>
                    </button>
                  </form>
                </>
              )}
            </div>

            {/* Footer band */}
            <div style={{
              borderTop: '1px solid var(--border)', padding: '12px 28px',
              background: 'var(--paper-alt)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
            }}>
              <span className="mc-caption" style={{ fontSize: 11 }}>
                {mode === 'signin' || mode === 'magic' || mode === 'forgot'
                  ? <>new here? <a className="mc-link mc-mono" style={{ cursor: 'pointer' }} onClick={() => { setMode('signup'); setErr(null); }}>create an account</a></>
                  : <>already have one? <a className="mc-link mc-mono" style={{ cursor: 'pointer' }} onClick={() => { setMode('signin'); setErr(null); }}>sign in</a></>}
              </span>
              <span className="mc-caption" style={{ fontSize: 11 }}>
                <a className="mc-link mc-mono" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast?.('opening status page…')}>● all systems operational</a>
              </span>
            </div>
          </div>

          {/* Below-card meta */}
          <div className="row-bw" style={{ marginTop: 14, gap: 12, flexWrap: 'wrap' }}>
            <span className="mc-caption" style={{ fontSize: 11 }}>
              protected by hcaptcha · we never email marketing
            </span>
            <span className="mc-caption" style={{ fontSize: 11 }}>
              <a className="mc-link mc-mono" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast?.('opening enterprise sso help…')}>need enterprise SSO?</a>
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function AcctTabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="mc-mono"
      style={{
        flex: 1, padding: '14px 16px',
        border: 'none', borderBottom: active ? '2px solid var(--ink)' : '2px solid transparent',
        background: active ? 'var(--card)' : 'var(--paper-alt)',
        color: active ? 'var(--text)' : 'var(--text-muted)',
        fontSize: 12, letterSpacing: '.06em', textTransform: 'uppercase',
        cursor: 'pointer', fontWeight: active ? 600 : 400,
      }}>
      {children}
    </button>
  );
}

function AcctField({ label, right, children, style }) {
  return (
    <div style={style}>
      <div className="row-bw" style={{ marginBottom: 6, gap: 8, minHeight: 16 }}>
        <label className="mc-caption-up" style={{ fontSize: 10.5, whiteSpace: 'nowrap' }}>{label}</label>
        {right}
      </div>
      {children}
    </div>
  );
}

function AcctErrorLine({ children }) {
  return (
    <div className="row" style={{
      gap: 8, marginTop: 12, padding: '8px 10px',
      background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
      border: '1px solid color-mix(in oklch, var(--accent) 35%, var(--border))',
      borderRadius: 'var(--radius)',
    }}>
      <span className="mc-mono" style={{ fontSize: 11, color: 'var(--accent)' }}>!</span>
      <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{children}</span>
    </div>
  );
}

function AcctSsoBtn({ glyph, name, onClick, compact }) {
  return (
    <button onClick={onClick} className="mc-btn"
      style={{
        flex: 1, justifyContent: compact ? 'center' : 'flex-start',
        padding: compact ? '10px 12px' : '11px 14px',
        gap: 10, fontSize: compact ? 12 : 13.5,
      }}>
      <span className="mc-mono" style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 22, height: 22, padding: '0 4px',
        border: '1px solid var(--border-sharp)', borderRadius: 4,
        background: 'var(--paper-alt)', fontSize: 10.5, fontWeight: 600,
      }}>{glyph}</span>
      <span>{name}</span>
    </button>
  );
}

function AcctSentState({ title, body, onBack }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{
        width: 56, height: 56, margin: '0 auto 14px',
        border: '1px solid var(--border-sharp)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--paper-alt)',
      }}>
        <span className="mc-mono" style={{ fontSize: 22 }}>✉</span>
      </div>
      <div className="mc-h2" style={{ textAlign: 'center', marginBottom: 8 }}>{title}</div>
      <p style={{ textAlign: 'center', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-muted)', margin: 0 }}>{body}</p>
      <AcctBackLink onClick={onBack}>← back to sign in</AcctBackLink>
    </div>
  );
}

function AcctBackLink({ children, onClick }) {
  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }} onClick={onClick}>{children}</a>
    </div>
  );
}

function AcctRow({ glyph, title, body }) {
  return (
    <div className="row" style={{ gap: 14, padding: '12px 14px', alignItems: 'flex-start' }}>
      <span className="mc-mono" style={{
        flexShrink: 0, width: 22, height: 22,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid var(--border-sharp)', borderRadius: 4,
        background: 'var(--paper-alt)', fontSize: 12,
      }}>{glyph}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{title}</div>
        <div className="mc-caption" style={{ fontSize: 11.5, lineHeight: 1.5 }}>{body}</div>
      </div>
    </div>
  );
}

window.AccountScreen = AccountScreen;
