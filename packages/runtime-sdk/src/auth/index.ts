// packages/runtime-sdk/src/auth/index.ts
//
// Phase 6 (per RESEARCH §"Pattern 7") — atomic auth-mode dispatcher.
// Single switch over AuthMode discriminated union; Phase-10 swaps the
// OAuth body to call into @cloudflare/workers-oauth-provider.

import type { AuthMode } from '../types.js';

import { decryptPassthrough } from './passthrough.js';
import { decryptStored } from './stored.js';
import { oauthStub } from './oauth-stub.js';

export interface TenantContext {
  readonly id: string;
  readonly upstream: string;
}

export async function resolveUpstreamCredential(
  req: Request,
  tenant: TenantContext,
  mode: AuthMode,
): Promise<string> {
  switch (mode.mode) {
    case 'passthrough':
      return await decryptPassthrough(req, tenant.id);
    case 'stored':
      return await decryptStored(tenant.id, tenant.upstream);
    case 'oauth':
      return oauthStub(); // never returns — throws OAuthDeferralError
  }
  // TS narrows the switch exhaustively; no default branch needed.
}

export {
  OAuthDeferralError,
  oauthStub,
  oauthStubErrorResponse,
} from './oauth-stub.js';
export { encryptPassthrough, decryptPassthrough } from './passthrough.js';
export {
  encryptStored,
  decryptStored,
  _clearStoredCredsForTest,
} from './stored.js';
