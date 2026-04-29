// `POST /api/v1/generate` request/response + SSE event envelope (D-09 / D-10).

import { describe, expect, it } from 'vitest';

import {
  EngineCallbackEnvelope,
  GenerationApiRequest,
  GenerationApiResponse,
  GenerationErrorCode,
  GenerationSseEvent,
  GenerationStage,
  IDEMPOTENCY_KEY_HEADER,
  IdempotencyKeyHeaderValue,
  LAST_EVENT_ID_HEADER,
} from '../src/generation-api.js';

const VALID_ULID = '01HXP3J8Y0K9V8R7N6M5K4K3J2'; // 26 chars Crockford base32 (no I/L/O/U)
const VALID_JOB_ID = `gen_${VALID_ULID}`;

describe('GenerationStage enum', () => {
  it('accepts every documented stage', () => {
    for (const stage of ['A', 'B', 'C', 'D', 'E', 'F1', 'F2', 'F3', 'completed', 'failed']) {
      expect(() => GenerationStage.parse(stage)).not.toThrow();
    }
  });
});

describe('GenerationSseEvent', () => {
  const validEvent = {
    job_id: VALID_JOB_ID,
    event_id: VALID_ULID,
    stage: 'A' as const,
    status: 'started' as const,
  };

  it('accepts a valid event without partial_result/error', () => {
    expect(() => GenerationSseEvent.parse(validEvent)).not.toThrow();
  });

  it('accepts an event with partial_result', () => {
    expect(() =>
      GenerationSseEvent.parse({
        ...validEvent,
        partial_result: { tools_authored: 5 },
      }),
    ).not.toThrow();
  });

  it('REJECTS job_id without `gen_` prefix', () => {
    expect(() => GenerationSseEvent.parse({ ...validEvent, job_id: VALID_ULID })).toThrow();
  });

  it('REJECTS event_id with lowercase letters (ULID is uppercase)', () => {
    expect(() =>
      GenerationSseEvent.parse({ ...validEvent, event_id: VALID_ULID.toLowerCase() }),
    ).toThrow();
  });

  it('REJECTS unknown stage value', () => {
    expect(() => GenerationSseEvent.parse({ ...validEvent, stage: 'Z' as 'A' })).toThrow();
  });

  it('REJECTS status outside {started, completed, error}', () => {
    expect(() =>
      GenerationSseEvent.parse({ ...validEvent, status: 'pending' as 'started' }),
    ).toThrow();
  });

  it('accepts an error sub-object with retry_after_seconds (non-negative)', () => {
    expect(() =>
      GenerationSseEvent.parse({
        ...validEvent,
        status: 'error' as const,
        error: { code: 'rate_limited', message: 'Slow down', retry_after_seconds: 30 },
      }),
    ).not.toThrow();
  });

  it('REJECTS retry_after_seconds < 0', () => {
    expect(() =>
      GenerationSseEvent.parse({
        ...validEvent,
        status: 'error' as const,
        error: { code: 'rate_limited', message: '', retry_after_seconds: -1 },
      }),
    ).toThrow();
  });
});

describe('EngineCallbackEnvelope (engine -> BFF leg)', () => {
  it('accepts a valid envelope', () => {
    expect(() =>
      EngineCallbackEnvelope.parse({
        direction: 'engine_to_bff',
        event: {
          job_id: VALID_JOB_ID,
          event_id: VALID_ULID,
          stage: 'F2',
          status: 'completed',
        },
      }),
    ).not.toThrow();
  });

  it('REJECTS direction other than engine_to_bff', () => {
    expect(() =>
      EngineCallbackEnvelope.parse({
        direction: 'client_to_bff',
        event: {
          job_id: VALID_JOB_ID,
          event_id: VALID_ULID,
          stage: 'A',
          status: 'started',
        },
      }),
    ).toThrow();
  });
});

describe('GenerationApiRequest (POST /api/v1/generate body)', () => {
  it('accepts spec_url only', () => {
    expect(() =>
      GenerationApiRequest.parse({ spec_url: 'https://example.com/openapi.yaml' }),
    ).not.toThrow();
  });

  it('accepts spec_content only', () => {
    expect(() => GenerationApiRequest.parse({ spec_content: 'openapi: 3.1.0' })).not.toThrow();
  });

  it('REJECTS both spec_url AND spec_content', () => {
    expect(() =>
      GenerationApiRequest.parse({
        spec_url: 'https://example.com/openapi.yaml',
        spec_content: 'openapi: 3.1.0',
      }),
    ).toThrow();
  });

  it('REJECTS neither', () => {
    expect(() => GenerationApiRequest.parse({})).toThrow();
  });

  it('accepts options with target_complexity + explicit_includes + max_tools_override', () => {
    expect(() =>
      GenerationApiRequest.parse({
        spec_url: 'https://example.com/openapi.yaml',
        options: {
          target_complexity: 'comprehensive',
          explicit_includes: ['POST /v1/charges/{id}/capture'],
          max_tools_override: 80,
        },
      }),
    ).not.toThrow();
  });

  it('REJECTS max_tools_override out of bounds', () => {
    expect(() =>
      GenerationApiRequest.parse({
        spec_url: 'https://example.com/openapi.yaml',
        options: { target_complexity: 'standard', max_tools_override: 200 },
      }),
    ).toThrow();
  });
});

describe('GenerationApiResponse', () => {
  it('accepts a valid 202 body', () => {
    expect(() =>
      GenerationApiResponse.parse({
        job_id: VALID_JOB_ID,
        sse_url: 'https://api.mcpgen.dev/api/v1/jobs/abc/events',
      }),
    ).not.toThrow();
  });

  it('REJECTS a job_id without `gen_` prefix', () => {
    expect(() =>
      GenerationApiResponse.parse({
        job_id: VALID_ULID,
        sse_url: 'https://example.com',
      }),
    ).toThrow();
  });
});

describe('IdempotencyKeyHeaderValue', () => {
  it('accepts a 26-char ULID with `gen_` prefix', () => {
    expect(() => IdempotencyKeyHeaderValue.parse(VALID_JOB_ID)).not.toThrow();
  });

  it('REJECTS a 25-char body', () => {
    expect(() => IdempotencyKeyHeaderValue.parse(`gen_${VALID_ULID.slice(1)}`)).toThrow();
  });

  it('REJECTS a 27-char body', () => {
    expect(() => IdempotencyKeyHeaderValue.parse(`gen_${VALID_ULID}A`)).toThrow();
  });
});

describe('GenerationErrorCode enum', () => {
  it('accepts every documented error code', () => {
    for (const code of [
      'invalid_spec',
      'spec_too_large',
      'spec_endpoint_count_too_large',
      'rate_limited',
      'cost_cap_exceeded',
      'idempotency_key_replay',
      'internal_error',
    ]) {
      expect(() => GenerationErrorCode.parse(code)).not.toThrow();
    }
  });
});

describe('Header constants', () => {
  it('exports the canonical Idempotency-Key header name', () => {
    expect(IDEMPOTENCY_KEY_HEADER).toBe('Idempotency-Key');
  });

  it('exports the canonical Last-Event-ID header name (D-09 SSE resume)', () => {
    expect(LAST_EVENT_ID_HEADER).toBe('Last-Event-ID');
  });
});

// ──────────────── Plan 04-14 — GenerationOptions dev_local field ─────────────

import { GenerationOptions } from '../src/generation-api.js';

describe('GenerationOptions dev_local field (Plan 04-14 D-3)', () => {
  it('parses dev_local: true', () => {
    const result = GenerationOptions.parse({ dev_local: true });
    expect(result.dev_local).toBe(true);
  });

  it('defaults dev_local to false when field is absent', () => {
    const result = GenerationOptions.parse({});
    expect(result.dev_local).toBe(false);
  });

  it('REJECTS non-boolean dev_local', () => {
    const result = GenerationOptions.safeParse({ dev_local: 'yes' });
    expect(result.success).toBe(false);
  });
});
