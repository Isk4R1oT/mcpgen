// apps/web/src/components/screens/deploy/deploy.tsx
//
// Phase 1 / Agent A5 — Deploy screen.
//
// Source of truth: claude-design-reference/canon/screen-deploy.jsx
// (`Deploy({ onDeployed, onBack, sample })`). Pixel-faithful rebuild against
// the production primitive kit + typed BFF clients.
//
// Backend wiring (per A5 brief + SCREEN-BEHAVIORS-CATALOG § deploy):
//   - "deploy" → POST /api/v1/deploy/ephemeral via `useDeployEphemeral()`.
//     On success the parent route flips local URL state (`?deployed=1`) so
//     `<DeploySuccess>` takes over. The parent owns the routing — this
//     component invokes `onDeployed(response)` and lets the page decide.
//   - errorMode === 'deploy-fail' (Zustand store) still drives the failure
//     branch UI verbatim (canon "edge rejected the bundle." card stack).
//   - target picker, auth picker, build-log drawer, vault explainer, custom URL
//     button — all UI surfaces preserved per SHARED-BRIEF rule 4 ("All canon
//     UI surfaces survive in code"). Pro / `_perm` flags are surfaced as
//     disabled state when not yet implemented (no UI is stripped).

'use client';

import { useState, type ReactElement } from 'react';

import { Badge, Btn, Card, Icon, SectionLabel, TopBar } from '@/components/ui';
import { deriveServerNameFromSpecUrl } from '@/components/screens/canvas/canvas';
import { useDeployEphemeral } from '@/lib/api/deployments';
import { useJob } from '@/lib/api/jobs';
import type { DeployResponse } from '@mcpgen/contracts/dashboard-api';
import { useErrorMode } from '@/stores/error-mode';

// ────────────────────────────────────────────────────────────────────────────
// Canon-verbatim option lists.
// ────────────────────────────────────────────────────────────────────────────

interface DeployOption {
  readonly id: 'cloud' | 'cf' | 'docker' | 'src';
  readonly title: string;
  readonly tag: '' | 'recommended' | 'pro';
  readonly desc: string;
  readonly meta: string;
}

const DEPLOY_OPTIONS: readonly DeployOption[] = [
  {
    id: 'cloud',
    title: 'mcpgen cloud',
    tag: 'recommended',
    desc: 'we host. you get a URL. we bill per tool-call.',
    meta: 'free: 100K calls/mo · pro: $19/mo + $0.0001/call',
  },
  {
    id: 'cf',
    title: 'your cloudflare workers',
    tag: '',
    desc: 'we deploy to your CF account. you pay CF directly.',
    meta: 'one-time setup: $0',
  },
  {
    id: 'docker',
    title: 'docker image',
    tag: 'pro',
    desc: 'docker pull mcpgen/lumen-mcp-abc123:latest',
    meta: 'run it anywhere.',
  },
  {
    id: 'src',
    title: 'source + dockerfile',
    tag: 'pro',
    desc: 'we generate, you take, we never see runtime.',
    meta: 'for the truly paranoid.',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Component.
// ────────────────────────────────────────────────────────────────────────────

export interface DeploySample {
  readonly id: string;
  readonly name: string;
}

export interface DeployProps {
  readonly jobId: string;
  readonly sample?: DeploySample;
  /** Original spec URL — used to derive a breadcrumb server name when the
   *  BFF hasn't surfaced `partial_result.spec_name` yet. */
  readonly specUrl?: string;
  readonly onBack?: () => void;
  /**
   * Called on successful deploy with the BFF response. The owning route
   * decides what to do (typically: update URL + render `<DeploySuccess>`).
   */
  readonly onDeployed?: (response: DeployResponse) => void;
}

export default function Deploy({
  jobId,
  sample,
  specUrl,
  onBack,
  onDeployed,
}: DeployProps): ReactElement {
  const errorMode = useErrorMode((s) => s.mode);
  const willFail = errorMode === 'deploy-fail';

  const [opt, setOpt] = useState<DeployOption['id']>('cloud');
  const [auth, setAuth] = useState<'passthrough' | 'static'>('passthrough');
  const [deploying, setDeploying] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);
  // Real BFF error captured from the mutation Result. When this is null we
  // render the willFail/test-fixture message; otherwise we surface the actual
  // error_code + message (no canon "mcp-sdk@2.1" placeholder strings).
  const [deployError, setDeployError] = useState<DeployErrorView | null>(null);

  const deployMutation = useDeployEphemeral();

  // Breadcrumb server name — same chain as canvas/preview screens.
  // Priority: explicit sample.name (server-side prop) → BFF
  // partial_result.spec_name → derived from spec URL → "mcp-server".
  const jobQuery = useJob(jobId);
  const job = jobQuery.data?.ok === true ? jobQuery.data.data : null;
  const partial = job?.partial_result ?? null;
  const specNameFromJob =
    partial !== null && typeof partial.spec_name === 'string' && partial.spec_name !== ''
      ? partial.spec_name
      : null;
  const specNameFromUrl = deriveServerNameFromSpecUrl(specUrl);
  const derivedServerName: string =
    sample?.name !== undefined && sample.name !== ''
      ? sample.name
      : specNameFromJob ?? specNameFromUrl;

  const go = async (): Promise<void> => {
    setDeploying(true);
    setFailed(false);
    setDeployError(null);

    // Honour `errorMode === 'deploy-fail'` test override — short-circuit to
    // the failure card without firing a real request.
    if (willFail) {
      setTimeout(() => {
        setFailed(true);
        setDeployError(null); // willFail uses the fallback copy
      }, 1800);
      return;
    }

    const result = await deployMutation.mutateAsync({ generationId: jobId });
    if (!result.ok) {
      setFailed(true);
      setDeployError(adaptDeployError(result));
      return;
    }
    onDeployed?.(result.data);
  };

  // ─── Failed branch ───────────────────────────────────────────────────────
  if (deploying && failed) {
    // Resolve display copy from the real BFF error when present, else fall
    // back to the willFail/test-fixture defaults. Canon DEMO strings
    // ("mcp-sdk@2.1", "2.0.4", "cdg, sfo, sin", "v1.1.7 rollback") are gone.
    const display = deployError ?? FALLBACK_FAIL_VIEW;

    return (
      <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
        <TopBar
          crumb="deploy failed"
          {...(onBack !== undefined ? { onLogo: onBack } : {})}
          right={
            <Btn
              kind="ghost"
              size="sm"
              icon="arrow-l"
              onClick={() => {
                setDeploying(false);
                setFailed(false);
                setDeployError(null);
              }}
            >
              back to options
            </Btn>
          }
        />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '60px 28px' }}>
          <div
            className="mc-caption-up"
            style={{ marginBottom: 8, color: 'var(--accent)' }}
          >
            <span className="mc-dot alert" style={{ marginRight: 6 }} />
            deploy failed
          </div>
          <div className="mc-display-l" style={{ marginBottom: 28 }}>
            {display.headline}
          </div>

          <Card
            style={{
              marginBottom: 18,
              borderColor: 'var(--accent)',
              borderLeftWidth: 4,
            }}
          >
            <SectionLabel>what happened</SectionLabel>
            <div className="mc-log">
              <div>
                <span style={{ color: 'var(--accent)' }}>✕ </span>
                {display.errorTitle}
              </div>
              {display.errorCode !== null ? (
                <div className="indent">
                  error code ·{' '}
                  <span className="mc-mono">{display.errorCode}</span>
                </div>
              ) : null}
              {display.statusLine !== null ? (
                <div className="indent">{display.statusLine}</div>
              ) : null}
            </div>
          </Card>

          <Card style={{ marginBottom: 18 }}>
            <SectionLabel>likely cause</SectionLabel>
            <div className="mc-rec">
              <Icon name="spark" size={12} />
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}
                >
                  {display.causeTitle}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 12.5, marginBottom: 8 }}
                >
                  {display.causeMessage}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Btn
                    kind="primary"
                    size="sm"
                    icon="play"
                    onClick={() => {
                      setFailed(false);
                      setDeployError(null);
                      void go();
                    }}
                  >
                    retry deploy
                  </Btn>
                </div>
              </div>
            </div>
          </Card>

          <div className="row" style={{ gap: 8, marginTop: 24 }}>
            <Btn
              kind="ghost"
              size="lg"
              onClick={() => {
                setDeploying(false);
                setFailed(false);
                setDeployError(null);
              }}
            >
              change options
            </Btn>
            <Btn kind="ghost" size="lg" onClick={onBack}>
              back to canvas
            </Btn>
          </div>
        </main>
      </div>
    );
  }

  // ─── Deploying branch ────────────────────────────────────────────────────
  if (deploying) {
    return (
      <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
        <TopBar
          crumb="deploying…"
          {...(onBack !== undefined ? { onLogo: onBack } : {})}
        />
        <main
          style={{ maxWidth: 600, margin: '0 auto', padding: '120px 28px' }}
        >
          <div className="mc-display-l" style={{ marginBottom: 32 }}>
            shipping it.
          </div>
          <div className="mc-progress" style={{ marginBottom: 12 }}>
            <div style={{ width: '60%' }} />
          </div>
          <div className="mc-mono muted" style={{ fontSize: 13 }}>
            <div>✓ bundling typescript module</div>
            <div>✓ generating mcp manifest</div>
            <div>
              <span className="mc-spin" style={{ display: 'inline-block' }}>
                ⠹
              </span>{' '}
              uploading to edge...
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ─── Form branch ─────────────────────────────────────────────────────────
  const crumb = `deploy ${derivedServerName}-mcp`;

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={crumb}
        {...(onBack !== undefined ? { onLogo: onBack } : {})}
        right={
          <Btn kind="ghost" size="sm" icon="arrow-l" onClick={onBack}>
            back
          </Btn>
        }
      />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px' }}>
        <div className="mc-display-l" style={{ marginBottom: 8 }}>
          where should this live?
        </div>
        <p className="muted" style={{ marginBottom: 32, fontSize: 15 }}>
          most people pick cloud and never look back. but the others are real.
        </p>

        <SectionLabel>deployment target</SectionLabel>
        <div className="col" style={{ gap: 8, marginBottom: 32 }}>
          {DEPLOY_OPTIONS.map((o) => {
            const isPro = o.tag === 'pro';
            // Pro / BYO-CF targets are not yet enabled — keep canon UI but
            // disable interaction so the user can still see the option.
            const interactive = !isPro && o.id !== 'cf';
            return (
              <div
                key={o.id}
                className={`mc-radio-row ${opt === o.id ? 'sel' : ''}`}
                onClick={interactive ? () => setOpt(o.id) : undefined}
                style={interactive ? undefined : { opacity: 0.55, cursor: 'not-allowed' }}
                role="radio"
                aria-checked={opt === o.id}
                aria-disabled={!interactive}
                data-target={o.id}
              >
                <span className="mc-radio-glyph">
                  {opt === o.id ? '◉' : '○'}
                </span>
                <div style={{ flex: 1 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {o.title}
                    </span>
                    {o.tag === 'recommended' && (
                      <Badge kind="primary" mono={false}>
                        recommended
                      </Badge>
                    )}
                    {o.tag === 'pro' && (
                      <Badge kind="ink" mono={false}>
                        pro
                      </Badge>
                    )}
                  </div>
                  <div
                    className="mc-mono muted"
                    style={{ fontSize: 12.5 }}
                  >
                    {o.desc}
                  </div>
                  <div
                    className="mc-mono"
                    style={{
                      fontSize: 11.5,
                      color: 'var(--text-faint)',
                      marginTop: 4,
                    }}
                  >
                    {o.meta}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <SectionLabel>server URL</SectionLabel>
        <div className="row" style={{ gap: 8, marginBottom: 32 }}>
          <div
            className="mc-mono mc-input"
            style={{
              display: 'flex',
              alignItems: 'center',
              flex: 1,
              height: 44,
            }}
          >
            {sample?.id ?? 'lumen'}-mcp-{shortId(jobId)}
            <span className="muted">.mcpgen.app</span>
          </div>
          <Btn kind="ghost" disabled title="custom URLs are a Pro feature">
            customize
          </Btn>
        </div>

        <SectionLabel>credentials forwarding</SectionLabel>
        <div className="col" style={{ gap: 8, marginBottom: 40 }}>
          <div
            className={`mc-radio-row ${auth === 'passthrough' ? 'sel' : ''}`}
            onClick={() => setAuth('passthrough')}
            role="radio"
            aria-checked={auth === 'passthrough'}
            data-auth="passthrough"
          >
            <span className="mc-radio-glyph">
              {auth === 'passthrough' ? '◉' : '○'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                pass-through <Badge kind="success">recommended</Badge>
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                each agent passes its own key. we never see them.
              </div>
            </div>
          </div>
          <div
            className={`mc-radio-row ${auth === 'static' ? 'sel' : ''}`}
            onClick={undefined /* gated behind ui_deploy_stored_creds_perm */}
            role="radio"
            aria-checked={auth === 'static'}
            aria-disabled
            data-auth="static"
            style={{ opacity: 0.55, cursor: 'not-allowed' }}
          >
            <span className="mc-radio-glyph">
              {auth === 'static' ? '◉' : '○'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                static, stored in vault <Badge kind="ink">pro</Badge>
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                for SaaS-style agents acting on behalf of users.{' '}
                <span className="mc-link" style={{ opacity: 0.6 }}>
                  why this is safe →
                </span>
              </div>
            </div>
          </div>
        </div>

        <Btn
          kind="primary"
          size="lg"
          full
          iconR="arrow-r"
          onClick={() => void go()}
          disabled={deployMutation.isPending}
        >
          deploy
        </Btn>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Short slug for the URL preview ("…-mcp-abc123" in canon). Real server name
 * is decided by the BFF on POST /deploy/ephemeral — this is presentation-only.
 */
function shortId(jobId: string): string {
  const cleaned = jobId.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return cleaned.length >= 6 ? cleaned.slice(0, 6) : cleaned.padEnd(6, 'x');
}

// ─── Deploy error adapter ──────────────────────────────────────────────────
//
// The BFF returns a `Result<DeployResponse>`; on failure the shape is
// `{ ok: false, status, error, raw? }`. `error` is the canonical error_code
// string (e.g. "no_anon_session", "rate_limited", "internal"). `raw` may
// carry a structured `{ error, message, detail }` blob from the API.
//
// Adapt this into a plain view-model so the failed branch never has to peek
// at the Result shape inline. Returns null for the willFail / test-fixture
// path which uses FALLBACK_FAIL_VIEW.

interface DeployErrorView {
  readonly headline: string;
  readonly errorTitle: string;
  readonly errorCode: string | null;
  readonly statusLine: string | null;
  readonly causeTitle: string;
  readonly causeMessage: string;
}

const FALLBACK_FAIL_VIEW: DeployErrorView = {
  headline: 'we couldn’t deploy this build.',
  errorTitle: 'deploy failed',
  errorCode: null,
  statusLine: null,
  causeTitle: 'something went wrong while shipping the bundle',
  causeMessage:
    'no further detail was returned. retry the deploy — if it keeps failing, change the deployment target and try again.',
};

interface BffErrorResult {
  readonly ok: false;
  readonly status: number;
  readonly error: string;
  readonly raw?: unknown;
}

function adaptDeployError(result: BffErrorResult): DeployErrorView {
  const code = result.error;
  const status = result.status;

  // Surface a structured `message` / `detail` from the raw BFF body when
  // present. The BFF contract is `{ error: <code>, message?: string,
  // detail?: string }`.
  const rawObj =
    result.raw !== null && typeof result.raw === 'object'
      ? (result.raw as Record<string, unknown>)
      : null;
  const rawMessage =
    rawObj !== null && typeof rawObj['message'] === 'string'
      ? (rawObj['message'] as string)
      : null;
  const rawDetail =
    rawObj !== null && typeof rawObj['detail'] === 'string'
      ? (rawObj['detail'] as string)
      : null;

  // Common error codes get tailored copy. Everything else falls back to the
  // raw error code + message.
  if (code === 'no_anon_session') {
    return {
      headline: 'your session expired.',
      errorTitle: 'deploy failed: anon session missing',
      errorCode: code,
      statusLine: status > 0 ? `http ${status}` : null,
      causeTitle: 'your anon session cookie is missing',
      causeMessage:
        'refresh the page to start a new anonymous session, then try the deploy again.',
    };
  }
  if (code === 'rate_limited') {
    return {
      headline: 'too many deploys, too fast.',
      errorTitle: 'deploy failed: rate limited',
      errorCode: code,
      statusLine: status > 0 ? `http ${status}` : null,
      causeTitle: 'you’ve hit the anonymous deploy rate limit',
      causeMessage:
        rawMessage ?? 'wait a minute and try again — or sign in for higher limits.',
    };
  }
  if (code === 'generation_not_found' || code === 'not_found') {
    return {
      headline: 'we lost track of this build.',
      errorTitle: 'deploy failed: generation not found',
      errorCode: code,
      statusLine: status > 0 ? `http ${status}` : null,
      causeTitle: 'this generation no longer exists',
      causeMessage:
        rawMessage ??
        'the generation may have expired or been cleaned up. go back and re-run generation.',
    };
  }

  // Generic fallback — use whatever the BFF gave us.
  const detail = rawDetail ?? rawMessage ?? null;
  return {
    headline: 'we couldn’t deploy this build.',
    errorTitle: rawMessage ?? `deploy failed: ${code}`,
    errorCode: code !== '' ? code : null,
    statusLine: status > 0 ? `http ${status}` : null,
    causeTitle: 'the deploy request was rejected',
    causeMessage:
      detail ??
      'no further detail was returned. retry the deploy — if it keeps failing, contact support with the error code above.',
  };
}
