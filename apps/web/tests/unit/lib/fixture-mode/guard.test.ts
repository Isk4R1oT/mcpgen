// Plan 07-03 — Vitest unit tests for fixture-mode guard + env router.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getBffUrl, getFrontendMode } from '@/lib/fixture-mode';
import { isFixturesAllowed } from '@/lib/fixture-mode/guard';

// process.env types treat NODE_ENV as readonly under @types/node 22; use a
// generic Record indirection so we can mutate it for the duration of each test.
const env = process.env as Record<string, string | undefined>;
const ENV_BACKUP: Record<string, string | undefined> = {};
const ENV_KEYS = ['MCPGEN_FRONTEND_MODE', 'MCPGEN_BFF_URL', 'NODE_ENV'] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) ENV_BACKUP[k] = env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (ENV_BACKUP[k] === undefined) delete env[k];
    else env[k] = ENV_BACKUP[k];
  }
});

describe('getFrontendMode', () => {
  it('defaults to "live" when env var unset', () => {
    delete env.MCPGEN_FRONTEND_MODE;
    expect(getFrontendMode()).toBe('live');
  });

  it('returns "fixtures" when env var is "fixtures"', () => {
    env.MCPGEN_FRONTEND_MODE = 'fixtures';
    expect(getFrontendMode()).toBe('fixtures');
  });

  it('?fixtures=true overrides to "fixtures" when not in production', () => {
    delete env.MCPGEN_FRONTEND_MODE;
    env.NODE_ENV = 'development';
    const req = new Request('http://localhost:3000/api/v1/generate?fixtures=true');
    expect(getFrontendMode(req)).toBe('fixtures');
  });

  it('?fixtures=true is IGNORED in production builds (T-7-09)', () => {
    delete env.MCPGEN_FRONTEND_MODE;
    env.NODE_ENV = 'production';
    const req = new Request('https://mcpgen.dev/api/v1/generate?fixtures=true');
    expect(getFrontendMode(req)).toBe('live');
  });

  it('MCPGEN_FRONTEND_MODE=fixtures env var is IGNORED in production (WR-06 / T-7-15)', () => {
    // Stray env-var leak into a production deploy must NOT switch users
    // onto the shared fixture data path — that would be a cross-tenant
    // data isolation violation.
    env.NODE_ENV = 'production';
    env.MCPGEN_FRONTEND_MODE = 'fixtures';
    expect(getFrontendMode()).toBe('live');
    const req = new Request('https://mcpgen.dev/api/v1/generate');
    expect(getFrontendMode(req)).toBe('live');
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
