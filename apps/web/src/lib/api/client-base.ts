// apps/web/src/lib/api/client-base.ts
//
// Foundation Agent F-BFFClients (Phase 0 frontend rebuild) — shared fetch
// wrapper for the typed BFF client modules in this directory. Replaces ad-hoc
// fetch calls scattered across `_*-client.tsx` files.
//
// Design constraints (CLAUDE.md):
//   - No silent retries / fallbacks. Every non-2xx surfaces as a structured
//     `Result.ok=false` so the caller decides UX. The wrapper itself never
//     throws on network/protocol errors — it always returns a Result.
//   - Strict typing — every callable parses the response body via Zod and
//     surfaces a parse failure as `error: 'invalid_response'`.
//   - Same-origin cookies (Logto session) are forwarded automatically since
//     all paths go through the Next.js `/api/v1/*` rewrite to the BFF.
//   - Idempotency-Key is opt-in per call (set `idempotencyKey` in opts).
//
// Path strategy: every call uses a relative `/api/v1/...` path. In dev,
// next.config.js rewrites `/api/v1/:path*` → `${MCPGEN_BFF_URL}/api/v1/:path*`
// (typically http://localhost:8787). In production, Vercel + Cloudflare path
// routing handles it at the edge. We never read MCPGEN_BFF_URL on the client
// (it would be an env-var leak); the rewrite owns that secret.
//
// References:
//   - apps/web/next.config.js (rewrites + dev BFF target)
//   - packages/contracts/src/idempotency.ts (IDEMPOTENCY_KEY_HEADER)
//   - apps/web/src/lib/api/client.ts (existing pattern this generalises)

import { IDEMPOTENCY_KEY_HEADER } from '@mcpgen/contracts';
import type { ZodType } from 'zod';

// ─── Result type ───────────────────────────────────────────────────────────

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; raw?: unknown };

// ─── Request options ───────────────────────────────────────────────────────

export interface RequestOptions {
  // Optional Idempotency-Key value. Required by the BFF on POST /api/v1/generate
  // and any state-mutating write endpoint. The caller is responsible for
  // generation (typically `gen_${ulid}` via apps/web/src/lib/idempotency-key.ts).
  idempotencyKey?: string;
  // Extra headers — merged on top of Content-Type + Idempotency-Key.
  headers?: Record<string, string>;
  // Optional AbortSignal so screens can cancel in flight (route changes).
  signal?: AbortSignal;
}

// ─── Internal fetch helper ─────────────────────────────────────────────────

interface RequestInput<T> {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  schema: ZodType<T>;
  options?: RequestOptions;
  // Status codes to treat as success (default: any 2xx). For endpoints that
  // legitimately return 202 (POST /generate) or 204 (no body) the caller
  // should set this explicitly.
  successStatuses?: number[];
}

async function readBody(res: Response): Promise<unknown> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await res.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

function isSuccess(status: number, allow?: number[]): boolean {
  if (allow && allow.length > 0) return allow.includes(status);
  return status >= 200 && status < 300;
}

function extractErrorString(raw: unknown, fallback: string): string {
  if (raw === null || typeof raw !== 'object') return fallback;
  const obj = raw as { error?: unknown; code?: unknown; message?: unknown };
  if (typeof obj.error === 'string') return obj.error;
  if (typeof obj.code === 'string') return obj.code;
  if (typeof obj.message === 'string') return obj.message;
  return fallback;
}

export async function request<T>({
  method,
  path,
  body,
  schema,
  options,
  successStatuses,
}: RequestInput<T>): Promise<Result<T>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options?.headers ?? {}),
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (options?.idempotencyKey !== undefined) {
    headers[IDEMPOTENCY_KEY_HEADER] = options.idempotencyKey;
  }

  const init: RequestInit = {
    method,
    headers,
    // Same-origin cookies (Logto session). The BFF lives behind the same
    // origin via the Next.js /api/v1/* rewrite, so the browser will send
    // cookies automatically; setting credentials explicitly future-proofs
    // against any cross-origin override during local debugging.
    credentials: 'same-origin',
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (options?.signal) init.signal = options.signal;

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (err) {
    // Network error — surface as a structured Result, never throw. CLAUDE.md
    // "External API calls: retries with warnings, then raise the last error" —
    // the caller decides whether to retry; we don't retry silently here.
    return {
      ok: false,
      status: 0,
      error: 'network_error',
      raw: err instanceof Error ? err.message : String(err),
    };
  }

  const raw = await readBody(res);

  if (!isSuccess(res.status, successStatuses)) {
    return {
      ok: false,
      status: res.status,
      error: extractErrorString(raw, 'http_error'),
      raw,
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: res.status,
      error: 'invalid_response',
      raw,
    };
  }
  return { ok: true, data: parsed.data };
}

// ─── Disabled-feature helper (used by stub clients) ────────────────────────

// Convenience for endpoints that the BFF has not implemented yet (marketplace,
// advanced billing, admin). The corresponding hook surfaces this as a typed
// disabled state so screens render gracefully without firing a real fetch.
export function notImplementedResult<T>(): Result<T> {
  return { ok: false, status: 0, error: 'flag_off_or_not_implemented' };
}
