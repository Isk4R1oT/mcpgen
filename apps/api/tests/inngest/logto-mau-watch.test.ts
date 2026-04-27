// apps/api/tests/inngest/logto-mau-watch.test.ts
//
// CTRL-02 (Pitfall #17 subset) / D-05 / T-8-13: logto-mau-watch-v1 contract
// tests via static-source assertions.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logtoMauWatch } from '../../src/inngest/functions/logto-mau-watch.js';
import { INNGEST_FUNCTION_IDS } from '@mcpgen/contracts/inngest-functions';

const HERE = dirname(fileURLToPath(import.meta.url));
const FN_SRC = readFileSync(
  resolve(HERE, '../../src/inngest/functions/logto-mau-watch.ts'),
  'utf-8',
);
const ADMIN_SRC = readFileSync(
  resolve(HERE, '../../src/lib/logto-admin.ts'),
  'utf-8',
);

describe('logto-mau-watch-v1', () => {
  it('uses the stable function ID from the register', () => {
    const id =
      (logtoMauWatch as unknown as { opts?: { id: string } }).opts?.id ??
      (logtoMauWatch as unknown as { id: () => string }).id();
    expect(id).toBe(INNGEST_FUNCTION_IDS.LOGTO_MAU_WATCH);
    expect(id).toBe('logto-mau-watch-v1');
  });

  it('source uses INNGEST_FUNCTION_IDS register (not hard-coded string)', () => {
    expect(FN_SRC).toContain('INNGEST_FUNCTION_IDS.LOGTO_MAU_WATCH');
  });

  it('configured with daily 04:00 UTC cron trigger', () => {
    expect(FN_SRC).toContain("cron: '0 4 * * *'");
  });

  it('threshold MAU_ALERT_THRESHOLD = 4000 (75% of 5K Logto Cloud free-tier cap, Pitfall #17)', () => {
    expect(FN_SRC).toContain('MAU_ALERT_THRESHOLD = 4000');
    expect(FN_SRC).toContain('mau > MAU_ALERT_THRESHOLD');
  });

  it('reads MAU via getLogtoMau adapter (delegated to lib/logto-admin.ts)', () => {
    expect(FN_SRC).toContain("from '../../lib/logto-admin.js'");
    expect(FN_SRC).toContain('getLogtoMau(adminEnv)');
  });

  it('persists mau_log row idempotent on sample_date (PK 23505 swallow on re-run)', () => {
    expect(FN_SRC).toContain('mau_log');
    expect(FN_SRC).toContain("'23505'");
  });

  it('emits ops alert via sendMauAlert when mau > threshold', () => {
    expect(FN_SRC).toContain('sendMauAlert');
    expect(FN_SRC).toContain("from '../../lib/email/resend-client.js'");
  });
});

describe('lib/logto-admin.ts (T-8-13)', () => {
  it('derives MGMT API audience from LOGTO_ENDPOINT host (NOT BFF M2M resource indicator)', () => {
    expect(ADMIN_SRC).toContain(
      'const audience = `https://${new URL(env.LOGTO_ENDPOINT).host}/api`',
    );
    // Sanity: must NOT use the BFF resource indicator constant
    expect(ADMIN_SRC).not.toContain('LOGTO_M2M_RESOURCE_INDICATOR');
  });

  it('fetches /api/dashboard/widgets/active-user-count with Bearer token', () => {
    expect(ADMIN_SRC).toContain('/api/dashboard/widgets/active-user-count');
    expect(ADMIN_SRC).toContain('Authorization: `Bearer ${token}`');
  });

  it('caches the MGMT API token with a 60s safety margin', () => {
    expect(ADMIN_SRC).toContain('cachedMgmtToken');
    expect(ADMIN_SRC).toContain('expires_in - 60');
  });

  it('uses btoa (Bun + Workers compatible — NOT Buffer.from)', () => {
    expect(ADMIN_SRC).toContain('btoa(');
    expect(ADMIN_SRC).not.toContain('Buffer.from(');
  });
});
