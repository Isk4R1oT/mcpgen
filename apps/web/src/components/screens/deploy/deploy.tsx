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
import { useDeployEphemeral } from '@/lib/api/deployments';
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
  onBack,
  onDeployed,
}: DeployProps): ReactElement {
  const errorMode = useErrorMode((s) => s.mode);
  const willFail = errorMode === 'deploy-fail';

  const [opt, setOpt] = useState<DeployOption['id']>('cloud');
  const [auth, setAuth] = useState<'passthrough' | 'static'>('passthrough');
  const [deploying, setDeploying] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  const deployMutation = useDeployEphemeral();

  const go = async (): Promise<void> => {
    setDeploying(true);
    setFailed(false);

    // Honour `errorMode === 'deploy-fail'` test override — short-circuit to
    // the canon failure card without firing a real request.
    if (willFail) {
      setTimeout(() => setFailed(true), 1800);
      return;
    }

    const result = await deployMutation.mutateAsync({ generationId: jobId });
    if (!result.ok) {
      setFailed(true);
      return;
    }
    onDeployed?.(result.data);
  };

  // ─── Failed branch ───────────────────────────────────────────────────────
  if (deploying && failed) {
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
            deploy failed · 0 / 3 regions healthy
          </div>
          <div className="mc-display-l" style={{ marginBottom: 28 }}>
            edge rejected the bundle.
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
                <span className="ok">✓ </span>bundled typescript module · 4.2 kb
              </div>
              <div>
                <span className="ok">✓ </span>generated mcp manifest
              </div>
              <div>
                <span className="ok">✓ </span>uploaded to edge
              </div>
              <div>
                <span style={{ color: 'var(--accent)' }}>✕ </span>cold-start
                probe failed in <span className="mc-mono">cdg, sfo, sin</span>
              </div>
              <div className="indent">
                runtime error ·{' '}
                <span className="mc-mono">cannot find module 'mcp-sdk@2.1'</span>
              </div>
              <div className="indent">
                → rollback to v1.1.7 was triggered automatically · existing
                traffic unaffected
              </div>
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
                  your runtime pin doesn't exist on edge
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 12.5, marginBottom: 8 }}
                >
                  the manifest requests{' '}
                  <span className="mc-mono">mcp-sdk@2.1</span>, but the edge
                  runtime ships <span className="mc-mono">2.0.4</span>. either
                  downgrade the pin or switch to{' '}
                  <span className="mc-mono">cloud (managed)</span> which
                  auto-bumps.
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Btn kind="primary" size="sm" icon="spark" disabled>
                    auto-fix &amp; retry
                  </Btn>
                  <Btn kind="ink" size="sm" disabled>
                    use mcp-sdk@2.0.4
                  </Btn>
                  <Btn kind="ghost" size="sm" disabled>
                    view full log
                  </Btn>
                </div>
              </div>
            </div>
          </Card>

          <div className="row" style={{ gap: 8, marginTop: 24 }}>
            <Btn
              kind="ink"
              size="lg"
              icon="play"
              onClick={() => {
                setFailed(false);
                void go();
              }}
            >
              retry deploy
            </Btn>
            <Btn
              kind="ghost"
              size="lg"
              onClick={() => {
                setDeploying(false);
                setFailed(false);
              }}
            >
              change options
            </Btn>
            <Btn kind="ghost" size="lg" onClick={onBack}>
              back to canvas
            </Btn>
          </div>

          <div className="mc-caption" style={{ marginTop: 16 }}>
            we keep failed deploys for 7 days. open{' '}
            <span className="mc-link" style={{ opacity: 0.6 }}>
              deploy logs
            </span>{' '}
            if you want to ssh into the failed environment.
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
  const crumb = `deploy ${sample?.name ?? 'lumen-payments'}-mcp`;

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
