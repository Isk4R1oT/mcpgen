// apps/cli/src/commands/deploy-cf-deferral.ts
//
// Phase 6 (per CLI-02 / D-13) — `mcpgen deploy --cf` deferral. Mirrors the
// exit-78 idiom from infrastructure/cloudflare/scripts/create-namespaces.sh.

import pc from 'picocolors';

export function emitCfDeferralBanner(): never {
  process.stderr.write(
    pc.yellow(`
ERROR: \`mcpgen deploy --cf\` is DEFERRED to Phase 10.

Per .planning/phases/01-foundation/01-PHASE-DEVIATIONS.md (revision 2),
Phases 1-9 run all compute locally; CF Workers / Workers-for-Platforms /
Hyperdrive are not provisioned until launch-prep (Phase 10).

Use:  mcpgen deploy <bundle-dir>     # local Bun process on localhost:879N

`),
  );
  process.exit(78); // EX_CONFIG — sysexits.h "config is not in usable state"
}
