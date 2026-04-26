// REFERENCE ONLY — user has manually configured the Logto tenant. This script
// exists as canonical procedure for re-creation/dev-org setup (e.g., bootstrapping
// `mcpgen-staging` or `mcpgen-sandbox` from scratch, or onboarding a new dev to
// a fresh tenant).
//
// DO NOT run in CI; DO NOT run as part of Phase 1 verification. The Phase 1 user
// has already provisioned the tenant via the Logto dashboard.
//
// What this script does (idempotent — safe to re-run):
//   1. Reads LOGTO_ENDPOINT / LOGTO_APP_ID / LOGTO_APP_SECRET from process.env.
//   2. Performs an OAuth 2.0 client_credentials grant against the Logto
//      Management API audience to obtain an access token.
//   3. Lists existing applications and ensures `mcpgen-web` (traditional web)
//      and `mcpgen-engine-m2m` (machine-to-machine) exist; creates any missing.
//   4. Lists existing connectors and ensures the GitHub social connector
//      record exists (CTRL-02: ONLY GitHub; never Google/Twitter/Apple).
//   5. Prints created App IDs to stdout. NEVER prints secrets.
//
// Run with: `pnpm tsx infrastructure/logto/scaffold.ts`.
//
// References:
//   - https://docs.logto.io/docs/recipes/protect-your-api/management-api/
//   - https://docs.logto.io/docs/references/applications/
//   - https://docs.logto.io/docs/references/connectors/

interface LogtoEnv {
  readonly endpoint: string;
  readonly appId: string;
  readonly appSecret: string;
}

interface LogtoApplication {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

interface LogtoConnector {
  readonly id: string;
  readonly target: string;
  readonly platform: string | null;
}

const REQUIRED_APPS: ReadonlyArray<{ name: string; type: 'Traditional' | 'MachineToMachine' }> = [
  { name: 'mcpgen-web', type: 'Traditional' },
  { name: 'mcpgen-engine-m2m', type: 'MachineToMachine' },
];

// CTRL-02: ONLY GitHub (no Google/Twitter/Apple/etc.). The list is intentionally
// short — adding to it is a scope-pivot decision (see infrastructure/logto/README.md).
const REQUIRED_CONNECTORS: ReadonlyArray<{ target: string; platform: string }> = [
  { target: 'github', platform: 'Universal' },
];

function readEnv(): LogtoEnv {
  const endpoint = process.env['LOGTO_ENDPOINT'];
  const appId = process.env['LOGTO_APP_ID'];
  const appSecret = process.env['LOGTO_APP_SECRET'];
  if (!endpoint || !appId || !appSecret) {
    throw new Error(
      'Missing required env vars: LOGTO_ENDPOINT, LOGTO_APP_ID, LOGTO_APP_SECRET. Source .env.local first.',
    );
  }
  return { endpoint, appId, appSecret };
}

async function fetchAccessToken(env: LogtoEnv): Promise<string> {
  // Logto Management API audience is the tenant API URL.
  // See https://docs.logto.io/docs/recipes/protect-your-api/management-api/
  const tenantHost = env.endpoint.replace(/^https?:\/\//, '');
  const audience = `https://${tenantHost}/api`;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    resource: audience,
    scope: 'all',
  });

  const credentials = Buffer.from(`${env.appId}:${env.appSecret}`).toString('base64');
  const res = await fetch(`${env.endpoint}/oidc/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Logto token grant failed: ${String(res.status)} ${text}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('Logto token grant returned no access_token');
  }
  return json.access_token;
}

async function listApplications(env: LogtoEnv, token: string): Promise<ReadonlyArray<LogtoApplication>> {
  const res = await fetch(`${env.endpoint}/api/applications`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`GET /api/applications failed: ${String(res.status)} ${await res.text()}`);
  }
  return (await res.json()) as ReadonlyArray<LogtoApplication>;
}

async function createApplication(
  env: LogtoEnv,
  token: string,
  name: string,
  type: string,
): Promise<LogtoApplication> {
  const res = await fetch(`${env.endpoint}/api/applications`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, type }),
  });
  if (!res.ok) {
    throw new Error(`POST /api/applications failed: ${String(res.status)} ${await res.text()}`);
  }
  return (await res.json()) as LogtoApplication;
}

async function listConnectors(env: LogtoEnv, token: string): Promise<ReadonlyArray<LogtoConnector>> {
  const res = await fetch(`${env.endpoint}/api/connectors`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`GET /api/connectors failed: ${String(res.status)} ${await res.text()}`);
  }
  return (await res.json()) as ReadonlyArray<LogtoConnector>;
}

async function ensureApplications(env: LogtoEnv, token: string): Promise<void> {
  const existing = await listApplications(env, token);
  const existingByName = new Map(existing.map((a) => [a.name, a] as const));

  for (const required of REQUIRED_APPS) {
    const found = existingByName.get(required.name);
    if (found) {
      console.log(`OK: application '${required.name}' exists (id=${found.id})`);
      continue;
    }
    const created = await createApplication(env, token, required.name, required.type);
    console.log(`CREATED: application '${required.name}' (id=${created.id})`);
  }
}

async function ensureConnectors(env: LogtoEnv, token: string): Promise<void> {
  // Connectors are pre-installed in Logto Cloud; we only verify the GitHub
  // record exists. Provisioning the GitHub OAuth app (Client ID + Secret) is a
  // dashboard step — this script does not paste secrets into Logto.
  const existing = await listConnectors(env, token);
  const githubFound = existing.some((c) => c.target === 'github');
  if (githubFound) {
    console.log("OK: connector 'github' exists");
  } else {
    console.warn(
      "WARN: connector 'github' missing. Add it via Logto Console → Connectors. " +
        'This script does not paste GitHub OAuth Client ID/Secret (manual dashboard step).',
    );
  }

  // CTRL-02: warn loudly if any forbidden connectors crept in.
  const forbidden = ['google', 'twitter', 'apple', 'facebook'];
  for (const c of existing) {
    if (forbidden.includes(c.target.toLowerCase())) {
      console.warn(
        `WARN: forbidden connector '${c.target}' is enabled. CTRL-02 + implementation-plan §11.6 anti-pattern #5 say email + GitHub only. Remove via Logto Console.`,
      );
    }
  }
}

async function main(): Promise<void> {
  const env = readEnv();
  console.log(`Scaffolding against ${env.endpoint} (app_id prefix: ${env.appId.slice(0, 6)}…)`);
  const token = await fetchAccessToken(env);
  console.log('OK: obtained Management API access token (not logged)');
  await ensureApplications(env, token);
  await ensureConnectors(env, token);
  console.log('Done.');
}

// Top-level await would force `--module=node18`; an explicit IIFE keeps the
// script compatible with the workspace's `module: ESNext` + `moduleResolution: Bundler` config.
void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
