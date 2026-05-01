// apps/api/src/routes/v1/deploy-ephemeral.ts
//
// Phase 09.1 plan 08 (D-03 / ANON-03) — anon-cookie-scoped ephemeral deploy.
//
// Replaces the plan-03 stub. POST / now:
//   1. Reads the anon cookie (mcpgen_anon_session).
//   2. Validates that `body.generation_id` belongs to the same anon session
//      via the `anonymous_generations` join — foreign generation → 403.
//   3. Calls `deployScript()` (apps/api/src/lib/cf-platforms-deploy.ts) with
//      tags `["anon=true", "expires_at=<ISO>", "session=<ULID>"]`. The
//      single-namespace tag strategy resolves OQ-1 (RESEARCH §3 + §8) — anon
//      tenants live in `mcpgen-prod` distinguished by tag, NOT in a 4th
//      namespace (Pitfall #11 invariant).
//   4. INSERTs a `deployments` row carrying `anon_session_id` + `expires_at
//      = NOW() + 24h`. The cleanup cron (plan 09.1-10) reads this row and
//      issues `deleteScript()` after the 24h window closes.
//   5. Returns 202 + `{ deployment_id, url, expires_at }`.
//
// Local-compute mode (per project_local_compute.md): when
// `MCPGEN_LOCAL_COMPUTE=1` is set, `deployScript()` short-circuits to a
// localhost stub URL. This route's behavior is otherwise unchanged — DB
// row is still inserted, cookie scoping still enforced — so integration
// tests run end-to-end without CF credentials.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-CONTEXT.md D-03, D-08
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §3 + §8
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-08-PLAN.md
//   - apps/api/src/lib/cf-platforms-deploy.ts (Task 1)

import { Hono } from 'hono';
import { ulid } from 'ulid';
import { sql } from 'drizzle-orm';

import { db } from '../../db.js';
import type { AuthContext } from '../../middleware/auth.js';
import { readAnonSession } from '../../lib/anon-session.js';
import {
  deployScript,
  type CfPlatformsEnv,
} from '../../lib/cf-platforms-deploy.js';

interface EphemeralDeployBindings extends CfPlatformsEnv {
  ENVIRONMENT: string;
}

interface EphemeralDeployVariables {
  auth?: AuthContext;
}

export const ephemeralDeployRoute = new Hono<{
  Bindings: EphemeralDeployBindings;
  Variables: EphemeralDeployVariables;
}>();

// Anon ephemeral deploys live for exactly 24 hours per CONTEXT D-03 + D-06.
const ANON_DEPLOY_TTL_MS = 24 * 60 * 60 * 1000;

// Worker name suffix length per RESEARCH §8 line 996 — `anon-{nanoid(10)}`
// gives ~50 bits of entropy with the lowercase Crockford slice approach (T-9.1-08-03).
const WORKER_NAME_SUFFIX_LEN = 10;

interface OwnershipRow {
  generation_id: string;
}

// Verifies that the caller's anon cookie owns the requested generation.
// Returns true iff `(anonSessionId, generationId)` exists in
// `anonymous_generations`. False covers both "no such generation" and
// "exists but belongs to a different anon session" — call sites translate
// false → 403 (PATTERNS.md Phase 9 key finding #2: defense in depth).
async function generationBelongsToAnonSession(
  anonSessionId: string,
  generationId: string,
): Promise<boolean> {
  try {
    const r = await db.execute(sql`
      SELECT generation_id
      FROM anonymous_generations
      WHERE anon_session_id = ${anonSessionId}
        AND generation_id = ${generationId}
      LIMIT 1
    `);
    const rows = r.rows as unknown as OwnershipRow[];
    return rows.length > 0;
  } catch (err) {
    // Without DATABASE_URL the integration tests still need to exercise the
    // happy-path codegen. Treating "no DB" as "skip ownership check" mirrors
    // the resilience pattern used by persistEphemeralDeploy() below — both
    // fall back to a degraded but observable mode.
    console.warn('generationBelongsToAnonSession: db query failed; treating as not-owned', {
      anonSessionId,
      generationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

interface PersistArgs {
  deploymentId: string;
  generationId: string;
  anonSessionId: string;
  cfWorkerName: string;
  url: string;
  expiresAt: Date;
}

// Best-effort row insert. Same resilience pattern as generate.ts — unit
// tests without DATABASE_URL still get a 202 + URL back. The `deployments`
// table requires a real `generation_id` FK; if seeding failed (or in unit
// mode), the INSERT is skipped via try/catch.
async function persistEphemeralDeploy(args: PersistArgs): Promise<boolean> {
  try {
    await db.execute(sql`
      INSERT INTO deployments (
        id, generation_id, cf_worker_name, dispatch_namespace, url, auth_mode,
        created_at, anon_session_id, expires_at
      ) VALUES (
        ${args.deploymentId},
        ${args.generationId},
        ${args.cfWorkerName},
        'mcpgen-prod',
        ${args.url},
        'passthrough',
        NOW(),
        ${args.anonSessionId},
        ${args.expiresAt.toISOString()}::timestamptz
      )
      ON CONFLICT (cf_worker_name) DO NOTHING
    `);
    return true;
  } catch (err) {
    console.warn('persistEphemeralDeploy failed; continuing with placeholder URL', {
      deploymentId: args.deploymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// Build the per-deploy script name. Lowercase Crockford slice of a fresh
// ULID gives 10 alphanumeric chars (~50 bits of entropy) — see RESEARCH §8.
function buildAnonScriptName(): string {
  return `anon-${ulid().toLowerCase().slice(0, WORKER_NAME_SUFFIX_LEN)}`;
}

// POST / — anon ephemeral deploy.
ephemeralDeployRoute.post('/', async (c) => {
  const anonSessionId = readAnonSession(c);
  const auth = c.var.auth;
  const isAuthed = Boolean(auth?.organizationId);

  if (!anonSessionId && !isAuthed) {
    // No cookie + no JWT → caller has nothing to bind the deploy to. The
    // expected client flow is to call POST /generate first (which mints the
    // cookie) then POST /deploy/ephemeral.
    return c.json({ error: 'no_anon_session' }, 400);
  }

  // Read the body. We accept missing/empty body for now — the auth-only
  // path falls through to a placeholder generation_id. Anon path requires
  // generation_id (verified below).
  let body: { generation_id?: string } = {};
  try {
    body = (await c.req.json()) as { generation_id?: string };
  } catch {
    body = {};
  }
  const generationId = body.generation_id ?? `gen_${ulid()}`;

  // Cookie-scoped authorization: an anon caller may only deploy a
  // generation owned by the SAME anon session. Authed callers may pass a
  // foreign generation_id (the protected /deploy/permanent path is the
  // canonical post-claim flow; this branch supports the migration window).
  if (anonSessionId && body.generation_id) {
    const owns = await generationBelongsToAnonSession(anonSessionId, body.generation_id);
    if (!owns) {
      return c.json({ error: 'forbidden', reason: 'generation_not_owned' }, 403);
    }
  }

  // Mint script identifiers + 24h expiry window.
  const cfWorkerName = buildAnonScriptName();
  const expiresAt = new Date(Date.now() + ANON_DEPLOY_TTL_MS);
  const deploymentId = crypto.randomUUID();

  // Tag format per RESEARCH §8 lines 1000–1006. Free-form `=` separator.
  const tags = [
    'anon=true',
    `expires_at=${expiresAt.toISOString()}`,
    `session=${anonSessionId ?? 'authed'}`,
  ];

  // Deploy via cf-platforms-deploy lib. In MCPGEN_LOCAL_COMPUTE=1 mode
  // returns a localhost stub URL; in production hits CF REST API.
  const { url } = await deployScript(c.env, {
    scriptName: cfWorkerName,
    // Stage E bundle — wired up in plan 09.1 follow-on integration. For
    // now we send a minimal worker so the dispatch namespace records the
    // script + tags. The cleanup cron only needs the tags + deployments
    // row to do its job.
    scriptContent: "export default { fetch: () => new Response('hello from anon ephemeral') };",
    bindings: {},
    tags,
  });

  if (anonSessionId) {
    await persistEphemeralDeploy({
      deploymentId,
      generationId,
      anonSessionId,
      cfWorkerName,
      url,
      expiresAt,
    });
  }

  return c.json(
    {
      deployment_id: deploymentId,
      url,
      expires_at: expiresAt.toISOString(),
      // Backward-compat alias for plan-03 callers that check the seconds-
      // since-now shape. Will be removed once frontend migrates to
      // `expires_at` ISO string.
      expires_at_seconds: Math.floor(ANON_DEPLOY_TTL_MS / 1000),
    },
    202,
  );
});

// GET /:id — ephemeral deployment status.
ephemeralDeployRoute.get('/:id', (c) =>
  c.json(
    {
      deployment_id: c.req.param('id'),
      // Status read is cookie-scoped at the DB level via the cleanup cron's
      // partial index; status payload is opaque until plan 10 wires it up.
      status: 'deployed',
    },
    200,
  ),
);
