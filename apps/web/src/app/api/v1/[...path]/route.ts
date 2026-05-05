// apps/web/src/app/api/v1/[...path]/route.ts
//
// BUG-006 fix — catch-all proxy for `/api/v1/*` paths that don't have an
// explicit Next.js route handler. Replaces the prior `next.config.js`
// `beforeFiles` rewrite which forwarded raw browser requests (cookie only)
// directly to the BFF and produced 401 on every authed endpoint because no
// Bearer token was attached.
//
// Routing precedence (Next.js App Router): explicit static and dynamic
// route files at e.g. `/api/v1/generate/route.ts` win over this catch-all
// — those keep their own logic (idempotency-key validation, fixture mode,
// etc.). Anything else falls through here and gets the canonical
// proxy treatment via `proxyToBff` (cookie + Bearer + body forwarding).

import type { NextRequest } from 'next/server';

import { proxyToBff } from '@/lib/api/bff-proxy';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

async function pathSuffix(ctx: RouteContext): Promise<string> {
  const { path } = await ctx.params;
  // path-segment-by-segment percent-encoding (don't double-encode `/`).
  return path.map((seg) => encodeURIComponent(seg)).join('/');
}

export async function GET(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return proxyToBff(req, { pathSuffix: await pathSuffix(ctx) });
}

export async function POST(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return proxyToBff(req, { pathSuffix: await pathSuffix(ctx) });
}

export async function PUT(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return proxyToBff(req, { pathSuffix: await pathSuffix(ctx) });
}

export async function PATCH(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return proxyToBff(req, { pathSuffix: await pathSuffix(ctx) });
}

export async function DELETE(req: NextRequest, ctx: RouteContext): Promise<Response> {
  return proxyToBff(req, { pathSuffix: await pathSuffix(ctx) });
}

export const runtime = 'nodejs';
