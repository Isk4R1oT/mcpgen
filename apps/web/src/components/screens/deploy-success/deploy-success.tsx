// apps/web/src/components/screens/deploy-success/deploy-success.tsx
//
// Phase 1 / Agent A5 — DeploySuccess screen.
//
// Source of truth: claude-design-reference/canon/screen-deploy.jsx
// (`DeploySuccess({ onDashboard, sample })`). Pixel-faithful rebuild against
// production primitives.
//
// Backend wiring:
//   - The deploy itself happens in `<Deploy>`. This component receives the
//     resolved MCP URL + Claude Desktop config from the parent route (which
//     keeps them in URL state or local React state) and renders read-only
//     post-deploy UX: copy buttons, share modal, marketplace toggle, claim CTA.
//   - "claim permanent" CTA — deploy/ephemeral creates an anon ephemeral
//     server which the user can claim by signing in. Per A5 brief:
//     `window.location.assign('/sign-in?redirect_to=/generate/<jobId>/deploy/permanent')`
//     (canon embedded sign-in screen).
//   - Copy buttons use `navigator.clipboard.writeText` + `toast('copied')`
//     per A5 brief.
//   - "publish to marketplace" toggle is client-only (gated behind
//     `ui_marketplace_publish_perm`).
//   - "invite teammates" / "share via slack/email/discord" are gated behind
//     `ui_teams_invite_perm` — we keep the canon UI but disable the buttons.

'use client';

import { useState, type ReactElement } from 'react';

import { Btn, Card, Icon, SectionLabel, TopBar } from '@/components/ui';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Public API.
// ────────────────────────────────────────────────────────────────────────────

export interface DeploySuccessSample {
  readonly id: string;
  readonly name: string;
}

export interface DeploySuccessProps {
  readonly jobId: string;
  /** Resolved MCP URL from the BFF deploy response (e.g. `https://stripe-mcp-abc123.mcpgen.app/mcp`). */
  readonly mcpUrl: string;
  /** Pre-formatted Claude Desktop config JSON block (optional — we synthesise one if absent). */
  readonly configJson?: string;
  readonly sample?: DeploySuccessSample;
  readonly isClaimed?: boolean;
  readonly onDashboard?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Component.
// ────────────────────────────────────────────────────────────────────────────

type CopiedKey = '' | 'url' | 'install' | 'share';

export default function DeploySuccess({
  jobId,
  mcpUrl,
  configJson,
  sample,
  isClaimed = false,
  onDashboard,
}: DeploySuccessProps): ReactElement {
  const [copied, setCopied] = useState<CopiedKey>('');
  const [shareSheet, setShareSheet] = useState<boolean>(false);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');

  const sampleId = sample?.id ?? 'lumen';
  const url = mcpUrl.replace(/^https?:\/\//, '');
  const installCmd = `npx mcpgen install ${sampleId}-mcp-${shortJobId(jobId)}`;
  const shareUrl = `https://mcpgen.app/s/${sampleId}-mcp-${shortJobId(jobId)}`;
  const config =
    configJson ??
    `{
  "mcpServers": {
    "${sampleId}": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer \${${sampleId.toUpperCase()}_KEY}"
      }
    }
  }
}`;

  const copy = async (text: string, key: Exclude<CopiedKey, ''>): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast('copied');
      setTimeout(() => setCopied(''), 1400);
    } catch {
      toast('copy failed', { kind: 'error' });
    }
  };

  const claim = (): void => {
    if (typeof window === 'undefined') return;
    // Canon embedded sign-in (MCPGen(5)) at /sign-in — replaces the prior
    // direct redirect to Logto Hosted UI. After successful auth the
    // AccountScreen reads the `redirect_to` query and routes to the
    // permanent-deploy claim page.
    const target = `/sign-in?redirect_to=${encodeURIComponent(
      `/generate/${jobId}/deploy/permanent`,
    )}`;
    window.location.assign(target);
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        {...(onDashboard !== undefined ? { onLogo: onDashboard } : {})}
        right={
          <Btn kind="ghost" size="sm" onClick={onDashboard}>
            dashboard →
          </Btn>
        }
      />

      <main
        style={{
          maxWidth: 720,
          margin: '0 auto',
          padding: '60px 28px 80px',
        }}
      >
        <div style={{ marginBottom: 36 }}>
          <div className="mc-caption-up" style={{ marginBottom: 8 }}>
            <span className="mc-dot live" style={{ marginRight: 6 }} />
            live · all 3 regions healthy
          </div>
          <div className="mc-display-xl" style={{ marginBottom: 0 }}>
            it's live.
          </div>
        </div>

        {/* URL card */}
        <Card style={{ marginBottom: 16 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>
            your endpoint
          </div>
          <div className="row-bw" style={{ gap: 12 }}>
            <span
              className="mc-mono"
              style={{ fontSize: 16, wordBreak: 'break-all' }}
            >
              <span className="muted">https://</span>
              {url}
            </span>
            <Btn
              kind="ink"
              size="sm"
              icon={copied === 'url' ? 'check' : 'copy'}
              onClick={() => void copy(mcpUrl, 'url')}
            >
              {copied === 'url' ? 'copied' : 'copy'}
            </Btn>
          </div>
        </Card>

        {/* Claim CTA — only when this is an anon ephemeral deploy. */}
        {!isClaimed && (
          <Card
            style={{
              marginBottom: 16,
              borderColor: 'var(--primary)',
              borderLeftWidth: 4,
            }}
          >
            <div className="row-bw" style={{ gap: 12, alignItems: 'center' }}>
              <div>
                <div
                  className="mc-caption-up"
                  style={{ marginBottom: 4, color: 'var(--primary)' }}
                >
                  ephemeral · expires in 24h
                </div>
                <div style={{ fontSize: 14 }}>
                  sign in to claim this deploy permanently and get a stable URL.
                </div>
              </div>
              <Btn kind="primary" size="md" iconR="arrow-r" onClick={claim}>
                claim permanent
              </Btn>
            </div>
          </Card>
        )}

        {/* What now? — three primary post-deploy actions */}
        <div className="mc-caption-up" style={{ marginBottom: 10 }}>
          what now?
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10,
            marginBottom: 32,
          }}
        >
          <button
            type="button"
            className="mc-card"
            onClick={() => void copy(installCmd, 'install')}
            style={{
              padding: 16,
              textAlign: 'left',
              cursor: 'pointer',
              background: 'var(--card)',
              borderColor: 'var(--border-sharp)',
            }}
            data-action="copy-install"
          >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Icon name={copied === 'install' ? 'check' : 'copy'} size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                copy install command
              </span>
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11.5,
                color: 'var(--text-muted)',
                marginBottom: 6,
                lineHeight: 1.4,
              }}
            >
              one-liner for any client.
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11,
                padding: '4px 6px',
                background: 'var(--paper-alt)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color:
                  copied === 'install' ? 'var(--success)' : 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {copied === 'install' ? '✓ copied to clipboard' : `$ ${installCmd}`}
            </div>
          </button>

          <button
            type="button"
            className="mc-card"
            onClick={() => setShareSheet(true)}
            style={{
              padding: 16,
              textAlign: 'left',
              cursor: 'pointer',
              background: 'var(--card)',
              borderColor: 'var(--border-sharp)',
            }}
            data-action="share"
          >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Icon name="share" size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                share with team
              </span>
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11.5,
                color: 'var(--text-muted)',
                marginBottom: 6,
                lineHeight: 1.4,
              }}
            >
              link, slack, or invite by email.
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11,
                padding: '4px 6px',
                background: 'var(--paper-alt)',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {shareUrl.replace('https://', '')}
            </div>
          </button>

          <button
            type="button"
            className="mc-card"
            onClick={() =>
              setVisibility((v) => (v === 'private' ? 'public' : 'private'))
            }
            style={{
              padding: 16,
              textAlign: 'left',
              cursor: 'pointer',
              background:
                visibility === 'public' ? 'var(--primary)' : 'var(--card)',
              color:
                visibility === 'public' ? 'var(--primary-ink)' : 'var(--text)',
              borderColor: 'var(--border-sharp)',
            }}
            data-action="publish"
          >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Icon name="cloud" size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                {visibility === 'public'
                  ? 'published to marketplace'
                  : 'publish to marketplace'}
              </span>
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11.5,
                color:
                  visibility === 'public'
                    ? 'var(--primary-ink)'
                    : 'var(--text-muted)',
                opacity: visibility === 'public' ? 0.8 : 1,
                marginBottom: 6,
                lineHeight: 1.4,
              }}
            >
              {visibility === 'public'
                ? 'discoverable · forkable · click to unpublish'
                : 'discoverable · forkable · earn from forks'}
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 11,
                padding: '4px 6px',
                background:
                  visibility === 'public'
                    ? 'rgba(0,0,0,.12)'
                    : 'var(--paper-alt)',
                border:
                  '1px solid ' +
                  (visibility === 'public'
                    ? 'rgba(0,0,0,.2)'
                    : 'var(--border)'),
                borderRadius: 3,
              }}
            >
              {visibility === 'public'
                ? '◉ public'
                : '○ private (toggle to publish)'}
            </div>
          </button>
        </div>

        <SectionLabel>connect to</SectionLabel>
        <div className="mc-connect" style={{ marginBottom: 32 }}>
          {[
            { name: 'claude desktop', hint: 'one-click' },
            { name: 'cursor', hint: 'one-click' },
            { name: 'cline', hint: 'one-click' },
            { name: 'langgraph', hint: 'snippet ↓' },
          ].map((c) => (
            <div key={c.name} className="mc-connect-card">
              <div className="name">{c.name}</div>
              <div className="hint">▶ {c.hint}</div>
            </div>
          ))}
        </div>

        <SectionLabel>or paste this anywhere</SectionLabel>
        <div className="mc-code" style={{ marginBottom: 32 }} data-config-block>
          {config}
        </div>

        <Btn
          kind="primary"
          size="lg"
          full
          iconR="arrow-r"
          onClick={onDashboard}
        >
          open dashboard
        </Btn>
      </main>

      {/* Share sheet (modal) */}
      {shareSheet && (
        <div
          className="mc-modal-veil"
          onClick={() => setShareSheet(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="mc-modal"
            style={{ width: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mc-modal-head">
              <div>
                <div className="mc-caption-up">share</div>
                <div className="mc-h2" style={{ marginTop: 2 }}>
                  send this server
                </div>
              </div>
              <button
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-sm"
                onClick={() => setShareSheet(false)}
                style={{ padding: '0 8px' }}
                aria-label="close share sheet"
              >
                <Icon name="x" size={11} />
              </button>
            </div>
            <div className="mc-modal-body">
              <SectionLabel>shareable link</SectionLabel>
              <div className="row" style={{ gap: 8, marginBottom: 22 }}>
                <div
                  className="mc-input mc-mono"
                  style={{
                    flex: 1,
                    height: 40,
                    display: 'flex',
                    alignItems: 'center',
                    fontSize: 12.5,
                  }}
                >
                  {shareUrl}
                </div>
                <Btn
                  kind="ink"
                  size="md"
                  icon={copied === 'share' ? 'check' : 'copy'}
                  onClick={() => void copy(shareUrl, 'share')}
                >
                  {copied === 'share' ? 'copied' : 'copy'}
                </Btn>
              </div>

              <SectionLabel>or send directly</SectionLabel>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  marginBottom: 22,
                }}
              >
                {[
                  { name: 'slack' as const, icon: 'share' as const },
                  { name: 'email' as const, icon: 'share' as const },
                  { name: 'discord' as const, icon: 'share' as const },
                ].map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="mc-btn mc-btn-ghost"
                    style={{ height: 38, justifyContent: 'center' }}
                    disabled
                    title="team invites coming soon"
                  >
                    <Icon name={c.icon} size={11} /> {c.name}
                  </button>
                ))}
              </div>

              <SectionLabel>invite teammates</SectionLabel>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="mc-input"
                  placeholder="email@company.com, comma separated"
                  style={{ flex: 1, height: 40, fontSize: 13 }}
                  disabled
                />
                <Btn kind="primary" size="md" disabled>
                  invite
                </Btn>
              </div>
            </div>
            <div className="mc-modal-foot">
              <span className="mc-caption">
                link works without sign-up. recipients can clone or fork in one
                click.
              </span>
              <Btn kind="ghost" size="sm" onClick={() => setShareSheet(false)}>
                done
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────────────────────

function shortJobId(jobId: string): string {
  const cleaned = jobId.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return cleaned.length >= 6 ? cleaned.slice(0, 6) : cleaned.padEnd(6, 'x');
}
