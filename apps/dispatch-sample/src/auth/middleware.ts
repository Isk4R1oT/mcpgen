// apps/dispatch-sample/src/auth/middleware.ts
//
// Pass-through credential mode (RUN-03 default; T-1-07 mitigation: never
// persists upstream key — client forwards `X-Upstream-Auth` on every request).
//
// Reference: docs/mcpgen-stage-e-design.md §5.1 (passthrough auth pattern)

interface AuthEnv {
  readonly SENTRY_DSN?: string;
}

export async function authMiddleware(
  req: Request,
  _env: AuthEnv,
): Promise<Response | null> {
  // Phase 1 stub: any non-empty Bearer token is "valid" — Phase 6 (RUN-03)
  // replaces this with a real per-tenant key check against the deployments table.
  const ourKey = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!ourKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  const upstreamCredential = req.headers.get('X-Upstream-Auth');
  if (!upstreamCredential) {
    return new Response(
      JSON.stringify({
        error:
          'Missing X-Upstream-Auth header. Configure your MCP client to forward upstream credentials.',
      }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }

  return null; // pass through — server.fetch can proceed
}
