// apps/web/tests/unit/app/generate/jobId/preview/preview-derive.test.ts
//
// M-4 Agent 2 — unit tests for the preview-screen prop derivation.
// Verifies that hardcoded literals (PREVIEW_CATEGORIES,
// EXCLUDED_ENDPOINTS_INIT, naiveTokens=14200, baseOptTokens) have been
// replaced by computed values driven from real artefacts.

import { describe, expect, it } from 'vitest';

import { stripe } from '@mcpgen/engine-fixtures';
import type { FinalTool } from '@mcpgen/ir';

import {
  deriveCategories,
  deriveSample,
  deriveTokenBudgets,
} from '@/app/generate/[jobId]/preview/_preview-derive';

const fakeTool = (type: FinalTool['type'], name: string): FinalTool =>
  ({
    name,
    type,
    description: {
      purpose: 'p',
      guidelines: { when_to_use: ['x'] },
      limitations: 'l',
      parameter_overview: 'po',
    },
    inputSchema: {},
    outputSchema: {},
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      title: 't',
    },
    response_config: {
      pagination: null,
      field_filtering: null,
      truncation: { threshold_tokens: 5000, message_template: 't' },
      has_response_format_param: false,
    },
    source_endpoints: [],
  }) as unknown as FinalTool;

describe('deriveSample', () => {
  it('returns zeros when no artefacts (no FALLBACK_SAMPLE leak)', () => {
    const s = deriveSample(undefined, undefined, undefined);
    expect(s.endpoints).toBe(0);
    expect(s.tools).toBe(0);
    expect(s.save).toBe(0);
    expect(s.id).toBe('mcp');
    expect(s.name).toBe('mcp server');
  });

  it('computes save % from endpoints vs tools', () => {
    const tools = [fakeTool('universal', 'search'), fakeTool('universal', 'fetch')];
    const s = deriveSample(100, 'github api', tools);
    expect(s.endpoints).toBe(100);
    expect(s.tools).toBe(2);
    expect(s.save).toBe(98); // (100 - 2) / 100 = 98%
    expect(s.id).toBe('github');
    expect(s.name).toBe('github api');
  });

  it('clamps save to 0 when tools >= endpoints', () => {
    const tools = [fakeTool('universal', 'a'), fakeTool('universal', 'b')];
    const s = deriveSample(2, 'tiny', tools);
    expect(s.save).toBe(0);
  });

  it('does not surface "lumen payments" when artefacts are absent', () => {
    // I-2 invariant — the previous FALLBACK_SAMPLE leaked the "lumen
    // payments" mock into production. Make sure we never produce it.
    const s = deriveSample(undefined, undefined, undefined);
    expect(s.name.toLowerCase()).not.toContain('lumen');
    expect(s.id.toLowerCase()).not.toContain('lumen');
  });

  it('works on a real engine fixture', () => {
    const s = deriveSample(50, 'stripe', stripe.finalTools);
    expect(s.tools).toBe(stripe.finalTools.length);
    expect(s.endpoints).toBe(50);
    expect(s.id).toBe('stripe');
  });
});

describe('deriveCategories', () => {
  it('returns empty when no tools', () => {
    expect(deriveCategories(undefined)).toEqual([]);
    expect(deriveCategories([])).toEqual([]);
  });

  it('buckets universal/action/workflow/specialized correctly', () => {
    const tools = [
      fakeTool('universal', 'search'),
      fakeTool('universal', 'fetch'),
      fakeTool('universal', 'list_objects'),
      fakeTool('action', 'charges_capture'),
      fakeTool('action', 'charges_refund'),
      fakeTool('workflow', 'schedule_event'),
    ];
    const cats = deriveCategories(tools);
    const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
    expect(byId.universal?.count).toBe(3);
    expect(byId.action?.count).toBe(2);
    expect(byId.workflow?.count).toBe(1);
    expect(byId.specialized).toBeUndefined();
  });

  it('marks specialized as rare and off by default', () => {
    const tools = [fakeTool('specialized', 'odd_endpoint')];
    const cats = deriveCategories(tools);
    expect(cats[0]?.rare).toBe(true);
    expect(cats[0]?.on).toBe(false);
  });

  it('drops empty buckets', () => {
    const tools = [fakeTool('action', 'a')];
    const cats = deriveCategories(tools);
    expect(cats.length).toBe(1);
    expect(cats[0]?.id).toBe('action');
  });
});

describe('deriveTokenBudgets', () => {
  it('returns zeros when no artefacts', () => {
    expect(deriveTokenBudgets(undefined, undefined)).toEqual({ naive: 0, opt: 0 });
  });

  it('computes naive baseline from endpoint count', () => {
    const r = deriveTokenBudgets(50, [
      fakeTool('universal', 'a'),
      fakeTool('universal', 'b'),
    ]);
    expect(r.naive).toBe(50 * 250);
    expect(r.opt).toBe(2 * 350);
  });

  it('does not return the old hardcoded 14200/2800 literals', () => {
    const r = deriveTokenBudgets(10, [fakeTool('universal', 'a')]);
    expect(r.naive).not.toBe(14200);
    expect(r.opt).not.toBe(2800);
    expect(r.opt).not.toBe(3400);
  });
});
