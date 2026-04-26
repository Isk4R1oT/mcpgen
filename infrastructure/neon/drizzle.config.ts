// infrastructure/neon/drizzle.config.ts
//
// Drizzle Kit config for the @mcpgen/contracts schema (the 5th frozen contract,
// FND-08). The TS schema source lives in `packages/contracts/src/db-schema.ts`;
// generated migrations land here under `./migrations/`.
//
// References:
//   - .planning/phases/01-foundation/01-CONTEXT.md D-12 (timestamp prefix)
//   - docs/decisions/001-drizzle-timestamp-prefix-native-format.md (accept native
//     YYYYMMDDHHMMSS_<name>.sql format — no underscore between date and time)
//   - .planning/phases/01-foundation/01-PATTERNS.md ("infrastructure/neon/drizzle.config.ts" row)
//
// `prefix: 'timestamp'` (Drizzle native) defends T-1-04 (migration filename
// collision between parallel worktrees). `drizzle-kit check` runs in CI on every
// PR and fails on any out-of-order or duplicate-prefix migration.

import { defineConfig } from 'drizzle-kit';

// Loaded from process.env at runtime. drizzle-kit generate does NOT require a
// live connection — it only reads the schema source — but the upstream CLI
// validates the dbCredentials block at config load. We accept an empty string
// fallback so `generate` and `check` work without DATABASE_URL set; `push` and
// `migrate` will fail naturally when the connection cannot be established.
const databaseUrl = process.env.DATABASE_URL ?? '';

export default defineConfig({
  dialect: 'postgresql',
  // NOTE: drizzle-kit resolves these paths relative to the CALLER's CWD (not the
  // config file's directory). All scripts that invoke drizzle-kit live in
  // `packages/contracts` (`pnpm --filter @mcpgen/contracts drizzle-kit:*`), so
  // these paths are written from `packages/contracts/`.
  schema: './src/db-schema.ts',
  out: '../../infrastructure/neon/migrations',
  migrations: {
    prefix: 'timestamp', // produces YYYYMMDDHHMMSS_<name>.sql (docs/decisions/001)
  },
  dbCredentials: { url: databaseUrl },
  verbose: true,
  strict: true,
});
