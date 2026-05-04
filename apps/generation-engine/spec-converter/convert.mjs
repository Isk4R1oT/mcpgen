#!/usr/bin/env node
// MCPGen spec normalizer.
//
// Reads a raw API spec (JSON or YAML) from stdin and emits OpenAPI 3.0 JSON
// to stdout. Source format is the first CLI arg; supported values:
//
//   swagger-2.0   — Swagger / OpenAPI 2.0 (host+basePath+schemes → servers[])
//   swagger-1.x   — Swagger 1.0 / 1.2     (legacy; via api-spec-converter)
//   postman-2.x   — Postman Collection v2.0 / v2.1
//
// All other formats are rejected by the Python detector before we get here.
//
// Errors → stderr, exit code 1 (conversion failure) or 2 (bad usage).
// Success → OpenAPI 3.0 JSON on stdout, exit code 0.

import { createRequire } from 'node:module';
import { writeFileSync, unlinkSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

// Strip schema-violating fields that legacy specs commonly carry over.
// OpenAPI 3.0's strict validator (used downstream by prance) rejects any
// non-`x-` properties at locations marked `additionalProperties: false`,
// such as info.contact (httpbin: responsibleDeveloper / responsibleOrganization)
// and info.license. swagger2openapi's --patch handles many issues but not these.
// Run this only on the converted OpenAPI-3.x output.
function sanitizeForStrictValidator(spec) {
  if (!spec || typeof spec !== 'object') return spec;
  const info = spec.info;
  if (info && typeof info === 'object') {
    if (info.contact && typeof info.contact === 'object') {
      const allowed = new Set(['name', 'url', 'email']);
      const filtered = Object.fromEntries(
        Object.entries(info.contact).filter(
          ([k]) => allowed.has(k) || k.startsWith('x-'),
        ),
      );
      if (Object.keys(filtered).length === 0) {
        delete info.contact;
      } else {
        info.contact = filtered;
      }
    }
    if (info.license && typeof info.license === 'object') {
      // OpenAPI 3.0 license: { name (required), url } + x-*. 3.1 adds identifier.
      const allowed = new Set(['name', 'url', 'identifier']);
      info.license = Object.fromEntries(
        Object.entries(info.license).filter(
          ([k]) => allowed.has(k) || k.startsWith('x-'),
        ),
      );
      // license requires `name`; drop entirely if converter left it nameless.
      if (typeof info.license.name !== 'string' || info.license.name.length === 0) {
        delete info.license;
      }
    }
    // Strip Swagger 2 root fields that swagger2openapi sometimes leaves on info
    // (rare, but observed on hand-rolled specs).
    for (const stale of ['termsOfServiceUrl']) {
      if (stale in info) delete info[stale];
    }
  }
  // OpenAPI 3.0 / 3.1 allow ONLY the following root-level keys plus `x-*`.
  // Anything else (Swagger 2 leftovers like `host`/`basePath`/`schemes`,
  // hand-rolled non-standard keys like httpbin's `protocol`) gets rejected
  // by openapi-spec-validator. Whitelist the known root keys; drop the rest.
  const ROOT_ALLOWED = new Set([
    'openapi',
    'info',
    'servers',
    'paths',
    'components',
    'security',
    'tags',
    'externalDocs',
    'jsonSchemaDialect', // 3.1
    'webhooks',          // 3.1
  ]);
  for (const k of Object.keys(spec)) {
    if (!ROOT_ALLOWED.has(k) && !k.startsWith('x-')) {
      delete spec[k];
    }
  }
  // Recursive pass: fix common type aliases that Swagger 2 tolerated but
  // OpenAPI 3 rejects (httpbin's spec.json has `{"type": "int"}`). Map them
  // to the closest OpenAPI 3 primitive. Walking the whole tree is safer than
  // chasing every schema location individually.
  const TYPE_ALIASES = {
    int: 'integer',
    long: 'integer',
    float: 'number',
    double: 'number',
    bool: 'boolean',
    date: 'string',
    'date-time': 'string',
    datetime: 'string',
    bytes: 'string',
    file: 'string',
  };
  const walk = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string' && Object.prototype.hasOwnProperty.call(TYPE_ALIASES, node.type)) {
      node.type = TYPE_ALIASES[node.type];
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(spec);
  return spec;
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

// Swagger 2.0 → OpenAPI 3.0 via swagger2openapi (APIs.guru, used by Stoplight/Redocly).
// `patch: true` fixes spec-violations the converter can repair (missing
// info.version, etc.); `warnOnly: true` keeps non-fatal validation issues
// from aborting; `anchors: true` lets YAML anchors round-trip cleanly.
async function convertSwagger2(input) {
  const s2o = require('swagger2openapi');
  return new Promise((resolve, reject) => {
    s2o.convertStr(
      input,
      { patch: true, warnOnly: true, anchors: true },
      (err, result) => {
        if (err) return reject(err);
        if (!result || !result.openapi) {
          return reject(new Error('swagger2openapi: empty result'));
        }
        const cleaned = sanitizeForStrictValidator(result.openapi);
        resolve(JSON.stringify(cleaned));
      },
    );
  });
}

// Swagger 1.0 / 1.2 → OpenAPI 3.0 via api-spec-converter (LucyBot).
// The library does the chained 1.x → 2.0 → 3.0 conversion internally.
// It expects a file path (no string-mode for swagger_1), so we write to tmp.
async function convertSwagger1(input) {
  const apiSpec = require('api-spec-converter');
  const tmp = join(tmpdir(), `mcpgen-s1-${Date.now()}-${process.pid}.json`);
  writeFileSync(tmp, input);
  try {
    const converted = await apiSpec.convert({
      from: 'swagger_1',
      to: 'openapi_3',
      source: tmp,
    });
    const spec = converted.spec ?? converted;
    const cleaned = sanitizeForStrictValidator(spec);
    return JSON.stringify(cleaned);
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup
    }
  }
}

// Postman Collection v2.x → OpenAPI 3.0 via postman-to-openapi (joolfe).
// The library accepts a path; write input to a tmp directory.
// outputFormat: 'json' returns JSON string when output path is omitted.
async function convertPostman(input) {
  const postmanToOpenApi = require('postman-to-openapi');
  const dir = mkdtempSync(join(tmpdir(), 'mcpgen-pm-'));
  const inPath = join(dir, 'collection.json');
  writeFileSync(inPath, input);
  try {
    const result = await postmanToOpenApi(inPath, undefined, {
      outputFormat: 'json',
      defaultTag: 'default',
    });
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;
    const cleaned = sanitizeForStrictValidator(parsed);
    return JSON.stringify(cleaned);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
}

const fromFormat = process.argv[2];
if (!fromFormat) {
  process.stderr.write(
    'usage: convert.mjs <swagger-2.0|swagger-1.x|postman-2.x>\n',
  );
  process.exit(2);
}

try {
  const input = await readStdin();
  if (!input || input.trim().length === 0) {
    throw new Error('empty stdin');
  }

  let result;
  if (fromFormat === 'swagger-2.0') {
    result = await convertSwagger2(input);
  } else if (fromFormat === 'swagger-1.x') {
    result = await convertSwagger1(input);
  } else if (fromFormat === 'postman-2.x') {
    result = await convertPostman(input);
  } else {
    process.stderr.write(`unknown source format: ${fromFormat}\n`);
    process.exit(2);
  }

  // Validate the converter actually emitted OpenAPI 3.x. If it didn't,
  // surface a clear error rather than letting prance choke downstream.
  const parsed = JSON.parse(result);
  if (typeof parsed.openapi !== 'string' || !parsed.openapi.startsWith('3.')) {
    throw new Error(
      `converter did not produce OpenAPI 3.x (got openapi=${JSON.stringify(parsed.openapi)})`,
    );
  }

  process.stdout.write(result);
} catch (err) {
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  process.stderr.write(`conversion failed (${fromFormat}): ${msg}\n`);
  process.exit(1);
}
