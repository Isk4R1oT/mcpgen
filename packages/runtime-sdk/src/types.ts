// packages/runtime-sdk/src/types.ts
//
// Option types referenced by the Runtime interface in ./index.ts.
// Phase 1 = signatures only. Phase 6 (RUN-01..05) implements the bodies.
//
// References:
//   - docs/mcpgen-stage-e-design.md §3.3 (runtime/infra templates)
//   - docs/mcpgen-stage-e-design.md §5 (3 auth modes: passthrough/stored/oauth)
//   - docs/mcpgen-stage-e-design.md §6 (smart_id runtime)
//   - docs/mcpgen-stage-e-design.md §7 (pagination/truncation runtime)

// ─────────────────────────────────────────────────────────────────────────────
// Smart IDs (Pass 1 design — `{server}:{type}:{collection}:{identifier}`).
// ─────────────────────────────────────────────────────────────────────────────
export interface SmartId {
  server: string; // typically "{tenant_short_id}-{spec_slug}"
  type: 'object' | 'collection' | 'schema';
  collection: string;
  identifier: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-universal-tool option bags (Pass 1 routing).
// All fields are READONLY because runtime calls must not mutate caller state.
// ─────────────────────────────────────────────────────────────────────────────
export interface RouteSearchOpts {
  limit?: number;
  cursor?: string;
}

export interface RouteFetchOpts {
  include?: ReadonlyArray<string>;
}

export interface ListCollectionsOpts {
  pattern?: string;
  include_schema?: boolean;
}

export interface ListObjectsFilter {
  property: string;
  operator: string;
  value: unknown;
}

export interface ListObjectsOpts {
  collection: string;
  properties?: ReadonlyArray<string>;
  filter?: ListObjectsFilter;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

export interface UpsertOpts {
  collection: string;
  data: unknown;
  id?: string;
  ids?: ReadonlyArray<string>;
}

export interface DeleteOpts {
  type: 'object' | 'objects' | 'collection';
  id?: string;
  ids?: ReadonlyArray<string>;
  collection?: string;
  confirm: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Response shaping config (Pass 5 — field filtering).
// ─────────────────────────────────────────────────────────────────────────────
export interface FieldFilteringConfig {
  always_include: ReadonlyArray<string>;
  opt_in: ReadonlyArray<string>;
  always_exclude: ReadonlyArray<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error teaching context (per Stage E error templates — agents see these).
// ─────────────────────────────────────────────────────────────────────────────
export interface ErrorTeachingContext {
  tool_name: string;
  upstream_status: number;
  suggestion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth modes (Stage E §5). Discriminated union on `mode`.
// 3 modes:
//   - passthrough: client supplies upstream credential per-request
//   - stored:      AES-256-GCM-encrypted credential at rest in CF KV
//   - oauth:       full OAuth 2.1 flow (PKCE mandatory) via @cloudflare/workers-oauth-provider
// ─────────────────────────────────────────────────────────────────────────────
export interface OAuthUpstreamConfig {
  authorization_endpoint: string;
  token_endpoint: string;
  scopes: ReadonlyArray<string>;
  pkce: true;
}

export interface PassthroughAuth {
  mode: 'passthrough';
}
export interface StoredAuth {
  mode: 'stored';
}
export interface OAuthAuth {
  mode: 'oauth';
  upstream: OAuthUpstreamConfig;
}
export type AuthMode = PassthroughAuth | StoredAuth | OAuthAuth;
