// packages/runtime-sdk/src/auth/passthrough.ts
//
// Phase 6 (per RUN-03 / D-08 / pitfall #12) — pass-through upstream credential.
// Per request: decrypt X-Upstream-Auth via HKDF-SHA-256-derived AES-GCM key,
// forward, never persist, never log. Outbound chokepoint (Sentry beforeSend
// in sentry-redaction.ts) catches residuals.
//
// Source: RESEARCH Example 3 verbatim.

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

async function deriveKey(
  secretMaterial: ArrayBuffer,
  info: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    secretMaterial,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: TEXT_ENCODER.encode('mcpgen.passthrough.v1'),
      info: TEXT_ENCODER.encode(info),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

function getTenantSecret(tenantId: string): ArrayBuffer {
  // Per CONTEXT D-08: per-tenant secret material is loaded from env at supervisor
  // spawn time (Bun.spawn passes RUNTIME_PASSTHROUGH_KEYS env var with a JSON
  // map { tenantId: base64Material }). Never persisted to disk.
  const raw = process.env.RUNTIME_PASSTHROUGH_KEYS;
  if (!raw) throw new Error('runtime_passthrough_keys_unset');
  const map = JSON.parse(raw) as Record<string, string>;
  const b64 = map[tenantId];
  if (!b64) throw new Error(`no_passthrough_secret_for_tenant: ${tenantId}`);
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
}

export async function encryptPassthrough(
  plaintext: string,
  tenantId: string,
): Promise<string> {
  const key = await deriveKey(
    getTenantSecret(tenantId),
    `tenant:${tenantId}`,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      TEXT_ENCODER.encode(plaintext),
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decryptPassthrough(
  req: Request,
  tenantId: string,
): Promise<string> {
  const blob = req.headers.get('X-Upstream-Auth');
  if (!blob) throw new Error('missing_x_upstream_auth');
  const raw = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const key = await deriveKey(
    getTenantSecret(tenantId),
    `tenant:${tenantId}`,
    ['decrypt'],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ct,
  );
  return TEXT_DECODER.decode(plaintext);
  // CRITICAL: never log `blob`, `raw`, `plaintext` — beforeSend redactor catches residuals.
}
