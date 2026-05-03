// apps/web/src/components/screens/billing/billing.tsx
//
// Phase 2 — Agent B3 — Billing screen.
//
// Source of truth: claude-design-reference/canon/screen-billing.jsx (function
// `Billing`). 100% pixel parity with that JSX, but rebuilt against the
// production primitive kit (`@/components/ui/*`) and next-intl translations.
//
// Behaviour wiring (per Phase-2 brief B3):
//   - Real BFF clients:
//       useUsageHourly()        → GET /api/v1/usage/hourly
//       useDashboardSummary()   → GET /api/v1/dashboard (composite)
//       createCheckoutSession() → POST /api/v1/billing/checkout (used by drawer)
//       createPortalSession()   → POST /api/v1/billing/portal (manage card CTA)
//   - Stub BFF clients (BFF endpoints not yet implemented):
//       usePlan()        → returns `flag_off_or_not_implemented`
//       useInvoices()    → returns `flag_off_or_not_implemented`
//     Per SHARED-BRIEF rule 5 we render canon's loading / no-invoices states
//     when these stubs report not-implemented (instead of stripping the UI).
//   - Upgrade-to-team drawer body lives in `drawers/upgrade-to-team.tsx`
//     (Phase-2 brief explicitly asks for that split).
//   - Spending-limit drawer body inlined here — it has no real BFF wiring
//     yet (`PUT /api/v1/billing/spending-caps` missing); each chip falls back
//     to canon's toast copy until the endpoint lands.
//
// What stays static (per catalog § billing "Notable inline data / mocks"):
//   - PLANS catalog (4 plans · upgrade card layout) — until the BFF returns
//     plan metadata, the picker reads the same literal canon data.
//   - 4-server "usage by server" breakdown — until the BFF returns per-server
//     aggregates we keep canon's mock; this matches the visual baseline.
//   - 4 FAQ Q/A — copy is product-policy text, not data.
//   - Payment-method "visa ···· 4242" — placeholder until the Stripe portal
//     payload exposes the brand+last4 (catalog § billing line 863).

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, type CSSProperties, type JSX } from 'react';

import LangSwitcher from '@/components/lang-switcher';
import { Badge, Btn, Card, Icon, SectionLabel, TopBar } from '@/components/ui';
import { createPortalSession, useInvoices, usePlan, useUsageHourly } from '@/lib/api/billing';
import { useDashboardSummary } from '@/lib/api/dashboard';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

import { UpgradeToTeamDrawerBody } from './drawers/upgrade-to-team';

// ────────────────────────────────────────────────────────────────────────────
// Static plan catalog (canon screen-billing.jsx lines 3–55).
// ────────────────────────────────────────────────────────────────────────────

interface PlanDef {
  readonly id: 'free' | 'pro' | 'team' | 'enterprise';
  readonly name: string;
  readonly price: number | null;
  readonly blurb: string;
  readonly quota: string;
  readonly features: ReadonlyArray<readonly [string, string]>;
  readonly cta: string;
  readonly current: boolean;
  readonly recommended?: boolean;
}

const PLANS: ReadonlyArray<PlanDef> = [
  {
    id: 'free',
    name: 'free',
    price: 0,
    blurb: 'for tinkering and personal use',
    quota: '10K calls / mo',
    features: [
      ['core', '1 server, public marketplace install'],
      ['quota', '10,000 tool calls / month · soft cap'],
      ['servers', '1 deployed server (private or public)'],
      ['regions', '1 region · cdg only'],
      ['support', 'community discord'],
    ],
    cta: 'current plan',
    current: false,
  },
  {
    id: 'pro',
    name: 'pro',
    price: 29,
    blurb: 'for serious builders shipping mcps to teams',
    quota: '100K calls / mo · then $0.20 / 1K',
    features: [
      ['core', 'unlimited public servers, 5 private'],
      ['quota', '100,000 tool calls / month · overage at $0.20/1K'],
      ['servers', '5 private + unlimited public'],
      ['regions', '3 regions · cdg, sfo, sin'],
      ['features', 'spec drift detection · auto-regenerate'],
      ['support', 'email · 24h sla'],
    ],
    cta: 'manage plan',
    current: true,
    recommended: true,
  },
  {
    id: 'team',
    name: 'team',
    price: 99,
    blurb: 'for teams collaborating on shared servers',
    quota: '1M calls / mo · then $0.10 / 1K',
    features: [
      ['core', 'shared workspace, 5 seats included'],
      ['quota', '1,000,000 tool calls / month · overage at $0.10/1K'],
      ['servers', 'unlimited private + public'],
      ['regions', 'all regions · 6 edges worldwide'],
      ['features', 'sso (google, github) · audit log · rbac'],
      ['support', 'priority email · 4h sla'],
    ],
    cta: 'upgrade to team',
    current: false,
  },
  {
    id: 'enterprise',
    name: 'enterprise',
    price: null,
    blurb: 'self-host, vpc, custom contracts',
    quota: 'custom',
    features: [
      ['core', 'self-hosted or dedicated cloud'],
      ['quota', 'custom — any volume'],
      ['servers', 'unlimited, in your vpc'],
      ['regions', 'any · plus on-prem'],
      ['features', 'saml sso · scim · soc 2 · custom contract'],
      ['support', 'dedicated csm · 1h sla · slack channel'],
    ],
    cta: 'talk to sales',
    current: false,
  },
];

// ────────────────────────────────────────────────────────────────────────────
// "Usage by server" row — populated at runtime from useUsageHourly() joined
// with useDashboardSummary() deployments (deployment_id → server_name).
// When the BFF returns no rows we render the canon "no usage yet" empty
// state rather than seeding canon mock data.
// ────────────────────────────────────────────────────────────────────────────

interface UsageRow {
  readonly name: string;
  readonly calls: number;
  readonly pct: number;
}

// ────────────────────────────────────────────────────────────────────────────
// Static invoice rows (canon screen-billing.jsx lines 57–62 — kept literal
// until /api/v1/billing/invoices lands; matches visual baseline).
// ────────────────────────────────────────────────────────────────────────────

interface InvoiceRow {
  readonly date: string;
  readonly period: string;
  readonly amount: string;
  readonly status: 'paid';
  readonly calls: string;
  readonly overage: string;
}

const INVOICES: ReadonlyArray<InvoiceRow> = [
  {
    date: 'apr 2026',
    period: 'apr 1 – apr 30',
    amount: '$29.00',
    status: 'paid',
    calls: '82,180',
    overage: '$0.00',
  },
  {
    date: 'mar 2026',
    period: 'mar 1 – mar 31',
    amount: '$32.40',
    status: 'paid',
    calls: '117,000',
    overage: '$3.40',
  },
  {
    date: 'feb 2026',
    period: 'feb 1 – feb 28',
    amount: '$29.00',
    status: 'paid',
    calls: '64,200',
    overage: '$0.00',
  },
  {
    date: 'jan 2026',
    period: 'jan 1 – jan 31',
    amount: '$29.00',
    status: 'paid',
    calls: '41,800',
    overage: '$0.00',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// BlockBar (canon ui.jsx lines 84–92, inlined — not in production UI kit).
// ────────────────────────────────────────────────────────────────────────────

interface BlockBarProps {
  readonly value: number;
  readonly max?: number;
  readonly width?: number;
  readonly dim?: boolean;
}

function BlockBar({
  value,
  max = 100,
  width = 12,
  dim = false,
}: BlockBarProps): JSX.Element {
  const blocks = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  const empty = width - blocks;
  return (
    <span className={`mc-blockbar ${dim ? 'dim' : ''}`}>
      {'█'.repeat(blocks)}
      <span className="mc-blockbar-empty">{'░'.repeat(empty)}</span>
    </span>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PlanCard (canon screen-billing.jsx lines 241–295).
// ────────────────────────────────────────────────────────────────────────────

interface PlanCardProps {
  readonly p: PlanDef;
  readonly cycle: 'monthly' | 'annual';
}

function PlanCard({ p, cycle }: PlanCardProps): JSX.Element {
  const yearly = cycle === 'annual';
  const displayPrice = p.price === null ? null : yearly ? Math.round(p.price * 10) : p.price;

  const cardStyle: CSSProperties = {
    padding: 20,
    position: 'relative',
    background: p.current ? 'var(--paper-alt)' : 'var(--card)',
  };
  if (p.recommended === true) {
    cardStyle.borderColor = 'var(--border-sharp)';
  }

  const onClick = (): void => {
    if (p.current) return;
    if (p.id === 'enterprise') {
      toast('opening contact form · hello@mcpgen.dev');
    } else {
      toast(`switching to ${p.name} · prorated`);
    }
  };

  return (
    <div className="mc-card" style={cardStyle}>
      {p.recommended === true ? (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 16,
            background: 'var(--primary)',
            color: 'var(--primary-ink)',
            padding: '2px 8px',
            fontFamily: 'var(--font-mono)',
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            border: '1px solid var(--border-sharp)',
            borderRadius: 'var(--radius)',
          }}
        >
          recommended
        </div>
      ) : null}

      <div className="mc-h2" style={{ marginBottom: 4, fontSize: 20 }}>
        {p.name}
      </div>
      <div
        className="mc-mono muted"
        style={{ fontSize: 11.5, marginBottom: 14, minHeight: 32, lineHeight: 1.4 }}
      >
        {p.blurb}
      </div>

      <div
        style={{
          marginBottom: 16,
          paddingBottom: 14,
          borderBottom: '1px dashed var(--border)',
        }}
      >
        {displayPrice === null ? (
          <div className="mc-mono" style={{ fontSize: 28, fontWeight: 500 }}>
            custom
          </div>
        ) : (
          <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
            <span
              className="mc-mono"
              style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em' }}
            >
              ${displayPrice}
            </span>
            <span className="mc-mono muted" style={{ fontSize: 12 }}>
              /{yearly ? 'yr' : 'mo'}
            </span>
          </div>
        )}
        <div className="mc-mono muted" style={{ fontSize: 11, marginTop: 4 }}>
          {p.quota}
        </div>
      </div>

      <div style={{ marginBottom: 16, minHeight: 200 }}>
        {p.features.map(([k, v]) => (
          <div
            key={k}
            className="row"
            style={{ gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 12 }}
          >
            <Icon
              name="check"
              size={11}
              style={{ marginTop: 4, flexShrink: 0, color: 'var(--success)' }}
            />
            <span style={{ lineHeight: 1.45 }}>{v}</span>
          </div>
        ))}
      </div>

      <Btn
        kind={p.current ? 'ghost' : p.recommended === true ? 'primary' : 'ink'}
        size="md"
        full
        disabled={p.current}
        onClick={onClick}
      >
        {p.cta}
      </Btn>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FAQ row (canon screen-billing.jsx lines 297–304).
// ────────────────────────────────────────────────────────────────────────────

interface FAQProps {
  readonly q: string;
  readonly a: string;
}

function FAQ({ q, a }: FAQProps): JSX.Element {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>{q}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{a}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Spending-limit drawer body (canon lines 148–157, inlined — kept here vs
// extracted because the chip handler set is purely client-side toast copy).
// ────────────────────────────────────────────────────────────────────────────

function SpendingLimitsDrawerBody(): JSX.Element {
  return (
    <div className="col" style={{ gap: 14, fontSize: 13 }}>
      <div>
        set a monthly cap. when you hit it, agents stop calling tools and we email
        you. no surprise bills.
      </div>
      <div className="col" style={{ gap: 8 }}>
        {[25, 50, 100, 250].map((v) => (
          <button
            key={v}
            type="button"
            className="mc-btn mc-btn-ghost"
            style={{ justifyContent: 'space-between', width: '100%' }}
            onClick={(): void => toast(`spending cap set to $${v}/mo`)}
          >
            <span>${v} / mo</span>
            {v === 50 ? <Badge>current</Badge> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public component.
// ────────────────────────────────────────────────────────────────────────────

export interface BillingProps {
  readonly userEmail?: string;
}

export default function Billing({ userEmail }: BillingProps = {}): JSX.Element {
  const t = useTranslations();
  const router = useRouter();

  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Real data — returns a `Result<…>` envelope. We aggregate per-deployment
  // usage rows into the "usage by server" breakdown below; when the BFF
  // returns nothing (empty rows or not-implemented) we render the canon
  // "no usage yet" empty state instead of falling back to canon mock data.
  // We deliberately fetch the last 24 hours of hourly usage.
  const usageTo = new Date().toISOString();
  const usageFrom = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const usageHourlyQuery = useUsageHourly({ from: usageFrom, to: usageTo });
  const dashboardSummaryQuery = useDashboardSummary();

  // Aggregate per-deployment usage and join with deployment metadata
  // (server_name) for the "usage by server" card. Empty array → canon's
  // "no usage yet" empty state.
  const usageRows: ReadonlyArray<UsageRow> = (() => {
    const usageData = usageHourlyQuery.data;
    const dashData = dashboardSummaryQuery.data;
    if (
      usageData === undefined ||
      !usageData.ok ||
      dashData === undefined ||
      !dashData.ok
    ) {
      return [];
    }
    // deployment_id → server_name lookup.
    const nameById = new Map<string, string>();
    for (const d of dashData.data.deployments) {
      nameById.set(d.deployment_id, d.server_name);
    }
    // Sum call_count per deployment.
    const callsById = new Map<string, number>();
    for (const row of usageData.data.rows) {
      const prev = callsById.get(row.deployment_id) ?? 0;
      callsById.set(row.deployment_id, prev + row.call_count);
    }
    const totalCalls = Array.from(callsById.values()).reduce(
      (s, n) => s + n,
      0,
    );
    if (totalCalls === 0) return [];
    // Order by descending call volume (canon sort order).
    const ordered = Array.from(callsById.entries())
      .map(([deploymentId, calls]) => {
        const name = nameById.get(deploymentId) ?? deploymentId;
        const pct = Math.round((calls / totalCalls) * 100);
        return { name, calls, pct } satisfies UsageRow;
      })
      .sort((a, b) => b.calls - a.calls);
    return ordered;
  })();

  // Stubs — render canon "loading" state until BFF lands. The stubs surface
  // `flag_off_or_not_implemented` (see `notImplementedResult` in client-base).
  usePlan();
  const invoicesQuery = useInvoices();
  const invoicesNotImplemented =
    invoicesQuery.data !== undefined &&
    !invoicesQuery.data.ok &&
    invoicesQuery.data.error === 'flag_off_or_not_implemented';

  // Canon-ground-truth period numbers (catalog § billing line 862 — replace
  // with real period usage when the BFF surfaces it).
  const used = 82180;
  const quota = 100000;
  const usedPct = Math.round((used / quota) * 100);

  const onLanding = (): void => router.push('/');
  const onDashboard = (): void => router.push('/dashboard');
  const onMarketplace = (): void => router.push('/marketplace');

  const onUpdateCard = async (): Promise<void> => {
    const result = await createPortalSession();
    if (!result.ok) {
      toast(`opening secure stripe form · failed (${result.error})`, { kind: 'error' });
      return;
    }
    // Stripe portal URL is cross-origin — hard navigate.
    window.location.assign(result.data.url);
  };

  const onUpgradeTeam = (): void => {
    openDrawer('upgrade to team', <UpgradeToTeamDrawerBody />, { eyebrow: 'pro → team' });
  };

  const onEditCaps = (): void => {
    openDrawer('spending limits', <SpendingLimitsDrawerBody />, {
      eyebrow: "hard cap · we'll never charge over",
    });
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="billing"
        onLogo={onLanding}
        right={
          <>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onDashboard}
            >
              {t('myServers')}
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={onMarketplace}
            >
              {t('marketplace')}
            </button>
            <LangSwitcher />
            <span className="mc-caption" style={{ marginRight: 4 }}>
              {userEmail ?? ''}
            </span>
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
        {/* Header row */}
        <div
          className="row-bw"
          style={{ marginBottom: 24, alignItems: 'flex-end' }}
        >
          <div>
            <div className="mc-display-l">{t('billingTitle')}</div>
            <div
              className="mc-mono muted"
              style={{ fontSize: 13, marginTop: 4 }}
            >
              {t('billingSub')}
            </div>
          </div>
          <Btn
            kind="ghost"
            size="md"
            icon="doc"
            onClick={(): void => {
              // Until /api/v1/billing/invoices/export lands we keep canon
              // toast copy (catalog § billing line 844).
              toast('bundling invoices · zip will download');
            }}
          >
            download all invoices
          </Btn>
        </div>

        {/* Current plan summary card */}
        <Card style={{ marginBottom: 16, padding: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ padding: 24, borderRight: '1px solid var(--border)' }}>
              <div className="mc-caption-up" style={{ marginBottom: 8 }}>
                {t('yourPlan')}
              </div>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <span className="mc-h1" style={{ textTransform: 'lowercase' }}>
                  pro
                </span>
                <Badge kind="primary" mono={false}>
                  {t('active')}
                </Badge>
              </div>
              <div
                className="mc-mono muted"
                style={{ fontSize: 12, marginBottom: 14 }}
              >
                $29.00 / {t('monthly')} · {t('renews')} may 14, 2026
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ink" size="sm" iconR="arrow-r" onClick={onUpgradeTeam}>
                  {t('upgradeTeam')}
                </Btn>
                <Btn
                  kind="ghost"
                  size="sm"
                  onClick={(): void => {
                    toast(
                      "cancellation flow · you'll keep pro until may 14",
                    );
                  }}
                >
                  {t('cancel')}
                </Btn>
              </div>
            </div>
            <div style={{ padding: 24, borderRight: '1px solid var(--border)' }}>
              <div className="mc-caption-up" style={{ marginBottom: 8 }}>
                {t('thisPeriod')}
              </div>
              <div
                className="mc-mono"
                style={{ fontSize: 32, fontWeight: 500 }}
              >
                {used.toLocaleString()}
              </div>
              <div
                className="mc-mono muted"
                style={{ fontSize: 11.5, marginBottom: 12 }}
              >
                {t('ofCalls')} {quota.toLocaleString()} {t('calls')} · {usedPct}%
              </div>
              <div
                style={{
                  height: 10,
                  border: '1px solid var(--border-sharp)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--paper-alt)',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    width: `${usedPct}%`,
                    height: '100%',
                    background: 'var(--ink)',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: '80%',
                    top: -2,
                    bottom: -2,
                    width: 1,
                    background: 'var(--accent)',
                  }}
                />
              </div>
              <div
                className="mc-mono muted"
                style={{ fontSize: 11, marginTop: 6 }}
              >
                projecting 105K · ≈ $1.00 overage
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div className="mc-caption-up" style={{ marginBottom: 8 }}>
                {t('paymentMethod')}
              </div>
              <div className="mc-mono" style={{ fontSize: 13, marginBottom: 4 }}>
                visa ····  4242
              </div>
              <div
                className="mc-mono muted"
                style={{ fontSize: 11.5, marginBottom: 14 }}
              >
                expires 09/28 · kira frost
              </div>
              <Btn
                kind="ghost"
                size="sm"
                icon="copy"
                onClick={(): void => {
                  void onUpdateCard();
                }}
              >
                {t('updateCard')}
              </Btn>
            </div>
          </div>

          {/* Spending controls strip */}
          <div style={{ padding: '16px 24px', background: 'var(--paper-alt)' }}>
            <div className="row-bw">
              <div className="row" style={{ gap: 14 }}>
                <Icon
                  name="warn"
                  size={14}
                  style={{ color: 'var(--text-muted)' }}
                />
                <span className="mc-mono" style={{ fontSize: 12.5 }}>
                  {t('spendingLimit')} · <strong>$50/mo</strong>
                </span>
              </div>
              <a
                className="mc-link mc-mono"
                style={{ fontSize: 12, cursor: 'pointer' }}
                onClick={onEditCaps}
              >
                {t('editCaps')} →
              </a>
            </div>
          </div>
        </Card>

        {/* Usage breakdown by server */}
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel
            right={
              <span className="mc-mono muted" style={{ fontSize: 11 }}>
                {t('thisMonth')}
              </span>
            }
          >
            {t('usageBy')}
          </SectionLabel>
          {usageRows.length === 0 ? (
            <div
              className="mc-mono muted"
              style={{ fontSize: 12.5, padding: '12px 0' }}
              data-testid="usage-by-server-empty"
            >
              no usage yet — deploy a server to start tracking calls.
            </div>
          ) : (
            usageRows.map((row, i) => (
              <div
                key={row.name}
                className="row"
                style={{
                  gap: 12,
                  padding: '8px 0',
                  borderBottom:
                    i === usageRows.length - 1
                      ? 'none'
                      : '1px dashed var(--border)',
                }}
              >
                <span
                  className="mc-mono"
                  style={{ fontSize: 12.5, minWidth: 220 }}
                >
                  {row.name}
                </span>
                <span style={{ flex: 1 }}>
                  <BlockBar value={row.pct} max={100} width={28} />
                </span>
                <span
                  className="mc-mono"
                  style={{ fontSize: 12.5, minWidth: 80, textAlign: 'right' }}
                >
                  {row.calls.toLocaleString()}
                </span>
                <span
                  className="mc-mono muted"
                  style={{ fontSize: 11.5, minWidth: 40, textAlign: 'right' }}
                >
                  {row.pct}%
                </span>
              </div>
            ))
          )}
        </Card>

        {/* Plan picker header + cycle toggle */}
        <div
          className="row-bw"
          style={{ marginBottom: 14, marginTop: 32 }}
        >
          <div>
            <div className="mc-h1">{t('plans')}</div>
            <div
              className="mc-mono muted"
              style={{ fontSize: 12.5, marginTop: 2 }}
            >
              {t('upgradeAnytime')}
            </div>
          </div>
          <div className="mc-chiprow">
            {(
              [
                ['monthly', t('monthly')],
                ['annual', t('annual')],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mc-chip ${billingCycle === id ? 'active' : ''}`}
                onClick={(): void => setBillingCycle(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Plan grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 32,
          }}
        >
          {PLANS.map((p) => (
            <PlanCard key={p.id} p={p} cycle={billingCycle} />
          ))}
        </div>

        {/* Invoices */}
        <Card style={{ marginBottom: 16, padding: 0 }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <SectionLabel
              right={
                <a
                  className="mc-link mc-mono"
                  style={{ fontSize: 11, cursor: 'pointer' }}
                  onClick={(): void => {
                    toast('tax & company details · vat: ee102345678');
                  }}
                >
                  {t('taxInfo')} →
                </a>
              }
            >
              {t('invoices')}
            </SectionLabel>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 80px',
              padding: '10px 20px',
              borderBottom: '1px solid var(--border)',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-muted)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              background: 'var(--paper-alt)',
            }}
          >
            <span>{t('period')}</span>
            <span>{t('billDate')}</span>
            <span>{t('calls')}</span>
            <span>{t('overage')}</span>
            <span>{t('amount')}</span>
            <span></span>
          </div>
          {invoicesNotImplemented ? (
            <div
              style={{
                padding: '32px 20px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
              }}
            >
              loading invoices…
            </div>
          ) : (
            INVOICES.map((inv, i) => (
              <div
                key={inv.date}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 80px',
                  padding: '14px 20px',
                  borderBottom:
                    i === INVOICES.length - 1
                      ? 'none'
                      : '1px solid var(--border)',
                  alignItems: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                }}
              >
                <span>{inv.period}</span>
                <span className="muted">{inv.date}</span>
                <span className="tnum">{inv.calls}</span>
                <span className="tnum muted">{inv.overage}</span>
                <span className="tnum" style={{ fontWeight: 500 }}>
                  {inv.amount}{' '}
                  <Badge kind="success" mono={false}>
                    {inv.status}
                  </Badge>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <a
                    className="mc-link"
                    style={{ fontSize: 12, cursor: 'pointer' }}
                    onClick={(): void => {
                      toast(`invoice ${inv.period} · pdf opening…`);
                    }}
                  >
                    pdf
                  </a>
                </span>
              </div>
            ))
          )}
        </Card>

        {/* Billing FAQ */}
        <Card>
          <SectionLabel>{t('questions')}</SectionLabel>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 24,
            }}
          >
            <FAQ
              q="what counts as a call?"
              a="every successful tool invocation by an agent. failed calls (4xx/5xx upstream) don't count. listing tools is free."
            />
            <FAQ
              q="do public servers count against my quota?"
              a="only when you call them. installs by other people use their quotas — not yours. publishing is always free."
            />
            <FAQ
              q="can i set hard caps?"
              a="yes. set a monthly $ limit and we'll hard-stop once you hit it. you'll get alerts at 80% and 95%."
            />
            <FAQ
              q="how does annual billing work?"
              a="pay 10 months, get 12. switch any time — we credit the unused portion against the new plan."
            />
          </div>
        </Card>
      </main>
    </div>
  );
}

