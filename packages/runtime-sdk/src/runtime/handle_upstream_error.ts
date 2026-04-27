// packages/runtime-sdk/src/runtime/handle_upstream_error.ts
//
// Phase 6 — base handleUpstreamError. Returns a Response whose body teaches
// the calling agent the next-step recovery action (Anthropic principle —
// error templates are teaching moments, not opaque info dumps).
//
// Reference: docs/mcpgen-stage-e-design.md §6 (error templates teach next step).

import type { ErrorTeachingContext } from '../types.js';

function defaultSuggestion(toolName: string, status: number): string {
  if (status === 401) return 'verify your credentials are valid for this upstream API';
  if (status === 403) return 'the credential is valid but lacks permission for this resource';
  if (status === 404) return `try search() first to find a valid id for ${toolName}`;
  if (status === 429) return 'rate-limited by upstream; respect Retry-After header and batch operations';
  if (status >= 500) return 'upstream server error; retry with exponential backoff';
  return 'see error_class for details and try again with corrected input';
}

export function handleUpstreamError(
  err: unknown,
  ctx: ErrorTeachingContext,
): Response {
  const status = ctx.upstream_status;
  const teach = ctx.suggestion ?? defaultSuggestion(ctx.tool_name, status);
  const body = {
    error: 'upstream_error',
    tool_name: ctx.tool_name,
    status,
    suggestion: teach,
    detail: err instanceof Error ? err.message : String(err),
  };
  return new Response(JSON.stringify(body), {
    status: status > 0 ? status : 502,
    headers: { 'content-type': 'application/json' },
  });
}
