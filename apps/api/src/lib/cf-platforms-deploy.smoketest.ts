// G-3 smoke-test — verifies CF REST DELETE works for tagged anon scripts.
// Run manually before plan 09.1-10 cleanup-cron lands.
//
// Phase 09.1 plan 08 — Closes RESEARCH G-3 (line 1311). Wrangler 4.85 has
// no documented `--tag-filter` for delete, so the cleanup cron uses the CF
// REST API directly. This script validates the REST API path against
// `mcpgen-sandbox` (NOT prod) before the cron lands in plan 09.1-10:
//
//   PUT    .../scripts/{name}    (deploy with tags)
//   GET    .../scripts/{name}    (verify tags written)
//   DELETE .../scripts/{name}    (cleanup)
//   GET    .../scripts/{name}    (expect 404)
//   DELETE .../scripts/{name}    (idempotency check, expect 404)
//
// Invocation:
//   CF_API_TOKEN=<token> CF_ACCOUNT_ID=<id> pnpm g3:smoke-cf-delete
//
// Operator hand-off: when CF_API_TOKEN is unavailable in dev, this script
// MUST be run by the operator before plan 09.1-10 cleanup-cron is enabled
// in production. Smoke-test outcome (PASS / FAIL) is recorded in the plan
// 09.1-08 SUMMARY and re-verified by the operator at Phase-10 launch.
//
// References:
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md G-3 (1311)
//   - .planning/phases/09.1-anonymous-hero-flow/09.1-RESEARCH.md §3 (252–369)
//   - infrastructure/cloudflare/scripts/create-namespaces.sh (operator pattern)

const SANDBOX_NAMESPACE = 'mcpgen-sandbox';

interface SmokeEnv {
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
}

interface SmokeResult {
  step: string;
  ok: boolean;
  detail: string;
}

function readEnv(): SmokeEnv | null {
  const token = process.env['CF_API_TOKEN'];
  const account = process.env['CF_ACCOUNT_ID'];
  if (!token || !account) return null;
  return { CF_API_TOKEN: token, CF_ACCOUNT_ID: account };
}

function buildScriptUrl(env: SmokeEnv, scriptName: string): string {
  return (
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}` +
    `/workers/dispatch/namespaces/${SANDBOX_NAMESPACE}/scripts/${scriptName}`
  );
}

async function putScript(
  env: SmokeEnv,
  scriptName: string,
  tags: string[],
): Promise<SmokeResult> {
  const url = buildScriptUrl(env, scriptName);
  const metadata = {
    main_module: 'worker.mjs',
    bindings: [],
    tags,
    compatibility_date: '2026-04-24',
    compatibility_flags: ['nodejs_compat'],
  };
  const formData = new FormData();
  formData.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' }),
  );
  // Minimal worker — just responds 'hello' so the deploy succeeds.
  const workerSource = "export default { fetch: () => new Response('hello') }";
  formData.append(
    'worker.mjs',
    new Blob([workerSource], { type: 'application/javascript+module' }),
  );
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: formData,
  });
  return {
    step: 'PUT',
    ok: res.ok,
    detail: res.ok ? `${res.status}` : `${res.status}: ${await res.text()}`,
  };
}

async function getScript(
  env: SmokeEnv,
  scriptName: string,
): Promise<{ status: number; body: string }> {
  const url = buildScriptUrl(env, scriptName);
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
  });
  return { status: res.status, body: await res.text() };
}

async function deleteScript(
  env: SmokeEnv,
  scriptName: string,
): Promise<{ status: number; body: string }> {
  const url = buildScriptUrl(env, scriptName);
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
  });
  return { status: res.status, body: res.ok ? '' : await res.text() };
}

async function main(): Promise<number> {
  const env = readEnv();
  if (!env) {
    console.error(
      'CF_API_TOKEN and CF_ACCOUNT_ID must be set in the environment.\n' +
        '\n' +
        'This smoke-test verifies CF REST DELETE works against the\n' +
        `${SANDBOX_NAMESPACE} dispatch namespace before plan 09.1-10 lands the\n` +
        'cleanup cron. Acquire credentials from CF dashboard (Workers Scripts\n' +
        'Edit scope only) and re-run:\n' +
        '\n' +
        '  CF_API_TOKEN=... CF_ACCOUNT_ID=... pnpm g3:smoke-cf-delete\n',
    );
    return 78; // EX_CONFIG — config not in usable state.
  }

  const scriptName = `g3-smoke-${Date.now()}`;
  const tags = [
    'anon=true',
    'expires_at=2026-05-02T00:00:00.000Z',
    'session=g3-smoke-test',
  ];

  console.log(
    `G-3 smoke test: ns=${SANDBOX_NAMESPACE} script=${scriptName}\n` +
      'Steps: PUT → GET → DELETE → GET (expect 404) → DELETE (idempotent)\n',
  );
  const results: SmokeResult[] = [];

  // (a) PUT script with anon tags
  const put = await putScript(env, scriptName, tags);
  results.push(put);
  console.log(`  [1] PUT       → ${put.ok ? 'OK' : 'FAIL'} (${put.detail})`);
  if (!put.ok) return finish(results, 1);

  // (b) GET — verify tags
  const get1 = await getScript(env, scriptName);
  const tagsPresent = tags.every((t) => get1.body.includes(t));
  const get1Ok = get1.status === 200 && tagsPresent;
  results.push({
    step: 'GET (after PUT)',
    ok: get1Ok,
    detail: `status=${get1.status} tags_present=${tagsPresent}`,
  });
  console.log(
    `  [2] GET       → ${get1Ok ? 'OK' : 'FAIL'} (status=${get1.status} tags_present=${tagsPresent})`,
  );
  if (!get1Ok) return finish(results, 1);

  // (c) DELETE
  const del1 = await deleteScript(env, scriptName);
  const del1Ok = del1.status === 200 || del1.status === 204;
  results.push({
    step: 'DELETE (first)',
    ok: del1Ok,
    detail: `status=${del1.status}`,
  });
  console.log(`  [3] DELETE    → ${del1Ok ? 'OK' : 'FAIL'} (status=${del1.status})`);
  if (!del1Ok) return finish(results, 1);

  // (d) GET — expect 404
  const get2 = await getScript(env, scriptName);
  const get2Ok = get2.status === 404;
  results.push({
    step: 'GET (after DELETE)',
    ok: get2Ok,
    detail: `status=${get2.status}`,
  });
  console.log(`  [4] GET 404   → ${get2Ok ? 'OK' : 'FAIL'} (status=${get2.status})`);
  if (!get2Ok) return finish(results, 1);

  // (e) DELETE again — idempotency check (expect 404, treated as success
  //     by deleteScript helper).
  const del2 = await deleteScript(env, scriptName);
  const del2Ok = del2.status === 404;
  results.push({
    step: 'DELETE (idempotent)',
    ok: del2Ok,
    detail: `status=${del2.status}`,
  });
  console.log(
    `  [5] DELETE 404 → ${del2Ok ? 'OK' : 'FAIL'} (status=${del2.status})`,
  );
  if (!del2Ok) return finish(results, 1);

  return finish(results, 0);
}

function finish(results: SmokeResult[], exitCode: number): number {
  const ok = results.every((r) => r.ok);
  console.log('');
  console.log(`G-3 smoke test summary: ${ok ? 'PASS' : 'FAIL'} (${results.length} steps)`);
  for (const r of results) {
    console.log(`  - [${r.ok ? 'PASS' : 'FAIL'}] ${r.step}: ${r.detail}`);
  }
  return exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('G-3 smoke test threw:', err);
    process.exit(1);
  });
