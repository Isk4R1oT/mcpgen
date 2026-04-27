// apps/cli/build.ts
//
// CLI-03 cross-compile build matrix. Phase 1 acceptance: all 4 targets compile
// + --help runs. Phase 6 hardens with --target=<t> single-target selector and
// --upload-dir=<dir> staging directory for the GH Actions release-artifact job.
//
// Reference: .planning/phases/01-foundation/01-RESEARCH.md §"Pattern 11" (Bun
// build matrix verbatim) + .planning/phases/06-runtime-plane/06-RESEARCH.md
// §"Open Question #7" (cross-compile from one linux-x64 runner; verify on
// each native OS).

import { spawn } from 'bun';
import { copyFile, mkdir } from 'node:fs/promises';

const ALL_TARGETS = [
  'bun-linux-x64',
  'bun-darwin-arm64',
  'bun-darwin-x64',
  'bun-windows-x64',
] as const;
type Target = (typeof ALL_TARGETS)[number];

const argTarget = process.argv.find((a) => a.startsWith('--target='))?.split('=')[1];
const argUploadDir = process.argv
  .find((a) => a.startsWith('--upload-dir='))
  ?.split('=')[1];

const targets: ReadonlyArray<Target> = argTarget
  ? [argTarget as Target]
  : ALL_TARGETS;

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

if (argUploadDir) {
  await mkdir(argUploadDir, { recursive: true });
  for (const t of targets) {
    const ext = t.includes('windows') ? '.exe' : '';
    await copyFile(`dist/mcpgen-${t}${ext}`, `${argUploadDir}/mcpgen-${t}${ext}`);
  }
}

console.log(JSON.stringify({ built: targets.length, targets }));
