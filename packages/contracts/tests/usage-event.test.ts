// UsageEvent shape + cross-package regex alignment with @mcpgen/ir's FinalTool.name.

import { describe, expect, it } from 'vitest';

import { FinalTool, TOOL_NAME_REGEX as IR_TOOL_NAME_REGEX } from '@mcpgen/ir';

import { TOOL_NAME_REGEX } from '../src/idempotency.js';
import {
  StripeMetersDimension,
  UsageEvent,
  UsageEventQueuePayload,
  UsageEventStatus,
} from '../src/usage-event.js';

const VALID_UUID = 'a1b2c3d4-e5f6-4789-abcd-ef0123456789';
const VALID_KEY = `${VALID_UUID}_2026-04-26T15:00_charges_create`;

const VALID_USAGE_EVENT = {
  idempotency_key: VALID_KEY,
  time: '2026-04-26T15:00:42.123Z',
  deployment_id: VALID_UUID,
  tool_name: 'charges_create',
  tokens_in: 120,
  tokens_out: 800,
  upstream_latency_ms: 42,
  worker_cpu_ms: 7,
  status: 'ok' as const,
  client_type: 'claude_desktop' as const,
  error_class: null,
};

describe('UsageEvent', () => {
  it('accepts a valid event', () => {
    expect(() => UsageEvent.parse(VALID_USAGE_EVENT)).not.toThrow();
  });

  it('accepts null nullable fields', () => {
    expect(() =>
      UsageEvent.parse({
        ...VALID_USAGE_EVENT,
        tokens_in: null,
        tokens_out: null,
        upstream_latency_ms: null,
        worker_cpu_ms: null,
        client_type: null,
        error_class: null,
      }),
    ).not.toThrow();
  });

  it('REJECTS malformed idempotency_key', () => {
    expect(() =>
      UsageEvent.parse({ ...VALID_USAGE_EVENT, idempotency_key: 'wrong-shape' }),
    ).toThrow();
  });

  it('REJECTS uppercase letters in tool_name', () => {
    expect(() => UsageEvent.parse({ ...VALID_USAGE_EVENT, tool_name: 'Charges_Create' })).toThrow();
  });

  it('REJECTS status outside {ok, error, rate_limited}', () => {
    expect(() => UsageEvent.parse({ ...VALID_USAGE_EVENT, status: 'pending' as 'ok' })).toThrow();
  });

  it('REJECTS unknown client_type', () => {
    expect(() =>
      UsageEvent.parse({ ...VALID_USAGE_EVENT, client_type: 'firefox' as 'cursor' }),
    ).toThrow();
  });

  it('REJECTS negative tokens_in', () => {
    expect(() => UsageEvent.parse({ ...VALID_USAGE_EVENT, tokens_in: -1 })).toThrow();
  });

  it('REJECTS non-ISO time', () => {
    expect(() => UsageEvent.parse({ ...VALID_USAGE_EVENT, time: 'yesterday' })).toThrow();
  });
});

describe('UsageEventStatus / StripeMetersDimension enums', () => {
  it('UsageEventStatus accepts all 3 documented statuses', () => {
    for (const s of ['ok', 'error', 'rate_limited']) {
      expect(() => UsageEventStatus.parse(s)).not.toThrow();
    }
  });

  it('StripeMetersDimension accepts all 5 documented dimensions', () => {
    for (const d of [
      'tool_calls',
      'tokens_in',
      'tokens_out',
      'upstream_latency_ms',
      'worker_cpu_ms',
    ]) {
      expect(() => StripeMetersDimension.parse(d)).not.toThrow();
    }
  });
});

describe('UsageEventQueuePayload', () => {
  it('accepts a valid wrapped payload', () => {
    expect(() =>
      UsageEventQueuePayload.parse({
        event: VALID_USAGE_EVENT,
        attempt: 0,
        enqueued_at: '2026-04-26T15:00:43.000Z',
      }),
    ).not.toThrow();
  });

  it('REJECTS negative attempt count', () => {
    expect(() =>
      UsageEventQueuePayload.parse({
        event: VALID_USAGE_EVENT,
        attempt: -1,
        enqueued_at: '2026-04-26T15:00:43.000Z',
      }),
    ).toThrow();
  });
});

describe('Cross-package regex alignment (T-1 boundary defense)', () => {
  // The tool_name regex MUST match FinalTool.name regex from @mcpgen/ir.
  // If they ever diverge, billing rows can't be linked back to tool definitions
  // — silent data corruption. We assert on the exported constant AND on the
  // regex actually compiled into the IR Zod schema (introspection).

  it('@mcpgen/contracts TOOL_NAME_REGEX === @mcpgen/ir TOOL_NAME_REGEX (constant)', () => {
    expect(TOOL_NAME_REGEX.source).toBe(IR_TOOL_NAME_REGEX.source);
    expect(TOOL_NAME_REGEX.flags).toBe(IR_TOOL_NAME_REGEX.flags);
  });

  it('FinalTool.name in @mcpgen/ir is bound to the same regex', () => {
    // Zod 4 stores regex checks as $ZodCheckRegex with `_zod.def.pattern`.
    // We extract the live regex and compare with our constant.
    const finalToolShape = FinalTool.shape;
    const nameSchema = finalToolShape.name as unknown as {
      _zod: { def: { checks: Array<{ _zod: { def: { pattern?: RegExp } } }> } };
    };
    const checks = nameSchema._zod.def.checks ?? [];
    const regexPatterns = checks
      .map((c) => c._zod?.def?.pattern)
      .filter((p): p is RegExp => p instanceof RegExp);
    expect(regexPatterns.length).toBeGreaterThan(0);
    const ftRegex = regexPatterns[0]!;
    expect(ftRegex.source).toBe(TOOL_NAME_REGEX.source);
  });
});
