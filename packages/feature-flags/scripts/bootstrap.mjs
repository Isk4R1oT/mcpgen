#!/usr/bin/env node
// Bootstrap Flipt with flags + segments from features.yaml.
// Idempotent — re-running updates existing resources via PUT.
//
// Usage:
//   pnpm --filter @mcpgen/feature-flags bootstrap [-- --env default|staging|production]
//
// Env vars:
//   FLIPT_URL — defaults to http://localhost:8090
//
// Reads from packages/feature-flags/<env>/features.yaml and POSTs each flag /
// segment to Flipt v2 REST API. Authentication is disabled in local dev; for
// production this script will need FLIPT_CLIENT_TOKEN.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = join(__dirname, '..');
const FLIPT_URL = process.env.FLIPT_URL ?? 'http://localhost:8090';
const FLIPT_TOKEN = process.env.FLIPT_CLIENT_TOKEN;

const { values } = parseArgs({
  options: {
    env: { type: 'string', default: 'default' },
  },
});
const ENV = values.env;

function authHeaders() {
  return FLIPT_TOKEN === undefined ? {} : { Authorization: `Bearer ${FLIPT_TOKEN}` };
}

async function postResource(env, namespace, key, payload) {
  const url = `${FLIPT_URL}/api/v2/environments/${env}/namespaces/${namespace}/resources`;
  const body = { key, payload };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 200) return { created: true };
  // Already-exists → fall back to PUT
  const errText = await res.text();
  if (res.status === 409 || errText.includes('already exists')) {
    return updateResource(env, namespace, key, payload);
  }
  throw new Error(`POST ${url} failed ${res.status}: ${errText}`);
}

async function updateResource(env, namespace, key, payload) {
  const url = `${FLIPT_URL}/api/v2/environments/${env}/namespaces/${namespace}/resources`;
  const body = { key, payload };
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 200) return { updated: true };
  const text = await res.text();
  throw new Error(`PUT ${url} failed ${res.status}: ${text}`);
}

async function main() {
  const featuresPath = join(PKG_ROOT, ENV, 'features.yaml');
  const content = readFileSync(featuresPath, 'utf8');
  const parsed = parseYaml(content);
  const namespace = parsed.namespace ?? 'default';

  console.log(`Bootstrapping ${ENV}/${namespace} → ${FLIPT_URL}`);

  try {
    const res = await fetch(`${FLIPT_URL}/health`);
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (err) {
    console.error(`Flipt server not reachable at ${FLIPT_URL}: ${err.message}`);
    console.error('Hint: docker compose up -d flipt');
    process.exit(2);
  }

  let okFlags = 0;
  let okSegments = 0;

  for (const seg of parsed.segments ?? []) {
    const payload = { '@type': 'flipt.core.Segment', ...seg };
    await postResource(ENV, namespace, seg.key, payload);
    okSegments += 1;
    console.log(`  ✓ segment ${seg.key}`);
  }

  for (const flag of parsed.flags ?? []) {
    const payload = { '@type': 'flipt.core.Flag', ...flag };
    await postResource(ENV, namespace, flag.key, payload);
    okFlags += 1;
    console.log(`  ✓ flag    ${flag.key}`);
  }

  console.log(`\nDone — ${okFlags} flag(s), ${okSegments} segment(s) bootstrapped.`);
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
