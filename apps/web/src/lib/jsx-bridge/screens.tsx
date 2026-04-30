// Per-screen wrappers. Each wrapper imports the locked screen via `./index`
// (which loads the bridge), receives typed props from the route segment, and
// translates locked-screen callback props (e.g. `onMakeIt()`) into Next router
// navigation via `useRouter()`.
//
// Plan 07-01 ships ALL 9 wrapper STUBS so the type surface exists. Plan 07-02
// (Wave 1) fills the body for LandingWrapper / AuthScreenWrapper / CanvasWrapper.
// Plans 07-03 / 07-04 / 07-05 fill the rest. Wave 1 stubs render the locked
// component with required props passed verbatim from the route — no router
// translation yet.

'use client';

import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { submitGeneration, submitDeploy } from '@/lib/api/client';
import {
  fetchDeployments,
  fetchUsageHourly,
  setBadgePublic,
  type Deployment,
  type DeployResponse,
  type UsageHourlyRow,
} from '@/lib/api/dashboard-client';
import { useGenerationSSE } from '@/lib/sse/use-generation-sse';
import { badgeLabel, badgeTier, type BadgeTier } from '@/lib/quality-badge';
import {
  buildClaudeProtocolHref,
  buildConfig,
  copyToClipboard,
  formatConfigJson,
  type ClaudeDesktopConfigBlock,
} from '@/lib/claude-desktop/config';
import {
  parseCollisionResponse,
  type CollisionResponse,
} from '@/lib/claude-desktop/collision';
import type { FinalTool, QualityReport as QualityReportType } from '@mcpgen/ir';

import {
  AuthScreen,
  Canvas,
  Dashboard,
  Deploy,
  DeploySuccess,
  Landing,
  Playground,
  Preview,
  QualityReport,
  SAMPLE_APIS,
  StreamLog,
  type LockedSample,
} from './index';

// --- LandingWrapper — Plan 07-02 FE-01 submit flow ------------------------
//
// Owns the form-state outside the locked Landing component. On `onMakeIt()`:
//   1. Validate urlText is a parseable URL.
//   2. Generate `Idempotency-Key: gen_${ulid}` via api/client (which calls
//      getOrCreateIdempotencyKey internally) and POST to /api/v1/generate.
//   3. On 202 → router.push(`/generate/${data.job_id}`).
//   4. On 4xx/5xx → setError(mapped.userMessage); the locked-CSS error line
//      renders below the form using ONLY var(--accent-red) inline style
//      (no new visual elements, FE-05 anti-drift).
//   5. On thrown (network error) → setError('Network error: please retry').

// Plan 07-01 default + locked SAMPLE_APIS[0] fall-back.
const FALLBACK_SAMPLE: LockedSample = {
  id: 'lumen',
  name: 'lumen payments',
  endpoints: 348,
  tools: 47,
  save: 76,
};

export interface LandingWrapperProps {
  initialSample?: LockedSample;
}

export function LandingWrapper({ initialSample }: LandingWrapperProps = {}): ReactElement {
  const router = useRouter();
  const seed: LockedSample =
    initialSample ?? (SAMPLE_APIS.length > 0 ? (SAMPLE_APIS[0] as LockedSample) : FALLBACK_SAMPLE);
  const [sample, setSample] = useState<LockedSample>(seed);
  const [urlText, setUrlText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const onMakeIt = (): void => {
    if (submitting) return;
    setError(null);

    // Validate URL shape before hitting the BFF.
    try {
      // eslint-disable-next-line no-new
      new URL(urlText);
    } catch {
      setError('Please enter a valid URL.');
      return;
    }

    setSubmitting(true);
    void (async () => {
      try {
        const result = await submitGeneration({
          specUrl: urlText,
          // Plan 07-02 doesn't fetch the spec to hash — Phase-1 BFF handles
          // server-side dedup. Empty spec_hash keeps the localStorage key
          // form-session-stable.
          specHash: '',
          request: { spec_url: urlText },
        });
        if (result.ok) {
          router.push(`/generate/${result.data.job_id}`);
          return;
        }
        setError(result.message);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setError(`Network error: ${msg}`);
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <>
      <Landing
        onMakeIt={onMakeIt}
        onSelectSample={setSample}
        sample={sample}
        urlText={urlText}
        setUrlText={setUrlText}
      />
      {error !== null && (
        // FE-05 anti-drift — error styling uses ONLY locked CSS vars from
        // global.css (no new visual elements).
        <div
          role="alert"
          className="mc-mono"
          style={{
            position: 'fixed',
            bottom: 24,
            left: 24,
            right: 24,
            maxWidth: 1100,
            margin: '0 auto',
            padding: '12px 16px',
            color: 'var(--accent-red, var(--text))',
            background: 'var(--paper-alt, transparent)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            fontSize: 13,
            zIndex: 100,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

// --- AuthScreenWrapper — Plan 07-02 Logto kickoff -------------------------

export interface AuthScreenWrapperProps {
  mode: 'sign-in' | 'sign-up';
  sample?: LockedSample;
}

export function AuthScreenWrapper({
  mode,
  sample,
}: AuthScreenWrapperProps): ReactElement {
  const router = useRouter();
  const seed: LockedSample =
    sample ?? (SAMPLE_APIS.length > 0 ? (SAMPLE_APIS[0] as LockedSample) : FALLBACK_SAMPLE);

  const onContinue = (): void => {
    // Logto kickoff. The sign-up route appends first_screen=register
    // server-side; here we route to the appropriate handler.
    const path = mode === 'sign-up' ? '/api/auth/logto/sign-up' : '/api/auth/logto/sign-in';
    const url = `${path}?redirect_to=${encodeURIComponent('/dashboard')}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  };

  return (
    <AuthScreen
      sample={seed}
      onContinue={onContinue}
      onBack={() => router.back()}
    />
  );
}

// --- CanvasWrapper (Plan 07-02 wires generation result + Cmd+K palette) ---

export interface CanvasWrapperProps {
  sample: LockedSample;
}

export function CanvasWrapper({ sample }: CanvasWrapperProps): ReactElement {
  const router = useRouter();
  return (
    <Canvas
      sample={sample}
      onPlay={() => router.push('/playground')}
      onDeploy={() => router.push('/deploy')}
      onCmdK={() => {
        /* Plan 07-04: Cmd+K palette */
      }}
      onBack={() => router.back()}
    />
  );
}

// --- StreamLogWrapper (Plan 07-03 — wires SSE consumption) ----------------
//
// The locked screen-stream.jsx self-drives a visual progress simulation via
// requestAnimationFrame. Per RESEARCH "Anti-Patterns" 3rd bullet we do NOT
// modify it. Instead, the wrapper subscribes to real SSE state via
// useGenerationSSE and overrides completion: when the real SSE stream emits
// stage='completed', we router.push() to /preview regardless of where the
// locked timer happens to be. The locked timer remains a visual smoothing
// effect; navigation is driven externally by real SSE.

export interface StreamLogWrapperProps {
  jobId: string;
  sample: LockedSample;
}

export function StreamLogWrapper({ jobId, sample }: StreamLogWrapperProps): ReactElement {
  const router = useRouter();
  const { status } = useGenerationSSE(jobId);

  useEffect(() => {
    if (status === 'completed') router.push(`/generate/${jobId}/preview`);
  }, [status, jobId, router]);

  return (
    <StreamLog
      sample={sample}
      onDone={() => {
        // Locked timer also fires onDone after its internal simulation; treat
        // it as a fallback navigation when SSE happens to outpace the timer.
        router.push(`/generate/${jobId}/preview`);
      }}
      onCancel={() => router.back()}
    />
  );
}

// --- PreviewWrapper (Plan 07-03 + Plan 07-04 — wires preview rendering) ---
//
// The Server Component shell prefetches fetchJobStatus(jobId) and passes the
// completed job's partial_result.final_tools / quality_report into the
// wrapper. The locked Preview screen reads `sample` for its bento layout;
// finalTools / qualityReport are passed as additional props that the screen
// currently ignores in v0 (v1.x backlog renders them in-place per FE-03).
//
// Plan 07-04 adds `codeSource: string | null`. Final rendering of the Stage E
// TypeScript bundle happens via the Shiki Server Component CodeBlock at the
// route level (apps/web/src/app/generate/[jobId]/preview/page.tsx) — Shiki
// must run in a Server Component context, so the wrapper carries the prop
// for type-surface completeness while the actual <CodeBlock> sits adjacent
// to <PreviewWrapper> in the route's Server Component tree.

export interface PreviewWrapperProps {
  jobId: string;
  sample: LockedSample;
  finalTools?: ReadonlyArray<FinalTool>;
  qualityReport?: QualityReportType;
  // Plan 07-04 — Stage E TypeScript bundle source. Null = no source available
  // (fixture mode keeps no in-memory state; live mode returns this only after
  // the BFF generate kickoff is wired). The wrapper accepts the prop for
  // type-surface completeness; rendering happens at the Server Component
  // level via <CodeBlock>.
  codeSource?: string | null;
}

export function PreviewWrapper({
  jobId,
  sample,
  finalTools,
  qualityReport,
  codeSource,
}: PreviewWrapperProps): ReactElement {
  const router = useRouter();
  // Suppress unused-prop typecheck warnings; the data is threaded through here
  // so v1.x can render it without a refactor (FE-03 in-screen rendering of
  // FinalTool[] + QualityReport is v1.x backlog). codeSource is consumed by
  // the route-level Server Component, NOT here.
  void finalTools;
  void qualityReport;
  void codeSource;

  return (
    <Preview
      sample={sample}
      onMakeIt={() => router.push(`/generate/${jobId}/quality`)}
      onBack={() => router.back()}
    />
  );
}

// --- PlaygroundWrapper (Plan 07-03 — SSE progress mid-stream) --------------

export interface PlaygroundWrapperProps {
  jobId: string;
  sample: LockedSample;
}

export function PlaygroundWrapper({ jobId, sample }: PlaygroundWrapperProps): ReactElement {
  const router = useRouter();
  const { status } = useGenerationSSE(jobId);

  useEffect(() => {
    if (status === 'completed') router.push(`/generate/${jobId}/preview`);
  }, [status, jobId, router]);

  return (
    <Playground
      sample={sample}
      onBack={() => router.back()}
      onDeploy={() => router.push(`/generate/${jobId}/deploy`)}
    />
  );
}

// --- QualityReportWrapper (Plan 07-03 — wires badge tier mapping) ---------

export interface QualityReportWrapperProps {
  jobId: string;
  sample: LockedSample;
  qualityReport?: QualityReportType;
}

export function QualityReportWrapper({
  jobId,
  sample,
  qualityReport,
}: QualityReportWrapperProps): ReactElement {
  const router = useRouter();
  // Compute tier + label so they are available for inline rendering when
  // Plan 07-04 fills the data path. Wave 1 keeps the locked screen rendering
  // its own placeholder breakdown; the tier is logged for diagnostic surface.
  const badge = useMemo(() => {
    if (qualityReport === undefined) return null;
    return { tier: badgeTier(qualityReport), label: badgeLabel(qualityReport) };
  }, [qualityReport]);
  void badge;

  return (
    <QualityReport
      sample={sample}
      onContinue={() => router.push(`/generate/${jobId}/deploy`)}
      onBack={() => router.back()}
    />
  );
}

// --- DeployWrapper (Plan 07-05 — full deploy CTA + 409 rename modal) ------
//
// Per 07-05-PRECONDITIONS.md §4: locked screen-deploy.jsx hardcodes its own
// onDeployed simulation + URL/config block. The wrapper surfaces the REAL
// deploy state in a sibling section ABOVE the locked Deploy screen, using
// only locked CSS-vars + locked mc-modal-* CSS classes for the rename modal.
// FE-05 anti-drift preserved (no new visual elements; no edits to locked JSX).

export interface DeployWrapperProps {
  jobId: string;
  sample: LockedSample;
}

export function DeployWrapper({ jobId, sample }: DeployWrapperProps): ReactElement {
  const router = useRouter();
  const [overrideName, setOverrideName] = useState<string | null>(null);
  const [renameInputValue, setRenameInputValue] = useState<string>('');
  const [deployment, setDeployment] = useState<DeployResponse | null>(null);
  const [collision, setCollision] = useState<CollisionResponse | null>(null);
  const [deploying, setDeploying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const claudeProtocolHref =
    deployment !== null ? buildClaudeProtocolHref(deployment.server_name) : null;
  const claudeConfigJson =
    deployment !== null
      ? formatConfigJson(
          // Honor server-side claude_desktop_config when present; otherwise
          // synthesize client-side from the deploy response (D-23 fallback).
          // The Zod schema's optional `headers` produces a `| undefined`
          // member that exactOptionalPropertyTypes:true rejects against
          // ClaudeDesktopConfigBlock; the cast is shape-equivalent (the
          // runtime value still satisfies the locked contract).
          (deployment.claude_desktop_config as ClaudeDesktopConfigBlock | undefined) ??
            buildConfig({
              serverName: deployment.server_name,
              serverUrl: deployment.server_url,
            }),
        )
      : null;

  const runDeploy = async (
    nameOverride: string | null,
    extraQuery?: string,
  ): Promise<void> => {
    setDeploying(true);
    setErrorMessage(null);
    try {
      const path = extraQuery !== undefined ? extraQuery : '';
      // submitDeploy hits /api/v1/deploy/[generationId]; in fixtures mode
      // the deploy-collision e2e test toggles ?force_collision=true via the
      // page URL, which the Route Handler reads from req.url. The wrapper
      // does not need to forward the toggle — it lives on the page request.
      void path;
      const opts =
        nameOverride !== null && nameOverride.length > 0
          ? { override_name: nameOverride }
          : undefined;
      const result = await submitDeploy(jobId, opts);
      if (result.ok) {
        setDeployment(result.data);
        setCollision(null);
        return;
      }
      // Discriminate by presence of `collision` (status:number type-overlap
      // means a plain `=== 409` check does not narrow under exactOptional).
      if ('collision' in result) {
        // Per Pitfall #30: surface the rename modal pre-filled with the
        // BFF-suggested alternative name so the user picks once and retries.
        // parseCollisionResponse was already applied inside dashboard-client;
        // re-validate at the wrapper boundary as belt-and-suspenders.
        const reparsed = parseCollisionResponse(result.collision) ?? result.collision;
        setCollision(reparsed);
        setRenameInputValue(reparsed.suggested_name);
        return;
      }
      setErrorMessage(result.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setErrorMessage(`Deploy failed: ${msg}`);
    } finally {
      setDeploying(false);
    }
  };

  const onDeployedFromLocked = (): void => {
    // The locked Deploy screen fires onDeployed after its 1.8s simulation.
    // The wrapper takes over from here to make the real BFF call. If the
    // wrapper has already deployed once successfully (re-fire), navigate to
    // the success route as before (Wave-1 fallback path).
    if (deployment !== null) {
      router.push('/deploy/success');
      return;
    }
    void runDeploy(overrideName);
  };

  const onConfirmRename = (): void => {
    if (renameInputValue.trim().length === 0) return;
    setOverrideName(renameInputValue);
    setCollision(null);
    void runDeploy(renameInputValue);
  };

  const onCancelRename = (): void => {
    setCollision(null);
    setRenameInputValue('');
  };

  const onCopyConfig = async (): Promise<void> => {
    if (claudeConfigJson === null) return;
    const ok = await copyToClipboard(claudeConfigJson);
    setCopyState(ok ? 'copied' : 'failed');
    setTimeout(() => setCopyState('idle'), 1400);
  };

  return (
    <>
      {/* Sibling section ABOVE the locked Deploy — surfaces real BFF state.
          Uses ONLY locked CSS-vars + locked utility classes (mc-mono / muted /
          mc-link). FE-05 anti-drift: no new visual elements; conditional
          render so a fresh load looks identical to the locked baseline. */}
      {deployment !== null && (
        <section
          aria-label="deploy-result"
          className="mc-mono"
          style={{
            maxWidth: 720,
            margin: '40px auto 0',
            padding: '16px 20px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--paper-alt)',
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <span className="mc-caption-up">deployed</span>
            <div style={{ marginTop: 4, wordBreak: 'break-all' }}>
              {deployment.server_url}
            </div>
          </div>
          <pre
            data-testid="claude-desktop-config-json"
            style={{
              margin: 0,
              padding: '10px 12px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--paper)',
              fontSize: 11.5,
              overflow: 'auto',
              maxHeight: 240,
              whiteSpace: 'pre',
            }}
          >
            {claudeConfigJson}
          </pre>
          <div className="row" style={{ gap: 10, marginTop: 12, alignItems: 'center' }}>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={() => {
                void onCopyConfig();
              }}
            >
              {copyState === 'copied' ? 'copied' : copyState === 'failed' ? 'copy failed' : 'copy config'}
            </button>
            {claudeProtocolHref !== null && (
              <a
                className="mc-btn mc-btn-ink mc-btn-sm"
                href={claudeProtocolHref}
                data-testid="open-in-claude-desktop"
              >
                Open in Claude Desktop
              </a>
            )}
          </div>
        </section>
      )}

      {errorMessage !== null && (
        <div
          role="alert"
          className="mc-mono"
          style={{
            maxWidth: 720,
            margin: '12px auto 0',
            padding: '10px 14px',
            color: 'var(--accent-red, var(--text))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--paper-alt, transparent)',
            fontSize: 13,
          }}
        >
          {errorMessage}
        </div>
      )}

      <Deploy
        sample={sample}
        onDeployed={onDeployedFromLocked}
        onBack={() => router.back()}
      />

      {/* 409 rename modal — uses ONLY the locked mc-modal-* CSS vocabulary
          from global.css (same classes as screen-dashboard's spec-diff /
          rotate modals). No new visual elements; FE-05 preserved. */}
      {collision !== null && (
        <div
          className="mc-modal-veil"
          onClick={onCancelRename}
          data-testid="rename-modal-veil"
        >
          <div
            className="mc-modal"
            style={{ width: 480 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="server-name-collision"
          >
            <div className="mc-modal-head">
              <div>
                <div className="mc-caption-up">server name in use</div>
                <div className="mc-h2" style={{ marginTop: 2 }}>
                  pick a different name
                </div>
              </div>
            </div>
            <div className="mc-modal-body">
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                <span className="mc-mono">{collision.existing_name}</span> is already
                deployed in this organization. choose a new name and we'll deploy
                under that.
              </div>
              <div className="mc-caption-up" style={{ marginBottom: 6 }}>
                new name
              </div>
              <input
                type="text"
                className="mc-input mc-mono"
                data-testid="rename-modal-input"
                value={renameInputValue}
                onChange={(e) => setRenameInputValue(e.target.value)}
                style={{ height: 36, fontSize: 12.5 }}
              />
            </div>
            <div className="mc-modal-foot">
              <button
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-sm"
                onClick={onCancelRename}
              >
                cancel
              </button>
              <button
                type="button"
                className="mc-btn mc-btn-ink mc-btn-sm"
                onClick={onConfirmRename}
                disabled={deploying}
                data-testid="rename-modal-confirm"
              >
                {deploying ? 'deploying…' : 'confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// --- DeploySuccessWrapper (Plan 07-05) ------------------------------------

export interface DeploySuccessWrapperProps {
  sample: LockedSample;
}

export function DeploySuccessWrapper({ sample }: DeploySuccessWrapperProps): ReactElement {
  const router = useRouter();
  return <DeploySuccess sample={sample} onDashboard={() => router.push('/dashboard')} />;
}

// --- DashboardWrapper (Plan 07-05) ----------------------------------------
//
// Per 07-05-PRECONDITIONS.md §4: locked screen-dashboard.jsx hardcodes its
// own demo content + has no slots for `deployments[]` / `usage[]` / per-tier
// quality badges. The wrapper renders the locked screen as-is (visual lock
// preserved) and surfaces the REAL data in a sibling section BELOW. The
// sibling uses only locked CSS-vars (FE-05).

export interface UserClaimsLite {
  sub: string;
  email?: string;
  name?: string;
}

export interface DashboardWrapperProps {
  sample?: LockedSample;
  userClaims?: UserClaimsLite;
}

export function DashboardWrapper({
  sample,
  userClaims,
}: DashboardWrapperProps = {}): ReactElement {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [toggleError, setToggleError] = useState<string | null>(null);
  const seed: LockedSample =
    sample ?? (SAMPLE_APIS.length > 0 ? (SAMPLE_APIS[0] as LockedSample) : FALLBACK_SAMPLE);

  const deployments = useQuery({
    queryKey: ['deployments'],
    queryFn: fetchDeployments,
  });

  const range = useMemo(() => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return { from: yesterday.toISOString(), to: now.toISOString() };
  }, []);
  const usageHourly = useQuery<UsageHourlyRow[]>({
    queryKey: ['usage-hourly', range],
    queryFn: () => fetchUsageHourly(range),
  });

  const onTogglePublicBadge = (deployment: Deployment): void => {
    void (async () => {
      // WR-03 fix: a failed PATCH must surface to the user — CLAUDE.md
      // "Always raise errors explicitly". The previous implementation
      // silently swallowed the error and left the optimistic checkbox
      // toggled until the next refetch.
      setToggleError(null);
      try {
        await setBadgePublic(deployment.deployment_id, !deployment.public_badge);
        // Invalidate so the canonical server state is re-fetched. React Query
        // re-issues fetchDeployments and the checkbox snaps to whatever the
        // server actually persisted (rolls back the optimistic toggle if the
        // PATCH did not land).
        await queryClient.invalidateQueries({ queryKey: ['deployments'] });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setToggleError(`Could not update public-badge: ${msg}`);
        // Force a refetch so the optimistic checkbox rolls back to the
        // server's recorded value.
        await queryClient.invalidateQueries({ queryKey: ['deployments'] });
      }
    })();
  };

  const totalCalls24h: number = (usageHourly.data ?? []).reduce(
    (sum, row) => sum + row.call_count,
    0,
  );

  void userClaims;

  return (
    <>
      <Dashboard
        sample={seed}
        onBack={() => router.back()}
        onPlay={() => router.push('/playground')}
      />

      {/* WR-03 fix — public-badge toggle failure surface. Conditional render
          + locked-CSS-vars only (FE-05 anti-drift); same locked vocabulary
          DeployWrapper uses (mc-mono / var(--accent-red, ...)). */}
      {toggleError !== null && (
        <div
          role="alert"
          data-testid="dashboard-toggle-error"
          className="mc-mono"
          style={{
            maxWidth: 1180,
            margin: '12px auto 0',
            padding: '10px 14px',
            color: 'var(--accent-red, var(--text))',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--paper-alt, transparent)',
            fontSize: 13,
          }}
        >
          {toggleError}
        </div>
      )}

      {/* Sibling section BELOW the locked screen — surfaces real deployments
          + usage_hourly + per-deployment quality badge + badge-public toggle.
          Renders only when at least one deployment is loaded; otherwise
          collapses cleanly so the locked baseline screenshot is unaffected. */}
      {deployments.data !== undefined && deployments.data.length > 0 && (
        <section
          aria-label="dashboard-deployments"
          className="mc-mono"
          data-testid="dashboard-deployments-section"
          style={{
            maxWidth: 1180,
            margin: '0 auto 64px',
            padding: '24px 28px 32px',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--paper-alt)',
          }}
        >
          <div className="row-bw" style={{ marginBottom: 16 }}>
            <span className="mc-caption-up">your deployments</span>
            <span className="mc-mono muted" style={{ fontSize: 11.5 }}>
              last 24h: {totalCalls24h.toLocaleString()} calls
            </span>
          </div>
          {deployments.data.map((d) => {
            const qr = (d.quality_report ?? null) as QualityReportType | null;
            const tier: BadgeTier | null = qr !== null ? badgeTier(qr) : null;
            const label: string | null = qr !== null ? badgeLabel(qr) : null;
            const deploymentUsage = (usageHourly.data ?? []).filter(
              (row) => row.deployment_id === d.deployment_id,
            );
            const calls = deploymentUsage.reduce((sum, row) => sum + row.call_count, 0);
            const totalCost = deploymentUsage.reduce(
              (sum, row) => sum + (row.total_cost_usd ?? 0),
              0,
            );
            return (
              <div
                key={d.deployment_id}
                data-testid={`deployment-card-${d.deployment_id}`}
                className="row"
                style={{
                  gap: 16,
                  padding: '12px 0',
                  borderBottom: '1px dashed var(--border)',
                  alignItems: 'center',
                }}
              >
                <span style={{ minWidth: 220, fontSize: 13, fontWeight: 600 }}>
                  {d.server_name}
                </span>
                <span className="muted" style={{ flex: 1, fontSize: 12.5, wordBreak: 'break-all' }}>
                  {d.server_url}
                </span>
                <span style={{ minWidth: 80, textAlign: 'right', fontSize: 12.5 }}>
                  {calls.toLocaleString()} calls
                </span>
                <span style={{ minWidth: 80, textAlign: 'right', fontSize: 12.5 }}>
                  ${totalCost.toFixed(2)}
                </span>
                {tier !== null && label !== null && (
                  <span
                    data-testid={`quality-badge-${d.deployment_id}`}
                    data-tier={tier}
                    style={{
                      minWidth: 110,
                      padding: '2px 8px',
                      fontSize: 11,
                      border: '1px solid var(--border-sharp)',
                      borderRadius: 'var(--radius)',
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </span>
                )}
                <label
                  className="row"
                  style={{ gap: 6, fontSize: 11, color: 'var(--text-muted)' }}
                >
                  <input
                    type="checkbox"
                    data-testid={`badge-public-toggle-${d.deployment_id}`}
                    checked={d.public_badge}
                    onChange={() => onTogglePublicBadge(d)}
                  />
                  public
                </label>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

// Re-export the sample list so routes can hand the locked first entry to the
// LandingWrapper without re-importing from `./index` separately.
export { SAMPLE_APIS };
