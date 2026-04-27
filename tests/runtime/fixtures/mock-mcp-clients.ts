// tests/runtime/fixtures/mock-mcp-clients.ts
//
// Phase 6 Wave 0 fixture — three MCP client protocolVersion values used by
// capability-gating test (Wave 1) + dispatch-sample E2E (Wave 2).
//
//   - 2025-06-18: latest spec; outputSchema + structuredContent supported
//   - 2025-03-26: prior spec; supports Mcp-Session-Id but no outputSchema
//   - 2024-11-05: legacy spec; no outputSchema, no structuredContent
//
// Per CONTEXT D-11, dispatch strips outputSchema from tools/list and
// structuredContent from tools/call when client protocolVersion < 2025-06-18.

export const MOCK_PROTOCOL_VERSIONS = {
  latest: '2025-06-18',
  prior: '2025-03-26',
  legacy: '2024-11-05',
} as const;

// `sessionId` is part of the public API for callers that already hold a
// session id (e.g. when re-issuing initialize after reconnect); the JSON-RPC
// initialize body itself does not carry it (that is a transport-header
// concern handled by `makeMockClientHeaders`). Underscore-prefixed to
// satisfy `noUnusedParameters` without dropping the public shape.
export function makeInitializeRequest(protocolVersion: string, _sessionId?: string): {
  readonly jsonrpc: '2.0';
  readonly id: number;
  readonly method: 'initialize';
  readonly params: { protocolVersion: string; capabilities: Record<string, unknown>; clientInfo: { name: string; version: string } };
} {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'mock-mcp-client', version: '0.0.0' },
    },
  };
}

// For the per-session map keyed by Mcp-Session-Id (CONTEXT D-11)
export function makeMockSessionId(): string {
  return crypto.randomUUID();
}

// Headers that test code sends with each mock client request. `protocolVersion`
// is part of the signature for symmetry with `makeInitializeRequest` and is
// reserved for future header-encoded protocolVersion variants (some MCP clients
// echo it in `Mcp-Protocol-Version` per draft 2025-09); current callers ignore
// it but the parameter must stay in the public API. Underscore-prefixed to
// satisfy `noUnusedParameters` without dropping the public shape.
export function makeMockClientHeaders(_protocolVersion: string, sessionId?: string): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'host': 'localhost',
  };
  if (sessionId) h['Mcp-Session-Id'] = sessionId;
  return h;
}
