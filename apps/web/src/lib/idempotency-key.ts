// apps/web/src/lib/idempotency-key.ts
//
// Plan 07-02 — FE-01 client-side Idempotency-Key generation + localStorage
// persistence. Per CONTEXT D-12: client generates `gen_${ulid}` before each
// `POST /api/v1/generate`; key persists in localStorage keyed by
// `${spec_url}|${spec_hash}` for the duration of the form session; rotated
// after a 202 response with a real job_id.
//
// References:
//   - .planning/phases/07-frontend-wire-up/07-RESEARCH.md "Pattern 3" (verbatim)
//   - .planning/phases/07-frontend-wire-up/07-CONTEXT.md D-12 + D-13
//   - packages/contracts/src/idempotency.ts (GEN_ID_REGEX, type GenId)
//
// SSR safety: every localStorage access is guarded by `typeof localStorage`
// because Next.js Server Components evaluate the module graph during build.

import { ulid } from 'ulid';
import { GEN_ID_REGEX, type GenId } from '@mcpgen/contracts';

const STORAGE_PREFIX = 'mcpgen.idem.';

function storageKey(specUrl: string, specHashOrEmpty: string): string {
  return `${STORAGE_PREFIX}${specUrl}|${specHashOrEmpty}`;
}

export const getOrCreateIdempotencyKey = (
  specUrl: string,
  specHashOrEmpty: string,
): GenId => {
  const k = storageKey(specUrl, specHashOrEmpty);
  const existing = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
  if (existing !== null && GEN_ID_REGEX.test(existing)) {
    return existing as GenId;
  }
  const fresh = `gen_${ulid()}` as GenId;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(k, fresh);
  }
  return fresh;
};

export const rotateIdempotencyKey = (
  specUrl: string,
  specHashOrEmpty: string,
): void => {
  // Called after the BFF returns 202 with a real job_id; the form-session key
  // has done its job and the next "Try again" should mint a fresh ULID.
  const k = storageKey(specUrl, specHashOrEmpty);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(k);
  }
};
