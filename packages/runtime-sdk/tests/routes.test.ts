// packages/runtime-sdk/tests/routes.test.ts
//
// Phase 6 Wave 2 — base route stubs return a structured envelope including
// `note: "base_runtime_stage_e_overrides_per_routing_rule"`. Phase-4 codegen
// overrides each method per the per-tool RoutingRule before bundling.

import { describe, expect, it } from 'vitest';

import { createRuntime } from '../src/index.js';

const NOTE = 'base_runtime_stage_e_overrides_per_routing_rule';

describe('Base universal-tool routes — Stage E overrides', () => {
  const runtime = createRuntime();

  it('routeSearch returns the deferred-to-Stage-E envelope', async () => {
    const out = (await runtime.routeSearch('hello', { limit: 5 })) as {
      note: string;
      query: string;
    };
    expect(out.note).toBe(NOTE);
    expect(out.query).toBe('hello');
  });

  it('routeFetch returns the deferred-to-Stage-E envelope', async () => {
    const out = (await runtime.routeFetch('alice:object:Charge:ch_x', {})) as {
      note: string;
      id: string;
    };
    expect(out.note).toBe(NOTE);
    expect(out.id).toBe('alice:object:Charge:ch_x');
  });

  it('routeListCollections returns the deferred-to-Stage-E envelope', async () => {
    const out = (await runtime.routeListCollections({})) as { note: string };
    expect(out.note).toBe(NOTE);
  });

  it('routeListObjects returns the deferred-to-Stage-E envelope', async () => {
    const out = (await runtime.routeListObjects({ collection: 'Charge' })) as {
      note: string;
    };
    expect(out.note).toBe(NOTE);
  });

  it('routeUpsert returns the deferred-to-Stage-E envelope', async () => {
    const out = (await runtime.routeUpsert({ collection: 'Charge', data: {} })) as {
      note: string;
    };
    expect(out.note).toBe(NOTE);
  });

  it('routeDelete returns the deferred-to-Stage-E envelope', async () => {
    const out = (await runtime.routeDelete({ type: 'object', confirm: true })) as {
      note: string;
    };
    expect(out.note).toBe(NOTE);
  });
});

describe('Response shapers + error teaching', () => {
  const runtime = createRuntime();

  it('shapeResponse pass-through returns input unchanged', () => {
    const raw = { foo: 1, bar: 'baz' };
    const out = runtime.shapeResponse(raw, {
      pagination: null,
      field_filtering: null,
      truncation: { threshold_tokens: 100, guidance_template: '' },
      has_response_format_param: false,
    });
    expect(out).toBe(raw);
  });

  it('applyFieldFilter strips always_exclude keys recursively', () => {
    const raw = {
      id: 'x',
      secret: 'shhh',
      nested: { id: 'n', secret: 'leak' },
    };
    const out = runtime.applyFieldFilter(raw, {
      always_include: [],
      opt_in: [],
      always_exclude: ['secret'],
    }) as { id: string; nested: { id: string; secret?: string } };
    expect(out.id).toBe('x');
    expect((out as { secret?: string }).secret).toBeUndefined();
    expect(out.nested.id).toBe('n');
    expect(out.nested.secret).toBeUndefined();
  });

  it('handleUpstreamError teaches a 401 response', async () => {
    const res = runtime.handleUpstreamError(new Error('bad creds'), {
      tool_name: 'charges_fetch',
      upstream_status: 401,
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { suggestion: string; tool_name: string };
    expect(body.tool_name).toBe('charges_fetch');
    expect(body.suggestion).toMatch(/credentials/);
  });

  it('handleUpstreamError teaches a 404 referencing the tool name', async () => {
    const res = runtime.handleUpstreamError({}, {
      tool_name: 'customers_search',
      upstream_status: 404,
    });
    const body = (await res.json()) as { suggestion: string };
    expect(body.suggestion).toMatch(/search\(\) first/);
    expect(body.suggestion).toMatch(/customers_search/);
  });

  it('handleUpstreamError defaults to 502 when status is 0', async () => {
    const res = runtime.handleUpstreamError(new Error('network'), {
      tool_name: 'x',
      upstream_status: 0,
    });
    expect(res.status).toBe(502);
  });

  it('handleUpstreamError honours an explicit suggestion', async () => {
    const res = runtime.handleUpstreamError(new Error('boom'), {
      tool_name: 'x',
      upstream_status: 500,
      suggestion: 'try again later, the upstream is experiencing high load',
    });
    const body = (await res.json()) as { suggestion: string };
    expect(body.suggestion).toBe('try again later, the upstream is experiencing high load');
  });
});
