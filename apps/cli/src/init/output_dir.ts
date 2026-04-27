// apps/cli/src/init/output_dir.ts
//
// Path-traversal-safe output directory writer (T-2-09-06 mitigation).
//
// Phase 2: defaults reject `../` escapes; absolute paths the user explicitly
// types (starting with `/` or `~`) are accepted.

import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve, sep } from 'node:path';

/**
 * Ensure the resolved output dir is either:
 *  - under the current working directory (relative path), OR
 *  - an explicit absolute path (literal starts with `/` or `~/`).
 *
 * Creates the directory tree (recursive) with mode 0755. Returns the
 * resolved absolute path.
 *
 * Rejects path-traversal attempts like `../../etc/passwd`.
 */
export async function ensureSafeOutputDir(rawDir: string): Promise<string> {
  const expanded = expandHome(rawDir);
  const resolved = resolve(expanded);
  const cwd = process.cwd();

  const isUnderCwd = resolved === cwd || resolved.startsWith(cwd + sep);
  const isExplicitAbsolute = rawDir.startsWith('/') || rawDir.startsWith('~');

  if (!isUnderCwd && !isExplicitAbsolute) {
    throw new Error(
      `output dir must be under cwd or explicitly absolute: ${rawDir}`,
    );
  }

  await mkdir(resolved, { recursive: true, mode: 0o755 });
  return resolved;
}

/**
 * Atomically write a single file under the (already-validated) output dir.
 */
export async function writeOutputFile(
  dir: string,
  name: string,
  content: string,
): Promise<void> {
  const path = resolve(dir, name);
  await writeFile(path, content, 'utf-8');
}

function expandHome(raw: string): string {
  if (raw === '~') return homedir();
  if (raw.startsWith('~/')) return resolve(homedir(), raw.slice(2));
  return raw;
}
