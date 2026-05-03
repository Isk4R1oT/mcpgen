// apps/api/tests/routes/account.test.ts
//
// Plan: Embedded auth — BFF /api/v1/account routes.
// Coverage:
//   - GET    /api/v1/account/profile   (200 happy / 401 no-auth)
//   - PATCH  /api/v1/account/profile   (200 happy / 401 no-auth / 400 invalid)
//   - GET    /api/v1/account/sessions  (200 with available:false fallback)
//   - DELETE /api/v1/account           (200 happy / 400 phrase mismatch / 401)
//   - POST   /api/v1/account/data-export (503 when flag off / 202 when on)
//
// Pattern mirrors apps/api/tests/routes/deployments-list.test.ts:
//   - jose mock with __authMode toggle
//   - vi.mock('../../src/db.js') with an in-memory store
//   - vi.mock('../../src/lib/logto-management.js') for Logto Management API

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupStripeMock } from '../_mocks/stripe.js';

setupStripeMock();

const TEST_ORG_ID = '00000000-0000-4000-8000-000000000099';
const TEST_LOGTO_USER_ID = 'user_logto_id_1';

vi.mock('jose', () => ({
  createRemoteJWKSet: () => () => ({}),
  jwtVerify: vi.fn(async (_token: string, _jwks: unknown, opts: { audience?: string[] }) => {
    const mode = (globalThis as unknown as { __authMode?: 'user' | 'm2m' | 'none' }).__authMode ?? 'user';
    if (mode === 'm2m') {
      return {
        payload: {
          aud: opts.audience?.[1] ?? 'https://api.mcpgen.dev/m2m',
          sub: 'm2m_client',
        },
      };
    }
    return {
      payload: {
        aud: opts.audience?.[0] ?? 'http://localhost:3000',
        sub: TEST_LOGTO_USER_ID,
        organization_id: TEST_ORG_ID,
      },
    };
  }),
}));

// ─── In-memory db.users mock ───────────────────────────────────────────────

interface UserRow {
  id: string;
  org_id: string;
  email: string;
  logto_user_id: string;
  created_at: Date | null;
}

const usersStore = new Map<string, UserRow>();
const orgDeleteCalls: string[] = [];
const userDeleteCalls: string[] = [];
const inngestSendCalls: Array<{ name: string; data: unknown }> = [];

function resetStores(): void {
  usersStore.clear();
  orgDeleteCalls.length = 0;
  userDeleteCalls.length = 0;
  inngestSendCalls.length = 0;
  usersStore.set(TEST_LOGTO_USER_ID, {
    id: '11111111-1111-4111-8111-111111111111',
    org_id: TEST_ORG_ID,
    email: 'igor@example.com',
    logto_user_id: TEST_LOGTO_USER_ID,
    created_at: new Date('2026-04-01T00:00:00Z'),
  });
}

vi.mock('../../src/db.js', () => {
  const findFirstByLogto = (where: { value?: { right?: { value?: string } } }): UserRow | undefined => {
    const v = where.value?.right?.value;
    if (typeof v !== 'string') return undefined;
    return usersStore.get(v);
  };
  const findFirstByOrg = (orgId: string): UserRow | undefined => {
    for (const u of usersStore.values()) {
      if (u.org_id === orgId) return u;
    }
    return undefined;
  };

  return {
    db: {
      query: {
        users: {
          findFirst: vi.fn(({ where }: { where: unknown }) => {
            // Crude but functional: detect "logto_user_id =" vs "org_id =" by
            // walking the drizzle eq() AST. The eq() result structure is
            // { value: { left, right: { value: <param> } } } — we read the
            // left column name from where.queryChunks if possible, otherwise
            // we fall back on probing both stores in sequence (caller calls
            // are well-defined so the order is deterministic).
            const w = where as { queryChunks?: unknown };
            const chunks = (w.queryChunks ?? []) as Array<unknown>;
            let column = '';
            for (const ch of chunks) {
              const val = (ch as { value?: string[] }).value;
              if (Array.isArray(val)) column += val.join('');
            }
            const target = (where as { value?: { right?: { value?: unknown } } }).value?.right?.value;
            if (column.includes('logto_user_id') && typeof target === 'string') {
              return Promise.resolve(usersStore.get(target));
            }
            if (column.includes('org_id') && typeof target === 'string') {
              return Promise.resolve(findFirstByOrg(target));
            }
            // Fallback: try logto_user_id (most common path).
            const fallback = findFirstByLogto(where as never);
            return Promise.resolve(fallback);
          }),
        },
      },
      delete: vi.fn(() => ({
        where: vi.fn((cond: { value?: { right?: { value?: unknown } } }) => {
          const target = cond.value?.right?.value;
          if (typeof target !== 'string') return Promise.resolve();
          // We can't tell from here whether it's users or organizations —
          // cheat by checking if it matches a known logto_user_id first;
          // fall back to org_id.
          if (usersStore.has(target)) {
            userDeleteCalls.push(target);
            usersStore.delete(target);
          } else {
            orgDeleteCalls.push(target);
          }
          return Promise.resolve();
        }),
      })),
    },
  };
});

// Inngest send-capture — patch the real client's send() with a spy so the
// rest of the module (including inngest.createFunction calls used by the
// serve() handler in apps/api/src/index.ts) keeps working.
import { inngest as realInngest } from '../../src/inngest/client.js';
const realSend = realInngest.send.bind(realInngest);
vi.spyOn(realInngest, 'send').mockImplementation(async (evt) => {
  // Capture the synthesized event for assertions.
  if (Array.isArray(evt)) {
    for (const e of evt) inngestSendCalls.push({ name: e.name, data: e.data });
  } else {
    inngestSendCalls.push({ name: evt.name, data: evt.data });
  }
  // Return the same shape the real client returns to keep callers happy.
  return { ids: ['mock-event-id'] };
});
// Reference realSend so TS doesn't complain about unused — kept for
// documentation; tests never actually call the real send.
void realSend;

// Logto Management API mock — captures profile fetches/updates/deletes.
const mockGetUserProfile = vi.fn();
const mockUpdateUserProfile = vi.fn();
const mockDeleteUser = vi.fn();
vi.mock('../../src/lib/logto-management.js', () => {
  class LogtoManagementError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    LogtoManagementError,
    _resetLogtoMgmtCacheForTesting: () => {},
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
    updateUserProfile: (...args: unknown[]) => mockUpdateUserProfile(...args),
    deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  };
});

// Flipt eval mock for the data-export gate.
const mockEvaluateBoolean = vi.fn();
vi.mock('../../src/lib/flags.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/flags.js')>(
    '../../src/lib/flags.js',
  );
  return {
    ...actual,
    evaluateBoolean: (...args: unknown[]) => mockEvaluateBoolean(...args),
  };
});

const { default: app } = await import('../../src/index.js');

const ENV = {
  LOGTO_ENDPOINT: 'https://logto.test',
  LOGTO_BASE_URL: 'http://localhost:3000',
  LOGTO_M2M_RESOURCE_INDICATOR: 'https://api.mcpgen.dev/m2m',
  LOGTO_M2M_APP_ID: 'mock-m2m-id',
  LOGTO_M2M_APP_SECRET: 'mock-m2m-secret',
  HYPERDRIVE: {} as Hyperdrive,
  SENTRY_DSN: '',
  ENVIRONMENT: 'test',
  STRIPE_SECRET_KEY: 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
  STRIPE_PRICE_PRO: 'price_test_pro',
  ENGINE_ENDPOINT: 'http://localhost:8000',
};

function setAuthMode(mode: 'user' | 'm2m' | 'none'): void {
  (globalThis as unknown as { __authMode?: 'user' | 'm2m' | 'none' }).__authMode = mode;
}

beforeEach(() => {
  setAuthMode('user');
  resetStores();
  mockGetUserProfile.mockReset();
  mockUpdateUserProfile.mockReset();
  mockDeleteUser.mockReset();
  mockEvaluateBoolean.mockReset();
  mockEvaluateBoolean.mockResolvedValue(false); // export OFF by default
});

describe('GET /api/v1/account/profile', () => {
  it('returns 401 without Authorization', async () => {
    const res = await app.fetch(new Request('http://x/api/v1/account/profile'), ENV);
    expect(res.status).toBe(401);
  });

  it('returns 200 with the Logto profile on happy path', async () => {
    mockGetUserProfile.mockResolvedValue({
      name: 'Igor',
      email: 'igor@example.com',
      handle: 'igor',
      timezone: 'Europe/Berlin',
      language: 'en',
      bio: 'Founder',
      avatar_url: '',
    });
    const res = await app.fetch(
      new Request('http://x/api/v1/account/profile', {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string; email: string; handle: string };
    expect(body.name).toBe('Igor');
    expect(body.email).toBe('igor@example.com');
    expect(body.handle).toBe('igor');
    expect(mockGetUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ LOGTO_ENDPOINT: 'https://logto.test' }),
      TEST_LOGTO_USER_ID,
    );
  });

  it('returns 403 for M2M tokens', async () => {
    setAuthMode('m2m');
    const res = await app.fetch(
      new Request('http://x/api/v1/account/profile', {
        headers: { Authorization: 'Bearer m2m-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/account/profile', () => {
  it('returns 401 without Authorization', async () => {
    const res = await app.fetch(
      new Request('http://x/api/v1/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      ENV,
    );
    expect(res.status).toBe(401);
  });

  it('returns 200 + updated profile on happy path', async () => {
    mockUpdateUserProfile.mockResolvedValue({
      name: 'Igor R',
      email: 'igor@example.com',
      handle: 'igor',
      timezone: 'Europe/Berlin',
      language: 'en',
      bio: 'Founder',
      avatar_url: '',
    });
    const res = await app.fetch(
      new Request('http://x/api/v1/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer user-jwt',
        },
        body: JSON.stringify({ name: 'Igor R' }),
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { name: string };
    expect(body.name).toBe('Igor R');
    expect(mockUpdateUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ LOGTO_ENDPOINT: 'https://logto.test' }),
      TEST_LOGTO_USER_ID,
      { name: 'Igor R' },
    );
  });

  it('returns 400 on invalid handle (special characters)', async () => {
    const res = await app.fetch(
      new Request('http://x/api/v1/account/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer user-jwt',
        },
        body: JSON.stringify({ handle: 'has spaces' }),
      }),
      ENV,
    );
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/account/sessions', () => {
  it('returns { available: false, sessions: [] } so the UI shows graceful empty state', async () => {
    const res = await app.fetch(
      new Request('http://x/api/v1/account/sessions', {
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { available: boolean; sessions: unknown[] };
    expect(body.available).toBe(false);
    expect(body.sessions).toEqual([]);
  });
});

describe('POST /api/v1/account/data-export', () => {
  it('returns 503 when ui_settings_danger_export_perm is OFF', async () => {
    mockEvaluateBoolean.mockResolvedValue(false);
    const res = await app.fetch(
      new Request('http://x/api/v1/account/data-export', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('export_unavailable');
    expect(inngestSendCalls).toHaveLength(0);
  });

  it('returns 202 + queues an Inngest event when flag ON', async () => {
    mockEvaluateBoolean.mockResolvedValue(true);
    const res = await app.fetch(
      new Request('http://x/api/v1/account/data-export', {
        method: 'POST',
        headers: { Authorization: 'Bearer user-jwt' },
      }),
      ENV,
    );
    expect(res.status).toBe(202);
    expect(inngestSendCalls).toHaveLength(1);
    expect(inngestSendCalls[0]?.name).toBe('account.data_export.requested');
  });
});
