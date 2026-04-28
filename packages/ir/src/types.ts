// packages/ir/src/types.ts
// Source of truth for the Universal IR (D-01).
// Pydantic 2 models in packages/ir/python/types.py are GENERATED from this file
// via packages/ir/scripts/codegen.ts (D-02). Do NOT hand-edit the Python mirror.
//
// References:
//   - docs/mcpgen-generation-engine-v2.md §5.2 (canonical IR shape per pass)
//   - docs/mcpgen-pass-1-design.md (Six-Tool Pattern; FinalTool taxonomy)
//   - docs/mcpgen-pass-4-design.md (4 boolean hints; openWorldHint=true invariant)
//   - docs/mcpgen-pass-5-design.md (ResponseConfig: pagination/field_filtering/truncation)
//   - docs/mcpgen-stage-f-design.md (QualityReport, quality badges)
//
// Naming: every public Zod export is a PascalCase const + an inferred type alias of the
// same name (TS allows a value and a type with the same name to coexist).

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Tool name shape (matches FinalTool.name regex; mirrored in
// packages/contracts/src/idempotency.ts as TOOL_NAME_REGEX). Every consumer
// MUST import the regex from idempotency.ts, NOT redeclare locally.
// ─────────────────────────────────────────────────────────────────────────────
export const TOOL_NAME_REGEX = /^[a-z][a-z0-9_]{0,63}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 4 — ToolAnnotations (4 MCP boolean hints)
// Architectural invariant: openWorldHint is ALWAYS true (we wrap external REST APIs).
// ─────────────────────────────────────────────────────────────────────────────
export const ToolAnnotations = z.object({
  readOnlyHint: z.boolean(),
  destructiveHint: z.boolean(),
  idempotentHint: z.boolean(),
  openWorldHint: z.literal(true),
});
export type ToolAnnotations = z.infer<typeof ToolAnnotations>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 — ToolDescription (5 of 6 paper rubric components in v0; Examples deferred)
// `description_hash` (Phase 3 D-14 / D-40) is a sha256 of the rendered description
// markdown — strictly-additive optional field used by the Pass 2 diff helper to
// surface description drift between regenerations of the same spec (Pitfall #7).
// ─────────────────────────────────────────────────────────────────────────────
export const ToolDescription = z.object({
  purpose: z.string().min(20),
  when_to_use: z.array(z.string()).min(1),
  when_not_to_use: z.array(z.string()).optional(),
  how_to_use: z.string().optional(),
  limitations: z.array(z.string()),
  parameter_overview: z.string().min(50).max(400),
  description_hash: z.string().optional(),
});
export type ToolDescription = z.infer<typeof ToolDescription>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 5 — ResponseConfig (pagination, field filtering, truncation, response_format)
// ─────────────────────────────────────────────────────────────────────────────
export const PaginationConfig = z.object({
  style: z.enum(['cursor', 'offset', 'page-number', 'none']),
  default_limit: z.number().int().positive(),
  max_limit: z.number().int().positive(),
});
export type PaginationConfig = z.infer<typeof PaginationConfig>;

export const FieldFilteringConfig = z.object({
  always_include: z.array(z.string()),
  opt_in: z.array(z.string()),
  always_exclude: z.array(z.string()),
});
export type FieldFilteringConfig = z.infer<typeof FieldFilteringConfig>;

export const TruncationConfig = z.object({
  threshold_tokens: z.number().int().positive(),
  guidance_template: z.string(),
});
export type TruncationConfig = z.infer<typeof TruncationConfig>;

export const ResponseConfig = z.object({
  pagination: PaginationConfig.nullable(),
  field_filtering: FieldFilteringConfig.nullable(),
  truncation: TruncationConfig,
  has_response_format_param: z.boolean(),
});
export type ResponseConfig = z.infer<typeof ResponseConfig>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — SmartIdSchema (per-server smart-ID format declaration)
// Format string e.g.: "{tenant_short_id}-{spec_slug}:{type}:{collection}:{identifier}"
// ─────────────────────────────────────────────────────────────────────────────
export const SmartIdSchema = z.object({
  format: z.string(),
  types: z.array(z.string()),
  collections: z.array(z.string()),
});
export type SmartIdSchema = z.infer<typeof SmartIdSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — RoutingRule (universal-tool → upstream-endpoint mapping)
// ─────────────────────────────────────────────────────────────────────────────
export const RoutingRule = z.object({
  universal_tool: z.enum([
    'search',
    'fetch',
    'list_collections',
    'list_objects',
    'upsert',
    'delete',
  ]),
  target_endpoint: z.string(),
  params_mapping: z.record(z.string(), z.string()),
});
export type RoutingRule = z.infer<typeof RoutingRule>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — WorkflowDef (multi-step coherent task)
// ─────────────────────────────────────────────────────────────────────────────
export const WorkflowStep = z.object({
  endpoint: z.string(),
  description: z.string(),
});
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const WorkflowDef = z.object({
  name: z.string().regex(TOOL_NAME_REGEX),
  steps: z.array(WorkflowStep).min(2).max(5),
  partial_failure_strategy: z.enum(['rollback', 'continue', 'report']),
});
export type WorkflowDef = z.infer<typeof WorkflowDef>;

// ─────────────────────────────────────────────────────────────────────────────
// FinalTool — Pass 5 output (the shape that gets generated into TS code).
// Combines: name + type + description (Pass 2) + inputSchema (Pass 3) +
// outputSchema (Pass 5) + annotations (Pass 4) + response_config (Pass 5) + provenance.
// ─────────────────────────────────────────────────────────────────────────────
export const FinalTool = z.object({
  name: z.string().regex(TOOL_NAME_REGEX),
  type: z.enum(['universal', 'action', 'workflow', 'specialized']),
  description: ToolDescription,
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  annotations: ToolAnnotations,
  response_config: ResponseConfig,
  source_endpoints: z.array(z.string()),
});
export type FinalTool = z.infer<typeof FinalTool>;

// ─────────────────────────────────────────────────────────────────────────────
// Stage A — RawIR (deterministic parser output)
// ─────────────────────────────────────────────────────────────────────────────
export const RawEndpoint = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']),
  path: z.string(),
  operation_id: z.string().nullable(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
  parameters: z.array(z.record(z.string(), z.unknown())),
  request_body: z.record(z.string(), z.unknown()).nullable(),
  responses: z.record(z.string(), z.unknown()),
  tags: z.array(z.string()),
  deprecated: z.boolean(),
});
export type RawEndpoint = z.infer<typeof RawEndpoint>;

export const SecurityScheme = z.object({
  type: z.enum(['apiKey', 'http', 'oauth2', 'openIdConnect', 'mutualTLS']),
  scheme: z.string().nullable(),
  in: z.enum(['header', 'query', 'cookie']).nullable(),
  name: z.string().nullable(),
  flows: z.record(z.string(), z.unknown()).nullable(),
});
export type SecurityScheme = z.infer<typeof SecurityScheme>;

export const RawIR = z.object({
  spec_format: z.enum(['openapi-3.0', 'openapi-3.1', 'graphql', 'postman']),
  spec_hash: z.string().regex(/^[a-f0-9]{64}$/),
  endpoints: z.array(RawEndpoint),
  schemas: z.record(z.string(), z.unknown()),
  security_schemes: z.record(z.string(), SecurityScheme),
  dependency_graph: z.record(z.string(), z.array(z.string())),
});
export type RawIR = z.infer<typeof RawIR>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 0 — ToolPlan + Pass0Output
// ─────────────────────────────────────────────────────────────────────────────
export const DropReason = z.enum([
  'DEPRECATED',
  'INTERNAL',
  'HEALTH_CHECK',
  'WEBHOOK',
  'AUTH_FLOW',
  'REDUNDANT',
  'LOW_VALUE',
  'USER_EXCLUDED',
  'EXCEEDS_CAP',
  'METHOD_NOT_SUPPORTED',
]);
export type DropReason = z.infer<typeof DropReason>;

export const DroppedEndpoint = z.object({
  method: z.string(),
  path: z.string(),
  reason: DropReason,
  can_user_override: z.boolean(),
});
export type DroppedEndpoint = z.infer<typeof DroppedEndpoint>;

export const ToolPlan = z.object({
  name: z.string().regex(TOOL_NAME_REGEX),
  category: z.enum(['search', 'crud', 'action', 'workflow', 'specialized']),
  source_endpoints: z.array(z.string()).min(1),
  rationale: z.string(),
});
export type ToolPlan = z.infer<typeof ToolPlan>;

export const AuthRequirement = z.object({
  scheme: z.enum(['apiKey', 'oauth2', 'http_basic', 'http_bearer', 'aws_signature', 'none']),
  recommended_mode: z.enum(['passthrough', 'stored', 'oauth_flow']),
  notes: z.string().nullable(),
});
export type AuthRequirement = z.infer<typeof AuthRequirement>;

export const CompositeCandidate = z.object({
  name: z.string(),
  steps: z.array(z.string()).min(2).max(5),
  rationale: z.string(),
});
export type CompositeCandidate = z.infer<typeof CompositeCandidate>;

// `auth_requirements` is a per-endpoint dict (D-21) so hybrid auth schemes
// (e.g., GitHub Bearer + Apps OAuth) emit multiple entries per endpoint
// (Pitfall #6). Keys are endpoint IDs in the form "<METHOD> <path>" (e.g.,
// "GET /repos/{owner}/{repo}/issues"). `prompt_injection_warnings` (D-51)
// surfaces heuristic matches for known PI patterns inside spec descriptions.
export const Pass0Output = z.object({
  tool_plans: z.array(ToolPlan),
  dropped_endpoints: z.array(DroppedEndpoint),
  composite_candidates: z.array(CompositeCandidate),
  auth_requirements: z.record(z.string(), z.array(AuthRequirement)),
  target_complexity: z.enum(['minimal', 'standard', 'comprehensive']),
  prompt_injection_warnings: z.array(z.string()),
});
export type Pass0Output = z.infer<typeof Pass0Output>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 1 — ToolTaxonomy / Pass1Output (Six-Tool Pattern + extras)
// ─────────────────────────────────────────────────────────────────────────────
export const ToolTaxonomyEntry = z.object({
  name: z.string().regex(TOOL_NAME_REGEX),
  type: z.enum(['universal', 'action', 'workflow', 'specialized']),
  source_endpoints: z.array(z.string()),
});
export type ToolTaxonomyEntry = z.infer<typeof ToolTaxonomyEntry>;

export const RoutingConfig = z.object({
  smart_id: SmartIdSchema,
  rules: z.array(RoutingRule),
});
export type RoutingConfig = z.infer<typeof RoutingConfig>;

// Pass 1 — SampleInvocation + CoverageProof (per-endpoint coverage proof, D-33)
// Pitfall #3 mitigation: every Pass 0 endpoint must round-trip to a syntactically
// valid upstream URL through `urllib.parse.urlparse` / `new URL(...)`. Phase 2
// validates URL shape only; Stage E (Phase 4) executes a dry-run against an
// HTTP mock to prove the routing rule is end-to-end correct.
export const SampleInvocation = z.object({
  url: z.string().url(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()),
});
export type SampleInvocation = z.infer<typeof SampleInvocation>;

export const CoverageProof = z.object({
  endpoint_id: z.string(),
  mapped_to_universal_tool: z.string(),
  sample_invocation: SampleInvocation,
});
export type CoverageProof = z.infer<typeof CoverageProof>;

export const Pass1Output = z.object({
  tools: z.array(ToolTaxonomyEntry),
  routing: RoutingConfig,
  workflows: z.array(WorkflowDef),
  coverage_pct: z.number().min(0).max(100),
  coverage_proof: z.array(CoverageProof),
});
export type Pass1Output = z.infer<typeof Pass1Output>;

export const ToolTaxonomy = Pass1Output;
export type ToolTaxonomy = Pass1Output;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 2 — Pass2Output (descriptions per tool name)
// ─────────────────────────────────────────────────────────────────────────────
export const Pass2Output = z.object({
  descriptions: z.record(z.string(), ToolDescription),
});
export type Pass2Output = z.infer<typeof Pass2Output>;

export const AuthoredTools = Pass2Output;
export type AuthoredTools = Pass2Output;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 3 — Pass3Output (input JSON Schemas per tool name)
// ─────────────────────────────────────────────────────────────────────────────
export const Pass3Output = z.object({
  input_schemas: z.record(z.string(), z.record(z.string(), z.unknown())),
});
export type Pass3Output = z.infer<typeof Pass3Output>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 4 — Pass4Output (annotations + titles per tool name)
// ─────────────────────────────────────────────────────────────────────────────
export const Pass4Output = z.object({
  annotations: z.record(z.string(), ToolAnnotations),
  titles: z.record(z.string(), z.string()),
});
export type Pass4Output = z.infer<typeof Pass4Output>;

// ─────────────────────────────────────────────────────────────────────────────
// Pass 5 — Pass5Output (final tools)
// ─────────────────────────────────────────────────────────────────────────────
export const Pass5Output = z.object({
  tools: z.array(FinalTool),
});
export type Pass5Output = z.infer<typeof Pass5Output>;

export const CompleteServerSpec = z.object({
  server_name: z.string(),
  spec_hash: z.string().regex(/^[a-f0-9]{64}$/),
  routing: RoutingConfig,
  tools: z.array(FinalTool),
  workflows: z.array(WorkflowDef),
});
export type CompleteServerSpec = z.infer<typeof CompleteServerSpec>;

// ─────────────────────────────────────────────────────────────────────────────
// Stage F — QualityReport (F1 / F2 / F3 + per-tool scores + overall + badge)
// ─────────────────────────────────────────────────────────────────────────────
export const QualityBadge = z.enum(['premium', 'verified', 'standard', 'needs_review']);
export type QualityBadge = z.infer<typeof QualityBadge>;

export const F1StaticReport = z.object({
  passed: z.boolean(),
  ts_compile_errors: z.array(z.string()),
  json_schema_errors: z.array(z.string()),
  mcp_compliance_errors: z.array(z.string()),
  secret_scan_findings: z.array(z.string()),
  bundle_bytes: z.number().int().nonnegative(),
});
export type F1StaticReport = z.infer<typeof F1StaticReport>;

export const RubricComponentScore = z.object({
  component: z.enum([
    'purpose',
    'guidelines',
    'limitations',
    'parameter_doc',
    'examples',
    'length_completeness',
  ]),
  score: z.number().min(0).max(5),
});
export type RubricComponentScore = z.infer<typeof RubricComponentScore>;

export const F2ToolSmellScore = z.object({
  tool_name: z.string().regex(TOOL_NAME_REGEX),
  components: z.array(RubricComponentScore),
  average: z.number().min(0).max(5),
});
export type F2ToolSmellScore = z.infer<typeof F2ToolSmellScore>;

export const F2SmellReport = z.object({
  tool_scores: z.array(F2ToolSmellScore),
  overall_average: z.number().min(0).max(5),
  passed: z.boolean(),
});
export type F2SmellReport = z.infer<typeof F2SmellReport>;

export const F3GoldenTaskResult = z.object({
  task_id: z.string(),
  passed: z.boolean(),
  judge_task_completion: z.number().min(0).max(10),
  judge_grounding: z.number().min(0).max(10),
  turns_used: z.number().int().nonnegative(),
});
export type F3GoldenTaskResult = z.infer<typeof F3GoldenTaskResult>;

export const F3AgentEvalReport = z.object({
  results: z.array(F3GoldenTaskResult),
  pass_rate: z.number().min(0).max(1),
  passed: z.boolean(),
});
export type F3AgentEvalReport = z.infer<typeof F3AgentEvalReport>;

export const QualityReport = z.object({
  spec_hash: z.string().regex(/^[a-f0-9]{64}$/),
  f1_static: F1StaticReport,
  f2_smell: F2SmellReport,
  f3_agent_eval: F3AgentEvalReport.nullable(),
  overall_score: z.number().min(0).max(5),
  quality_badge: QualityBadge,
});
export type QualityReport = z.infer<typeof QualityReport>;
