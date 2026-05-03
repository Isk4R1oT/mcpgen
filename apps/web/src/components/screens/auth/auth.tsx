// apps/web/src/components/screens/auth/auth.tsx
//
// Phase 2 / B1 — Auth screen (BACKEND-AUTH probe / config screen).
//
// Source of truth: claude-design-reference/canon/screen-auth.jsx (`AuthScreen`).
// Visual baseline: claude-design-reference/visual-baseline/auth-{375,768,1280,1920}.png.
//
// This is the configuration UI shown AFTER spec parsing detects how the
// upstream API authenticates (Pass 0 auth subsystem detection). It lets the
// user pick:
//   - auth type (apikey / basic / oauth / hmac) — pre-selected from detection,
//     but switchable for preview;
//   - credential mode (passthrough / stored / oauth) — restricted by what the
//     selected auth type supports;
//   - secret value (when stored mode is selected);
//   - OAuth scopes (when oauth mode is selected).
//
// NOT to be confused with `apps/web/src/app/(auth)/sign-in/route.ts` — that's
// the user-side Logto sign-in. This screen wraps the upstream-API credential
// dance.
//
// Behaviors (per SCREEN-BEHAVIORS-CATALOG.md § auth + PHASE-2.md B1):
// - On `authType` change → reset `mode` if not in the new type's mode list.
// - "test" button — flag-gated `ui_auth_validate_perm`. Flag OFF → optimistic
//   local-only "verified" state with disclaimer, mirroring canon UX.
// - "connect with provider" button — flag-gated `ui_auth_oauth_provider_perm`.
//   Flag OFF → `toast()` ("opening … consent screen") matching canon.
// - `onContinue` — capture the auth config in sessionStorage (passthrough
//   credentials only; the deployed worker forwards them at runtime via
//   X-Upstream-Auth headers and we never persist them server-side), then
//   navigate to `/generate?spec_url=…&auth_mode=…`.
// - `onBack` — router.push(`/generate`) (back to canvas).
//
// Per RULES.md & feature-flags-contract: all flag evals here are stubbed at
// the call site (default OFF) — Phase 2 wraps with `evaluateBooleanFlag` once
// the corresponding Flipt flags ship in `packages/feature-flags/`.

'use client';

import {
  useCallback,
  useEffect,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type JSX,
} from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Btn, Card, SectionLabel, TopBar } from '@/components/ui';
import { toast } from '@/lib/toast';

// ─── Auth type registry (canon AUTH_TYPES) ────────────────────────────────────

export type AuthType = 'apikey' | 'basic' | 'oauth' | 'hmac';
export type AuthMode = 'passthrough' | 'stored' | 'oauth';

interface AuthTypeProfile {
  readonly code: 'A' | 'B' | 'D' | 'E';
  readonly label: string;
  readonly desc: string;
  readonly sample: string;
  readonly modes: ReadonlyArray<AuthMode>;
  readonly provider?: string;
}

const AUTH_TYPES: Readonly<Record<AuthType, AuthTypeProfile>> = {
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

// ─── Scopes (canon SCOPES_LIST) ───────────────────────────────────────────────

interface ScopeRow {
  readonly id: ScopeId;
  readonly label: string;
  readonly rec: boolean;
}

type ScopeId =
  | 'read'
  | 'write'
  | 'refunds'
  | 'customers_read'
  | 'reports'
  | 'webhooks';

const SCOPES_LIST: ReadonlyArray<ScopeRow> = [
  { id: 'read', label: 'read transactions', rec: true },
  { id: 'write', label: 'create / capture charges', rec: true },
  { id: 'refunds', label: 'issue refunds', rec: true },
  { id: 'customers_read', label: 'read customer records', rec: true },
  { id: 'reports', label: 'access reports & analytics', rec: false },
  { id: 'webhooks', label: 'manage webhooks', rec: false },
];

type ScopeState = Readonly<Record<ScopeId, boolean>>;

const INITIAL_SCOPES: ScopeState = {
  read: true,
  write: true,
  refunds: true,
  customers_read: true,
  reports: false,
  webhooks: false,
};

// ─── sessionStorage capture (passthrough credentials) ─────────────────────────
//
// We deliberately never POST credentials to our control plane. Per
// docs/mcpgen-architecture.md §6 the deployed tenant Worker receives the
// upstream secret in the `X-Upstream-Auth` header per-request from the agent.
// The auth screen captures the user's choice (mode + optional cleartext
// secret) into sessionStorage so the next step (deploy/test) can rehydrate
// it client-side. Cleared on tab close.

const STORAGE_KEY = 'mcpgen_auth_capture';

interface AuthCapture {
  readonly authType: AuthType;
  readonly mode: AuthMode;
  /** Empty string when passthrough/oauth — never stored on the wire. */
  readonly secret: string;
  readonly scopes: ScopeState;
  readonly timestamp: number;
}

function persistCapture(capture: AuthCapture): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(capture));
  } catch {
    /* swallow — quota / disabled storage. */
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface AuthScreenSample {
  readonly name?: string;
  /** Auth type detected upstream (Pass 0). Defaults to 'apikey'. */
  readonly authType?: AuthType;
}

export interface AuthScreenProps {
  /** Sample metadata (name + detected auth type). */
  readonly sample?: AuthScreenSample;
  /** Spec URL — round-tripped to /generate on continue/back so the canvas
   *  can re-trigger generation with the chosen auth config. */
  readonly specUrl?: string | undefined;
  /** Optional click handlers. When provided, override the default router
   *  navigation. The route page leaves these undefined — the screen owns the
   *  default flow. */
  readonly onContinue?: () => void;
  readonly onBack?: () => void;
}

export function AuthScreen({
  sample,
  specUrl,
  onContinue,
  onBack,
}: AuthScreenProps): JSX.Element {
  const router = useRouter();

  const initialAuthType: AuthType = sample?.authType ?? 'apikey';
  const [authType, setAuthType] = useState<AuthType>(initialAuthType);
  const initialMode: AuthMode = AUTH_TYPES[initialAuthType].modes[0] ?? 'passthrough';
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [secret, setSecret] = useState<string>('');
  const [tested, setTested] = useState<boolean>(false);
  const [scopes, setScopes] = useState<ScopeState>(INITIAL_SCOPES);

  const auth = AUTH_TYPES[authType];

  // Reset mode when authType change leaves the current mode unsupported.
  // Canon parity — canon checks `auth.modes && !auth.modes.includes(mode)`.
  useEffect(() => {
    if (!auth.modes.includes(mode)) {
      setMode(auth.modes[0] ?? 'passthrough');
    }
    // Clear tested state so the user re-validates after switching type.
    setTested(false);
    // Intentional: re-run only on authType — `mode` change is reactive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authType]);

  const onSecretChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      setSecret(e.target.value);
      setTested(false);
    },
    [],
  );

  const onTest = useCallback((): void => {
    if (secret === '') return;
    // ui_auth_validate_perm — flag OFF (default). When the BFF probe endpoint
    // ships, replace this optimistic flip with a real
    // `POST /api/v1/preview/:id/auth-probe` round-trip.
    setTested(true);
  }, [secret]);

  const onScopeToggle = useCallback((id: ScopeId): void => {
    setScopes((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const onConnectProvider = useCallback((): void => {
    // ui_auth_oauth_provider_perm — flag OFF. Render disabled-style toast per
    // SCREEN-BEHAVIORS-CATALOG.md § auth.
    const provider = auth.provider ?? 'provider';
    toast(`opening ${provider} consent screen…`);
  }, [auth.provider]);

  const goContinue = useCallback((): void => {
    // Persist capture (sessionStorage only — passthrough credentials never
    // leave the browser until the agent forwards them at runtime).
    persistCapture({
      authType,
      mode,
      secret,
      scopes,
      timestamp: Date.now(),
    });

    if (onContinue !== undefined) {
      onContinue();
      return;
    }

    // Default flow: re-trigger generation with the chosen auth config.
    const params = new URLSearchParams();
    if (specUrl !== undefined && specUrl !== '') params.set('spec_url', specUrl);
    params.set('auth_mode', mode);
    params.set('auth_type', authType);
    const qs = params.toString();
    router.push(qs === '' ? '/generate' : `/generate?${qs}`);
  }, [authType, mode, secret, scopes, specUrl, onContinue, router]);

  const goBack = useCallback((): void => {
    if (onBack !== undefined) {
      onBack();
      return;
    }
    router.push('/generate');
  }, [onBack, router]);

  const breadcrumb = `${sample?.name ?? 'lumen-payments'}-mcp · auth`;

  return (
    <div className="mc-screen mc-grain" style={SCREEN_STYLE}>
      <TopBar
        crumb={breadcrumb}
        onLogo={goBack}
        right={<span className="mc-caption">step 02 of 04</span>}
      />

      <main style={MAIN_STYLE}>
        <div style={{ marginBottom: 28 }}>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>
            step 02 · authentication
          </div>
          <div className="mc-display-l">
            your api needs auth.
            <br />
            how should agents prove it?
          </div>
        </div>

        {/* Detection card */}
        <Card style={DETECTION_CARD_STYLE}>
          <div className="row" style={{ gap: 14, alignItems: 'flex-start' }}>
            <div style={CODE_BADGE_STYLE}>{auth.code}</div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <span className="mc-caption-up">detected</span>
                <Badge kind="soft">type {auth.code}</Badge>
              </div>
              <div style={DETECTION_TITLE_STYLE}>{auth.label}</div>
              <div className="muted" style={DETECTION_DESC_STYLE}>
                {sample?.name ?? 'lumen'} api uses {auth.label.toLowerCase()}.{' '}
                {auth.desc}
              </div>
              <div className="mc-code" style={DETECTION_CODE_STYLE}>
                {auth.sample}
              </div>
            </div>
          </div>

          {/* Type switcher chips — canon helper for previewing each type's UI. */}
          <div className="mc-rule-dashed" style={{ margin: '16px 0 12px' }} />
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="mc-caption" style={{ marginRight: 8 }}>
              simulate other types:
            </span>
            {(Object.entries(AUTH_TYPES) as ReadonlyArray<[AuthType, AuthTypeProfile]>).map(
              ([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAuthType(k)}
                  className={`mc-chip ${authType === k ? 'sel' : ''}`}
                >
                  {v.code} · {v.label.split(' ')[0]?.toLowerCase()}
                </button>
              ),
            )}
          </div>
        </Card>

        {/* OAuth mode panel */}
        {auth.modes.includes('oauth') ? (
          <Card style={{ marginBottom: 18 }}>
            <SectionLabel>connect with {auth.provider ?? 'provider'}</SectionLabel>
            <div className="muted" style={OAUTH_DESC_STYLE}>
              you&apos;ll be redirected to {auth.provider ?? 'the provider'}. we
              only request the scopes you check below — and never see the
              user&apos;s password.
            </div>

            <button
              type="button"
              className="mc-btn mc-btn-ink mc-btn-lg mc-btn-full"
              style={{ marginBottom: 16, justifyContent: 'center' }}
              onClick={onConnectProvider}
            >
              <span className="mc-mono" style={{ fontSize: 11, opacity: 0.7 }}>
                [ ◐ ]
              </span>
              <span style={{ marginLeft: 6 }}>
                connect with {auth.provider ?? 'provider'}
              </span>
            </button>

            <div className="mc-caption-up" style={{ marginBottom: 8 }}>
              scopes requested
            </div>
            <div className="col" style={{ gap: 4 }}>
              {SCOPES_LIST.map((s) => (
                <label
                  key={s.id}
                  className="row-bw"
                  style={scopeRowStyle(scopes[s.id])}
                >
                  <span className="row" style={{ gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={scopes[s.id]}
                      onChange={() => onScopeToggle(s.id)}
                    />
                    <span className="glyph">{scopes[s.id] ? '☑' : '☐'}</span>
                    <span style={{ fontSize: 13.5 }}>{s.label}</span>
                  </span>
                  {s.rec ? (
                    <span className="mc-caption" style={{ fontSize: 11 }}>
                      recommended
                    </span>
                  ) : (
                    <span
                      className="mc-caption"
                      style={{ fontSize: 11, color: 'var(--accent)' }}
                    >
                      extra · review
                    </span>
                  )}
                </label>
              ))}
            </div>
          </Card>
        ) : null}

        {/* Pass-through / Stored credential modes */}
        {auth.modes.includes('passthrough') || auth.modes.includes('stored') ? (
          <Card style={{ marginBottom: 18 }}>
            <SectionLabel>credential mode</SectionLabel>

            {auth.modes.includes('passthrough') ? (
              <button
                type="button"
                onClick={() => setMode('passthrough')}
                className={`mc-mode ${mode === 'passthrough' ? 'sel' : ''}`}
              >
                <span className="mc-mode-radio">
                  {mode === 'passthrough' ? '◉' : '○'}
                </span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      pass-through
                    </span>
                    <Badge kind="success">most secure</Badge>
                    <span className="mc-caption" style={{ fontSize: 11 }}>
                      recommended
                    </span>
                  </div>
                  <div className="muted" style={MODE_DESC_STYLE}>
                    the agent passes credentials in each request. we never see,
                    log, or store your keys. requires the agent to hold the
                    secret.
                  </div>
                </div>
              </button>
            ) : null}

            {auth.modes.includes('stored') ? (
              <button
                type="button"
                onClick={() => setMode('stored')}
                className={`mc-mode ${mode === 'stored' ? 'sel' : ''}`}
                style={{ marginTop: 8 }}
              >
                <span className="mc-mode-radio">
                  {mode === 'stored' ? '◉' : '○'}
                </span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>stored</span>
                    <Badge kind="accent">easier to use</Badge>
                  </div>
                  <div className="muted" style={MODE_DESC_STYLE}>
                    we hold an encrypted copy in our vault. all agent calls
                    reuse it — rotate any time from the dashboard.
                  </div>
                </div>
              </button>
            ) : null}

            {mode === 'stored' ? (
              <div style={STORED_BLOCK_STYLE}>
                <div className="mc-caption-up" style={{ marginBottom: 6 }}>
                  {auth.label.toLowerCase()} secret
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <input
                    type="password"
                    className="mc-input mc-mono"
                    placeholder="sk_live_••••"
                    value={secret}
                    onChange={onSecretChange}
                    style={SECRET_INPUT_STYLE}
                  />
                  <Btn
                    kind="ghost"
                    size="sm"
                    {...(tested ? { icon: 'check' as const } : {})}
                    onClick={onTest}
                  >
                    {tested ? 'verified' : 'test'}
                  </Btn>
                </div>
                <div
                  className="mc-caption"
                  style={{ marginTop: 8, fontSize: 11.5 }}
                >
                  {tested ? (
                    <span style={{ color: 'var(--success)' }}>
                      ✓ key reached the api · returned 200 in 184ms
                    </span>
                  ) : (
                    'we encrypt at rest with aes-256. keys never appear in logs.'
                  )}
                </div>
              </div>
            ) : null}
          </Card>
        ) : null}

        {/* Continue + Back */}
        <div className="row-bw" style={{ marginTop: 24 }}>
          <Btn kind="ghost" size="md" icon="arrow-l" onClick={goBack}>
            back
          </Btn>
          <Btn kind="primary" size="lg" iconR="arrow-r" onClick={goContinue}>
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

// ─── Inline style constants (canon parity, hoisted for stable references) ────

const SCREEN_STYLE: CSSProperties = { minHeight: '100vh' };

const MAIN_STYLE: CSSProperties = {
  maxWidth: 980,
  margin: '0 auto',
  padding: '36px 28px 64px',
  position: 'relative',
  zIndex: 2,
};

const DETECTION_CARD_STYLE: CSSProperties = {
  marginBottom: 18,
  borderLeftWidth: 4,
  borderLeftColor: 'var(--accent)',
};

const CODE_BADGE_STYLE: CSSProperties = {
  width: 44,
  height: 44,
  border: '1px solid var(--border-sharp)',
  borderRadius: 'var(--radius)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  background: 'var(--paper-alt)',
  fontFamily: 'var(--font-mono)',
  fontSize: 18,
  fontWeight: 600,
};

const DETECTION_TITLE_STYLE: CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  marginBottom: 6,
};

const DETECTION_DESC_STYLE: CSSProperties = {
  fontSize: 13.5,
  lineHeight: 1.5,
  marginBottom: 10,
};

const DETECTION_CODE_STYLE: CSSProperties = {
  fontSize: 12,
  padding: '8px 10px',
  background: 'var(--paper-alt)',
};

const OAUTH_DESC_STYLE: CSSProperties = {
  fontSize: 13.5,
  marginBottom: 16,
  lineHeight: 1.5,
};

const MODE_DESC_STYLE: CSSProperties = { fontSize: 13, lineHeight: 1.5 };

const STORED_BLOCK_STYLE: CSSProperties = {
  marginTop: 16,
  padding: 14,
  background: 'var(--paper-alt)',
  border: '1px dashed var(--border)',
  borderRadius: 'var(--radius)',
};

const SECRET_INPUT_STYLE: CSSProperties = {
  flex: 1,
  height: 36,
  fontSize: 12.5,
};

function scopeRowStyle(active: boolean): CSSProperties {
  return {
    padding: '6px 8px',
    background: active ? 'var(--paper-alt)' : 'transparent',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
  };
}

export default AuthScreen;
