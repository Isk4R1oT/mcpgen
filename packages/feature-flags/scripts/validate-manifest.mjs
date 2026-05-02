#!/usr/bin/env node
// Validates that every flag in default/features.yaml (and staging/production
// when present) has a matching entry in _manifest/flags.yaml — and vice
// versa. Enforces naming convention (suffix matches category).
//
// Run from repo root or from packages/feature-flags/. Exits non-zero on any
// violation. Used by .github/workflows/feature-flags-validate.yml and locally
// via `pnpm --filter @mcpgen/feature-flags validate`.
//
// See docs/mcpgen-feature-flags-contract.md §4.3.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');

// We avoid a yaml dependency for portability — the schema we care about is
// flat enough that a hand-rolled key extractor is sufficient.
const FLAG_KEY_RE = /^\s+-\s+key:\s+(\w[\w_]*)\s*$/gm;

const VALID_CATEGORIES = ['kill', 'rollout', 'exp', 'perm', 'ops'];

function extractFlagKeys(yamlContent) {
  const keys = new Set();
  const matches = yamlContent.matchAll(FLAG_KEY_RE);
  for (const m of matches) keys.add(m[1]);
  return keys;
}

function parseManifest(yamlContent) {
  // Hand-roll parsing of the manifest entries — we only need: key, category,
  // expected_removal_at (optional). Each entry starts with "- key:".
  const entries = [];
  const lines = yamlContent.split('\n');
  let current = null;
  for (const line of lines) {
    const keyMatch = /^\s+-\s+key:\s+(\w+)\s*$/.exec(line);
    if (keyMatch !== null) {
      if (current !== null) entries.push(current);
      current = { key: keyMatch[1] };
      continue;
    }
    if (current === null) continue;
    const fieldMatch = /^\s+(\w+):\s+(.*?)\s*$/.exec(line);
    if (fieldMatch !== null) {
      current[fieldMatch[1]] = fieldMatch[2];
    }
  }
  if (current !== null) entries.push(current);
  return entries;
}

function getCategoryFromKey(key) {
  const suffix = key.split('_').pop();
  return VALID_CATEGORIES.includes(suffix) ? suffix : null;
}

function validate() {
  const errors = [];
  const warnings = [];

  // 1. Collect all flag keys across env directories
  const envDirs = ['default', 'staging', 'production'];
  const flagsPerEnv = new Map();
  for (const env of envDirs) {
    const featuresPath = join(PKG_ROOT, env, 'features.yaml');
    if (!existsSync(featuresPath)) {
      warnings.push(`${env}/features.yaml does not exist (ok if env not used yet)`);
      continue;
    }
    const content = readFileSync(featuresPath, 'utf8');
    flagsPerEnv.set(env, extractFlagKeys(content));
  }

  const allFlagKeys = new Set();
  for (const keys of flagsPerEnv.values()) {
    for (const k of keys) allFlagKeys.add(k);
  }

  // 2. Parse manifest
  const manifestPath = join(PKG_ROOT, '_manifest', 'flags.yaml');
  if (!existsSync(manifestPath)) {
    errors.push('_manifest/flags.yaml is missing');
    return { errors, warnings };
  }
  const manifestEntries = parseManifest(readFileSync(manifestPath, 'utf8'));
  const manifestKeys = new Set(manifestEntries.map((e) => e.key));

  // 3. Every flag must have a manifest entry
  for (const flagKey of allFlagKeys) {
    if (!manifestKeys.has(flagKey)) {
      errors.push(`flag "${flagKey}" has no entry in _manifest/flags.yaml`);
    }
  }

  // 4. Every manifest entry must reference a real flag
  for (const entry of manifestEntries) {
    if (!allFlagKeys.has(entry.key)) {
      errors.push(`manifest entry "${entry.key}" does not exist in any features.yaml`);
    }
  }

  // 5. Naming convention: suffix matches category
  for (const entry of manifestEntries) {
    const expectedCategory = getCategoryFromKey(entry.key);
    if (expectedCategory === null) {
      errors.push(
        `flag "${entry.key}" has no recognized category suffix ` +
          `(expected one of: ${VALID_CATEGORIES.join(', ')})`,
      );
      continue;
    }
    if (entry.category !== expectedCategory) {
      errors.push(
        `flag "${entry.key}" suffix is "${expectedCategory}" but manifest declares ` +
          `category "${entry.category}"`,
      );
    }
  }

  // 6. _rollout / _exp must have expected_removal_at in the future
  const today = new Date().toISOString().slice(0, 10);
  for (const entry of manifestEntries) {
    if (entry.category === 'rollout' || entry.category === 'exp') {
      if (entry.expected_removal_at === undefined) {
        errors.push(
          `flag "${entry.key}" is _${entry.category} but lacks expected_removal_at`,
        );
        continue;
      }
      if (entry.expected_removal_at < today) {
        errors.push(
          `flag "${entry.key}" expected_removal_at=${entry.expected_removal_at} is in the past — ` +
            `either extend or remove the flag (see contract §5.4)`,
        );
      }
    }
  }

  // 7. Required fields
  const requiredFields = ['category', 'owner', 'created_at'];
  for (const entry of manifestEntries) {
    for (const f of requiredFields) {
      if (entry[f] === undefined) {
        errors.push(`flag "${entry.key}" missing required manifest field "${f}"`);
      }
    }
  }

  return { errors, warnings };
}

const { errors, warnings } = validate();

for (const w of warnings) console.warn(`WARN: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);

if (errors.length > 0) {
  console.error(`\nFAIL — ${errors.length} validation error(s)`);
  process.exit(1);
}
console.log(`OK — ${warnings.length} warning(s), 0 errors`);
