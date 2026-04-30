// apps/cli/src/init/options.ts
//
// Typed Commander option surface + ULID idempotency-key generation +
// Stage F (Phase 5) flag wiring (`--f3` / `--sandbox-creds` / `--strict`).
//
// References:
// - 02-CONTEXT.md D-24 (--include / --exclude flags) + D-25 (--complexity)
//   + D-48 (Idempotency-Key gen_<ULID>)
// - 05-CONTEXT.md D-39 (CLI flags `--f3` / `--sandbox-creds` / `--strict`)
// - packages/contracts/src/idempotency.ts (FROZEN GEN_ID_REGEX)

import { existsSync, readFileSync } from 'node:fs';

import type { Command } from 'commander';
import { ulid } from 'ulid';
import { parse as parseYaml } from 'yaml';

export type ComplexityLevel = 'minimal' | 'standard' | 'comprehensive';

export interface CliInitOptions {
  outputDir: string;
  complexity: ComplexityLevel;
  include: string[];
  exclude: string[];
  /** Plan 04-14 D-3: enable dev-local build mode (substitutes tenant placeholder). */
  devLocal: boolean;
  /** Plan 05-09 / 05-CONTEXT D-39: opt-in to F3 agent eval. Default false. */
  f3Enabled?: boolean;
  /**
   * Plan 05-09 / 05-CONTEXT D-39: parsed sandbox credentials. Only set when
   * the user passed `--sandbox-creds <path>` AND the file parsed cleanly.
   * Empty/undefined → engine sees no `sandbox_credentials` field at all
   * (falls back to mocked F3).
   */
  sandboxCredentials?: Record<string, string>;
  /**
   * Plan 05-09 / 05-CONTEXT D-39: CI-mode flag. When true, the CLI exits
   * non-zero on F1 fail / F2 < threshold / F3 < threshold. Thresholds come
   * from `LAUNCH_CRITERIA` (Pitfall #29 invariant — never hardcoded here).
   */
  strict?: boolean;
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
  /**
   * Plan 05-09 / 05-CONTEXT D-35: Stage F controls. Strictly-additive —
   * Phase 1-4 engines ignore unknown body fields, but `f3_enabled=false` is
   * always sent so older engines never auto-trigger F3 by accident.
   */
  f3_enabled?: boolean;
  /** Plan 05-09: never persisted server-side; never logged client-side. */
  sandbox_credentials?: Record<string, string>;
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
  // Plan 05-09 / 05-CONTEXT D-35: forward Stage F controls.
  // `f3_enabled` is always sent (default false) so the engine never has to
  // disambiguate "client did not opt in" vs "client is older than Phase 5".
  body.f3_enabled = opts.f3Enabled === true;
  if (
    opts.sandboxCredentials !== undefined
    && Object.keys(opts.sandboxCredentials).length > 0
  ) {
    body.sandbox_credentials = opts.sandboxCredentials;
  }
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

// ─────────────────────────────────────────────────────────────────────────
// Plan 05-09 / 05-CONTEXT D-39 — Stage F flags
// ─────────────────────────────────────────────────────────────────────────

/**
 * Common raw-credential prefixes. We refuse `--sandbox-creds <raw>` so the
 * raw secret never lands in shell history (D-39 invariant + threat T-5-39).
 *
 * Detection is conservative on purpose — false-positives (rejecting a path
 * that genuinely starts with one of these prefixes) are acceptable; the
 * operator can rename the file.
 */
const RAW_CREDENTIAL_PREFIXES: ReadonlyArray<string> = [
  'sk_',
  'pk_',
  'rk_',
  'ghp_',
  'gho_',
  'ghs_',
  'github_pat_',
  'xoxb-',
  'xoxp-',
  'AKIA',
  'Bearer ',
  'bearer ',
];

function looksLikeRawCredential(value: string): boolean {
  for (const prefix of RAW_CREDENTIAL_PREFIXES) {
    if (value.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Parse a `--sandbox-creds <path>` YAML/.env file into a flat
 * `Record<string, string>` ready for the engine request body.
 *
 * Behavior (D-39):
 *   - rejects raw credentials passed directly (sk_xxx, ghp_yyy, Bearer zzz)
 *     with an explicit "never via shell history" error message
 *   - validates the path exists; clear error otherwise
 *   - sniffs file extension: `.yaml` / `.yml` → YAML object; otherwise
 *     KEY=VALUE .env-style
 *   - YAML must be a key-value object (not array / scalar)
 *
 * The returned object is consumed verbatim by `buildEngineRequestBody` —
 * no further transformation. Caller is responsible for never logging it.
 */
export function loadSandboxCredentials(path: string): Record<string, string> {
  if (looksLikeRawCredential(path)) {
    throw new Error(
      'Refusing to accept raw credential as --sandbox-creds value. '
        + 'Pass a file path (e.g., --sandbox-creds ~/.mcpgen/sandbox-creds.yaml). '
        + 'See CONTEXT D-39: never via shell history.',
    );
  }
  if (!existsSync(path)) {
    throw new Error(`--sandbox-creds file not found: ${path}`);
  }
  const content = readFileSync(path, 'utf-8');
  if (path.endsWith('.yaml') || path.endsWith('.yml')) {
    const parsed = parseYaml(content);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        `--sandbox-creds YAML must be a key-value object: ${path}`,
      );
    }
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Coerce numbers/booleans to strings; reject nested objects.
      if (v === null || typeof v === 'object') {
        throw new Error(
          `--sandbox-creds YAML value for ${k!} must be a scalar (got ${typeof v})`,
        );
      }
      result[k] = String(v);
    }
    return result;
  }
  // .env-style: KEY=VALUE per non-empty non-comment line.
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return result;
}

/**
 * Register the Stage F (Phase 5) flag surface on a Commander command.
 *
 * Extracted into a helper so unit tests can wire the flags onto a fresh
 * Commander instance without depending on the rest of `registerInitCommand`.
 *
 * Flags (D-39):
 *   - `--f3` — opt into F3 agent eval (default off; engine still
 *     auto-triggers if F2 < threshold or σ < 0.4)
 *   - `--sandbox-creds <path>` — path to YAML/.env file with sandbox
 *     credentials. NEVER takes raw credentials directly.
 *   - `--strict` — exit non-zero on F1 fail / F2 < threshold / F3 <
 *     threshold (CI-friendly). Thresholds source from LAUNCH_CRITERIA.
 */
export function registerStageFOptions(cmd: Command): Command {
  return cmd
    .option(
      '--f3',
      'Run F3 agent evaluation (default off; auto-triggered if F2 fails)',
      false,
    )
    .option(
      '--sandbox-creds <path>',
      'Path to YAML/.env file with sandbox credentials (NEVER pass raw credentials)',
    )
    .option(
      '--strict',
      'Exit non-zero on F1 fail / F2 < threshold / F3 < threshold (CI-friendly)',
      false,
    );
}
