// apps/cli/build.ts
//
// CLI-03 cross-compile build matrix. Phase 1 acceptance: all 4 targets compile
// + --help runs. Full CI matrix that runs builds-per-target lives in Phase 6
// (CLI-03).
//
// Reference: .planning/phases/01-foundation/01-RESEARCH.md §"Pattern 11" (Bun
// build matrix verbatim).

import { spawn } from 'bun';
import { mkdir } from 'node:fs/promises';

const targets = [
  'bun-linux-x64',
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-windows-x64',
] as const;

await mkdir('dist', { recursive: true });

for (const t of targets) {
  const ext = t.includes('windows') ? '.exe' : '';
  const proc = spawn(
    [
      'bun',
      'build',
      '--compile',
      `--target=${t}`,
      'src/index.ts',
      '--outfile',
      `dist/mcpgen-${t}${ext}`,
    ],
    { stdout: 'inherit', stderr: 'inherit' },
  );
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`Build failed for ${t}: exit ${code}`);
    process.exit(1);
  }
  console.log(`Built dist/mcpgen-${t}${ext}`);
}
