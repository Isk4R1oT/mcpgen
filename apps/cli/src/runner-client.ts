// apps/cli/src/runner-client.ts
//
// Phase 6 (per CLI-02 / D-13) — HTTP client for apps/tenant-worker-runner.
// Talks to localhost:8788/admin/{spawn,kill,list}. Phase-10 swap is a
// CF API client that calls `wrangler deploy --dispatch-namespace mcpgen-prod`
// — same orchestration shape, different transport.

const RUNNER_URL = process.env.MCPGEN_RUNNER_URL ?? 'http://localhost:8788';

export interface SpawnResponse {
  readonly pid: number;
  readonly port: number;
  readonly scriptName: string;
  readonly url: string;
}

export interface SpawnOptions {
  readonly scriptName: string;
  readonly bundlePath: string;
  readonly generationId?: string;
  readonly tenantId?: string;
  readonly authMode?: 'passthrough' | 'stored' | 'oauth';
}

export async function spawnTenantWorker(opts: SpawnOptions): Promise<SpawnResponse> {
  const r = await fetch(`${RUNNER_URL}/admin/spawn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`runner_spawn_failed_${r.status}: ${body}`);
  }
  return (await r.json()) as SpawnResponse;
}

export async function killTenantWorker(scriptName: string): Promise<void> {
  const r = await fetch(`${RUNNER_URL}/admin/kill`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scriptName }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`runner_kill_failed_${r.status}: ${body}`);
  }
}

export async function listTenantWorkers(): Promise<ReadonlyArray<unknown>> {
  const r = await fetch(`${RUNNER_URL}/admin/list`);
  if (!r.ok) throw new Error(`runner_list_failed_${r.status}`);
  const j = (await r.json()) as { managed: ReadonlyArray<unknown> };
  return j.managed;
}
