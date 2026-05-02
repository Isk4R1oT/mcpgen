// Plan 07-03 — Vitest unit tests for fixture-mode guard + env router.
//
// Migrated 2026-05-03: getFrontendMode now reads `ui_frontend_fixtures_mode_ops`
// from Flipt instead of MCPGEN_FRONTEND_MODE. We mock @/lib/flags to control
// flag eval per test. NODE_ENV hard-block (T-7-09 / WR-06) and ?fixtures=true
// override behavior unchanged.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the flags module BEFORE importing fixture-mode (which uses it).
const mockEvaluateBooleanFlag = vi.fn();
vi.mock('@/lib/flags', () => ({
  evaluateBooleanFlag: (...args: unknown[]) => mockEvaluateBooleanFlag(...args),
}));

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';
import { isFixturesAllowed } from '@/lib/fixture-mode/guard';

const env = process.env as Record<string, string | undefined>;
const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = ['MCPGEN_BFF_URL', 'NODE_ENV'] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) ENV_BACKUP[k] = env[k];
  mockEvaluateBooleanFlag.mockReset();
  mockEvaluateBooleanFlag.mockResolvedValue(false); // default to live
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ENV_BACKUP[k] === undefined) delete env[k];
    else env[k] = ENV_BACKUP[k];
  }
});

describe('getFrontendMode', () => {
  it('defaults to "live" when flag is OFF', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    expect(await getFrontendMode()).toBe('live');
  });

  it('returns "fixtures" when flag is ON', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(true);
    expect(await getFrontendMode()).toBe('fixtures');
  });

  it('?fixtures=true overrides to "fixtures" when not in production', async () => {
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    env.NODE_ENV = 'development';
    const req = new Request('http://localhost:3000/api/v1/generate?fixtures=true');
    expect(await getFrontendMode(req)).toBe('fixtures');
  });

  it('?fixtures=true is IGNORED in production builds (T-7-09)', async () => {
    env.NODE_ENV = 'production';
    const req = new Request('https://mcpgen.dev/api/v1/generate?fixtures=true');
    expect(await getFrontendMode(req)).toBe('live');
    // Production hard-block must short-circuit BEFORE Flipt eval.
    expect(mockEvaluateBooleanFlag).not.toHaveBeenCalled();
  });

  it('flag=ON is IGNORED in production (WR-06 / T-7-15)', async () => {
    // Stray flag flip in a production deploy must NOT switch users onto the
    // shared fixture data path — that would be a cross-tenant data isolation
    // violation. Production must short-circuit before any Flipt eval.
    env.NODE_ENV = 'production';
    mockEvaluateBooleanFlag.mockResolvedValue(true);
    expect(await getFrontendMode()).toBe('live');
    const req = new Request('https://mcpgen.dev/api/v1/generate');
    expect(await getFrontendMode(req)).toBe('live');
    expect(mockEvaluateBooleanFlag).not.toHaveBeenCalled();
  });

  it('falls back to "live" when Flipt eval throws', async () => {
    // evaluateBooleanFlag wraps SDK errors and returns defaultValue (false).
    // Simulate by having the mock resolve to false (which is what
    // evaluateBooleanWithDefault does on SDK error).
    mockEvaluateBooleanFlag.mockResolvedValue(false);
    expect(await getFrontendMode()).toBe('live');
  });
});

describe('getBffUrl', () => {
  it('defaults to localhost wrangler dev port', () => {
    delete env.MCPGEN_BFF_URL;
    expect(getBffUrl()).toBe('http://localhost:8787/api/v1');
  });

  it('honors MCPGEN_BFF_URL override', () => {
    env.MCPGEN_BFF_URL = 'https://api.mcpgen.dev/api/v1';
    expect(getBffUrl()).toBe('https://api.mcpgen.dev/api/v1');
  });
});

describe('isFixturesAllowed (production guard)', () => {
  it('returns false in production', () => {
    env.NODE_ENV = 'production';
    expect(isFixturesAllowed()).toBe(false);
  });

  it('returns true in development', () => {
    env.NODE_ENV = 'development';
    expect(isFixturesAllowed()).toBe(true);
  });

  it('returns true in test', () => {
    env.NODE_ENV = 'test';
    expect(isFixturesAllowed()).toBe(true);
  });
});
