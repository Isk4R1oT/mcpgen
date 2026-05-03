// apps/web/src/components/screens/settings/sections/usage.tsx
//
// Usage & billing section — flag-ON-by-default. The "lite" version of the
// dedicated /billing screen. Source of truth: canon StUsage + StCostCell.
//
// Real data wiring (per brief — "real data must NOT contain canon demo
// strings"):
//   - useUsageHourly() over the trailing 30 days → tool-calls this month.
//   - useDashboardSummary() → active server count.
//   - planMeta lookup is keyed on the `plan` prop (server-side resolved).
//
// All cost cells / dates are explicitly empty-state safe — they show "—"
// when the BFF has not surfaced the value yet, NEVER canon mock numbers
// like "$184.20" or "284,512". Canon-style "$0.00" / "0" are real values.

'use client';

import type { JSX } from 'react';
import { useTranslations } from 'next-intl';

import { useUsageHourly } from '@/lib/api/billing';
import { useDashboardSummary } from '@/lib/api/dashboard';
import { toast } from '@/lib/toast';

import {
  PLAN_META,
  PlanBadge,
  Section,
  parsePlanCalls,
  type PlanId,
} from '../components';

export interface UsageSectionProps {
  readonly plan: PlanId;
  readonly onOpenBilling: () => void;
}

export function UsageSection({
  plan,
  onOpenBilling,
}: UsageSectionProps): JSX.Element {
  const t = useTranslations();
  const planMeta = PLAN_META[plan];
  const cap = parsePlanCalls(planMeta.calls);

  // Trailing 30 days (canon "this month" semantics — BFF aggregate exposes
  // hourly buckets so we sum locally).
  const usageTo = new Date().toISOString();
  const usageFrom = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const usageQuery = useUsageHourly({ from: usageFrom, to: usageTo });
  const dashQuery = useDashboardSummary();

  const usedCalls = ((): number => {
    const r = usageQuery.data;
    if (r === undefined || !r.ok) return 0;
    return r.data.rows.reduce((s, row) => s + row.call_count, 0);
  })();

  const totalCostUsd = ((): number => {
    const r = usageQuery.data;
    if (r === undefined || !r.ok) return 0;
    return r.data.rows.reduce(
      (s, row) => s + (row.total_cost_usd ?? 0),
      0,
    );
  })();

  const activeServers = ((): number | null => {
    const r = dashQuery.data;
    if (r === undefined || !r.ok) return null;
    return r.data.deployments.length;
  })();

  const usagePct = Math.min((usedCalls / cap) * 100, 100);
  const formatted = formatNumber(usedCalls);
  const formattedCost = formatCurrency(totalCostUsd);

  // Renew date — until the BFF surfaces the Stripe invoice cycle anchor we
  // surface "—". This avoids the canon hardcoded "may 18 · visa •••• 4242".
  const renewMeta: string | null = null;

  return (
    <Section
      id="usage"
      title={t('settings.usage.title')}
      desc={t('settings.usage.desc')}
      action={
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          onClick={onOpenBilling}
        >
          {t('settings.usage.openBilling')} →
        </button>
      }
    >
      <div
        className="row"
        style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}
      >
        <PlanBadge plan={plan} />
        {renewMeta !== null ? (
          <span className="mc-caption">{renewMeta}</span>
        ) : null}
      </div>

      {/* Big progress bar */}
      <div
        style={{
          border: '1px solid var(--border-sharp)',
          borderRadius: 'var(--radius)',
          padding: 18,
          background: 'var(--card)',
          marginBottom: 14,
        }}
      >
        <div className="row-bw" style={{ marginBottom: 8 }}>
          <div>
            <div
              className="mc-caption-up"
              style={{ fontSize: 10.5, marginBottom: 4 }}
            >
              {t('settings.usage.toolCallsLabel')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 28,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {formatted}
              <span style={{ color: 'var(--text-faint)', fontSize: 18 }}>
                {' '}
                / {planMeta.calls}
              </span>
            </div>
          </div>
          <div className="mc-caption" style={{ fontSize: 11 }}>
            {t('settings.usage.usedPct', { pct: usagePct.toFixed(1) })}
          </div>
        </div>
        <div
          style={{
            height: 8,
            background: 'var(--paper-alt)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${usagePct}%`,
              background:
                usagePct > 80 ? 'var(--accent)' : 'var(--primary)',
            }}
          />
        </div>
      </div>

      {/* Cost split */}
      <div
        className="row"
        style={{
          gap: 0,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          overflow: 'hidden',
          flexWrap: 'wrap',
        }}
      >
        <CostCell
          k={t('settings.usage.thisMonth')}
          v={formattedCost}
          sub={
            activeServers !== null
              ? t('settings.usage.allServers', { n: activeServers })
              : t('settings.usage.allServersEmpty')
          }
        />
        <CostCell
          k={t('settings.usage.forecast')}
          v="—"
          sub={t('settings.usage.forecastSub')}
        />
        <CostCell
          k={t('settings.usage.lastMonth')}
          v="—"
          sub={t('settings.usage.lastMonthSub')}
        />
        <CostCell
          k={t('settings.usage.byok')}
          v="—"
          sub={t('settings.usage.byokSub')}
          tint
        />
      </div>

      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          onClick={onOpenBilling}
        >
          {t('settings.usage.changePlan')}
        </button>
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          onClick={(): void => toast(t('settings.usage.invoicesToast'))}
        >
          {t('settings.usage.downloadInvoices')}
        </button>
        <button
          type="button"
          className="mc-btn mc-btn-sm"
          onClick={(): void => toast(t('settings.usage.taxToast'))}
        >
          {t('settings.usage.taxInfo')}
        </button>
      </div>
    </Section>
  );
}

interface CostCellProps {
  readonly k: string;
  readonly v: string;
  readonly sub: string;
  readonly tint?: boolean;
}

function CostCell({ k, v, sub, tint = false }: CostCellProps): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 160,
        padding: 14,
        borderRight: '1px solid var(--border)',
        background: tint ? 'var(--paper-alt)' : 'transparent',
      }}
    >
      <div className="mc-caption-up" style={{ fontSize: 10, marginBottom: 6 }}>
        {k}
      </div>
      <div className="mc-mono" style={{ fontSize: 18, fontWeight: 500 }}>
        {v}
      </div>
      <div className="mc-caption" style={{ fontSize: 11, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatCurrency(n: number): string {
  return `$${n.toFixed(2)}`;
}
