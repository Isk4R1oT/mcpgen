// apps/api/src/lib/cf-platforms-deploy.ts
//
// Phase 09.1 plan 08 (D-03 / ANON-03) — Cloudflare Workers for Platforms
// REST API helper. Three operations are wrapped here so every caller — anon
// ephemeral deploy (this plan), claim re-tag (plan 09.1-09), and the
// cleanup cron (plan 09.1-10) — uses one canonical implementation:
//
//   deployScript({ scriptName, scriptContent, bindings, tags })
//   deleteScript(scriptName)
//   retagScript(scriptName, newTags)
//
// ⚠ Pitfall #11 invariant — single namespace, NEVER a 4th:
//   The architecture mandates exactly 3 dispatch namespaces (mcpgen-prod,
//   mcpgen-staging, mcpgen-sandbox; see infrastructure/cloudflare/README.md).
//   Anon ephemeral tenants live in `mcpgen-prod` distinguished by the
//   `anon=true` tag — NOT in a dedicated 4th namespace. This file hard-codes
//   the namespace constant; the `.pre-commit-hooks/no-fourth-namespace.sh`
//   hook enforces no other namespace name appears in tracked files. See
//   RESEARCH §3 OQ-1 verdict (lines 288–299) and §8 lines 910–1018 verbatim
//   shapes.
//
// ⚠ Local-compute mode (per project_local_compute.md memory + RESEARCH
//   "Environment Availability"): Phases 1–9 run all compute locally; CF
//   provisioning is deferred to Phase 10. When `MCPGEN_LOCAL_COMPUTE=1` is
//   set, all three functions short-circuit to a local-stub URL or no-op so
//   integration tests run end-to-end without CF credentials.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-03
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §3 + §8
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-08-PLAN.md
//   - infrastructure/cloudflare/README.md (3-namespace cap)
//   - .pre-commit-hooks/no-fourth-namespace.sh

// ─── Public types ───────────────────────────────────────────────────────────

export interface CfPlatformsEnv {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ENVIRONMENT?: string;
  // Flipt env vars — local-compute mode is now driven by the
  // `runtime_local_compute_routing_ops` flag (per docs/mcpgen-feature-flags-contract.md
  // §4.4). Phases 1-9 default the flag to true; Phase 10 flips per-tenant.
  FLIPT_URL?: string;
  FLIPT_ENVIRONMENT?: string;
  FLIPT_CLIENT_TOKEN?: string;
}

export interface DeployScriptParams {
  scriptName: string;
  // Bundle from Stage E. Empty string is allowed in local-compute mode.
  scriptContent: string;
  bindings: Record<string, unknown>;
  // CF tag strings. Anon flow uses ["anon=true", "expires_at=<ISO>",
  // "session=<ULID>"]. Free-form (CF API does not validate format).
  tags: string[];
}

export interface DeployScriptResult {
  url: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

// Pitfall #11 invariant — single namespace for all dispatch scripts (prod /
// anon / sandboxed-trial alike). 4th namespace would break the no-fourth-
// namespace pre-commit hook AND require a paired-decision-doc bump.
const NAMESPACE = 'mcpgen-prod';

// Tenant subdomain shape per CONTEXT D-03: `https://{scriptName}.mcpgen.app/mcp`.
const TENANT_DOMAIN_SUFFIX = '.mcpgen.app';

// CF Workers compatibility date pinned at the time of plan-08 authoring. Bump
// in lockstep with apps/dispatch/wrangler.toml when the runtime updates.
const CF_COMPATIBILITY_DATE = '2026-04-24';
const CF_COMPATIBILITY_FLAGS: readonly string[] = ['nodejs_compat'];

// Local-compute stub port range (per project_local_compute.md). 9000+ avoids
// collision with Phases 1–9 ports (8787 BFF, 8789 dispatch, 8790+ tenants).
const LOCAL_COMPUTE_PORT = 9000;

// ─── Helpers ────────────────────────────────────────────────────────────────

import { evaluateBoolean, serviceEntityId } from './flags.js';

const LOCAL_COMPUTE_FLAG = 'runtime_local_compute_routing_ops';

/**
 * Reads `runtime_local_compute_routing_ops` from Flipt. Default value is
 * `true` because Phases 1-9 always run in local-compute mode (per
 * project_local_compute.md memory). When Flipt is unreachable or the flag
 * is missing, we fall back to true — keeping local dev usable without
 * a running Flipt server.
 *
 * Phase 10 will flip the flag's defaultValue to false in the production
 * environment so cloud-routed generations hit the real CF dispatch API.
 */
async function isLocalCompute(env: CfPlatformsEnv): Promise<boolean> {
  return evaluateBoolean(
    env,
    LOCAL_COMPUTE_FLAG,
    serviceEntityId('cf-platforms-deploy'),
    {},
    true,
  );
}

function buildScriptUrl(env: CfPlatformsEnv, scriptName: string): string {
  return (
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}` +
    `/workers/dispatch/namespaces/${NAMESPACE}/scripts/${scriptName}`
  );
}

function buildScriptTagsUrl(env: CfPlatformsEnv, scriptName: string): string {
  return `${buildScriptUrl(env, scriptName)}/tags`;
}

// ─── deployScript ───────────────────────────────────────────────────────────
//
// Multipart PUT to dispatch namespace creates-or-updates the script and
// records its metadata.tags. Errors include the CF response body so a
// failing CF call is debuggable from the API logs (no need to re-issue the
// request to find out what was wrong).
//
// Returns the public tenant URL (`https://{scriptName}.mcpgen.app/mcp`).

export async function deployScript(
  env: CfPlatformsEnv,
  params: DeployScriptParams,
): Promise<DeployScriptResult> {
  if (await isLocalCompute(env)) {
    // Local-compute: no CF call, return a localhost stub URL.
    return { url: `http://localhost:${LOCAL_COMPUTE_PORT}/${params.scriptName}/mcp` };
  }

  const url = buildScriptUrl(env, params.scriptName);
  const metadata = {
    main_module: 'worker.mjs',
    bindings: Object.entries(params.bindings).map(([name, value]) => ({
      name,
      type: 'plain_text',
      text: String(value),
    })),
    tags: params.tags,
    compatibility_date: CF_COMPATIBILITY_DATE,
    compatibility_flags: CF_COMPATIBILITY_FLAGS,
  };

  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  formData.append(
    'worker.mjs',
    new Blob([params.scriptContent], { type: 'application/javascript+module' }),
  );

  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`CF deploy failed ${res.status}: ${body}`);
  }

  return { url: `https://${params.scriptName}${TENANT_DOMAIN_SUFFIX}/mcp` };
}

// ─── deleteScript ───────────────────────────────────────────────────────────
//
// Idempotent — 404 is treated as success (the script is already gone, which
// is the desired terminal state). Cleanup cron (plan 09.1-10) relies on this
// invariant so retries after a partial failure converge on "deleted".

export async function deleteScript(
  env: CfPlatformsEnv,
  scriptName: string,
): Promise<void> {
  if (await isLocalCompute(env)) return;

  const url = buildScriptUrl(env, scriptName);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
  });

  if (!res.ok && res.status !== 404) {
    const body = await res.text();
    throw new Error(`CF delete failed ${res.status}: ${body}`);
  }
}

// ─── retagScript ────────────────────────────────────────────────────────────
//
// Replaces the script's tag set wholesale (not a merge). Used by the claim
// flow (plan 09.1-09 D-04 step 5b) to convert anon tags to claimed tags:
//
//   anon=true / expires_at=... / session=...
//     → anon=false / claimed_by_org=... / claimed_at=...

export async function retagScript(
  env: CfPlatformsEnv,
  scriptName: string,
  newTags: string[],
): Promise<void> {
  if (await isLocalCompute(env)) return;

  const url = buildScriptTagsUrl(env, scriptName);
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(newTags),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`CF retag failed ${res.status}: ${body}`);
  }
}

// ─── Constants exported for tests and callers that need the namespace name ─

export const CF_DISPATCH_NAMESPACE = NAMESPACE;
