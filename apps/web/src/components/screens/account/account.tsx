// apps/web/src/components/screens/account/account.tsx
//
// Phase Frontend Rebuild — Account screen (production sign-in / sign-up).
//
// Source of truth: claude-design-reference/canon/screen-account.jsx
// (`AccountScreen`, lines 1–335). 100% pixel parity with that JSX, but rebuilt
// against the production primitive kit (`@/components/ui/*`) and next-intl
// translations.
//
// NOT to be confused with `apps/web/src/components/screens/auth/auth.tsx` —
// that screen is the upstream-API auth probe (Pass 0 detection step).
//
// Behaviour wiring (per Phase brief):
//   - sign-in       → POST /api/auth/embedded/sign-in       {email, password}
//   - sign-up       → POST /api/auth/embedded/sign-up       {name, email, password, company?}
//   - magic         → POST /api/auth/embedded/magic-link    {email}
//   - forgot        → POST /api/auth/embedded/forgot-password {email}
//   - SSO providers → window.location hard-nav to /api/auth/logto/sign-in?provider=…
//   - 200 → router.push('/dashboard') (sign-in/up) or render <AcctSentState/> (magic/forgot)
//   - 4xx → render <AcctErrorLine/> with API's `error_message`
//
// Flag-gating (server-evaluated; passed as bool props):
//   - ui_auth_signup_perm           — show "create account" tab + signup mode
//   - ui_auth_magic_link_perm       — show "email me a magic link" CTA
//   - ui_auth_forgot_password_perm  — show "forgot?" link in password slot
//   - ui_auth_google_sso_perm       — show "continue with google" SSO row
//   - ui_auth_github_sso_perm       — show GitHub compact SSO button
//   - ui_auth_microsoft_sso_perm    — show Microsoft compact SSO button
//   - ui_auth_saml_sso_perm         — show SAML compact SSO button
//   - ui_marketplace_perm           — show "marketplace" link in TopBar right slot
//
// When ALL 4 SSO flags are OFF the entire SSO block + the "or with email"
// divider collapse cleanly so the form layout stays canon-correct.

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
  type JSX,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { Icon, TopBar } from '@/components/ui';
import { toast } from '@/lib/toast';

import {
  AcctBackLink,
  AcctErrorLine,
  AcctField,
  AcctRow,
  AcctSentState,
  AcctSsoBtn,
  AcctTabBtn,
} from './components';

// ────────────────────────────────────────────────────────────────────────────
// Public types.
// ────────────────────────────────────────────────────────────────────────────

export type AccountMode = 'signin' | 'signup' | 'magic' | 'forgot';

export interface AccountFlags {
  readonly ui_auth_signup_perm: boolean;
  readonly ui_auth_magic_link_perm: boolean;
  readonly ui_auth_forgot_password_perm: boolean;
  readonly ui_auth_google_sso_perm: boolean;
  readonly ui_auth_github_sso_perm: boolean;
  readonly ui_auth_microsoft_sso_perm: boolean;
  readonly ui_auth_saml_sso_perm: boolean;
  readonly ui_marketplace_perm: boolean;
}

export interface AccountScreenProps {
  readonly mode: AccountMode;
  readonly flags: AccountFlags;
}

// ────────────────────────────────────────────────────────────────────────────
// Constants.
// ────────────────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PW_LABELS: ReadonlyArray<string> = ['', 'weak', 'okay', 'good', 'strong'];

type SsoProvider = 'google' | 'github' | 'microsoft' | 'saml';

// ────────────────────────────────────────────────────────────────────────────
// API helpers.
// ────────────────────────────────────────────────────────────────────────────

interface ApiErrorBody {
  readonly error_message?: string;
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; errorMessage: string }> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, errorMessage: `network error: ${reason}` };
  }

  if (response.ok) {
    return { ok: true };
  }
  let parsed: ApiErrorBody = {};
  try {
    parsed = (await response.json()) as ApiErrorBody;
  } catch {
    // Body wasn't JSON — fall through to a generic message.
  }
  const errorMessage =
    typeof parsed.error_message === 'string' && parsed.error_message.length > 0
      ? parsed.error_message
      : `request failed (status ${response.status})`;
  return { ok: false, errorMessage };
}

// ────────────────────────────────────────────────────────────────────────────
// Public component.
// ────────────────────────────────────────────────────────────────────────────

export default function AccountScreen({
  mode: initialMode,
  flags,
}: AccountScreenProps): JSX.Element {
  const t = useTranslations('account');
  const router = useRouter();

  // If the caller landed in a flag-gated mode that's off, snap back to signin.
  // Server route shells already 404 in that case, but this is a defensive
  // belt-and-suspenders for the client.
  const safeInitial: AccountMode =
    (initialMode === 'signup' && !flags.ui_auth_signup_perm) ||
    (initialMode === 'magic' && !flags.ui_auth_magic_link_perm) ||
    (initialMode === 'forgot' && !flags.ui_auth_forgot_password_perm)
      ? 'signin'
      : initialMode;

  const [mode, setMode] = useState<AccountMode>(safeInitial);
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [company, setCompany] = useState<string>('');
  const [agree, setAgree] = useState<boolean>(true);
  const [showPw, setShowPw] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [magicSent, setMagicSent] = useState<boolean>(false);
  const [resetSent, setResetSent] = useState<boolean>(false);
  const [err, setErr] = useState<string | null>(null);

  // Password strength meter (canon algorithm — 1:1).
  const pwScore = useMemo<number>(() => {
    if (password.length === 0) return 0;
    let s = 0;
    if (password.length >= 8) s += 1;
    if (password.length >= 12) s += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s += 1;
    if (/\d/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return Math.min(s, 4);
  }, [password]);
  const pwLabel = PW_LABELS[pwScore] ?? '';

  const validEmail = EMAIL_RE.test(email);
  const isAuthForm = mode === 'signin' || mode === 'signup';

  const anySsoEnabled =
    flags.ui_auth_google_sso_perm ||
    flags.ui_auth_github_sso_perm ||
    flags.ui_auth_microsoft_sso_perm ||
    flags.ui_auth_saml_sso_perm;
  const compactSsoCount =
    (flags.ui_auth_github_sso_perm ? 1 : 0) +
    (flags.ui_auth_microsoft_sso_perm ? 1 : 0) +
    (flags.ui_auth_saml_sso_perm ? 1 : 0);

  // ── Mode switching ────────────────────────────────────────────────────────

  const goSignin = (): void => {
    setMode('signin');
    setErr(null);
    setMagicSent(false);
    setResetSent(false);
    router.push('/sign-in');
  };
  const goSignup = (): void => {
    if (!flags.ui_auth_signup_perm) return;
    setMode('signup');
    setErr(null);
    router.push('/sign-up');
  };
  const goMagic = (): void => {
    if (!flags.ui_auth_magic_link_perm) return;
    setMode('magic');
    setErr(null);
    router.push('/sign-in/magic');
  };
  const goForgot = (): void => {
    if (!flags.ui_auth_forgot_password_perm) return;
    setMode('forgot');
    setErr(null);
    router.push('/sign-in/forgot');
  };

  // ── Submit handlers ──────────────────────────────────────────────────────

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    setErr(null);

    if (mode === 'magic') {
      if (!validEmail) {
        setErr(t('errEmail'));
        return;
      }
      setBusy(true);
      void (async () => {
        const result = await postJson('/api/auth/embedded/magic-link', {
          email,
        });
        setBusy(false);
        if (!result.ok) {
          setErr(result.errorMessage);
          return;
        }
        setMagicSent(true);
        toast(t('toastMagicSent', { email }));
      })();
      return;
    }

    if (mode === 'forgot') {
      if (!validEmail) {
        setErr(t('errEmail'));
        return;
      }
      setBusy(true);
      void (async () => {
        const result = await postJson('/api/auth/embedded/forgot-password', {
          email,
        });
        setBusy(false);
        if (!result.ok) {
          setErr(result.errorMessage);
          return;
        }
        setResetSent(true);
        toast(t('toastResetSent'));
      })();
      return;
    }

    if (mode === 'signup') {
      if (name.trim().length === 0) {
        setErr(t('errName'));
        return;
      }
      if (!validEmail) {
        setErr(t('errEmail'));
        return;
      }
      if (pwScore < 2) {
        setErr(t('errPwWeak'));
        return;
      }
      if (!agree) {
        setErr(t('errTerms'));
        return;
      }
      setBusy(true);
      void (async () => {
        const body: Record<string, unknown> = {
          name: name.trim(),
          email,
          password,
        };
        if (company.trim().length > 0) {
          body.company = company.trim();
        }
        const result = await postJson('/api/auth/embedded/sign-up', body);
        setBusy(false);
        if (!result.ok) {
          setErr(result.errorMessage);
          return;
        }
        toast(t('toastSignupOk'));
        router.push('/dashboard');
      })();
      return;
    }

    // sign-in
    if (!validEmail) {
      setErr(t('errEmail'));
      return;
    }
    if (password.length < 1) {
      setErr(t('errPwEmpty'));
      return;
    }
    setBusy(true);
    void (async () => {
      const result = await postJson('/api/auth/embedded/sign-in', {
        email,
        password,
      });
      setBusy(false);
      if (!result.ok) {
        setErr(result.errorMessage);
        return;
      }
      toast(t('toastSigninOk'));
      router.push('/dashboard');
    })();
  };

  const sso = (provider: SsoProvider): void => {
    setBusy(true);
    toast(t('toastSso', { provider }));
    // Hard-nav — Logto Hosted handles the OAuth dance and returns to /dashboard.
    const target =
      `/api/auth/logto/sign-in?provider=${encodeURIComponent(provider)}` +
      `&redirect_to=${encodeURIComponent('/dashboard')}`;
    window.location.href = target;
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const onLogo = (): void => router.push('/');
  const onMarketplace = (): void => router.push('/marketplace');
  const onStatus = (): void => toast(t('toastStatus'));
  const onEnterpriseSso = (): void => toast(t('toastEnterpriseSso'));

  const heroBlock: ReactNode =
    mode === 'signup' ? (
      <>
        {t('heroStartLine1')}
        <br />
        <span style={{ fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>
          {t('heroStartLine2')}
        </span>
      </>
    ) : (
      <>
        {t('heroBackLine1')}
        <br />
        <span style={{ fontStyle: 'italic', fontFamily: 'var(--font-serif)' }}>
          {t('heroBackLine2')}
        </span>
      </>
    );

  const pitchSub: string =
    mode === 'signup' ? t('pitchSignup') : t('pitchSignin');

  const tabsVisible = isAuthForm && flags.ui_auth_signup_perm;

  // Card shell style (canon).
  const cardStyle: CSSProperties = {
    border: '1px solid var(--border-sharp)',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--card)',
    boxShadow: 'var(--shadow)',
    overflow: 'hidden',
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={t('crumb')}
        onLogo={onLogo}
        right={
          flags.ui_marketplace_perm ? (
            <a
              className="mc-link mc-mono"
              style={{ fontSize: 12, cursor: 'pointer' }}
              onClick={onMarketplace}
            >
              {t('marketplace')}
            </a>
          ) : null
        }
      />

      <main
        style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '40px 28px 64px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
          gap: 48,
          alignItems: 'start',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* LEFT — pitch / proof */}
        <aside style={{ paddingTop: 24 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>
            {t('eyebrow')}
          </div>
          <div
            className="mc-display-l"
            style={{ marginBottom: 14, lineHeight: 1.05 }}
          >
            {heroBlock}
          </div>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--text-muted)',
              maxWidth: 460,
              margin: '0 0 22px',
            }}
          >
            {pitchSub}
          </p>

          {/* Trust strip */}
          <div
            style={{
              border: '1px solid var(--border-sharp)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              background: 'var(--card)',
            }}
          >
            <AcctRow
              glyph="✓"
              title={t('trustSoc2Title')}
              body={t('trustSoc2Body')}
            />
            <div className="mc-rule-dashed" />
            <AcctRow
              glyph="◐"
              title={t('trustTenantTitle')}
              body={t('trustTenantBody')}
            />
            <div className="mc-rule-dashed" />
            <AcctRow
              glyph="◇"
              title={t('trustByokTitle')}
              body={t('trustByokBody')}
            />
            <div className="mc-rule-dashed" />
            <AcctRow
              glyph="∎"
              title={t('trustZeroLogTitle')}
              body={t('trustZeroLogBody')}
            />
          </div>

          <div
            className="mc-caption"
            style={{ marginTop: 18, fontSize: 11.5 }}
          >
            {t('trustedBy')}{' '}
            <span style={{ color: 'var(--text)' }}>{t('trustedByList')}</span>
          </div>
        </aside>

        {/* RIGHT — the form card */}
        <section>
          <div style={cardStyle}>
            {/* Tabs (only for signin/signup AND when signup flag is on) */}
            {tabsVisible ? (
              <div
                className="row"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <AcctTabBtn
                  active={mode === 'signin'}
                  onClick={goSignin}
                >
                  {t('tabSignin')}
                </AcctTabBtn>
                <AcctTabBtn
                  active={mode === 'signup'}
                  onClick={goSignup}
                >
                  {t('tabSignup')}
                </AcctTabBtn>
              </div>
            ) : null}

            <div style={{ padding: '26px 28px 24px' }}>
              {/* Magic-link sent state */}
              {mode === 'magic' && magicSent ? (
                <AcctSentState
                  title={t('magicSentTitle')}
                  body={
                    <>
                      {t('magicSentBodyPre')}{' '}
                      <span className="mc-mono">{email}</span>
                      {t('magicSentBodyPost')}
                    </>
                  }
                  onBack={(e: MouseEvent<HTMLAnchorElement>): void => {
                    e.preventDefault();
                    goSignin();
                  }}
                  backLabel={t('backToSignin')}
                />
              ) : null}

              {/* Reset sent state */}
              {mode === 'forgot' && resetSent ? (
                <AcctSentState
                  title={t('resetSentTitle')}
                  body={
                    <>
                      {t('resetSentBodyPre')}{' '}
                      <span className="mc-mono">{email}</span>
                      {t('resetSentBodyPost')}
                    </>
                  }
                  onBack={(e: MouseEvent<HTMLAnchorElement>): void => {
                    e.preventDefault();
                    goSignin();
                  }}
                  backLabel={t('backToSignin')}
                />
              ) : null}

              {/* Magic-link form */}
              {mode === 'magic' && !magicSent ? (
                <form onSubmit={submit}>
                  <span className="mc-caption-up">{t('magicTitle')}</span>
                  <p
                    className="muted"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      marginTop: 8,
                      marginBottom: 14,
                    }}
                  >
                    {t('magicBlurb')}
                  </p>
                  <AcctField label={t('emailLabel')}>
                    <input
                      className="mc-input mc-mono"
                      type="email"
                      placeholder={t('emailPlaceholder')}
                      value={email}
                      onChange={(e): void => setEmail(e.target.value)}
                      autoFocus
                    />
                  </AcctField>
                  {err !== null ? <AcctErrorLine>{err}</AcctErrorLine> : null}
                  <button
                    type="submit"
                    className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full"
                    disabled={busy}
                    style={{ marginTop: 14, justifyContent: 'center' }}
                  >
                    {busy ? t('btnSending') : t('btnSendMagic')}
                  </button>
                  <AcctBackLink
                    onClick={(e): void => {
                      e.preventDefault();
                      goSignin();
                    }}
                  >
                    {t('backToSignin')}
                  </AcctBackLink>
                </form>
              ) : null}

              {/* Forgot form */}
              {mode === 'forgot' && !resetSent ? (
                <form onSubmit={submit}>
                  <span className="mc-caption-up">{t('forgotTitle')}</span>
                  <p
                    className="muted"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      marginTop: 8,
                      marginBottom: 14,
                    }}
                  >
                    {t('forgotBlurb')}
                  </p>
                  <AcctField label={t('emailLabel')}>
                    <input
                      className="mc-input mc-mono"
                      type="email"
                      placeholder={t('emailPlaceholder')}
                      value={email}
                      onChange={(e): void => setEmail(e.target.value)}
                      autoFocus
                    />
                  </AcctField>
                  {err !== null ? <AcctErrorLine>{err}</AcctErrorLine> : null}
                  <button
                    type="submit"
                    className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full"
                    disabled={busy}
                    style={{ marginTop: 14, justifyContent: 'center' }}
                  >
                    {busy ? t('btnSending') : t('btnSendReset')}
                  </button>
                  <AcctBackLink
                    onClick={(e): void => {
                      e.preventDefault();
                      goSignin();
                    }}
                  >
                    {t('backToSignin')}
                  </AcctBackLink>
                </form>
              ) : null}

              {/* Sign in / sign up form */}
              {isAuthForm ? (
                <>
                  {/* SSO row — collapses entirely if no SSO flags are on */}
                  {anySsoEnabled ? (
                    <>
                      <div className="col" style={{ gap: 8 }}>
                        {flags.ui_auth_google_sso_perm ? (
                          <AcctSsoBtn
                            glyph="G"
                            name={t('ssoGoogle')}
                            onClick={(): void => sso('google')}
                          />
                        ) : null}
                        {compactSsoCount > 0 ? (
                          <div className="row" style={{ gap: 8 }}>
                            {flags.ui_auth_github_sso_perm ? (
                              <AcctSsoBtn
                                glyph="GH"
                                name={t('ssoGithub')}
                                onClick={(): void => sso('github')}
                                compact
                              />
                            ) : null}
                            {flags.ui_auth_microsoft_sso_perm ? (
                              <AcctSsoBtn
                                glyph="◆"
                                name={t('ssoMicrosoft')}
                                onClick={(): void => sso('microsoft')}
                                compact
                              />
                            ) : null}
                            {flags.ui_auth_saml_sso_perm ? (
                              <AcctSsoBtn
                                glyph="SAML"
                                name={t('ssoSaml')}
                                onClick={(): void => sso('saml')}
                                compact
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {/* divider */}
                      <div
                        className="row"
                        style={{
                          gap: 12,
                          alignItems: 'center',
                          margin: '18px 0 14px',
                        }}
                      >
                        <div
                          style={{
                            flex: 1,
                            height: 1,
                            background: 'var(--border)',
                          }}
                        />
                        <span
                          className="mc-caption"
                          style={{ fontSize: 10.5 }}
                        >
                          {t('orWithEmail')}
                        </span>
                        <div
                          style={{
                            flex: 1,
                            height: 1,
                            background: 'var(--border)',
                          }}
                        />
                      </div>
                    </>
                  ) : null}

                  <form onSubmit={submit}>
                    {mode === 'signup' ? (
                      <div
                        className="row"
                        style={{ gap: 10, marginBottom: 12 }}
                      >
                        <AcctField
                          label={t('nameLabel')}
                          style={{ flex: 1 }}
                        >
                          <input
                            className="mc-input"
                            type="text"
                            placeholder={t('namePlaceholder')}
                            value={name}
                            onChange={(e): void => setName(e.target.value)}
                            autoFocus
                          />
                        </AcctField>
                        <AcctField
                          label={t('companyLabel')}
                          style={{ flex: 1 }}
                        >
                          <input
                            className="mc-input"
                            type="text"
                            placeholder={t('companyPlaceholder')}
                            value={company}
                            onChange={(e): void => setCompany(e.target.value)}
                          />
                        </AcctField>
                      </div>
                    ) : null}

                    <AcctField
                      label={t('workEmailLabel')}
                      style={{ marginBottom: 12 }}
                    >
                      <input
                        className="mc-input mc-mono"
                        type="email"
                        placeholder={t('emailPlaceholder')}
                        value={email}
                        onChange={(e): void => setEmail(e.target.value)}
                        autoFocus={mode === 'signin'}
                      />
                    </AcctField>

                    <AcctField
                      label={t('passwordLabel')}
                      right={
                        mode === 'signin' &&
                        flags.ui_auth_forgot_password_perm ? (
                          <a
                            className="mc-link mc-mono"
                            style={{ fontSize: 11, cursor: 'pointer' }}
                            onClick={(e): void => {
                              e.preventDefault();
                              goForgot();
                            }}
                          >
                            {t('forgotLink')}
                          </a>
                        ) : null
                      }
                    >
                      <div style={{ position: 'relative' }}>
                        <input
                          className="mc-input mc-mono"
                          type={showPw ? 'text' : 'password'}
                          placeholder={
                            mode === 'signup'
                              ? t('passwordPlaceholderSignup')
                              : t('passwordPlaceholderSignin')
                          }
                          value={password}
                          onChange={(e): void => setPassword(e.target.value)}
                          style={{ paddingRight: 56 }}
                        />
                        <button
                          type="button"
                          onClick={(): void => setShowPw((s) => !s)}
                          className="mc-mono"
                          style={{
                            position: 'absolute',
                            right: 8,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            fontSize: 10.5,
                            color: 'var(--text-muted)',
                            padding: '4px 6px',
                            letterSpacing: '.06em',
                            textTransform: 'uppercase',
                          }}
                        >
                          {showPw ? t('hide') : t('show')}
                        </button>
                      </div>
                    </AcctField>

                    {/* Password strength (signup only, when typed) */}
                    {mode === 'signup' && password.length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        <div
                          className="row"
                          style={{ gap: 4, marginBottom: 4 }}
                          data-testid="pw-strength-bars"
                        >
                          {[0, 1, 2, 3].map((i) => (
                            <div
                              key={i}
                              style={{
                                flex: 1,
                                height: 3,
                                borderRadius: 1.5,
                                background:
                                  i < pwScore
                                    ? pwScore <= 1
                                      ? 'var(--accent)'
                                      : pwScore === 2
                                        ? 'var(--warn, #c98a00)'
                                        : 'var(--success)'
                                    : 'var(--border)',
                              }}
                            />
                          ))}
                        </div>
                        <div
                          className="mc-caption"
                          style={{ fontSize: 10.5 }}
                          data-testid="pw-strength-label"
                        >
                          {t('strength')}:{' '}
                          <span
                            style={{
                              color:
                                pwScore >= 3
                                  ? 'var(--success)'
                                  : 'var(--text)',
                            }}
                          >
                            {pwLabel.length > 0 ? pwLabel : '—'}
                          </span>
                          <span
                            style={{
                              marginLeft: 8,
                              color: 'var(--text-faint)',
                            }}
                          >
                            {t('strengthTip')}
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {/* Terms (signup) */}
                    {mode === 'signup' ? (
                      <label
                        className="row"
                        style={{
                          gap: 8,
                          alignItems: 'flex-start',
                          marginTop: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={agree}
                          onChange={(): void => setAgree((a) => !a)}
                          style={{ marginTop: 3 }}
                        />
                        <span
                          className="mc-caption"
                          style={{
                            fontSize: 11.5,
                            lineHeight: 1.5,
                            color: 'var(--text-muted)',
                          }}
                        >
                          {t('termsPre')}{' '}
                          <a
                            className="mc-link"
                            style={{ cursor: 'pointer' }}
                          >
                            {t('termsLinkTerms')}
                          </a>{' '}
                          {t('termsAnd')}{' '}
                          <a
                            className="mc-link"
                            style={{ cursor: 'pointer' }}
                          >
                            {t('termsLinkPrivacy')}
                          </a>
                          {t('termsPost')}
                        </span>
                      </label>
                    ) : null}

                    {err !== null ? <AcctErrorLine>{err}</AcctErrorLine> : null}

                    <button
                      type="submit"
                      className="mc-btn mc-btn-primary mc-btn-lg mc-btn-full"
                      disabled={busy}
                      style={{ marginTop: 14, justifyContent: 'center' }}
                    >
                      {busy
                        ? mode === 'signup'
                          ? t('btnCreating')
                          : t('btnSigningIn')
                        : mode === 'signup'
                          ? t('btnCreate')
                          : t('btnSignin')}
                      {!busy ? <Icon name="arrow-r" size={13} /> : null}
                    </button>

                    {/* Magic link CTA */}
                    {flags.ui_auth_magic_link_perm ? (
                      <button
                        type="button"
                        className="mc-btn mc-btn-full"
                        style={{
                          marginTop: 8,
                          justifyContent: 'center',
                          background: 'transparent',
                        }}
                        onClick={(): void => goMagic()}
                      >
                        <span
                          className="mc-mono"
                          style={{ fontSize: 11, opacity: 0.7 }}
                        >
                          [ ✉ ]
                        </span>
                        <span style={{ marginLeft: 8 }}>
                          {t('magicCta')}
                        </span>
                      </button>
                    ) : null}
                  </form>
                </>
              ) : null}
            </div>

            {/* Footer band */}
            <div
              style={{
                borderTop: '1px solid var(--border)',
                padding: '12px 28px',
                background: 'var(--paper-alt)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span className="mc-caption" style={{ fontSize: 11 }}>
                {mode === 'signin' || mode === 'magic' || mode === 'forgot' ? (
                  flags.ui_auth_signup_perm ? (
                    <>
                      {t('newHere')}{' '}
                      <a
                        className="mc-link mc-mono"
                        style={{ cursor: 'pointer' }}
                        onClick={(e): void => {
                          e.preventDefault();
                          goSignup();
                        }}
                      >
                        {t('createAccount')}
                      </a>
                    </>
                  ) : null
                ) : (
                  <>
                    {t('haveAccount')}{' '}
                    <a
                      className="mc-link mc-mono"
                      style={{ cursor: 'pointer' }}
                      onClick={(e): void => {
                        e.preventDefault();
                        goSignin();
                      }}
                    >
                      {t('tabSignin')}
                    </a>
                  </>
                )}
              </span>
              <span className="mc-caption" style={{ fontSize: 11 }}>
                <a
                  className="mc-link mc-mono"
                  style={{ cursor: 'pointer' }}
                  onClick={onStatus}
                >
                  ● {t('allOperational')}
                </a>
              </span>
            </div>
          </div>

          {/* Below-card meta */}
          <div
            className="row-bw"
            style={{ marginTop: 14, gap: 12, flexWrap: 'wrap' }}
          >
            <span className="mc-caption" style={{ fontSize: 11 }}>
              {t('hcaptcha')}
            </span>
            <span className="mc-caption" style={{ fontSize: 11 }}>
              <a
                className="mc-link mc-mono"
                style={{ cursor: 'pointer' }}
                onClick={onEnterpriseSso}
              >
                {t('needEnterpriseSso')}
              </a>
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
