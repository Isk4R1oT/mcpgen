// apps/dispatch/src/middleware/capabilityGate.ts
//
// Phase 6 (per D-11 / pitfall #4) — MCP protocolVersion negotiator.
// Strips outputSchema from tools/list and structuredContent from tools/call
// for clients with protocolVersion < 2025-06-18. Single rewrite point.
// Source: RESEARCH Example 6 verbatim.

import type { MiddlewareHandler } from 'hono';

const sessionVersions = new Map<string, string>();    // sessionId -> protocolVersion
const SUPPORTS_OUTPUT_SCHEMA = '2025-06-18';

interface JsonRpcEnvelope {
  readonly result?: unknown;
  readonly [key: string]: unknown;
}
interface ToolsListResult {
  readonly tools: Record<string, unknown>[];
  readonly [key: string]: unknown;
}
interface ToolsCallResult {
  readonly content?: unknown;
  readonly structuredContent?: unknown;
  readonly [key: string]: unknown;
}

function downgradeForLegacy(json: unknown, method: string | undefined): unknown {
  if (!json || typeof json !== 'object' || !('result' in json)) return json;
  const env = json as JsonRpcEnvelope;
  const r = env.result;

  if (method === 'tools/list' && r && typeof r === 'object' && 'tools' in r && Array.isArray((r as ToolsListResult).tools)) {
    const tools = (r as ToolsListResult).tools.map((t) => {
      const { outputSchema: _outputSchema, ...rest } = t as Record<string, unknown> & { outputSchema?: unknown };
      return rest;
    });
    return { ...env, result: { ...(r as object), tools } };
  }
  if (method === 'tools/call' && r && typeof r === 'object' && 'structuredContent' in r) {
    const { structuredContent: _structuredContent, ...rest } = r as ToolsCallResult & Record<string, unknown>;
    return { ...env, result: rest };
  }
  return json;
}

export const capabilityGate: MiddlewareHandler = async (c, next) => {
  const sid = c.req.header('Mcp-Session-Id');
  const cloned = c.req.raw.clone();
  let body: { method?: string; params?: { protocolVersion?: string } } = {};
  try { body = (await cloned.json()) as typeof body; } catch { /* not JSON-RPC */ }

  let effectiveSid = sid;
  if (body?.method === 'initialize' && body.params?.protocolVersion) {
    if (!effectiveSid) {
      effectiveSid = crypto.randomUUID();
      c.header('Mcp-Session-Id', effectiveSid);
    }
    sessionVersions.set(effectiveSid, body.params.protocolVersion);
  }
  await next();

  const pv = effectiveSid ? sessionVersions.get(effectiveSid) : undefined;
  if (pv && pv < SUPPORTS_OUTPUT_SCHEMA) {
    const text = await c.res.clone().text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { return; }
    const downgraded = downgradeForLegacy(json, body?.method);
    c.res = new Response(JSON.stringify(downgraded), {
      status: c.res.status,
      headers: c.res.headers,
    });
  }
};

// Test-only: clear the in-memory session map between vitest runs.
export function _resetSessionVersionsForTest(): void {
  sessionVersions.clear();
}
