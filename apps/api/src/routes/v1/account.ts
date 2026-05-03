// apps/api/src/routes/v1/account.ts
//
// Account profile + sessions + danger-zone endpoints. Mounted at /api/v1/account
// behind the user-JWT-protected sub-app (apps/api/src/index.ts).
//
//   GET    /api/v1/account/profile      — read profile (Logto + customData)
//   PATCH  /api/v1/account/profile      — update profile (subset of fields)
//   GET    /api/v1/account/sessions     — active session list (Logto, may be unsupported)
//   DELETE /api/v1/account              — danger-zone account deletion
//   POST   /api/v1/account/data-export  — gated GDPR export
//
// Required env vars (see apps/web/src/lib/logto/client.ts header):
//   LOGTO_ENDPOINT, LOGTO_M2M_APP_ID, LOGTO_M2M_APP_SECRET
//
// Authentication: protectedApp / authMiddleware. M2M tokens are rejected
// with 403 on every endpoint (account routes are user-only by definition).

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users, organizations } from '@mcpgen/contracts/db-schema';

import { db } from '../../db.js';
import { inngest } from '../../inngest/client.js';
import { evaluateBoolean } from '../../lib/flags.js';
import {
  deleteUser,
  getUserProfile,
  updateUserProfile,
  LogtoManagementError,
  type LogtoEnv,
} from '../../lib/logto-management.js';
import type { AuthContext } from '../../middleware/auth.js';

interface Bindings extends LogtoEnv {
  FLIPT_URL?: string;
  FLIPT_ENVIRONMENT?: string;
  FLIPT_CLIENT_TOKEN?: string;
}

export const accountRoutes = new Hono<{
  Bindings: Bindings;
  Variables: { auth: AuthContext };
}>();

// ─── Validators ────────────────────────────────────────────────────────────

const ProfilePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  handle: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9_-]+$/).optional(),
  timezone: z.string().trim().max(64).optional(),
  language: z.string().trim().max(16).optional(),
  bio: z.string().max(512).optional(),
  avatar_url: z.string().url().max(1024).optional(),
});

const DeleteAccountSchema = z.object({
  confirm_phrase: z.string().trim().min(1).max(256),
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function ensureUserAuth(
  auth: AuthContext,
):
  | { ok: true; logtoUserId: string; orgId: string | null }
  | { ok: false; status: 401 | 403; body: { error: string; reason: string } } {
  if (auth.isM2M) {
    return { ok: false, status: 403, body: { error: 'forbidden', reason: 'm2m_cannot_access_account' } };
  }
  if (auth.subject.length === 0) {
    return { ok: false, status: 401, body: { error: 'unauthorized', reason: 'missing_subject' } };
  }
  return { ok: true, logtoUserId: auth.subject, orgId: auth.organizationId };
}

function logtoErrorResponseStatus(err: unknown): 502 | 500 {
  return err instanceof LogtoManagementError ? 502 : 500;
}

// ─── GET /profile ──────────────────────────────────────────────────────────

accountRoutes.get('/profile', async (c) => {
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);
  try {
    const profile = await getUserProfile(c.env, guard.logtoUserId);
    return c.json(profile, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[account/profile GET] logto fetch failed', err);
    return c.json(
      {
        error: 'logto_unavailable',
        reason: err instanceof LogtoManagementError ? err.code : 'unknown',
      },
      logtoErrorResponseStatus(err),
    );
  }
});

// ─── PATCH /profile ────────────────────────────────────────────────────────

accountRoutes.patch('/profile', zValidator('json', ProfilePatchSchema), async (c) => {
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);
  const patch = c.req.valid('json');
  try {
    const profile = await updateUserProfile(c.env, guard.logtoUserId, patch);
    return c.json(profile, 200);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[account/profile PATCH] logto patch failed', err);
    return c.json(
      {
        error: 'logto_unavailable',
        reason: err instanceof LogtoManagementError ? err.code : 'unknown',
      },
      logtoErrorResponseStatus(err),
    );
  }
});

// ─── GET /sessions ─────────────────────────────────────────────────────────
//
// Logto Cloud does not currently expose a user-session listing endpoint via
// Management API. We surface { available: false } so the canon UI renders the
// graceful empty state ("Active sessions are not available for this tenant").
// When Logto ships /api/users/:id/sessions we'll switch this to a real list.

accountRoutes.get('/sessions', (c) => {
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);
  return c.json({ available: false, sessions: [] }, 200);
});

// ─── DELETE / (account deletion) ───────────────────────────────────────────

accountRoutes.delete('/', zValidator('json', DeleteAccountSchema), async (c) => {
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);

  // 1. Look up DB user record (need handle for confirm-phrase + cascade scope).
  const userRow = await db.query.users.findFirst({
    where: eq(users.logto_user_id, guard.logtoUserId),
  });
  if (userRow === undefined) {
    return c.json({ error: 'not_found', reason: 'user_row_missing' }, 404);
  }

  // 2. Phrase check — handle defaults to email-local when missing.
  const handle = userRow.email.split('@')[0] ?? '';
  const expected = `delete ${handle}`;
  const provided = c.req.valid('json').confirm_phrase.trim().toLowerCase();
  if (provided !== expected.toLowerCase()) {
    return c.json(
      {
        error: 'confirm_phrase_mismatch',
        reason: 'expected_phrase_does_not_match',
      },
      400,
    );
  }

  // 3. Logto-side delete (idempotent — 404 from Logto is treated as success).
  try {
    await deleteUser(c.env, guard.logtoUserId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[account DELETE] logto delete failed', err);
    return c.json(
      {
        error: 'logto_unavailable',
        reason: err instanceof LogtoManagementError ? err.code : 'unknown',
      },
      logtoErrorResponseStatus(err),
    );
  }

  // 4. Neon cascade: delete user row. organizations row stays only if other
  // users belong to it; otherwise cascade by org.
  await db.delete(users).where(eq(users.logto_user_id, guard.logtoUserId));
  if (guard.orgId !== null) {
    const remaining = await db.query.users.findFirst({
      where: eq(users.org_id, guard.orgId),
    });
    if (remaining === undefined) {
      await db.delete(organizations).where(eq(organizations.id, guard.orgId));
    }
  }

  // 5. Inngest event for downstream cleanup (R2 artifacts, billing, etc.)
  try {
    await inngest.send({
      name: 'account.deleted',
      data: {
        logtoUserId: guard.logtoUserId,
        orgId: guard.orgId,
        email: userRow.email,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[account DELETE] inngest send failed (non-fatal)', err);
  }

  return c.json({ ok: true }, 200);
});

// ─── POST /data-export ─────────────────────────────────────────────────────

accountRoutes.post('/data-export', async (c) => {
  const guard = ensureUserAuth(c.var.auth);
  if (!guard.ok) return c.json(guard.body, guard.status);

  const enabled = await evaluateBoolean(
    c.env,
    'ui_settings_danger_export_perm',
    guard.logtoUserId,
    {},
    false,
  );
  if (!enabled) {
    return c.json(
      {
        error: 'export_unavailable',
        reason: 'feature_disabled',
      },
      503,
    );
  }

  try {
    await inngest.send({
      name: 'account.data_export.requested',
      data: {
        logtoUserId: guard.logtoUserId,
        orgId: guard.orgId,
      },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[account/data-export POST] inngest send failed', err);
    return c.json({ error: 'inngest_unavailable', reason: 'send_failed' }, 502);
  }
  return c.json({ ok: true, status: 'queued' }, 202);
});
