// apps/web/src/components/screens/admin/login/login.tsx
//
// Phase 3 / C4-login — Admin login screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-login.jsx
// (`LoginScreen`).
//
// Three-stage form: identity (SSO) → 2-factor (MFA) → session (success).
// Mirrors the canon flow:
//   - SSO accepts only `@mcpgen.dev` addresses; "continue with Okta" /
//     "passkey" buttons advance to MFA after a 280ms timeout (canon parity).
//   - MFA expects a 6-digit numeric code (`123456` accepted in dev mock);
//     also surfaces a session-shift selector (on-call / scheduled /
//     breakglass) and a "reason" field for non-default shifts.
//   - Success briefly shows a session card + auto-routes to `/admin`.
//
// All BFF endpoints (Logto SSO, MFA verify, session start) are missing.
// Per the dispatch brief, the actual sign-in is gated by
// `ui_admin_login_perm` (default OFF) — the flow remains a UI mock until
// flipped. See `.planning/phase-rebuild/FLAGS-NEEDED.md`.
//
// Layout / style: full-bleed two-column grid (canon `gridTemplateColumns:
// 1.1fr 1fr`), left rail = brand + system status mock, right pane = the
// active form. Renders WITHOUT the AdminShell — the `_admin-shell-gate.tsx`
// from C1 already skips the shell on `/admin/login`.

'use client';

import { useRouter } from 'next/navigation';
import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
} from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────

export type LoginStage = 'sso' | 'mfa' | 'success';
export type LoginShift = 'on-call' | 'scheduled' | 'breakglass';

export interface LoginProps {
  /** Initial email for the SSO stage (canon default = jana.k@mcpgen.dev). */
  initialEmail?: string;
  /** Initial stage (test override). */
  initialStage?: LoginStage;
  /** After-success redirect (default `/admin`). */
  successHref?: string;
  /**
   * Disable the after-success router push (test override). Useful in unit
   * tests that don't have a router.
   */
  disableRedirect?: boolean;
}

// ─── Stage indicator ───────────────────────────────────────────────────────

interface StepProps {
  idx: string;
  label: string;
  active: boolean;
  done: boolean;
}

function Step({ idx, label, active, done }: StepProps): ReactElement {
  const color = active
    ? 'var(--text)'
    : done
      ? 'var(--success)'
      : 'var(--text-faint)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color }}>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          border: `1px solid ${color}`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          background: done ? 'var(--success)' : 'transparent',
        }}
      >
        {done ? <span style={{ color: 'var(--paper)' }}>✓</span> : idx}
      </span>
      <span>{label}</span>
    </div>
  );
}

// ─── Mock system status (left rail) ────────────────────────────────────────

const STATUS_ROWS: ReadonlyArray<readonly [string, string, '' | 'ok']> = [
  ['all systems', 'operational', 'ok'],
  ['build', 'a91c4e2 · 2 min', ''],
  ['active inc.', '0', 'ok'],
  ['queue', '42 jobs', ''],
  ['active staff', '7 of 14', ''],
];

const SHIFT_OPTIONS: ReadonlyArray<readonly [LoginShift, string]> = [
  ['on-call', 'standard 8h session · normal approval thresholds'],
  ['scheduled', 'planned maintenance window · INC-2025-0742'],
  [
    'breakglass',
    '⚠ pages on-call manager · 30-min session · all actions recorded',
  ],
];

// ─── Login screen ──────────────────────────────────────────────────────────

export function Login({
  initialEmail = 'jana.k@mcpgen.dev',
  initialStage = 'sso',
  successHref = '/admin',
  disableRedirect = false,
}: LoginProps = {}): ReactElement {
  const router = useRouter();

  const [stage, setStage] = useState<LoginStage>(initialStage);
  const [email, setEmail] = useState<string>(initialEmail);
  const [code, setCode] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState<string>('');
  const [shift, setShift] = useState<LoginShift>('on-call');

  // ── Stage transitions ────────────────────────────────────────────────────

  const advanceToMfa = (): void => {
    setErr(null);
    // Canon delays the stage flip by 280ms to mimic an SSO bounce.
    setTimeout(() => setStage('mfa'), 280);
  };

  const submitSso = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!email.endsWith('@mcpgen.dev')) {
      setErr('staff sso requires an @mcpgen.dev address');
      return;
    }
    advanceToMfa();
  };

  const submitMfa = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (code.length !== 6) {
      setErr('enter the 6-digit code from your authenticator');
      return;
    }
    setErr(null);
    setStage('success');
    if (disableRedirect) return;
    setTimeout(() => router.push(successHref), 700);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const rootStyle: CSSProperties = {
    minHeight: '100vh',
    background: 'var(--paper)',
    color: 'var(--text)',
    display: 'grid',
    gridTemplateColumns: '1.1fr 1fr',
    fontFamily: 'var(--font-body)',
  };

  return (
    <div style={rootStyle} data-screen-label="admin · login">
      {/* ── left rail · brand + system status ── */}
      <div
        style={{
          position: 'relative',
          borderRight: '1px solid var(--border)',
          padding: '34px 44px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'var(--paper-alt)',
        }}
      >
        <div
          className="adm-logo"
          style={{
            position: 'static',
            borderBottom: 'none',
            padding: 0,
          }}
        >
          <span className="mark">m</span>
          <span>mcpgen</span>
          <span className="ops">ops</span>
        </div>

        <div>
          <div
            style={{
              fontFamily: 'Instrument Serif, serif',
              fontSize: 56,
              lineHeight: 1.05,
              fontStyle: 'italic',
              marginBottom: 18,
            }}
          >
            internal
            <br />
            operations
            <br />
            console.
          </div>
          <p
            style={{
              fontSize: 13.5,
              lineHeight: 1.7,
              color: 'var(--text-muted)',
              maxWidth: 420,
              margin: 0,
            }}
          >
            staff-only. every action you take from this point is logged and
            signed against your identity. customer impersonation, kill
            switches, and suspensions require a second approver.
          </p>
        </div>

        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              color: 'var(--text-muted)',
              marginBottom: 10,
            }}
          >
            system at a glance
          </div>
          <div
            style={{
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            }}
          >
            {STATUS_ROWS.map(([label, value, kind], i) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom:
                    i < STATUS_ROWS.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span
                  style={{
                    color:
                      kind === 'ok' ? 'var(--success)' : 'var(--text)',
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              border: '1px dashed var(--border-sharp)',
              borderRadius: 4,
              background: 'var(--card)',
            }}
          >
            <div
              style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}
            >
              ⚠ you are connecting from an unrecognised network
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              74.125.x.x · oslo, no · not on staff allowlist. an extra
              approval will be required for destructive actions during this
              session.
            </div>
          </div>
        </div>
      </div>

      {/* ── right · sign-in card ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
        }}
      >
        <div style={{ width: 420 }}>
          {/* progress */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 28,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}
          >
            <Step
              idx="01"
              label="identity"
              active={stage === 'sso'}
              done={stage !== 'sso'}
            />
            <Step
              idx="02"
              label="2-factor"
              active={stage === 'mfa'}
              done={stage === 'success'}
            />
            <Step
              idx="03"
              label="session"
              active={stage === 'success'}
              done={false}
            />
          </div>

          {stage === 'sso' && (
            <form onSubmit={submitSso} aria-label="staff sso form">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                  }}
                />
                staff only · not a customer area
              </div>
              <h1
                style={{
                  fontFamily: 'Instrument Serif, serif',
                  fontStyle: 'italic',
                  fontSize: 36,
                  margin: '0 0 8px',
                }}
              >
                sign in to ops
              </h1>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--text-muted)',
                  margin: '0 0 24px',
                  lineHeight: 1.6,
                }}
              >
                this console is for mcpgen employees only. there is no
                sign-up — your account is provisioned by it through okta.
                customers sign in at{' '}
                <a className="adm-link" href="/">
                  mcpgen.dev
                </a>
                .
              </p>

              {/* Hidden email field. Canon hard-codes the address; the
                  validator below still runs against `email` so the @mcpgen.dev
                  guard fires identically. Keeping it as state allows a future
                  email-input variant without touching the validator. */}
              <input
                type="hidden"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <button
                type="submit"
                className="mc-btn mc-btn-ink mc-btn-md"
                onClick={advanceToMfa}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  height: 48,
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    background: 'var(--ink-on)',
                    color: 'var(--ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                  }}
                >
                  O
                </span>
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    marginLeft: 10,
                  }}
                >
                  <span style={{ display: 'block', fontWeight: 600 }}>
                    continue with okta
                  </span>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 11,
                      opacity: 0.7,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    mcpgen.okta.com · saml 2.0
                  </span>
                </span>
                <span
                  style={{
                    opacity: 0.7,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                  }}
                >
                  idp →
                </span>
              </button>

              <button
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-md"
                onClick={advanceToMfa}
                style={{
                  width: '100%',
                  justifyContent: 'flex-start',
                  height: 44,
                }}
              >
                <span
                  style={{
                    width: 22,
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  ⚷
                </span>
                <span
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    marginLeft: 10,
                  }}
                >
                  sign in with passkey
                </span>
                <span
                  style={{
                    opacity: 0.6,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                  }}
                >
                  webauthn · this device
                </span>
              </button>

              {err !== null && (
                <div
                  role="alert"
                  style={{
                    color: 'var(--accent)',
                    fontSize: 12,
                    marginTop: 10,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  · {err}
                </div>
              )}

              <div
                style={{
                  marginTop: 26,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    color: 'var(--text-muted)',
                    marginBottom: 8,
                  }}
                >
                  can&apos;t sign in?
                </div>
                <ul
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    lineHeight: 1.7,
                    margin: 0,
                    paddingLeft: 0,
                    listStyle: 'none',
                  }}
                >
                  <li>
                    · lost device or passkey —{' '}
                    <span className="adm-link">contact #it-helpdesk</span>
                  </li>
                  <li>
                    · okta is down —{' '}
                    <span className="adm-link">
                      request break-glass access
                    </span>{' '}
                    (pages on-call manager, 30-min capped session)
                  </li>
                  <li>
                    · left the company recently — your account was
                    deprovisioned by it
                  </li>
                </ul>
              </div>
            </form>
          )}

          {stage === 'mfa' && (
            <form onSubmit={submitMfa} aria-label="mfa form">
              <h1
                style={{
                  fontFamily: 'Instrument Serif, serif',
                  fontStyle: 'italic',
                  fontSize: 36,
                  margin: '0 0 8px',
                }}
              >
                second factor
              </h1>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--text-muted)',
                  margin: '0 0 22px',
                  lineHeight: 1.6,
                }}
              >
                signed in as <strong>{email}</strong>. enter the 6-digit
                code from your authenticator. your touch-id key is also
                accepted.
              </p>

              <label
                htmlFor="mfa-code"
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10.5,
                  textTransform: 'uppercase',
                  letterSpacing: '.08em',
                  color: 'var(--text-muted)',
                  marginBottom: 6,
                }}
              >
                authenticator code
              </label>
              <input
                id="mfa-code"
                className="mc-input mc-mono"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                }
                placeholder="000 000"
                inputMode="numeric"
                autoComplete="one-time-code"
                style={{
                  fontSize: 22,
                  letterSpacing: '.6em',
                  textAlign: 'center',
                  height: 56,
                }}
                autoFocus
              />
              {err !== null && (
                <div
                  role="alert"
                  style={{
                    color: 'var(--accent)',
                    fontSize: 12,
                    marginTop: 6,
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  · {err}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    textTransform: 'uppercase',
                    letterSpacing: '.08em',
                    color: 'var(--text-muted)',
                  }}
                >
                  session shift
                </div>
                {SHIFT_OPTIONS.map(([key, desc]) => {
                  const sel = shift === key;
                  return (
                    <div
                      key={key}
                      role="radio"
                      aria-checked={sel}
                      tabIndex={0}
                      onClick={() => setShift(key)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setShift(key);
                        }
                      }}
                      className={`mc-radio-row ${sel ? 'sel' : ''}`.trim()}
                      style={{
                        ...(key === 'breakglass' && sel
                          ? { borderColor: 'var(--accent)' }
                          : {}),
                      }}
                    >
                      <span className="mc-radio-glyph">
                        {sel ? '◉' : '○'}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {key}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {(shift === 'scheduled' || shift === 'breakglass') && (
                <div style={{ marginTop: 12 }}>
                  <label
                    htmlFor="mfa-reason"
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      letterSpacing: '.08em',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                    }}
                  >
                    reason · required
                  </label>
                  <input
                    id="mfa-reason"
                    className="mc-input mc-mono"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={
                      shift === 'breakglass'
                        ? 'INC-… and what you intend to do'
                        : 'INC-… or maintenance ticket'
                    }
                  />
                </div>
              )}

              <button
                type="submit"
                className="mc-btn mc-btn-ink mc-btn-md"
                style={{
                  width: '100%',
                  marginTop: 16,
                  height: 42,
                }}
                disabled={
                  code.length !== 6 ||
                  (shift !== 'on-call' && reason.length === 0)
                }
              >
                <span>start session</span>
              </button>

              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  gap: 14,
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                }}
              >
                <span className="adm-link">use recovery code</span>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <button
                  type="button"
                  className="adm-link"
                  onClick={() => {
                    setErr(null);
                    setCode('');
                    setStage('sso');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    font: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  back
                </button>
                <span style={{ color: 'var(--text-faint)' }}>·</span>
                <span className="adm-link">contact security</span>
              </div>
            </form>
          )}

          {stage === 'success' && (
            <div>
              <h1
                style={{
                  fontFamily: 'Instrument Serif, serif',
                  fontStyle: 'italic',
                  fontSize: 36,
                  margin: '0 0 8px',
                }}
              >
                session opened
              </h1>
              <p
                style={{
                  fontSize: 13.5,
                  color: 'var(--text-muted)',
                  margin: '0 0 22px',
                  lineHeight: 1.6,
                }}
              >
                welcome back, <strong>jana</strong>. you are{' '}
                <strong>{shift}</strong> for the next 8 hours.
              </p>
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 4,
                  padding: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '110px 1fr',
                    rowGap: 6,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>
                    session id
                  </span>
                  <span>sess_8a91qp4f3c2e</span>
                  <span style={{ color: 'var(--text-muted)' }}>expires</span>
                  <span>in 8 hours · 22:42 utc</span>
                  <span style={{ color: 'var(--text-muted)' }}>ip</span>
                  <span>74.125.x.x · oslo, no</span>
                  <span style={{ color: 'var(--text-muted)' }}>device</span>
                  <span>macbook · chrome 121 · webauthn</span>
                  <span style={{ color: 'var(--text-muted)' }}>scopes</span>
                  <span>ops.read, ops.write, billing.refund, support.*</span>
                </div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                opening ops console…
              </div>
            </div>
          )}

          <div
            style={{
              marginTop: 28,
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              color: 'var(--text-faint)',
              textAlign: 'center',
            }}
          >
            mcpgen ops · v4.12.0 · soc2 type ii · iso 27001 · all sessions
            are recorded
          </div>
        </div>
      </div>
    </div>
  );
}
