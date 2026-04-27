// packages/runtime-sdk/src/index.ts
//
// Frozen interface for tenant Workers (FND-06).
// Phase 1 = signatures only. Phase 6 (RUN-01..05) implements the bodies.
// Phase 4 (Stage E codegen) emits Workers that import these. Phase 5
// (apps/dispatch-sample) hand-codes against this interface as the reference
// shape for the Phase 4 generator.
//
// MCP SDK pin: ^1.29.0 (D-04). Stage E codegen templates and apps/dispatch-sample
// MUST also pin to ^1.x to keep the surface area consistent across local +
// generated code.
//
// References:
//   - docs/mcpgen-stage-e-design.md §3.3 (runtime/infra templates)
//   - docs/mcpgen-stage-e-design.md §5 (3 auth modes)
//   - docs/mcpgen-stage-e-design.md §6 (smart_id runtime)
//   - docs/mcpgen-stage-e-design.md §7 (pagination/truncation runtime)
//   - .planning/phases/01-foundation/01-PATTERNS.md "packages/runtime-sdk/src/index.ts"
//   - .planning/phases/06-runtime-plane/06-CONTEXT.md D-06 / D-07 (Phase-6 bodies + smart-ID single source of truth)

import type { UsageEvent } from '@mcpgen/contracts';
import type { ResponseConfig } from '@mcpgen/ir';

// Types referenced by the Runtime interface below. The same names are
// re-exported in a single statement at the bottom of this file so consumers
// can `import { Runtime, AuthMode, SmartId, ... } from '@mcpgen/runtime'`
// without going through './types' directly.
import type {
  DeleteOpts,
  ErrorTeachingContext,
  FieldFilteringConfig,
  ListCollectionsOpts,
  ListObjectsOpts,
  RouteFetchOpts,
  RouteSearchOpts,
  SmartId,
  UpsertOpts,
} from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// RuntimeContext — passed into every tool handler. Carries upstream credential
// + deployment ID + the usage-event emitter.
// ─────────────────────────────────────────────────────────────────────────────
export interface RuntimeContext {
  readonly upstreamCredential: string;
  readonly deploymentId: string;
  emitUsageEvent(event: UsageEvent): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime — the core interface every tenant Worker consumes.
// 11 methods: 2 smart-ID utilities + 6 universal-tool routes + 3 response shapers.
// FROZEN signature — DO NOT change. CI runs `pnpm typecheck` against this.
// Any change is a chore(contracts):-class change with paired docs/decisions/ entry.
// ─────────────────────────────────────────────────────────────────────────────
export interface Runtime {
  // Smart-ID utilities (Pass 1 design)
  parseSmartId(id: string): SmartId;
  makeSmartId(parts: SmartId): string;

  // Six-Tool Pattern routes (Pass 1 design)
  routeSearch(query: string, opts: RouteSearchOpts): Promise<unknown>;
  routeFetch(id: string, opts: RouteFetchOpts): Promise<unknown>;
  routeListCollections(opts: ListCollectionsOpts): Promise<unknown>;
  routeListObjects(opts: ListObjectsOpts): Promise<unknown>;
  routeUpsert(opts: UpsertOpts): Promise<unknown>;
  routeDelete(opts: DeleteOpts): Promise<unknown>;

  // Response shaping (Pass 5 design)
  shapeResponse(raw: unknown, config: ResponseConfig): unknown;
  applyFieldFilter(raw: unknown, filter: FieldFilteringConfig): unknown;
  handleUpstreamError(err: unknown, ctx: ErrorTeachingContext): Response;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — REAL Runtime factory.
// The 11 method bodies live in src/runtime/*; this file only composes them.
// Phase-1 throw bodies are GONE — every method returns a real value.
// ─────────────────────────────────────────────────────────────────────────────
import { applyFieldFilter } from './runtime/apply_field_filter.js';
import { handleUpstreamError } from './runtime/handle_upstream_error.js';
import { routeDelete } from './runtime/routes/delete.js';
import { routeFetch } from './runtime/routes/fetch.js';
import { routeListCollections } from './runtime/routes/list_collections.js';
import { routeListObjects } from './runtime/routes/list_objects.js';
import { routeSearch } from './runtime/routes/search.js';
import { routeUpsert } from './runtime/routes/upsert.js';
import { shapeResponse } from './runtime/shape_response.js';
import { SMART_ID_REGEX, makeSmartId, parseSmartId } from './runtime/smart_id.js';

export function createRuntime(): Runtime {
  return {
    parseSmartId,
    makeSmartId,
    routeSearch,
    routeFetch,
    routeListCollections,
    routeListObjects,
    routeUpsert,
    routeDelete,
    shapeResponse,
    applyFieldFilter,
    handleUpstreamError,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// createStubRuntime — Phase-6 backward-compat alias kept for apps/dispatch-sample's
// existing import (line 21). The Phase-1 throw bodies have been replaced by
// createRuntime(); the symbol stays bound to the real factory so existing imports
// keep working without churn. Wave-2 not-stubbed.test.ts asserts no method throws
// the old `/Phase 1/` error.
// ─────────────────────────────────────────────────────────────────────────────
export function createStubRuntime(): Runtime {
  return createRuntime();
}

// ─────────────────────────────────────────────────────────────────────────────
// Public re-exports — single import surface for consumers.
// ─────────────────────────────────────────────────────────────────────────────
export { SMART_ID_REGEX, makeSmartId, parseSmartId };
export { hostHeaderValidation } from './runtime/host-header-validation.js';
export { drainPending, waitUntil } from './runtime/wait_until.js';

export type {
  AuthMode,
  DeleteOpts,
  ErrorTeachingContext,
  FieldFilteringConfig,
  ListCollectionsOpts,
  ListObjectsFilter,
  ListObjectsOpts,
  OAuthAuth,
  OAuthUpstreamConfig,
  PassthroughAuth,
  RouteFetchOpts,
  RouteSearchOpts,
  SmartId,
  StoredAuth,
  UpsertOpts,
} from './types.js';
