#!/usr/bin/env bun
// apps/cli/src/index.ts
//
// Commander.js CLI skeleton. Phase 1 only ships the `--help` / `--version`
// surface; the `init` and `deploy` commands return "Not implemented" stubs
// because they land in Phase 2 (CLI-01) and Phase 6 (CLI-02) respectively.
//
// Reference: .planning/phases/01-foundation/01-PATTERNS.md `apps/cli/` row.

import { Command } from 'commander';

const program = new Command();

program
  .name('mcpgen')
  .description('Generate production-ready MCP servers from any API spec.')
  .version('0.0.0');

program
  .command('init <spec-url>')
  .description('Initialise an MCP server from an OpenAPI URL (Phase 2 — CLI-01).')
  .action(() => {
    console.error(
      'Not implemented in Phase 1. CLI commands ship in Phase 2 (init) and Phase 6 (deploy).',
    );
    process.exit(1);
  });

program
  .command('deploy')
  .description('Deploy a generated MCP server (Phase 6 — CLI-02).')
  .action(() => {
    console.error('Not implemented in Phase 1. Deploy command ships in Phase 6.');
    process.exit(1);
  });

program.parse(process.argv);
