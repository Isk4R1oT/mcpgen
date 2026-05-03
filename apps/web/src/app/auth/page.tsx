// apps/web/src/app/auth/page.tsx
//
// Phase 2 / B1 — /auth route segment (BACKEND-AUTH probe screen).
//
// Server Component shell. Reads `?spec_url=...` (round-tripped from /generate)
// and `?auth_type=apikey|basic|oauth|hmac` (Pass 0 detection result, optional)
// and forwards both to the Client Component AuthScreen.
//
// NOT to be confused with `/(auth)/sign-in` — that's the user-Logto sign-in
// route group. This page configures how the deployed MCP server will
// authenticate against the upstream API.

import type { ReactElement } from 'react';

import { AuthScreen, type AuthType } from '@/components/screens/auth/auth';

export const dynamic = 'force-dynamic';

interface AuthPageProps {
  // Next.js 15 — `searchParams` is a Promise of the parsed query.
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const VALID_AUTH_TYPES: ReadonlySet<AuthType> = new Set([
  'apikey',
  'basic',
  'oauth',
  'hmac',
]);

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

export default async function AuthPage({
  searchParams,
}: AuthPageProps): Promise<ReactElement> {
  const params = await searchParams;
  const specUrl = pickFirst(params['spec_url']);
  const rawAuthType = pickFirst(params['auth_type']);
  const authType: AuthType | undefined =
    rawAuthType !== undefined && VALID_AUTH_TYPES.has(rawAuthType as AuthType)
      ? (rawAuthType as AuthType)
      : undefined;

  // The breadcrumb name is sourced from the spec hostname when available so
  // the canon `…-mcp · auth` reads naturally. Falls back to the canon default.
  const sampleName = specUrl !== undefined ? deriveSampleName(specUrl) : undefined;

  const sample = {
    ...(sampleName !== undefined ? { name: sampleName } : {}),
    ...(authType !== undefined ? { authType } : {}),
  };

  return (
    <AuthScreen
      {...(Object.keys(sample).length > 0 ? { sample } : {})}
      {...(specUrl !== undefined ? { specUrl } : {})}
    />
  );
}

/**
 * Derive a friendly sample name from a spec URL. Keeps the canon breadcrumb
 * format (lowercase hostname tail, no TLD). Best-effort — invalid URLs fall
 * through to the screen's built-in default ("lumen-payments").
 */
function deriveSampleName(specUrl: string): string | undefined {
  try {
    const url = new URL(specUrl);
    const host = url.hostname.toLowerCase();
    const parts = host.split('.').filter((p) => p !== '' && p !== 'www');
    if (parts.length === 0) return undefined;
    if (parts.length === 1) return parts[0];
    // host like `api.stripe.com` → "stripe"; `petstore3.swagger.io` → "swagger"
    return parts[parts.length - 2];
  } catch {
    return undefined;
  }
}
