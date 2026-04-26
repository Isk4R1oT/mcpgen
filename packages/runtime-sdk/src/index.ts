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
// createStubRuntime — Phase-1 placeholder factory. Every method throws.
// Used for IDE autocomplete, compile-time integration checks, and Phase 4
// codegen template smoke tests. Phase 6 replaces this with real implementations
// (RUN-01 = parseSmartId/makeSmartId; RUN-02 = routes; RUN-03 = response
// shapers; RUN-04 = error teaching; RUN-05 = usage emit).
// ─────────────────────────────────────────────────────────────────────────────
export function createStubRuntime(): Runtime {
  const notImpl = (method: string): never => {
    throw new Error(
      `Runtime.${method}() is an interface-only stub in Phase 1; implementation lands in Phase 6 (RUN-01..05).`,
    );
  };

  return {
    parseSmartId: () => notImpl('parseSmartId'),
    makeSmartId: () => notImpl('makeSmartId'),
    routeSearch: () => notImpl('routeSearch'),
    routeFetch: () => notImpl('routeFetch'),
    routeListCollections: () => notImpl('routeListCollections'),
    routeListObjects: () => notImpl('routeListObjects'),
    routeUpsert: () => notImpl('routeUpsert'),
    routeDelete: () => notImpl('routeDelete'),
    shapeResponse: () => notImpl('shapeResponse'),
    applyFieldFilter: () => notImpl('applyFieldFilter'),
    handleUpstreamError: () => notImpl('handleUpstreamError'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public type re-exports — single import surface for consumers.
// (`export * from './types.js'` would also work; explicit list reads better
// in IDE autocomplete and makes the "frozen" nature of the surface visible.)
// ─────────────────────────────────────────────────────────────────────────────
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
