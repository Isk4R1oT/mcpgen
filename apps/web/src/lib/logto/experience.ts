// apps/web/src/lib/logto/experience.ts
//
// Direct REST client for Logto's Experience API + Management API.
// Used by /api/auth/embedded/* route handlers to drive the canon-styled
// embedded sign-in / sign-up / magic-link / forgot-password forms WITHOUT
// the purple Logto Hosted UI.
//
// Why direct REST (not SDK):
//   - Logto does not publish an `@logto/experience-sdk` npm package
//     (verified 2026-05-04: `npm view @logto/experience-sdk` → 404).
//   - The `@logto/next` SDK only ships hosted-UI redirect helpers
//     (signIn / handleSignIn / signOut). Embedded sign-in is documented
//     at https://docs.logto.io/end-user-flows/sign-up-and-sign-in/embedded-sign-in
//     and exposed via REST at `${LOGTO_ENDPOINT}/api/experience`.
//   - We need fine-grained error mapping (401 invalid_credentials, 409
//     email_taken, 501 connector_not_configured) — direct REST gives us
//     access to the response body that an SDK would swallow.
//
// Required env vars (read inside callers — see logto/client.ts header):
//   LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
//   LOGTO_EMAIL_CONNECTOR_ID (optional, for magic-link)
//
// Reference: https://openapi.logto.io/group/endpoint-experience

import { logtoConfig } from '@/lib/logto/client';

// ─── Errors ────────────────────────────────────────────────────────────────

export class LogtoExperienceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = 'LogtoExperienceError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class LogtoConfigError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    super(`missing required Logto env var: ${variable}`);
    this.name = 'LogtoConfigError';
    this.variable = variable;
  }
}

// ─── Env reader ────────────────────────────────────────────────────────────

interface LogtoServerEnv {
  endpoint: string;
  m2mAppId: string;
  m2mAppSecret: string;
  emailConnectorId: string;
}

function readLogtoServerEnv(): LogtoServerEnv {
  const endpoint = logtoConfig.endpoint;
  if (endpoint.length === 0) throw new LogtoConfigError('LOGTO_ENDPOINT');
  const m2mAppId = process.env['LOGTO_M2M_APP_ID'] ?? '';
  if (m2mAppId.length === 0) throw new LogtoConfigError('LOGTO_M2M_APP_ID');
  const m2mAppSecret = process.env['LOGTO_M2M_APP_SECRET'] ?? '';
  if (m2mAppSecret.length === 0) throw new LogtoConfigError('LOGTO_M2M_APP_SECRET');
  const emailConnectorId = process.env['LOGTO_EMAIL_CONNECTOR_ID'] ?? '';
  return { endpoint, m2mAppId, m2mAppSecret, emailConnectorId };
}

// Public predicate so the magic-link route can short-circuit with 501.
export function isMagicLinkConfigured(): boolean {
  return (process.env['LOGTO_EMAIL_CONNECTOR_ID'] ?? '').length > 0;
}

// ─── M2M token cache (process-local, 50min TTL) ────────────────────────────

interface CachedM2MToken {
  token: string;
  expiresAt: number;
}
let cachedM2M: CachedM2MToken | null = null;
const M2M_TTL_MS = 50 * 60 * 1000; // 50 min — Logto issues 1h tokens

export function _resetM2MCacheForTesting(): void {
  cachedM2M = null;
}

async function getManagementApiToken(): Promise<string> {
  const env = readLogtoServerEnv();
  if (cachedM2M !== null && cachedM2M.expiresAt > Date.now()) {
    return cachedM2M.token;
  }
  const tenantHost = env.endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const audience = `https://${tenantHost}/api`;
  const credentials = Buffer.from(`${env.m2mAppId}:${env.m2mAppSecret}`).toString('base64');

  const res = await fetch(`${env.endpoint.replace(/\/$/, '')}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: audience,
      scope: 'all',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new LogtoExperienceError(
      res.status,
      'm2m_token_failed',
      `Logto Management API token grant failed: ${String(res.status)}`,
      text,
    );
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (json.access_token === undefined) {
    throw new LogtoExperienceError(500, 'm2m_token_no_token', 'Logto returned empty access_token', json);
  }
  cachedM2M = {
    token: json.access_token,
    expiresAt: Date.now() + M2M_TTL_MS,
  };
  return json.access_token;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface RawCookieJar {
  // Map of (name → 'name=value; Path=/; HttpOnly; ...') for forwarding to
  // the browser. We preserve the raw Set-Cookie attributes so HttpOnly,
  // Secure, SameSite, and Max-Age round-trip through us untouched.
  setCookieHeaders: string[];
  // Map of name=value pairs we send back to Logto on subsequent calls
  // within the same interaction.
  cookieValues: Record<string, string>;
}

function parseSetCookieHeaders(res: Response): RawCookieJar {
  const jar: RawCookieJar = { setCookieHeaders: [], cookieValues: {} };
  // Node 20 + undici expose getSetCookie(); jsdom in tests may not.
  const headers = res.headers as Headers & { getSetCookie?: () => string[] };
  const all =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : (() => {
          const v = res.headers.get('set-cookie');
          return v === null ? [] : [v];
        })();
  for (const raw of all) {
    jar.setCookieHeaders.push(raw);
    const firstSemi = raw.indexOf(';');
    const pair = firstSemi === -1 ? raw : raw.slice(0, firstSemi);
    const eq = pair.indexOf('=');
    if (eq > 0) {
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      jar.cookieValues[name] = value;
    }
  }
  return jar;
}

function buildCookieHeader(jar: RawCookieJar): string {
  return Object.entries(jar.cookieValues)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

async function readJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

interface LogtoErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

function isLogtoErrorBody(v: unknown): v is LogtoErrorBody {
  return v !== null && typeof v === 'object';
}

// ─── Experience API: sign-in with email + password ─────────────────────────

export interface SignInResult {
  cookies: string[]; // raw Set-Cookie headers to forward to the browser
  redirectTo: string | null;
}

/**
 * Drive the embedded sign-in flow:
 *   1. PUT /api/experience              → start interaction (SignIn intent)
 *   2. POST /api/experience/identification → identify + verify password
 *   3. POST /api/experience/submit      → finalize, mints LOGTO_SESSION cookie
 *
 * Returns the Set-Cookie headers to forward verbatim. Callers are
 * responsible for attaching them to their NextResponse via `headers.append`.
 *
 * Error mapping:
 *   - 401 / invalid credentials → LogtoExperienceError(401, 'invalid_credentials')
 *   - 422 / user_not_exist / not_found → LogtoExperienceError(401, 'invalid_credentials')
 *   - other → LogtoExperienceError(status, code from body)
 */
export async function signInWithPassword(email: string, password: string): Promise<SignInResult> {
  const env = readLogtoServerEnv();
  const base = env.endpoint.replace(/\/$/, '');
  const jar: RawCookieJar = { setCookieHeaders: [], cookieValues: {} };

  // Step 1 — start interaction
  const startRes = await fetch(`${base}/api/experience`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionEvent: 'SignIn' }),
  });
  if (!startRes.ok) {
    const body = await readJsonBody(startRes);
    throw mapExperienceError(startRes.status, body, 'start_interaction_failed');
  }
  const startJar = parseSetCookieHeaders(startRes);
  jar.setCookieHeaders.push(...startJar.setCookieHeaders);
  Object.assign(jar.cookieValues, startJar.cookieValues);

  // Step 2 — identification with password verification
  const idRes = await fetch(`${base}/api/experience/identification`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(jar),
    },
    body: JSON.stringify({
      identifier: { type: 'email', value: email },
      verification: { type: 'password', password },
    }),
  });
  if (!idRes.ok) {
    const body = await readJsonBody(idRes);
    throw mapExperienceError(idRes.status, body, 'identification_failed');
  }
  const idJar = parseSetCookieHeaders(idRes);
  jar.setCookieHeaders.push(...idJar.setCookieHeaders);
  Object.assign(jar.cookieValues, idJar.cookieValues);

  // Step 3 — submit, persists LOGTO_SESSION cookie
  const submitRes = await fetch(`${base}/api/experience/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(jar),
    },
    body: '{}',
  });
  if (!submitRes.ok) {
    const body = await readJsonBody(submitRes);
    throw mapExperienceError(submitRes.status, body, 'submit_failed');
  }
  const submitJar = parseSetCookieHeaders(submitRes);
  jar.setCookieHeaders.push(...submitJar.setCookieHeaders);

  let redirectTo: string | null = null;
  const submitBody = await readJsonBody(submitRes);
  if (isLogtoErrorBody(submitBody) && typeof (submitBody as { redirectTo?: unknown }).redirectTo === 'string') {
    redirectTo = (submitBody as { redirectTo: string }).redirectTo;
  }
  return { cookies: jar.setCookieHeaders, redirectTo };
}

// ─── Management API: create user (sign-up flow first half) ─────────────────

export interface NewUserAttributes {
  email: string;
  password: string;
  name: string;
  /** stored under user.profile.company per Logto profile spec */
  company: string | null;
}

export interface CreatedUser {
  id: string;
  email: string;
}

export async function createUser(attrs: NewUserAttributes): Promise<CreatedUser> {
  const env = readLogtoServerEnv();
  const token = await getManagementApiToken();
  const base = env.endpoint.replace(/\/$/, '');

  // Logto Management API user create:
  //   primary email + password + name (top-level), optional profile.company
  const body: Record<string, unknown> = {
    primaryEmail: attrs.email,
    password: attrs.password,
    name: attrs.name,
  };
  if (attrs.company !== null) {
    body['profile'] = { company: attrs.company };
  }

  const res = await fetch(`${base}/api/users`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await readJsonBody(res);
  if (res.status === 201 || res.status === 200) {
    const u = json as { id?: string; primaryEmail?: string };
    if (typeof u.id !== 'string') {
      throw new LogtoExperienceError(500, 'user_create_no_id', 'Logto returned no user id', json);
    }
    return { id: u.id, email: u.primaryEmail ?? attrs.email };
  }
  // Logto returns 422 with code = "user.email_already_in_use" (or similar)
  // when the email is taken.
  const errBody = isLogtoErrorBody(json) ? json : {};
  const code = typeof errBody.code === 'string' ? errBody.code : 'create_user_failed';
  if (
    res.status === 422 &&
    /email/i.test(code) &&
    /(in_use|exists|taken|already)/i.test(code)
  ) {
    throw new LogtoExperienceError(409, 'email_taken', 'email already in use', json);
  }
  throw new LogtoExperienceError(res.status, code, errBody.message ?? 'create_user_failed', json);
}

// ─── Experience API: send magic-link (verification code via email) ─────────

export async function sendMagicLink(email: string): Promise<void> {
  const env = readLogtoServerEnv();
  if (env.emailConnectorId.length === 0) {
    throw new LogtoExperienceError(
      501,
      'magic_link_not_configured',
      'LOGTO_EMAIL_CONNECTOR_ID is not set',
      null,
    );
  }
  const base = env.endpoint.replace(/\/$/, '');

  // Step 1 — start interaction (SignIn)
  const startRes = await fetch(`${base}/api/experience`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionEvent: 'SignIn' }),
  });
  if (!startRes.ok) {
    const body = await readJsonBody(startRes);
    throw mapExperienceError(startRes.status, body, 'magic_link_start_failed');
  }
  const startJar = parseSetCookieHeaders(startRes);

  // Step 2 — request verification code via email connector
  const codeRes = await fetch(`${base}/api/experience/verifications/verification-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(startJar),
    },
    body: JSON.stringify({
      identifier: { type: 'email', value: email },
      // Logto names this template "SignIn" for sign-in emails.
      interactionEvent: 'SignIn',
    }),
  });
  if (!codeRes.ok) {
    const body = await readJsonBody(codeRes);
    // Don't disclose user existence — caller maps every failure to 200
    // unless the connector itself is misconfigured (501).
    if (codeRes.status === 501 || codeRes.status === 400) {
      throw mapExperienceError(codeRes.status, body, 'magic_link_send_failed');
    }
  }
  // Treat success and "user_not_exist" the same — caller returns ok:true
  // to avoid leaking whether the email is registered.
}

// ─── Experience API: forgot-password ────────────────────────────────────────

export async function startForgotPassword(email: string): Promise<void> {
  const env = readLogtoServerEnv();
  const base = env.endpoint.replace(/\/$/, '');

  // Logto exposes password-reset as a ForgotPassword interactionEvent.
  // The flow:
  //   1. PUT /api/experience  { interactionEvent: 'ForgotPassword' }
  //   2. POST /api/experience/verifications/verification-code
  //      → Logto sends the reset email via the configured email connector
  //
  // We don't drive submit() here — the user clicks the link in the email,
  // which lands on Logto's reset-password page (or our future canon page).
  const startRes = await fetch(`${base}/api/experience`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionEvent: 'ForgotPassword' }),
  });
  if (!startRes.ok) {
    const body = await readJsonBody(startRes);
    throw mapExperienceError(startRes.status, body, 'forgot_password_start_failed');
  }
  const jar = parseSetCookieHeaders(startRes);

  if (env.emailConnectorId.length === 0) {
    throw new LogtoExperienceError(
      501,
      'magic_link_not_configured',
      'LOGTO_EMAIL_CONNECTOR_ID is not set — password reset cannot send email',
      null,
    );
  }

  const codeRes = await fetch(`${base}/api/experience/verifications/verification-code`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(jar),
    },
    body: JSON.stringify({
      identifier: { type: 'email', value: email },
      interactionEvent: 'ForgotPassword',
    }),
  });
  if (codeRes.status === 501 || codeRes.status === 400) {
    const body = await readJsonBody(codeRes);
    throw mapExperienceError(codeRes.status, body, 'forgot_password_send_failed');
  }
  // 4xx beyond 400 is treated as silent success (idempotent — don't disclose).
}

// ─── Experience API: verify magic-link token ───────────────────────────────

export interface VerifyMagicLinkResult {
  ok: boolean;
  cookies: string[];
}

export async function verifyMagicLinkToken(
  email: string,
  token: string,
): Promise<VerifyMagicLinkResult> {
  const env = readLogtoServerEnv();
  const base = env.endpoint.replace(/\/$/, '');
  const jar: RawCookieJar = { setCookieHeaders: [], cookieValues: {} };

  // Step 1 — start interaction
  const startRes = await fetch(`${base}/api/experience`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ interactionEvent: 'SignIn' }),
  });
  if (!startRes.ok) return { ok: false, cookies: [] };
  const startJar = parseSetCookieHeaders(startRes);
  jar.setCookieHeaders.push(...startJar.setCookieHeaders);
  Object.assign(jar.cookieValues, startJar.cookieValues);

  // Step 2 — verify the code (acts as identification + verification together)
  const verifyRes = await fetch(`${base}/api/experience/verifications/verification-code/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(jar),
    },
    body: JSON.stringify({
      identifier: { type: 'email', value: email },
      code: token,
    }),
  });
  if (!verifyRes.ok) return { ok: false, cookies: [] };
  const verifyJar = parseSetCookieHeaders(verifyRes);
  jar.setCookieHeaders.push(...verifyJar.setCookieHeaders);
  Object.assign(jar.cookieValues, verifyJar.cookieValues);

  // Step 3 — submit
  const submitRes = await fetch(`${base}/api/experience/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: buildCookieHeader(jar),
    },
    body: '{}',
  });
  if (!submitRes.ok) return { ok: false, cookies: [] };
  const submitJar = parseSetCookieHeaders(submitRes);
  jar.setCookieHeaders.push(...submitJar.setCookieHeaders);
  return { ok: true, cookies: jar.setCookieHeaders };
}

// ─── Management API: change password (requires authenticated user) ─────────

export async function changeUserPassword(
  logtoUserId: string,
  newPassword: string,
): Promise<void> {
  const env = readLogtoServerEnv();
  const token = await getManagementApiToken();
  const base = env.endpoint.replace(/\/$/, '');
  const res = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}/password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: newPassword }),
  });
  if (!res.ok) {
    const body = await readJsonBody(res);
    const errBody = isLogtoErrorBody(body) ? body : {};
    const code = typeof errBody.code === 'string' ? errBody.code : 'password_change_failed';
    throw new LogtoExperienceError(res.status, code, errBody.message ?? 'password_change_failed', body);
  }
}

// ─── Management API: verify password (used by change-password to check current) ───

export async function verifyUserPassword(
  logtoUserId: string,
  password: string,
): Promise<boolean> {
  const env = readLogtoServerEnv();
  const token = await getManagementApiToken();
  const base = env.endpoint.replace(/\/$/, '');
  const res = await fetch(`${base}/api/users/${encodeURIComponent(logtoUserId)}/has-password`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  });
  if (res.status === 204 || res.status === 200) return true;
  if (res.status === 422 || res.status === 400) return false;
  const body = await readJsonBody(res);
  const errBody = isLogtoErrorBody(body) ? body : {};
  const code = typeof errBody.code === 'string' ? errBody.code : 'verify_password_failed';
  throw new LogtoExperienceError(res.status, code, errBody.message ?? 'verify_password_failed', body);
}

// ─── Error mapping ─────────────────────────────────────────────────────────

function mapExperienceError(status: number, body: unknown, fallbackCode: string): LogtoExperienceError {
  const errBody = isLogtoErrorBody(body) ? body : {};
  const code = typeof errBody.code === 'string' ? errBody.code : fallbackCode;
  // Logto returns 422 + code "session.invalid_credentials" or 401 for bad
  // password / unknown user.
  if (
    status === 401 ||
    /(invalid_credentials|password_invalid)/i.test(code) ||
    (status === 422 && /password/i.test(code))
  ) {
    return new LogtoExperienceError(401, 'invalid_credentials', 'incorrect email or password', body);
  }
  if (status === 404 || /(not_found|user_not_exist)/i.test(code)) {
    // For sign-in we still surface as invalid_credentials (don't disclose
    // existence). Callers that want the raw 404 can read .status.
    return new LogtoExperienceError(401, 'invalid_credentials', 'incorrect email or password', body);
  }
  return new LogtoExperienceError(status, code, errBody.message ?? fallbackCode, body);
}
