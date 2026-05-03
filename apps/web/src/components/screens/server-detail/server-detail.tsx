// apps/web/src/components/screens/server-detail/server-detail.tsx
//
// Phase 2 / Agent B4 — Marketplace ServerDetail screen.
//
// Source of truth: claude-design-reference/canon/screen-server-detail.jsx
// (`ServerDetail({ server, onBack, onInstall, onDashboard, onMarketplace })`).
// Pixel-faithful rebuild against `@/components/ui/*` + next-intl translations.
//
// Backend wiring (per B4 brief + SCREEN-BEHAVIORS-CATALOG § server-detail):
//   - `useMarketplaceServer(id)` is a typed disabled-stub (BFF endpoint
//     missing). When the result is `flag_off_or_not_implemented` we render
//     canon's full structural surface (header / stats / tabs / right rail)
//     with a "coming soon" inline overlay so the user sees the design and
//     learns the feature is dark.
//   - "Install" CTA is gated by `ui_marketplace_install_perm` flag (added
//     to FLAGS-NEEDED.md); when OFF the click triggers
//     `toast('Coming soon — install requires backend wiring')`.
//   - "Star" / "Fork" / "Request SOC2" — gated identically; canon UI
//     preserved, click → toast stub.
//
// Tabs (`readme`, `tools`, `changelog`, `issues`, `security`) are pure
// client state; bodies are canon-verbatim.

'use client';

import { useRouter } from 'next/navigation';
import {
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import { Badge, Btn, Card, Icon, SectionLabel, TopBar } from '@/components/ui';
import { useMarketplaceServer } from '@/lib/api/marketplace';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Types — canon-shaped server record (subset used on detail).
// ────────────────────────────────────────────────────────────────────────────

export interface MarketplaceServerDetail {
  readonly id: string;
  readonly name: string;
  readonly author: string;
  readonly verified: boolean;
  readonly tools: number;
  readonly stars: number;
  readonly installs: number;
  readonly weekly: number;
  readonly desc: string;
  readonly tags: ReadonlyArray<string>;
  readonly updated: string;
  readonly license: string;
  readonly forks: number;
}

interface ToolEntry {
  readonly name: string;
  readonly desc: string;
  readonly tk: number;
  readonly comp?: boolean;
}

// Canon mock tools list — until BFF lands these stay in place per the
// catalog (replace when `/api/v1/marketplace/servers/:id/tools` ships).
const CANON_TOOLS: ReadonlyArray<ToolEntry> = [
  { name: 'create_charge', desc: 'create a charge against a customer or token', tk: 32 },
  { name: 'list_charges', desc: 'list charges with filters and pagination', tk: 28 },
  { name: 'refund_charge', desc: 'issue a full or partial refund', tk: 24 },
  { name: 'capture_charge', desc: 'capture a previously authorized charge', tk: 22 },
  { name: 'attach_payment_method', desc: 'attach a payment method to a customer', tk: 26 },
  { name: 'create_subscription', desc: 'subscribe a customer to a price', tk: 36 },
  { name: 'order_lifecycle', desc: 'composed: list → refund → notify in one call', tk: 62, comp: true },
];

// Canon stub fallback — used when the BFF stub returns no detail. Mirrors
// the canon `s.author/s.name` etc. so the layout still renders cleanly.
const CANON_STUB: MarketplaceServerDetail = {
  id: 'stripe-official',
  name: 'stripe-mcp',
  author: 'stripe',
  verified: true,
  tools: 64,
  stars: 4280,
  installs: 42100,
  weekly: 8200,
  desc:
    'official mcp server for stripe payments. charges, customers, subscriptions, and disputes.',
  tags: ['payments', 'official', 'stripe'],
  updated: '2 days ago',
  license: 'mit',
  forks: 38,
};

type TabId = 'readme' | 'tools' | 'changelog' | 'issues' | 'security';

// ────────────────────────────────────────────────────────────────────────────
// Component.
// ────────────────────────────────────────────────────────────────────────────

export interface ServerDetailProps {
  readonly serverId: string;
  /**
   * When the install perm flag is ON we wire the install button to the
   * future BFF call. Default OFF — toast stub. (Bootstrapped server-side
   * via the route page and passed in.)
   */
  readonly installEnabled?: boolean;
  /** `ui_marketplace_star_perm`. */
  readonly starEnabled?: boolean;
  /** `ui_marketplace_fork_perm`. */
  readonly forkEnabled?: boolean;
  /** `ui_security_soc2_perm`. */
  readonly soc2Enabled?: boolean;
}

export default function ServerDetail({
  serverId,
  installEnabled = false,
  starEnabled = false,
  forkEnabled = false,
  soc2Enabled = false,
}: ServerDetailProps): ReactElement {
  const router = useRouter();
  const queryResult = useMarketplaceServer(serverId);

  // Disabled-stub-aware: when the result is the typed `flag_off_or_not_implemented`
  // marker, fall back to the canon structural shape so the design still
  // renders. The canon stub uses `serverId` as a synthetic id so URLs stay
  // self-consistent.
  const result = queryResult.data;
  const stubMode = result === undefined || result.ok !== true;
  const s: MarketplaceServerDetail = stubMode
    ? { ...CANON_STUB, id: serverId }
    : { ...CANON_STUB, id: serverId };
  // NB: when the real endpoint lands the schema parse will succeed and we
  // map `result.data` → `MarketplaceServerDetail` in place of CANON_STUB.

  const [tab, setTab] = useState<TabId>('readme');

  const onMarketplace = (): void => router.push('/marketplace');
  const onDashboard = (): void => router.push('/dashboard');
  const onInstall = (): void => {
    if (!installEnabled) {
      toast('Coming soon — install requires backend wiring');
      return;
    }
    void navigator.clipboard?.writeText(`mcpgen install ${s.author}/${s.name}`);
    toast('config copied · paste into claude desktop');
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`marketplace / ${s.name}`}
        onLogo={onMarketplace}
        right={
          <>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onMarketplace}
            >
              ← back
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onDashboard}
            >
              my servers
            </button>
            <Btn kind="ink" size="sm" icon="copy" onClick={onInstall}>
              install
            </Btn>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '32px 28px 64px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        {/* "coming soon" disabled-stub banner — surfaces the BFF disabled
            state without stripping any UI surface. */}
        {stubMode ? (
          <div
            className="mc-card"
            style={{
              marginBottom: 24,
              padding: 14,
              background: 'var(--paper-alt)',
              borderStyle: 'dashed',
            }}
            data-testid="marketplace-server-stub"
          >
            <div className="mc-mono muted" style={{ fontSize: 12 }}>
              marketplace detail · coming soon — preview is rendered with
              canon defaults until the backend lands.
            </div>
          </div>
        ) : null}

        {/* Header */}
        <div
          className="row-bw"
          style={{ marginBottom: 24, alignItems: 'flex-start' }}
        >
          <div style={{ flex: 1 }}>
            <div className="row" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span className="mc-mono muted" style={{ fontSize: 13 }}>
                {s.author} /
              </span>
              <span className="mc-display-l">{s.name}</span>
              {s.verified ? (
                <Badge kind="ink" mono={false}>
                  <Icon name="check" size={10} /> verified
                </Badge>
              ) : null}
              <Badge kind="accent" mono={false}>
                public
              </Badge>
            </div>
            <div
              style={{
                fontSize: 15,
                lineHeight: 1.55,
                color: 'var(--text-muted)',
                maxWidth: 720,
                marginBottom: 12,
              }}
            >
              {s.desc}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {s.tags.map((tag) => (
                <Badge key={tag} mono={false}>
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Btn
              kind="ghost"
              size="md"
              icon="src"
              onClick={(): void => {
                if (starEnabled) {
                  // TODO: POST /api/v1/marketplace/servers/:id/star
                  toast(`starred · ${(s.stars + 1).toLocaleString()} stars`);
                  return;
                }
                toast('Coming soon — star requires backend wiring');
              }}
            >
              ★ {s.stars.toLocaleString()}
            </Btn>
            <Btn
              kind="ghost"
              size="md"
              onClick={(): void => {
                if (forkEnabled) {
                  // TODO: POST /api/v1/marketplace/servers/:id/fork
                  toast('forked into your workspace');
                  return;
                }
                toast('Coming soon — fork requires backend wiring');
              }}
            >
              fork · {s.forks}
            </Btn>
            <Btn kind="primary" size="md" icon="copy" onClick={onInstall}>
              install
            </Btn>
          </div>
        </div>

        {/* Stat strip */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">installs</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6 }}>
              {s.installs.toLocaleString()}
            </div>
          </div>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">weekly</div>
            <div
              className="mc-stat-num"
              style={{ fontSize: 24, marginTop: 6, color: 'var(--success)' }}
            >
              +{s.weekly.toLocaleString()}
            </div>
          </div>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">tools</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6 }}>
              {s.tools}
            </div>
          </div>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">avg tokens / call</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6 }}>
              284
            </div>
          </div>
          <div
            className="mc-stat"
            style={{
              padding: 14,
              background: 'var(--primary)',
              borderColor: 'var(--border-sharp)',
            }}
          >
            <div
              className="mc-stat-lbl"
              style={{ color: 'var(--primary-ink)', opacity: 0.7 }}
            >
              token savings
            </div>
            <div
              className="mc-stat-num"
              style={{ fontSize: 24, marginTop: 6, color: 'var(--primary-ink)' }}
            >
              76%
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
          <div>
            <div className="mc-tabs">
              {(
                [
                  ['readme', 'readme'],
                  ['tools', `tools · ${CANON_TOOLS.length}`],
                  ['changelog', 'changelog'],
                  ['issues', 'issues · 3'],
                  ['security', 'security'],
                ] as const
              ).map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  onClick={(): void => setTab(id as TabId)}
                  className={`mc-tab ${tab === id ? 'sel' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'readme' ? (
              <div className="mc-card mc-card-pad">
                <div className="mc-h2" style={{ marginBottom: 8 }}>
                  quick start
                </div>
                <div className="mc-code" style={{ marginBottom: 14 }}>
                  {`$ npx mcpgen install ${s.author}/${s.name}\n$ mcpgen auth set ${s.author.toUpperCase()}_API_KEY sk_live_•••\n$ mcpgen serve`}
                </div>
                <div className="mc-h3" style={{ marginBottom: 6 }}>
                  what&apos;s inside
                </div>
                <ul
                  style={{
                    paddingLeft: 18,
                    lineHeight: 1.7,
                    color: 'var(--text)',
                    fontSize: 14,
                  }}
                >
                  <li>
                    {s.tools} tools covering core resources, with composed
                    multi-step actions
                  </li>
                  <li>token-optimized schemas — 76% smaller than naive 1:1 conversion</li>
                  <li>oauth + bearer + signing-secret support out of the box</li>
                  <li>typed errors, idempotency keys, automatic retries on 429</li>
                </ul>
                <div className="mc-rule-dashed" />
                <div className="mc-h3" style={{ marginBottom: 6 }}>
                  example
                </div>
                <div className="mc-code">
                  {`> create_charge customer=cus_8f1a amount=4200 currency=usd\n← charge ch_3Nq7Bx · status=succeeded · 218 tk · 240 ms`}
                </div>
              </div>
            ) : null}

            {tab === 'tools' ? (
              <div className="mc-card" style={{ padding: 0 }}>
                {CANON_TOOLS.map((tool, i) => {
                  const rowStyle: CSSProperties = {
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 2fr 80px',
                    gap: 12,
                    padding: '14px 18px',
                    borderBottom:
                      i === CANON_TOOLS.length - 1
                        ? 'none'
                        : '1px dashed var(--border)',
                    alignItems: 'center',
                  };
                  return (
                    <div key={tool.name} style={rowStyle}>
                      <span
                        className="mc-mono"
                        style={{
                          fontSize: 13.5,
                          fontWeight: 500,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {tool.comp === true ? <Icon name="bolt" size={11} /> : null}
                        {tool.name}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {tool.desc}
                      </span>
                      <span
                        className="mc-mono"
                        style={{ fontSize: 12, textAlign: 'right' }}
                      >
                        {tool.tk} tk
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {tab === 'changelog' ? (
              <div className="mc-card mc-card-pad">
                <div className="mc-mono" style={{ fontSize: 13.5, lineHeight: 1.8 }}>
                  <div style={{ marginBottom: 14 }}>
                    <strong>v2.4.0</strong> · 2 days ago
                    <br />
                    <span className="muted">
                      + add incremental_auth, evidence_summary tools
                      <br />* fix retry on 429 with rate-limit headers
                    </span>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <strong>v2.3.1</strong> · 2 weeks ago
                    <br />
                    <span className="muted">* trim tax_id schema by 18 tokens</span>
                  </div>
                  <div>
                    <strong>v2.3.0</strong> · 1 month ago
                    <br />
                    <span className="muted">
                      + subscriptions.pause_collection
                      <br />+ disputes composed lifecycle tool
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {tab === 'issues' ? (
              <div className="mc-card mc-card-pad muted" style={{ fontSize: 13 }}>
                3 open issues. issue tracker placeholder.
              </div>
            ) : null}

            {tab === 'security' ? (
              <div className="mc-card mc-card-pad">
                <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                  <Icon name="lock" size={14} style={{ color: 'var(--success)' }} />
                  <span className="mc-h3">no known vulnerabilities</span>
                </div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  audited weekly. signed releases. credentials are aes-256
                  encrypted at rest. read full{' '}
                  <a
                    className="mc-link"
                    style={{ cursor: 'pointer' }}
                    onClick={(): void =>
                      openDrawer(
                        'security policy',
                        <SecurityPolicyBody soc2Enabled={soc2Enabled} />,
                        { eyebrow: 'how we handle your data' },
                      )
                    }
                  >
                    security policy
                  </a>
                  .
                </div>
              </div>
            ) : null}
          </div>

          {/* Right rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <SectionLabel>about</SectionLabel>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <Row k="author" v={s.author + (s.verified ? ' ✓' : '')} />
                <Row k="license" v={s.license} />
                <Row k="updated" v={s.updated} />
                <Row k="version" v="v2.4.0" />
                <Row k="endpoint" v={`${s.author}/${s.name}.mcpgen.app`} mono />
              </div>
            </Card>

            <Card>
              <SectionLabel>install</SectionLabel>
              <div className="mc-mono" style={{ fontSize: 12, marginBottom: 10 }}>
                via cli
              </div>
              <div
                className="mc-code"
                style={{ fontSize: 11.5, padding: 10, marginBottom: 12 }}
              >
                {`mcpgen install ${s.author}/${s.name}`}
              </div>
              <div className="mc-mono" style={{ fontSize: 12, marginBottom: 10 }}>
                via desktop
              </div>
              <Btn kind="ink" size="sm" full icon="copy" onClick={onInstall}>
                add to claude desktop
              </Btn>
              <div style={{ height: 6 }} />
              <Btn
                kind="ghost"
                size="sm"
                full
                icon="copy"
                onClick={(): void => {
                  if (!installEnabled) {
                    toast('Coming soon — install requires backend wiring');
                    return;
                  }
                  void navigator.clipboard?.writeText(
                    `mcpgen install ${s.author}/${s.name}`,
                  );
                  toast('config copied · paste into cursor settings');
                }}
              >
                add to cursor
              </Btn>
            </Card>

            <Card>
              <SectionLabel>top installs</SectionLabel>
              <div
                style={{
                  fontSize: 12.5,
                  fontFamily: 'var(--font-mono)',
                  lineHeight: 1.9,
                  color: 'var(--text-muted)',
                }}
              >
                <div>linear</div>
                <div>retool</div>
                <div>postscript</div>
                <div>418 others</div>
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers — canon `Row` and the security drawer body.
// ────────────────────────────────────────────────────────────────────────────

interface RowProps {
  readonly k: string;
  readonly v: string;
  readonly mono?: boolean;
}

function Row({ k, v, mono = false }: RowProps): ReactElement {
  const valueStyle: CSSProperties = {
    fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)',
    fontSize: 12.5,
    textAlign: 'right',
  };
  return (
    <div
      className="row-bw"
      style={{ padding: '5px 0', borderBottom: '1px dashed var(--border)' }}
    >
      <span
        className="muted"
        style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}
      >
        {k}
      </span>
      <span style={valueStyle}>{v}</span>
    </div>
  );
}

interface SecurityPolicyBodyProps {
  readonly soc2Enabled: boolean;
}

function SecurityPolicyBody({ soc2Enabled }: SecurityPolicyBodyProps): ReactElement {
  const requestSoc2 = (): void => {
    if (soc2Enabled) {
      // TODO: POST /api/v1/marketplace/servers/:id/security/soc2-request
      toast('soc2 report request emailed to you');
      return;
    }
    toast('Coming soon — SOC2 report request requires backend wiring');
  };
  return (
    <div className="col" style={{ gap: 14, fontSize: 13, lineHeight: 1.6 }}>
      <div>
        <strong>encryption</strong> — all credentials encrypted at rest with
        aes-256-gcm. master keys in aws kms with quarterly rotation.
      </div>
      <div>
        <strong>signing</strong> — every release is signed with our gpg key
        (fingerprint <span className="mc-mono">8e3a 1d24 a91c 4e2f</span>).
        agents verify on install.
      </div>
      <div>
        <strong>audits</strong> — third-party penetration test quarterly. last
        report: feb 2025 — zero critical findings.{' '}
        <a className="mc-link" onClick={requestSoc2}>
          request soc2 report
        </a>
        .
      </div>
      <div>
        <strong>data handling</strong> — no upstream api responses persisted.
        logs scrubbed of pii within 24 h.
      </div>
      <div>
        <strong>incident response</strong> — 24/7 on-call. status page at{' '}
        <span className="mc-mono">status.mcpgen.dev</span>. report a
        vulnerability to <span className="mc-mono">security@mcpgen.dev</span>.
      </div>
    </div>
  );
}
