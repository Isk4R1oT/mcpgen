// apps/cli/src/init/options.ts
//
// Typed Commander option surface + ULID idempotency-key generation.
//
// References:
// - 02-CONTEXT.md D-24 (--include / --exclude flags) + D-25 (--complexity)
//   + D-48 (Idempotency-Key gen_<ULID>)
// - packages/contracts/src/idempotency.ts (FROZEN GEN_ID_REGEX)

import { ulid } from 'ulid';

export type ComplexityLevel = 'minimal' | 'standard' | 'comprehensive';

export interface CliInitOptions {
  outputDir: string;
  complexity: ComplexityLevel;
  include: string[];
  exclude: string[];
  /** Plan 04-14 D-3: enable dev-local build mode (substitutes tenant placeholder). */
  devLocal: boolean;
}

export interface EngineGenerationRequest {
  spec_url?: string;
  spec_content?: string;
  options: {
    target_complexity: ComplexityLevel;
    explicit_includes: string[];
    explicit_excludes: string[];
    /** Plan 04-14 D-3: dev-local build mode flag. */
    dev_local: boolean;
  };
}

/**
 * Generate a per-call idempotency key matching the frozen Phase-1
 * GEN_ID_REGEX (`^gen_<26-char Crockford ULID>$`).
 *
 * Each invocation returns a fresh key — the engine's L1 cache deduplicates
 * by spec hash, not by idempotency key. The key is for crash-resume only
 * (Phase-1 D-11 / D-48).
 */
export function generateIdempotencyKey(): string {
  return `gen_${ulid()}`;
}

/**
 * Build the engine API request body. The CLI passes `spec_url` for HTTP
 * URLs; for local file paths or stdin, the caller reads the contents and
 * passes them via `specContent`.
 */
export function buildEngineRequestBody(
  specUrl: string | null,
  specContent: string | null,
  opts: CliInitOptions,
): EngineGenerationRequest {
  if ((specUrl === null) === (specContent === null)) {
    throw new Error('exactly one of specUrl or specContent must be set');
  }
  const body: EngineGenerationRequest = {
    options: {
      target_complexity: opts.complexity,
      explicit_includes: opts.include,
      explicit_excludes: opts.exclude,
      dev_local: opts.devLocal,
    },
  };
  if (specUrl !== null) body.spec_url = specUrl;
  if (specContent !== null) body.spec_content = specContent;
  return body;
}

const VALID_COMPLEXITY: ReadonlySet<string> = new Set([
  'minimal',
  'standard',
  'comprehensive',
]);

/**
 * Validate the `--complexity` flag value. Commander does not type-narrow
 * its `option(<level>)` argument by default, so we narrow here.
 */
export function parseComplexity(raw: string): ComplexityLevel {
  if (!VALID_COMPLEXITY.has(raw)) {
    throw new Error(
      `--complexity must be one of: minimal | standard | comprehensive (got ${JSON.stringify(raw)})`,
    );
  }
  return raw as ComplexityLevel;
}
