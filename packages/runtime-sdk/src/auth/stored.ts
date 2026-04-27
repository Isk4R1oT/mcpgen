// packages/runtime-sdk/src/auth/stored.ts
//
// Phase 6 (per RUN-04 / D-09 / architecture §14) — stored upstream credentials.
// AES-256-GCM at rest with per-tenant DEK; DEK wrapped under master AES-KW
// key from RUNTIME_KEK env var. Local-compute uses bun:sqlite; Phase-10 swap
// is real CF KV via the same KV_NAMESPACE binding name (D-09).
//
// Source: RESEARCH Example 4 verbatim.

import { Database } from 'bun:sqlite';

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

const db = new Database(process.env.STORED_CREDS_DB ?? 'stored-creds.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS tenant_creds (
    tenant_id TEXT NOT NULL,
    upstream  TEXT NOT NULL,
    iv        BLOB NOT NULL,
    ct        BLOB NOT NULL,
    wrapped_dek BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (tenant_id, upstream)
  );
`);

async function getKek(): Promise<CryptoKey> {
  const b64 = process.env.RUNTIME_KEK;
  if (!b64) throw new Error('runtime_kek_unset');
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-KW' }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

async function unwrapDek(wrapped: ArrayBuffer): Promise<CryptoKey> {
  const kek = await getKek();
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kek,
    { name: 'AES-KW' },
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

export async function encryptStored(
  tenantId: string,
  upstream: string,
  plaintext: string,
): Promise<void> {
  const dek = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      dek,
      TEXT_ENCODER.encode(plaintext),
    ),
  );
  const kek = await getKek();
  const wrapped = new Uint8Array(
    await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-KW' }),
  );
  // Parameterised insert — no string interpolation (RESEARCH §"Security Domain").
  db.query(
    `INSERT OR REPLACE INTO tenant_creds (tenant_id, upstream, iv, ct, wrapped_dek, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(tenantId, upstream, iv, ct, wrapped, Date.now());
}

export async function decryptStored(
  tenantId: string,
  upstream: string,
): Promise<string> {
  const row = db
    .query(
      'SELECT iv, ct, wrapped_dek FROM tenant_creds WHERE tenant_id = ? AND upstream = ?',
    )
    .get(tenantId, upstream) as
    | { iv: Uint8Array; ct: Uint8Array; wrapped_dek: Uint8Array }
    | null;
  if (!row) throw new Error('stored_creds_not_found');
  // Copy into a fresh ArrayBuffer to satisfy WebCrypto's strict ArrayBuffer
  // (not ArrayBufferLike / SharedArrayBuffer) parameter typing under
  // typescript@6 + @types/node@22.
  const wrappedCopy = new Uint8Array(row.wrapped_dek.byteLength);
  wrappedCopy.set(row.wrapped_dek);
  const dek = await unwrapDek(wrappedCopy.buffer);
  const ivCopy = new Uint8Array(row.iv.byteLength);
  ivCopy.set(row.iv);
  const ctCopy = new Uint8Array(row.ct.byteLength);
  ctCopy.set(row.ct);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivCopy },
    dek,
    ctCopy,
  );
  return TEXT_DECODER.decode(plaintext);
}

// Test-only: clear the SQLite table between vitest runs.
export function _clearStoredCredsForTest(): void {
  db.exec('DELETE FROM tenant_creds');
}
