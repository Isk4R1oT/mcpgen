// admin-login.jsx — staff sign-in (sso → mfa → session start)

function LoginScreen({ onIn }) {
  const [stage, setStage] = React.useState('sso'); // sso | mfa | locked | success
  const [email, setEmail] = React.useState('jana.k@mcpgen.dev');
  const [code, setCode]   = React.useState('');
  const [err, setErr]     = React.useState(null);
  const [reason, setReason] = React.useState('');
  const [shift, setShift] = React.useState('on-call'); // on-call | scheduled | breakglass

  const tokens = window.computeTokens
    ? window.computeTokens({ caseStyle: 'lower', titleFont: 'Instrument Serif', bodyFont: 'Inter', monoFont: 'JetBrains Mono', density: 'compact', radius: 'sharp', shadow: 'soft', borderWeight: 'normal', palette: 'paper' })
    : {};

  const submitSso = (e) => {
    e.preventDefault();
    if (!email.endsWith('@mcpgen.dev')) { setErr('staff sso requires an @mcpgen.dev address'); return; }
    setErr(null);
    setTimeout(() => setStage('mfa'), 280);
  };
  const submitMfa = (e) => {
    e.preventDefault();
    if (code.length !== 6) { setErr('enter the 6-digit code from your authenticator'); return; }
    setErr(null);
    setStage('success');
    setTimeout(() => onIn && onIn(), 700);
  };

  return (
    <div style={{ ...tokens, minHeight: '100vh', background: 'var(--paper)', color: 'var(--text)', display: 'grid', gridTemplateColumns: '1.1fr 1fr', fontFamily: 'var(--font-body)' }}>
      {/* ── left rail · brand + system status ── */}
      <div style={{ position: 'relative', borderRight: '1px solid var(--border)', padding: '34px 44px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: 'var(--paper-alt)' }}>
        <div className="adm-logo" style={{ position: 'static', borderBottom: 'none', padding: 0 }}>
          <span className="mark">m</span>
          <span>mcpgen</span>
          <span className="ops">ops</span>
        </div>

        <div>
          <div style={{ fontFamily: 'Instrument Serif, serif', fontSize: 56, lineHeight: 1.05, fontStyle: 'italic', marginBottom: 18 }}>
            internal<br/>operations<br/>console.
          </div>
          <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-muted)', maxWidth: 420, margin: 0 }}>
            staff-only. every action you take from this point is logged and signed against your identity. customer impersonation, kill switches, and suspensions require a second approver.
          </p>
        </div>

        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-muted)', marginBottom: 10 }}>system at a glance</div>
          <div style={{ border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {[
              ['all systems', 'operational',     'ok'],
              ['build',       'a91c4e2 · 2 min', ''],
              ['active inc.', '0',                'ok'],
              ['queue',       '42 jobs',         ''],
              ['active staff','7 of 14',          ''],
            ].map(([l, v, k], i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ color: k === 'ok' ? 'var(--success)' : 'var(--text)' }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: 12, border: '1px dashed var(--border-sharp)', borderRadius: 4, background: 'var(--card)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>⚠ you are connecting from an unrecognised network</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>74.125.x.x · oslo, no · not on staff allowlist. an extra approval will be required for destructive actions during this session.</div>
          </div>
        </div>
      </div>

      {/* ── right · sign-in card ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 420 }}>
          {/* progress */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 28, fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.1em' }}>
            <Step idx="01" label="identity" active={stage === 'sso'} done={stage !== 'sso'} />
            <Step idx="02" label="2-factor" active={stage === 'mfa'} done={stage === 'success'} />
            <Step idx="03" label="session"  active={stage === 'success'} done={false} />
          </div>

          {stage === 'sso' && (
            <form onSubmit={submitSso}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 999, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 14 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
                staff only · not a customer area
              </div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 36, margin: '0 0 8px' }}>sign in to ops</h1>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 24px', lineHeight: 1.6 }}>
                this console is for mcpgen employees only. there is no sign-up — your account is provisioned by it through okta. customers sign in at <a className="adm-link" href="MCPGen.html">mcpgen.dev</a>.
              </p>

              <button type="button" className="mc-btn mc-btn-ink mc-btn-md" onClick={() => setTimeout(() => setStage('mfa'), 280)} style={{ width: '100%', justifyContent: 'flex-start', height: 48, marginBottom: 8 }}>
                <span style={{ width: 22, height: 22, borderRadius: 4, background: 'var(--ink-on)', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: 12 }}>O</span>
                <span style={{ flex: 1, textAlign: 'left', marginLeft: 10 }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>continue with okta</span>
                  <span style={{ display: 'block', fontSize: 11, opacity: .7, fontFamily: 'var(--font-mono)' }}>mcpgen.okta.com · saml 2.0</span>
                </span>
                <span style={{ opacity: .7, fontFamily: 'var(--font-mono)', fontSize: 11 }}>idp →</span>
              </button>

              <button type="button" className="mc-btn mc-btn-ghost mc-btn-md" onClick={() => setTimeout(() => setStage('mfa'), 280)} style={{ width: '100%', justifyContent: 'flex-start', height: 44 }}>
                <span style={{ width: 22, textAlign: 'center', fontFamily: 'var(--font-mono)' }}>⚷</span>
                <span style={{ flex: 1, textAlign: 'left', marginLeft: 10 }}>sign in with passkey</span>
                <span style={{ opacity: .6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>webauthn · this device</span>
              </button>

              {err && <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 10, fontFamily: 'var(--font-mono)' }}>· {err}</div>}

              <div style={{ marginTop: 26, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', marginBottom: 8 }}>can't sign in?</div>
                <ul style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, margin: 0, paddingLeft: 0, listStyle: 'none' }}>
                  <li>· lost device or passkey — <a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => alert('opening it-helpdesk slack channel…')}>contact #it-helpdesk</a></li>
                  <li>· okta is down — <a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => alert('break-glass requested · paging on-call manager…')}>request break-glass access</a> (pages on-call manager, 30-min capped session)</li>
                  <li>· left the company recently — your account was deprovisioned by it</li>
                </ul>
              </div>
            </form>
          )}

          {stage === 'mfa' && (
            <form onSubmit={submitMfa}>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 36, margin: '0 0 8px' }}>second factor</h1>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
                signed in as <strong>{email}</strong>. enter the 6-digit code from your authenticator. your touch-id key is also accepted.
              </p>

              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', marginBottom: 6 }}>authenticator code</label>
              <input
                className="mc-input mc-mono"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000 000"
                style={{ fontSize: 22, letterSpacing: '.6em', textAlign: 'center', height: 56 }}
                autoFocus
              />
              {err && <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 6, fontFamily: 'var(--font-mono)' }}>· {err}</div>}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>session shift</div>
                {[
                  ['on-call',    'standard 8h session · normal approval thresholds'],
                  ['scheduled',  'planned maintenance window · INC-2025-0742'],
                  ['breakglass', '⚠ pages on-call manager · 30-min session · all actions recorded'],
                ].map(([k, d]) => (
                  <div key={k}
                       onClick={() => setShift(k)}
                       className={`mc-radio-row ${shift === k ? 'sel' : ''}`}
                       style={{ borderColor: k === 'breakglass' && shift === k ? 'var(--accent)' : '' }}>
                    <span className="mc-radio-glyph">{shift === k ? '◉' : '○'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{k}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{d}</div>
                    </div>
                  </div>
                ))}
              </div>

              {(shift === 'scheduled' || shift === 'breakglass') && (
                <div style={{ marginTop: 12 }}>
                  <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)', marginBottom: 6 }}>reason · required</label>
                  <input className="mc-input mc-mono" value={reason} onChange={e => setReason(e.target.value)} placeholder={shift === 'breakglass' ? 'INC-… and what you intend to do' : 'INC-… or maintenance ticket'} />
                </div>
              )}

              <button type="submit" className="mc-btn mc-btn-ink mc-btn-md" style={{ width: '100%', marginTop: 16, height: 42 }} disabled={code.length !== 6 || ((shift !== 'on-call') && !reason)}>
                start session
              </button>

              <div style={{ marginTop: 14, display: 'flex', gap: 14, justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                <a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => alert('enter your 16-char recovery code')}>use recovery code</a>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <a className="adm-link" onClick={() => setStage('sso')}>back</a>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <a className="adm-link" style={{ cursor: 'pointer' }} onClick={() => alert('paging security on-call…')}>contact security</a>
              </div>
            </form>
          )}

          {stage === 'success' && (
            <div>
              <h1 style={{ fontFamily: 'Instrument Serif, serif', fontStyle: 'italic', fontSize: 36, margin: '0 0 8px' }}>session opened</h1>
              <p style={{ fontSize: 13.5, color: 'var(--text-muted)', margin: '0 0 22px', lineHeight: 1.6 }}>
                welcome back, <strong>jana</strong>. you are <strong>{shift}</strong> for the next 8 hours.
              </p>
              <div style={{ border: '1px solid var(--border)', borderRadius: 4, padding: 14, fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>session id</span><span>sess_8a91qp4f3c2e</span>
                  <span style={{ color: 'var(--text-muted)' }}>expires</span><span>in 8 hours · 22:42 utc</span>
                  <span style={{ color: 'var(--text-muted)' }}>ip</span><span>74.125.x.x · oslo, no</span>
                  <span style={{ color: 'var(--text-muted)' }}>device</span><span>macbook · chrome 121 · webauthn</span>
                  <span style={{ color: 'var(--text-muted)' }}>scopes</span><span>ops.read, ops.write, billing.refund, support.*</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>opening ops console…</div>
            </div>
          )}

          <div style={{ marginTop: 28, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-faint)', textAlign: 'center' }}>
            mcpgen ops · v4.12.0 · soc2 type ii · iso 27001 · all sessions are recorded
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({ idx, label, active, done }) {
  const color = active ? 'var(--text)' : done ? 'var(--success)' : 'var(--text-faint)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
      <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1px solid ${color}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, background: done ? 'var(--success)' : 'transparent' }}>
        {done ? <span style={{ color: 'var(--paper)' }}>✓</span> : idx}
      </span>
      <span>{label}</span>
    </div>
  );
}

window.LoginScreen = LoginScreen;
