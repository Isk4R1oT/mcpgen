// apps/web/src/components/screens/admin/billing/billing.tsx
//
// Phase 3 / C3-billing — Admin Billing & Plans screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-billing.jsx
// (function `BillingScreen`). 100% structural + class-name parity with
// that JSX, rebuilt against the production admin-ui kit
// (`@/components/admin-ui/*`).
//
// Behaviour wiring (per SCREEN-BEHAVIORS-CATALOG.md § admin-billing):
//   - Invoices       → GET  /api/admin/v1/billing/invoices          MISSING
//   - Refund         → POST /api/admin/v1/billing/invoices/:id/refund MISSING
//   - Retry charge   → POST /api/admin/v1/billing/invoices/:id/retry  MISSING
//   - Issue credit   → POST /api/admin/v1/billing/credits             MISSING
//   - Dunning seq.   → GET/PUT /api/admin/v1/billing/dunning          MISSING
//
// All five endpoints route through the typed disabled-stubs in
// `apps/web/src/lib/api/admin.ts` (`useAdminInvoices`,
// `useAdminBillingKpis`). Until the BFF flips ENABLED → true those hooks
// return `flag_off_or_not_implemented`; we map that to the canon loading
// branch (KPIs render `…`, invoices table renders an `<EmptyState>`).
//
// Admin-action wiring (per SHARED-BRIEF + PHASE-3 brief): every mutation
// CTA is flag-gated `ui_admin_<action>_perm` (default OFF) → fires
// `toast('admin action: not yet wired')`. The four flags surfaced here
// are documented in `.planning/phase-rebuild/FLAGS-NEEDED.md`:
//   - ui_admin_billing_refund_perm     (default OFF)
//   - ui_admin_billing_retry_perm      (default OFF)
//   - ui_admin_billing_credit_perm     (default OFF)
//   - ui_admin_billing_dunning_perm    (default OFF)
//
// IMPORTANT: All canon UI surfaces survive even with no BFF endpoint.
// Per SHARED-BRIEF rule #4 we NEVER strip the UI; we render the canon
// loading / empty branch while wiring stays inert.

'use client';

import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from 'react';

import {
  Btn,
  Card,
  EmptyState,
  Pill,
  SectionLabel,
  Table,
  Tabs,
  type PillKind,
  type TabItem,
} from '@/components/admin-ui';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';
import {
  useAdminBillingKpis,
  useAdminInvoices,
  type AdminInvoice,
} from '@/lib/api/admin';

// ────────────────────────────────────────────────────────────────────────────
// Tab model — mirrors canon `useState('invoices')` + render switch.
// ────────────────────────────────────────────────────────────────────────────

type BillingTab = 'invoices' | 'refunds' | 'dunning' | 'plans' | 'tax';

const TAB_ITEMS: TabItem<BillingTab>[] = [
  { id: 'invoices', label: 'invoices' },
  { id: 'refunds', label: 'refunds' },
  { id: 'dunning', label: 'dunning' },
  { id: 'plans', label: 'plans' },
  { id: 'tax', label: 'tax' },
];

// Canon pill kind per invoice status — matches the inline ternary in
// admin-billing.jsx line 50.
function invoicePillKind(status: AdminInvoice['status']): PillKind {
  if (status === 'paid' || status === 'refunded') return 'ok';
  if (status === 'failed') return 'alert';
  if (status === 'disputed') return 'warn';
  return 'info';
}

// Dunning sequence — 6 hardcoded steps from canon admin-billing.jsx
// lines 64–71. This is product copy, not BFF data; kept inline so the
// canon UI surface is byte-equivalent.
const DUNNING_STEPS: ReadonlyArray<readonly [string, string, string]> = [
  ['day 0', 'auto-charge fails', 'nothing visible to customer'],
  ['day 1', 'email · soft notice', "subject: payment didn't go through"],
  ['day 3', 'in-app banner', 'amber · update payment cta'],
  ['day 7', 'email · firm notice', 'subject: action needed in 7 days'],
  ['day 14', 'restrict new deploys', 'existing servers keep running'],
  ['day 30', 'suspend org', 'sessions revoked, servers paused'],
];

// ────────────────────────────────────────────────────────────────────────────
// IssueCreditDrawerBody — the form rendered inside `openDrawer(...)`.
//
// Mirrors canon admin-billing.jsx lines 16–26 (form fields + the
// "issue credit" submit button). The submit fires the flag-OFF toast
// stub — until `ui_admin_billing_credit_perm` flips ON the call is a no-op.
// ────────────────────────────────────────────────────────────────────────────

const DRAWER_INPUT_STYLE: CSSProperties = {
  width: '100%',
  padding: 10,
  fontSize: 12,
  border: '1px solid var(--border)',
  background: 'var(--paper)',
  borderRadius: 4,
};

interface IssueCreditDrawerBodyProps {
  readonly enabled: boolean;
}

function IssueCreditDrawerBody({ enabled }: IssueCreditDrawerBodyProps): ReactElement {
  const onIssue = useCallback((): void => {
    if (enabled) {
      // TODO: POST /api/admin/v1/billing/credits
      toast('credit issued · audit row queued', { kind: 'info' });
      return;
    }
    toast('admin action: not yet wired', { kind: 'info' });
  }, [enabled]);
  return (
    <div className="col" style={{ gap: 12, fontSize: 13 }}>
      <div className="adm-kpi-label">org</div>
      <input
        className="mc-input mc-mono"
        placeholder="search org…"
        defaultValue="lumen-payments"
        style={DRAWER_INPUT_STYLE}
      />
      <div className="adm-kpi-label">amount (usd)</div>
      <input
        className="mc-input mc-mono"
        defaultValue="50.00"
        style={DRAWER_INPUT_STYLE}
      />
      <div className="adm-kpi-label">reason</div>
      <select className="mc-input mc-mono" style={DRAWER_INPUT_STYLE}>
        <option>customer goodwill</option>
        <option>incident credit</option>
        <option>onboarding</option>
      </select>
      <Btn kind="ink" size="sm" full onClick={onIssue}>
        issue credit
      </Btn>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Refund modal — canon lines 83–117. Half / full chips and method chips
// mutate a controlled amount field; submit fires the flag-OFF toast stub.
// ────────────────────────────────────────────────────────────────────────────

interface RefundModalProps {
  invoice: AdminInvoice;
  onClose: () => void;
  enabled: boolean;
}

function formatAmount(value: number): string {
  // Canon uses `${showRefund.amount}` which is already a number; we mirror
  // the two-decimal form used by the "half" chip handler in canon.
  return Number.isInteger(value) ? value.toString() : value.toFixed(2);
}

function RefundModal({ invoice, onClose, enabled }: RefundModalProps): ReactElement {
  const [amount, setAmount] = useState<string>(formatAmount(invoice.amount));
  const [method, setMethod] = useState<'card' | 'credit'>('card');

  const onFull = useCallback((): void => {
    setAmount(formatAmount(invoice.amount));
  }, [invoice.amount]);

  const onHalf = useCallback((): void => {
    setAmount((invoice.amount / 2).toFixed(2));
  }, [invoice.amount]);

  const onSubmit = useCallback((): void => {
    if (enabled) {
      // TODO: POST /api/admin/v1/billing/invoices/:id/refund (4-eyes >$500)
      toast(`refund $${amount} queued · ${invoice.id}`, { kind: 'info' });
      onClose();
      return;
    }
    toast('admin action: not yet wired', { kind: 'info' });
    onClose();
  }, [onClose, enabled, amount, invoice.id]);

  // Canon: "refunds > $500 require 4-eyes". Single approver OK below.
  const requiresFourEyes = invoice.amount > 500;

  return (
    <div
      className="mc-modal-veil"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="refund invoice"
    >
      <div className="adm-modal" onClick={(e): void => e.stopPropagation()}>
        <div className="mc-modal-head">
          <span className="mc-h3">refund {invoice.id}</span>
        </div>
        <div className="mc-modal-body">
          <div
            className="adm-detail-grid"
            style={{ gridTemplateColumns: 'repeat(3, 1fr)', padding: 0, marginBottom: 14 }}
          >
            <div>
              <div className="adm-kpi-label">org</div>
              <div className="adm-kpi-num" style={{ fontSize: 16 }}>
                {invoice.org}
              </div>
            </div>
            <div>
              <div className="adm-kpi-label">original</div>
              <div className="adm-kpi-num" style={{ fontSize: 16 }}>
                ${formatAmount(invoice.amount)}
              </div>
            </div>
            <div>
              <div className="adm-kpi-label">stripe</div>
              <div className="adm-kpi-num mc-mono" style={{ fontSize: 12 }}>
                {invoice.stripe_charge_id ?? 'ch_3Nx4Lq…'}
              </div>
            </div>
          </div>

          <SectionLabel>
            <span>amount</span>
          </SectionLabel>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <input
              className="mc-input mc-mono"
              value={amount}
              onChange={(e): void => setAmount(e.target.value)}
              style={{ width: 140 }}
              aria-label="refund amount"
            />
            <Btn kind="ghost" size="sm" onClick={onFull}>
              full
            </Btn>
            <Btn kind="ghost" size="sm" onClick={onHalf}>
              half
            </Btn>
            <span
              className="muted mc-mono"
              style={{ fontSize: 12, alignSelf: 'center' }}
            >
              usd
            </span>
          </div>

          <SectionLabel>
            <span>method</span>
          </SectionLabel>
          <div className="row" style={{ gap: 8, marginBottom: 12 }}>
            <span
              className="mc-chip"
              role="button"
              tabIndex={0}
              onClick={(): void => setMethod('card')}
              onKeyDown={(e): void => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMethod('card');
                }
              }}
              style={
                method === 'card'
                  ? {
                      background: 'var(--ink)',
                      color: 'var(--ink-on)',
                      borderColor: 'var(--ink)',
                    }
                  : undefined
              }
            >
              back to card
            </span>
            <span
              className="mc-chip"
              role="button"
              tabIndex={0}
              onClick={(): void => setMethod('credit')}
              onKeyDown={(e): void => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMethod('credit');
                }
              }}
              style={
                method === 'credit'
                  ? {
                      background: 'var(--ink)',
                      color: 'var(--ink-on)',
                      borderColor: 'var(--ink)',
                    }
                  : undefined
              }
            >
              credit on account
            </span>
          </div>

          <SectionLabel>
            <span>reason</span>
          </SectionLabel>
          <select className="mc-input mc-mono" style={{ marginBottom: 8 }}>
            <option>customer goodwill</option>
            <option>incident · service degraded</option>
            <option>billing error</option>
            <option>duplicate charge</option>
          </select>
          <textarea
            className="mc-input"
            style={{ height: 60, padding: 10 }}
            placeholder="internal note"
          />
          <div className="adm-approval" style={{ marginTop: 12 }}>
            refunds &gt; $500 require 4-eyes. this is ${formatAmount(invoice.amount)} —{' '}
            {requiresFourEyes ? 'two approvers required.' : 'single approver ok.'}
          </div>
        </div>
        <div className="mc-modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            cancel
          </Btn>
          <Btn kind="ink" onClick={onSubmit}>
            refund ${amount}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// <Billing /> — admin billing & plans screen
// ────────────────────────────────────────────────────────────────────────────

export interface BillingProps {
  readonly actionFlags?: import('@/lib/flags/admin-actions').AdminBillingFlags;
}

const ALL_OFF_BILLING_FLAGS: import('@/lib/flags/admin-actions').AdminBillingFlags = {
  ui_admin_billing_refund_perm: false,
  ui_admin_billing_retry_perm: false,
  ui_admin_billing_credit_perm: false,
  ui_admin_billing_dunning_perm: false,
};

export function Billing({
  actionFlags = ALL_OFF_BILLING_FLAGS,
}: BillingProps = {}): ReactElement {
  const invoicesQuery = useAdminInvoices();
  const kpisQuery = useAdminBillingKpis();

  const [tab, setTab] = useState<BillingTab>('invoices');
  const [refundFor, setRefundFor] = useState<AdminInvoice | null>(null);

  // Disabled-stub today: both hooks return `flag_off_or_not_implemented`,
  // so we sit in the loading branch (KPIs render `…`, invoice table is
  // empty). The branches stay live so flipping ENABLED upstream wires the
  // canon UI without further screen changes.
  const kpis = kpisQuery.data && kpisQuery.data.ok ? kpisQuery.data.data : null;
  const loading = kpis === null;

  const invoices: ReadonlyArray<AdminInvoice> =
    invoicesQuery.data && invoicesQuery.data.ok
      ? invoicesQuery.data.data.invoices
      : [];

  // Failed/disputed counts shown in the SectionLabel right-side caption.
  const failedCount =
    invoicesQuery.data && invoicesQuery.data.ok
      ? (invoicesQuery.data.data.failed_count ?? 0)
      : 0;
  const disputedCount =
    invoicesQuery.data && invoicesQuery.data.ok
      ? (invoicesQuery.data.data.disputed_count ?? 0)
      : 0;

  // ─── Action handlers ─────────────────────────────────────────────────────

  const onExportCsv = useCallback((): void => {
    // Cheap action — surface a friendly toast even with no BFF (canon parity).
    toast('exporting billing csv · audit row queued');
  }, []);

  const onIssueCreditOpen = useCallback((): void => {
    // Drawer body submits behind `ui_admin_billing_credit_perm` (OFF default)
    // → its own toast stub. Opening the drawer itself is read-only so it
    // does NOT need a flag.
    openDrawer(
      'issue credit',
      <IssueCreditDrawerBody enabled={actionFlags.ui_admin_billing_credit_perm} />,
      { eyebrow: 'one-time account credit' },
    );
  }, [actionFlags.ui_admin_billing_credit_perm]);

  const onRefundOpen = useCallback((inv: AdminInvoice): void => {
    setRefundFor(inv);
  }, []);

  const onRefundClose = useCallback((): void => {
    setRefundFor(null);
  }, []);

  const onRetry = useCallback(
    (inv: AdminInvoice): void => {
      if (actionFlags.ui_admin_billing_retry_perm) {
        // TODO: POST /api/admin/v1/billing/invoices/:id/retry
        toast(`retrying invoice ${inv.id}…`, { kind: 'info' });
        return;
      }
      toast('admin action: not yet wired', { kind: 'info' });
    },
    [actionFlags.ui_admin_billing_retry_perm],
  );

  const onDunningEdit = useCallback(
    (dayLabel: string): void => {
      if (actionFlags.ui_admin_billing_dunning_perm) {
        // TODO: PUT /api/admin/v1/billing/dunning
        toast(`opening dunning copy editor · ${dayLabel}`, { kind: 'info' });
        return;
      }
      toast('admin action: not yet wired', { kind: 'info' });
    },
    [actionFlags.ui_admin_billing_dunning_perm],
  );

  // ─── KPI tile values ─────────────────────────────────────────────────────

  const mrrValue = loading ? '…' : `$${(kpis?.mrr_usd ?? 0).toLocaleString()}`;
  const failedPaymentsValue = loading
    ? '…'
    : (kpis?.failed_payments_24h ?? 0).toString();
  const failedPaymentsSub = loading
    ? '—'
    : `$${(kpis?.failed_payments_at_risk_usd ?? 0).toLocaleString()} at risk`;
  const refundsValue = loading
    ? '…'
    : `$${(kpis?.refunds_30d_usd ?? 0).toLocaleString()}`;
  const refundsSub = loading
    ? '—'
    : `${kpis?.refunds_30d_count ?? 0} issued`;
  const creditsValue = loading
    ? '…'
    : `$${(kpis?.credits_outstanding_usd ?? 0).toLocaleString()}`;
  const creditsSub = loading
    ? '—'
    : `${kpis?.credits_outstanding_accounts ?? 0} accounts`;

  // ─── Invoice rows for <Table /> ──────────────────────────────────────────

  const invoiceRows: ReactNode[][] = invoices.map((inv) => [
    <span className="mc-mono" key="i">
      {inv.id}
    </span>,
    <span style={{ fontWeight: 600 }} key="o">
      {inv.org}
    </span>,
    <span className="mc-mono" key="a">
      ${formatAmount(inv.amount)}
    </span>,
    <Pill kind={invoicePillKind(inv.status)} key="s">
      {inv.status}
    </Pill>,
    <span className="mc-mono" key="t">
      {inv.attempts}
    </span>,
    <span className="mc-mono muted" key="n">
      {inv.next_retry ?? '—'}
    </span>,
    <div
      key="x"
      className="row"
      style={{ gap: 6, justifyContent: 'flex-end' }}
    >
      <Btn
        kind="ghost"
        size="sm"
        onClick={(): void => onRefundOpen(inv)}
        aria-label={`refund ${inv.id}`}
      >
        refund
      </Btn>
      <Btn
        kind="ghost"
        size="sm"
        onClick={(): void => onRetry(inv)}
        aria-label={`retry ${inv.id}`}
      >
        retry
      </Btn>
    </div>,
  ]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="adm-page" data-testid="admin-billing">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">billing &amp; plans</h1>
          <p className="adm-page-sub">
            invoices, refunds, credits, dunning. stripe sync 2 min ago.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" onClick={onExportCsv}>
            export csv
          </Btn>
          <Btn kind="ink" size="sm" onClick={onIssueCreditOpen}>
            issue credit
          </Btn>
        </div>
      </div>

      <div className="adm-grid">
        <Card>
          <div className="adm-kpi-label">mrr</div>
          <div className="adm-kpi-num">{mrrValue}</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            {loading ? '—' : '+4.1% mom'}
          </div>
        </Card>
        <Card>
          <div className="adm-kpi-label">failed payments · 24h</div>
          <div className="adm-kpi-num">{failedPaymentsValue}</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            {failedPaymentsSub}
          </div>
        </Card>
        <Card>
          <div className="adm-kpi-label">refunds · 30d</div>
          <div className="adm-kpi-num">{refundsValue}</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            {refundsSub}
          </div>
        </Card>
        <Card>
          <div className="adm-kpi-label">credits · outstanding</div>
          <div className="adm-kpi-num">{creditsValue}</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            {creditsSub}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Tabs<BillingTab> items={TAB_ITEMS} selected={tab} onChange={setTab} />
      </div>

      {tab === 'invoices' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel>
            <span>recent invoices</span>
            <span
              className="adm-page-sub"
              style={{ fontSize: 11 }}
            >
              {failedCount} failed · {disputedCount} disputed
            </span>
          </SectionLabel>
          {invoiceRows.length === 0 ? (
            <EmptyState
              title={
                loading
                  ? 'loading invoices…'
                  : 'no invoices in this window'
              }
              sub={
                loading
                  ? 'awaiting stripe sync'
                  : 'try widening the date range'
              }
            />
          ) : (
            <Table
              headers={[
                'invoice',
                'org',
                'amount',
                'status',
                'attempts',
                'next retry',
                '',
              ]}
              rows={invoiceRows}
            />
          )}
        </Card>
      ) : null}

      {tab === 'dunning' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel>
            <span>dunning sequence</span>
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DUNNING_STEPS.map(([day, event, note]) => (
              <div
                key={day}
                className="row"
                style={{
                  gap: 12,
                  padding: '10px 12px',
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                }}
              >
                <span
                  className="mc-mono"
                  style={{ fontSize: 12, fontWeight: 700, width: 60 }}
                >
                  {day}
                </span>
                <span
                  style={{ fontWeight: 600, fontSize: 13, width: 200 }}
                >
                  {event}
                </span>
                <span
                  className="muted mc-mono"
                  style={{ fontSize: 11.5, flex: 1 }}
                >
                  {note}
                </span>
                <Btn
                  kind="ghost"
                  size="sm"
                  onClick={(): void => onDunningEdit(day)}
                  aria-label={`edit copy for ${day}`}
                >
                  edit copy
                </Btn>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {tab !== 'invoices' && tab !== 'dunning' ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState title={`${tab} — preview only`} />
        </Card>
      ) : null}

      {refundFor !== null ? (
        <RefundModal
          invoice={refundFor}
          onClose={onRefundClose}
          enabled={actionFlags.ui_admin_billing_refund_perm}
        />
      ) : null}
    </div>
  );
}

export default Billing;
