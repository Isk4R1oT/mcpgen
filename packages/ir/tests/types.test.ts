// Round-trip parse/reject tests for every top-level Zod schema in @mcpgen/ir.
// Establishes the contract that downstream plans (engine, runtime, fixtures)
// will validate against. Negative cases enforce architectural invariants:
//   - openWorldHint=true (Pass 4 invariant)
//   - tool name regex /^[a-z][a-z0-9_]{0,63}$/
//   - ToolDescription.purpose ≥ 20 chars
//   - parameter_overview length 50–400 chars

import { describe, expect, it } from 'vitest';

import {
  CompleteServerSpec,
  FinalTool,
  Pass0Output,
  Pass1Output,
  Pass2Output,
  Pass3Output,
  Pass4Output,
  Pass5Output,
  QualityReport,
  RawIR,
  ResponseConfig,
  RoutingRule,
  SmartIdSchema,
  ToolAnnotations,
  ToolDescription,
  WorkflowDef,
} from '../src/types.js';

const VALID_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true as const,
};

const VALID_DESCRIPTION = {
  purpose: 'Search Stripe charges by query string and return ranked smart-ID results.',
  when_to_use: ['User asks to find a charge by name, email, or last4 of card.'],
  limitations: ['Limited to 100 results per call; pagination via cursor.'],
  parameter_overview:
    'A single query parameter; no filtering — use list_objects(filter) for structured filters.',
};

const VALID_RESPONSE_CONFIG = {
  pagination: {
    style: 'cursor' as const,
    default_limit: 25,
    max_limit: 100,
  },
  field_filtering: {
    always_include: ['id', 'status'],
    opt_in: ['metadata'],
    always_exclude: ['raw_response'],
  },
  truncation: {
    threshold_tokens: 10000,
    guidance_template: 'Showing {N} of {Total} results. Refine query or use list_objects.',
  },
  has_response_format_param: false,
};

const VALID_FINAL_TOOL = {
  name: 'charges_search',
  type: 'universal' as const,
  description: VALID_DESCRIPTION,
  inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
  outputSchema: { type: 'object' },
  annotations: VALID_ANNOTATIONS,
  response_config: VALID_RESPONSE_CONFIG,
  source_endpoints: ['GET /v1/charges'],
};

describe('ToolAnnotations', () => {
  it('accepts a valid annotations object', () => {
    expect(() => ToolAnnotations.parse(VALID_ANNOTATIONS)).not.toThrow();
  });

  it('REJECTS openWorldHint=false (architectural invariant per Pass 4 design)', () => {
    expect(() => ToolAnnotations.parse({ ...VALID_ANNOTATIONS, openWorldHint: false })).toThrow();
  });

  it('rejects missing fields', () => {
    expect(() => ToolAnnotations.parse({ readOnlyHint: true })).toThrow();
  });
});

describe('ToolDescription', () => {
  it('accepts a valid description', () => {
    expect(() => ToolDescription.parse(VALID_DESCRIPTION)).not.toThrow();
  });

  it('REJECTS purpose < 20 chars', () => {
    expect(() => ToolDescription.parse({ ...VALID_DESCRIPTION, purpose: 'short' })).toThrow();
  });

  it('REJECTS empty when_to_use', () => {
    expect(() => ToolDescription.parse({ ...VALID_DESCRIPTION, when_to_use: [] })).toThrow();
  });

  it('REJECTS parameter_overview < 50 chars', () => {
    expect(() =>
      ToolDescription.parse({ ...VALID_DESCRIPTION, parameter_overview: 'too short' }),
    ).toThrow();
  });

  it('REJECTS parameter_overview > 400 chars', () => {
    expect(() =>
      ToolDescription.parse({ ...VALID_DESCRIPTION, parameter_overview: 'x'.repeat(401) }),
    ).toThrow();
  });

  it('accepts optional when_not_to_use and how_to_use', () => {
    expect(() =>
      ToolDescription.parse({
        ...VALID_DESCRIPTION,
        when_not_to_use: ['When you only know the charge ID — use fetch() instead.'],
        how_to_use: 'Provide a query string with at least 3 characters.',
      }),
    ).not.toThrow();
  });
});

describe('ResponseConfig', () => {
  it('accepts a valid config', () => {
    expect(() => ResponseConfig.parse(VALID_RESPONSE_CONFIG)).not.toThrow();
  });

  it('accepts null pagination + null field_filtering', () => {
    expect(() =>
      ResponseConfig.parse({
        pagination: null,
        field_filtering: null,
        truncation: VALID_RESPONSE_CONFIG.truncation,
        has_response_format_param: false,
      }),
    ).not.toThrow();
  });

  it('rejects unknown pagination style', () => {
    expect(() =>
      ResponseConfig.parse({
        ...VALID_RESPONSE_CONFIG,
        pagination: { style: 'magic', default_limit: 10, max_limit: 100 },
      }),
    ).toThrow();
  });
});

describe('SmartIdSchema', () => {
  it('accepts a valid smart-ID schema', () => {
    expect(() =>
      SmartIdSchema.parse({
        format: '{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}',
        types: ['object', 'collection', 'schema'],
        collections: ['Charge', 'Customer'],
      }),
    ).not.toThrow();
  });
});

describe('FinalTool', () => {
  it('accepts a valid tool', () => {
    expect(() => FinalTool.parse(VALID_FINAL_TOOL)).not.toThrow();
  });

  it('REJECTS uppercase letters in name', () => {
    expect(() => FinalTool.parse({ ...VALID_FINAL_TOOL, name: 'Customer_Search' })).toThrow();
  });

  it('REJECTS leading digit in name', () => {
    expect(() => FinalTool.parse({ ...VALID_FINAL_TOOL, name: '1_search' })).toThrow();
  });

  it('REJECTS spaces in name', () => {
    expect(() => FinalTool.parse({ ...VALID_FINAL_TOOL, name: 'charges search' })).toThrow();
  });

  it('REJECTS name > 64 chars', () => {
    expect(() => FinalTool.parse({ ...VALID_FINAL_TOOL, name: 'a' + 'b'.repeat(64) })).toThrow();
  });

  it('REJECTS unknown tool type', () => {
    expect(() =>
      FinalTool.parse({ ...VALID_FINAL_TOOL, type: 'invalid' as 'universal' }),
    ).toThrow();
  });

  it('infers a TS type matching the schema', () => {
    // Compile-time sanity: the inferred type must accept VALID_FINAL_TOOL.
    const parsed = FinalTool.parse(VALID_FINAL_TOOL);
    expect(parsed.name).toBe('charges_search');
    expect(parsed.annotations.openWorldHint).toBe(true);
  });
});

describe('RoutingRule', () => {
  it('accepts a valid routing rule', () => {
    expect(() =>
      RoutingRule.parse({
        universal_tool: 'search',
        target_endpoint: 'GET /v1/charges',
        params_mapping: { query: 'query' },
      }),
    ).not.toThrow();
  });

  it('rejects an unknown universal_tool name', () => {
    expect(() =>
      RoutingRule.parse({
        universal_tool: 'magic',
        target_endpoint: 'GET /v1/charges',
        params_mapping: {},
      }),
    ).toThrow();
  });
});

describe('WorkflowDef', () => {
  it('accepts a 2-step workflow', () => {
    expect(() =>
      WorkflowDef.parse({
        name: 'schedule_event',
        steps: [
          { endpoint: 'GET /v1/availability', description: 'Find slots' },
          { endpoint: 'POST /v1/events', description: 'Create event' },
        ],
        partial_failure_strategy: 'rollback',
      }),
    ).not.toThrow();
  });

  it('rejects a 1-step workflow (must be 2–5 steps)', () => {
    expect(() =>
      WorkflowDef.parse({
        name: 'one_step',
        steps: [{ endpoint: 'GET /x', description: 'x' }],
        partial_failure_strategy: 'rollback',
      }),
    ).toThrow();
  });
});

describe('RawIR', () => {
  it('accepts a minimal valid RawIR', () => {
    const sample = {
      spec_format: 'openapi-3.1' as const,
      spec_hash: 'a'.repeat(64),
      endpoints: [],
      schemas: {},
      security_schemes: {},
      dependency_graph: {},
    };
    expect(() => RawIR.parse(sample)).not.toThrow();
  });

  it('rejects malformed spec_hash (must be 64 hex chars)', () => {
    expect(() =>
      RawIR.parse({
        spec_format: 'openapi-3.1',
        spec_hash: 'short',
        endpoints: [],
        schemas: {},
        security_schemes: {},
        dependency_graph: {},
      }),
    ).toThrow();
  });
});

describe('Pass0–5 outputs', () => {
  it('Pass0Output round-trips', () => {
    const sample = {
      tool_plans: [
        {
          name: 'charges_create',
          category: 'crud' as const,
          source_endpoints: ['POST /v1/charges'],
          rationale: 'Top-importance write surface.',
        },
      ],
      dropped_endpoints: [],
      composite_candidates: [],
      auth_requirements: [
        { scheme: 'apiKey' as const, recommended_mode: 'passthrough' as const, notes: null },
      ],
      target_complexity: 'standard' as const,
    };
    expect(() => Pass0Output.parse(sample)).not.toThrow();
  });

  it('Pass1Output round-trips with Six-Tool Pattern coverage', () => {
    const sample = {
      tools: [
        {
          name: 'search',
          type: 'universal' as const,
          source_endpoints: ['GET /v1/charges/search'],
        },
      ],
      routing: {
        smart_id: {
          format: '{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}',
          types: ['object'],
          collections: ['Charge'],
        },
        rules: [
          {
            universal_tool: 'search' as const,
            target_endpoint: 'GET /v1/charges/search',
            params_mapping: { query: 'query' },
          },
        ],
      },
      workflows: [],
      coverage_pct: 100,
    };
    expect(() => Pass1Output.parse(sample)).not.toThrow();
  });

  it('Pass2Output round-trips', () => {
    expect(() =>
      Pass2Output.parse({
        descriptions: { charges_search: VALID_DESCRIPTION },
      }),
    ).not.toThrow();
  });

  it('Pass3Output round-trips', () => {
    expect(() =>
      Pass3Output.parse({
        input_schemas: { charges_search: { type: 'object' } },
      }),
    ).not.toThrow();
  });

  it('Pass4Output round-trips', () => {
    expect(() =>
      Pass4Output.parse({
        annotations: { charges_search: VALID_ANNOTATIONS },
        titles: { charges_search: 'Search Charges' },
      }),
    ).not.toThrow();
  });

  it('Pass5Output round-trips', () => {
    expect(() => Pass5Output.parse({ tools: [VALID_FINAL_TOOL] })).not.toThrow();
  });
});

describe('CompleteServerSpec + QualityReport', () => {
  it('CompleteServerSpec round-trips', () => {
    expect(() =>
      CompleteServerSpec.parse({
        server_name: 'stripe',
        spec_hash: 'b'.repeat(64),
        routing: {
          smart_id: {
            format: '{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}',
            types: ['object'],
            collections: ['Charge'],
          },
          rules: [],
        },
        tools: [VALID_FINAL_TOOL],
        workflows: [],
      }),
    ).not.toThrow();
  });

  it('QualityReport round-trips', () => {
    expect(() =>
      QualityReport.parse({
        spec_hash: 'c'.repeat(64),
        f1_static: {
          passed: true,
          ts_compile_errors: [],
          json_schema_errors: [],
          mcp_compliance_errors: [],
          secret_scan_findings: [],
          bundle_bytes: 700_000,
        },
        f2_smell: {
          tool_scores: [
            {
              tool_name: 'charges_search',
              components: [
                { component: 'purpose', score: 4.5 },
                { component: 'guidelines', score: 4.2 },
                { component: 'limitations', score: 4.0 },
                { component: 'parameter_doc', score: 4.3 },
                { component: 'examples', score: 1.0 },
                { component: 'length_completeness', score: 4.5 },
              ],
              average: 3.75,
            },
          ],
          overall_average: 3.75,
          passed: false,
        },
        f3_agent_eval: null,
        overall_score: 3.5,
        quality_badge: 'standard',
      }),
    ).not.toThrow();
  });
});
