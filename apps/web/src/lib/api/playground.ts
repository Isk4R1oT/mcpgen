// apps/web/src/lib/api/playground.ts
//
// Phase 1 / Agent A5 — disabled-stub client for the (yet-to-exist) playground
// run-tool BFF endpoint. Mirrors the same pattern used by `admin.ts` and
// `marketplace.ts`: the schema is declared so screens can be type-safely wired
// today, but the function returns `flag_off_or_not_implemented` until the
// `ui_playground_run_tool_perm` flag flips ON and the backend lands.
//
// Once the BFF lands (REQ-001 in old SHARED-FILE-REQUESTS.md → POST
// /api/v1/playground/:id/invoke), swap the stub to a real `request<...>()`
// call and remove the `ENABLED = false` guard.
//
// References:
//   - .planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md § playground
//   - apps/web/src/lib/api/client-base.ts (Result + notImplementedResult)

import { z } from 'zod';

import { notImplementedResult, type Result } from './client-base.js';

// ─── Schemas ───────────────────────────────────────────────────────────────

export const PlaygroundRunRowSchema = z.object({
  amt: z.string(),
  date: z.string(),
});
export type PlaygroundRunRow = z.infer<typeof PlaygroundRunRowSchema>;

export const PlaygroundTraceSchema = z.object({
  n: z.number().int().nonnegative(),
  name: z.string(),
  in: z.number().int().nonnegative(),
  out: z.number().int().nonnegative(),
  lat: z.number().int().nonnegative(),
});
export type PlaygroundTrace = z.infer<typeof PlaygroundTraceSchema>;

export const PlaygroundRunResultSchema = z.object({
  text: z.string(),
  rows: z.array(PlaygroundRunRowSchema).optional(),
  totalAmount: z.string().optional(),
  trace: PlaygroundTraceSchema,
});
export type PlaygroundRunResult = z.infer<typeof PlaygroundRunResultSchema>;

export interface PlaygroundRunArgs {
  readonly jobId: string;
  readonly toolName: string;
  readonly prompt: string;
}

// ─── Functions ─────────────────────────────────────────────────────────────

// Default OFF per Phase 1 / A5 brief: `ui_playground_run_tool_perm`.
const ENABLED = false;

/**
 * Invoke a playground tool. Currently always returns
 * `flag_off_or_not_implemented` — the BFF endpoint is missing (REQ-001) and
 * the screen is required to render the canon "trace failed" branch when the
 * stub returns this error string.
 */
export async function runPlaygroundTool(
  _args: PlaygroundRunArgs,
): Promise<Result<PlaygroundRunResult>> {
  if (!ENABLED) return notImplementedResult<PlaygroundRunResult>();
  // When the BFF endpoint lands, swap to a real `request<...>()` call posting
  // to `/api/v1/playground/${jobId}/invoke` with `{ tool_name, prompt }`.
  return notImplementedResult<PlaygroundRunResult>();
}
