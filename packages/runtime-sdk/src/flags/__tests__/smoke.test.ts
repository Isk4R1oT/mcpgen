// Smoke test for the Flipt client factory. Hits the local Flipt server
// at http://localhost:8090 (default) — skipped via `it.skipIf` when not
// running locally with `docker compose up flipt + pnpm flags:bootstrap`.
//
// To run: docker compose up -d flipt && pnpm --filter @mcpgen/feature-flags
//         bootstrap && pnpm --filter @mcpgen/runtime test
import { describe, it, expect } from 'vitest';
import {
  getFlipt,
  evaluateBooleanWithDefault,
  serviceEntityId,
  _resetFliptForTests,
} from '../index.js';

const FLIPT_URL = process.env.FLIPT_URL ?? 'http://localhost:8090';

async function fliptIsLive(): Promise<boolean> {
  try {
    const res = await fetch(`${FLIPT_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

describe('flags client (smoke)', () => {
  it('serviceEntityId formats correctly', () => {
    expect(serviceEntityId('dispatch-worker')).toBe('service:dispatch-worker');
  });

  it('evaluates a real flag against a live Flipt', async () => {
    if (!(await fliptIsLive())) return;
    _resetFliptForTests();
    const client = await getFlipt({
      url: FLIPT_URL,
      namespace: 'default',
      environment: 'default',
      clientToken: undefined,
    });
    const enabled = evaluateBooleanWithDefault(
      client,
      'runtime_local_compute_routing_ops',
      'test-user',
      {},
      false,
    );
    // Per default/features.yaml — this flag is enabled=true.
    expect(enabled).toBe(true);
  });

  it('returns defaultValue when flag does not exist', async () => {
    if (!(await fliptIsLive())) {
      return;
    }
    _resetFliptForTests();
    const client = await getFlipt({
      url: FLIPT_URL,
      namespace: 'default',
      environment: 'default',
      clientToken: undefined,
    });
    const result = evaluateBooleanWithDefault(
      client,
      'nonexistent_flag_kill',
      'test-user',
      {},
      true,
    );
    expect(result).toBe(true);
  });
});
