// apps/web/src/lib/api/bff-proxy.ts
//
// BUG-006 fix — browser-side fetches to `/api/v1/*` returned 401 even when
// the user had a valid Logto session, because the BFF auth middleware
// requires `Authorization: Bearer <jwt>` and the prior `next.config.js`
// `beforeFiles` rewrite forwarded raw browser requests (cookie only) to
// the BFF without any token bridging.
//
// This helper is the server-side bridge: it runs inside Next.js route
// handlers (which have access to the encrypted Logto session cookie),
// resolves an access token via `@logto/next/server-actions.getAccessToken`,
// and forwards the request to the BFF with `Authorization: Bearer <token>`
// in addition to the original Cookie. Anonymous callers (no Logto session)
// are still allowed through — `getAccessToken` throws, we catch and
// proceed without the Bearer header so the BFF's anon paths still work
// (e.g. `/api/v1/generate` without sign-in).
//
// Streaming responses (SSE) are passed through using the BFF response's
// `body` ReadableStream so chunks reach the client as they arrive.
//
// References:
//   - apps/api/src/middleware/auth.ts (BFF expects Bearer; 401 missing_bearer)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-15 (Cookie
//     forwarding pattern; this commit upgrades it to also bridge the
//     access token so authed BFF endpoints actually work from the browser)
//   - QA report `.tmp/qa-report-2026-05-05.md` BUG-006

import { getAccessToken } from '@logto/next/server-actions';
import type { NextRequest } from 'next/server';

import { logtoConfig } from '@/lib/logto/client';

import { getBffUrl } from '@/lib/fixture-mode';

interface ProxyOptions {
  /**
   * Subpath under `/api/v1` (e.g. `'deployments'` or `'me'`). The full
   * upstream URL is `${getBffUrl()}/${pathSuffix}`. Caller is responsible
   * for any path-segment encoding.
   */
  readonly pathSuffix: string;
  /**
   * When true, `getAccessToken` failures (typical when the user is not
   * signed in) silently proceed without a Bearer header. When false, a
   * missing token returns 401 to the caller. Default: true.
   */
  readonly allowAnon?: boolean;
}

export async function proxyToBff(
  req: NextRequest,
  opts: ProxyOptions,
): Promise<Response> {
  const allowAnon = opts.allowAnon ?? true;
  const upstreamUrl = `${getBffUrl()}/${opts.pathSuffix}`;

  const headers: Record<string, string> = {};
  // Forward Content-Type so JSON / form bodies parse on the BFF side.
  const contentType = req.headers.get('content-type');
  if (contentType !== null) headers['Content-Type'] = contentType;
  // Cookie carries the anon-session id used by anon-flow endpoints.
  const cookieHeader = req.headers.get('cookie');
  if (cookieHeader !== null) headers.Cookie = cookieHeader;
  // Idempotency-Key is preserved on POST endpoints that require it.
  const idemKey = req.headers.get('idempotency-key');
  if (idemKey !== null) headers['Idempotency-Key'] = idemKey;

  // Bridge the Logto session → access token. `getAccessToken` reads the
  // encrypted Logto cookie (server-only — never exposed to the browser)
  // and returns a Bearer JWT minted for our resource indicator.
  let accessToken: string | null = null;
  try {
    accessToken = await getAccessToken(logtoConfig);
  } catch {
    // Not signed in (or session expired). Anon flows continue without
    // a Bearer; auth-required endpoints will surface 401 from the BFF.
    if (!allowAnon) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', reason: 'no_logto_session' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }
  if (accessToken !== null && accessToken !== '') {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let upstreamRes: Response;
  try {
    // For methods with a body, forward the raw stream. NextRequest.body
    // is already a ReadableStream — passing it through avoids buffering
    // the whole payload in memory for large requests.
    const init: RequestInit & { duplex?: 'half' } = {
      method: req.method,
      headers,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = req.body;
      if (body !== null) {
        init.body = body;
        // Node's undici requires `duplex: 'half'` when passing a stream
        // body to fetch — undocumented but enforced. Without it, the
        // request fails with `RequestInit: duplex option is required`.
        init.duplex = 'half';
      }
    }
    upstreamRes = await fetch(upstreamUrl, init);
  } catch (e: unknown) {
    return Response.json(
      {
        error: 'bff_unreachable',
        upstream_url: upstreamUrl,
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  // Pass through status + content-type. For SSE the body must be streamed
  // chunk-by-chunk; `upstreamRes.body` is a ReadableStream so it stays a
  // stream end-to-end.
  const respContentType = upstreamRes.headers.get('content-type') ?? 'application/json';
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      'Content-Type': respContentType,
    },
  });
}
