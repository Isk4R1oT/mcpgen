// apps/web/src/components/screens/admin/marketplace/marketplace.tsx
//
// Phase 3 / C3-marketplace — Admin marketplace moderation screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-marketplace.jsx
// (`MarketplaceScreen({ ctx })`). Pixel-faithful port to the production
// admin-ui kit (`@/components/admin-ui`) under the canon admin shell.
//
// Backend wiring (per SCREEN-BEHAVIORS-CATALOG.md § admin-marketplace):
//   - Queue listing → `useAdminModerationQueue()` typed disabled-stub.
//     Returns `{ ok: false, error: 'flag_off_or_not_implemented' }` until
//     the BFF lands. We render the canon empty state on the queue card +
//     a stubbed detail rail so the layout / structure stays intact.
//   - Approve / Request changes / Reject (via TakedownModal) and
//     bulk-approve are gated behind `ui_admin_<action>_perm` flags
//     (default OFF). When OFF the click fires `toast(...)` (canon
//     `ctx.showToast` parity); flipping ON requires the matching BFF
//     route to exist (see FLAGS-NEEDED.md).
//   - Filters drawer → `openDrawer(...)` (canon `window.mcpDrawer` parity).
//
// All canon UI surfaces survive in code: header copy, four secondary tabs
// (`reports`/`featured`/`categories`/`policy`) render the canon
// "preview only" empty state when active. The takedown modal is fully
// rendered with policy dropdown + message textarea + 4-eyes hint.

'use client';

import {
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from 'react';

import {
  Btn,
  Card,
  EmptyState,
  Pill,
  SectionLabel,
  Table,
} from '@/components/admin-ui';
import {
  useAdminModerationQueue,
  type AdminModerationItem,
  type AdminModerationRisk,
} from '@/lib/api/admin';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

// ─── Canon copy / static data ──────────────────────────────────────────────

type TabId = 'queue' | 'reports' | 'featured' | 'categories' | 'policy';

interface TabDef {
  readonly id: TabId;
  readonly label: string;
}

const TABS: ReadonlyArray<TabDef> = [
  { id: 'queue', label: 'review queue · 14' },
  { id: 'reports', label: 'user reports · 7' },
  { id: 'featured', label: 'featured' },
  { id: 'categories', label: 'categories' },
  { id: 'policy', label: 'policy' },
];

// Filter chips reproduced verbatim from canon admin-marketplace.jsx.
const FILTER_GROUPS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['risk', ['any', 'low', 'med', 'high']],
  ['waiting', ['any', '<1h', '1-4h', '>4h']],
  ['submitter', ['any', 'first-time', 'verified', 'enterprise']],
  ['category', ['any', 'payments', 'data', 'devtools', 'productivity']],
];

// Auto-checks list — verbatim from canon (5 items, oauth scopes failing
// triggers the policy-hit explainer).
const AUTO_CHECKS: ReadonlyArray<readonly [string, boolean]> = [
  ['license file present', true],
  ['no known cves in deps', true],
  ['oauth scopes minimal', false],
  ['no pii in examples', true],
  ['name not trademark-conflicting', true],
];

// Reject reasons (canon `<select>` options).
const REJECT_REASONS: ReadonlyArray<string> = [
  'excessive oauth scopes',
  'misleading description',
  'tos violation',
  'security · vulnerable dep',
  'impersonation · trademark',
];

// Default rejection message (canon `<textarea defaultValue=...>`).
const DEFAULT_REJECT_MSG =
  'hi — the requested oauth scope `admin:org` is broader than what your tools document. please reduce to `read:org` or document why elevated access is needed.';

// Empty-state placeholder for the per-item detail rail when the queue is
// empty (BFF disabled-stub). Mirrors the queue's first-item shape so the
// page renders the canon layout while we await live data.
const EMPTY_DETAIL: AdminModerationItem = {
  id: '—',
  name: 'no items in queue',
  submitter: '—',
  risk: 'low',
  waiting: '—',
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function pillKindForRisk(risk: AdminModerationRisk): 'alert' | 'warn' | 'ok' {
  if (risk === 'high') return 'alert';
  if (risk === 'med') return 'warn';
  return 'ok';
}

function detailPillKindForRisk(risk: AdminModerationRisk): 'alert' | 'warn' {
  return risk === 'high' ? 'alert' : 'warn';
}

// ─── Filters drawer body ───────────────────────────────────────────────────

function FiltersDrawerBody(): JSX.Element {
  return (
    <div className="col" style={{ gap: 12, fontSize: 13 }}>
      {FILTER_GROUPS.map(([group, opts]) => (
        <div key={group}>
          <div className="adm-kpi-label" style={{ marginBottom: 4 }}>
            {group}
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {opts.map((opt) => (
              <button
                key={opt}
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-sm"
                onClick={(): void => {
                  toast(`${group}: ${opt}`);
                }}
                style={{ fontSize: 11 }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Takedown (reject) modal ───────────────────────────────────────────────

interface TakedownModalProps {
  readonly target: AdminModerationItem;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

function TakedownModal({
  target,
  onCancel,
  onConfirm,
}: TakedownModalProps): JSX.Element {
  return (
    <div
      className="mc-modal-veil"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="takedown-title"
    >
      <div
        className="adm-modal"
        onClick={(e): void => e.stopPropagation()}
        role="document"
      >
        <div className="mc-modal-head">
          <span id="takedown-title" className="mc-h3">
            reject · {target.name}
          </span>
        </div>
        <div className="mc-modal-body">
          <SectionLabel>
            <span>policy violated</span>
          </SectionLabel>
          <select
            className="mc-input mc-mono"
            style={{ marginBottom: 10 }}
            aria-label="policy violated"
          >
            {REJECT_REASONS.map((reason) => (
              <option key={reason}>{reason}</option>
            ))}
          </select>
          <SectionLabel>
            <span>message to author</span>
          </SectionLabel>
          <textarea
            className="mc-input"
            style={{ height: 80, padding: 10 }}
            defaultValue={DEFAULT_REJECT_MSG}
            aria-label="message to author"
          />
          <div className="adm-approval" style={{ marginTop: 12 }}>
            requires <strong>2 moderators</strong>. ali (you) + 1 more. sasha is on-call.
          </div>
        </div>
        <div className="mc-modal-foot">
          <Btn kind="ghost" onClick={onCancel}>
            cancel
          </Btn>
          <Btn kind="ink" onClick={onConfirm}>
            send &amp; request 4-eyes
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Marketplace moderation screen ─────────────────────────────────────────

export interface AdminMarketplaceScreenProps {
  /**
   * Flag `ui_admin_marketplace_bulk_approve_perm`. Gates the "bulk approve · 12"
   * CTA in the page header. Server-evaluated (default OFF).
   */
  bulkApproveEnabled?: boolean;
  /**
   * Flag `ui_admin_marketplace_approve_perm`. Gates the per-item "approve & list"
   * CTA on the detail rail. Server-evaluated (default OFF).
   */
  approveEnabled?: boolean;
  /**
   * Flag `ui_admin_marketplace_request_changes_perm`. Gates the per-item
   * "request changes" CTA. Server-evaluated (default OFF).
   */
  requestChangesEnabled?: boolean;
  /**
   * Flag `ui_admin_marketplace_takedown_perm`. Gates BOTH the per-item "reject"
   * CTA (which opens the TakedownModal) and the modal's "send & request 4-eyes"
   * confirm. Server-evaluated (default OFF). 4-eyes is enforced server-side.
   */
  takedownEnabled?: boolean;
}

export default function AdminMarketplaceScreen({
  bulkApproveEnabled = false,
  approveEnabled = false,
  requestChangesEnabled = false,
  takedownEnabled = false,
}: AdminMarketplaceScreenProps = {}): JSX.Element {
  // BFF disabled-stub. When the result is unavailable (always, in Phase 3)
  // the queue array is empty and the page renders the canon empty state.
  const queryResult = useAdminModerationQueue();
  const queue: ReadonlyArray<AdminModerationItem> =
    queryResult.data !== undefined && queryResult.data.ok
      ? queryResult.data.data.queue
      : [];

  const [tab, setTab] = useState<TabId>('queue');
  const [selId, setSelId] = useState<string | null>(
    queue[0] !== undefined ? queue[0].id : null,
  );
  const [showTakedown, setShowTakedown] = useState<boolean>(false);

  const sel: AdminModerationItem =
    queue.find((q) => q.id === selId) ?? queue[0] ?? EMPTY_DETAIL;

  const openFilters = (): void => {
    openDrawer('moderation filters', <FiltersDrawerBody />, {
      eyebrow: 'narrow the queue',
    });
  };

  // Bulk-approve action — gated behind `ui_admin_marketplace_bulk_approve_perm`.
  // OFF (default) → canon ctx.showToast stub. ON → live action toast.
  const onBulkApprove = (): void => {
    if (!bulkApproveEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('approving 12 listings · 4-eyes required');
  };

  // Per-item actions — each gated behind its own flag. OFF (default) fires the
  // canon ctx.showToast stub (canon UI surface survives in code per
  // SHARED-BRIEF.md); ON fires the live canon copy.
  const onApprove = (): void => {
    if (!approveEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('approved · listed in marketplace');
  };
  const onRequestChanges = (): void => {
    if (!requestChangesEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('returned to author with notes');
  };
  // The "reject" CTA opens the modal regardless (so moderators can compose
  // the takedown reason / message), but the final "send & request 4-eyes"
  // confirm is what mutates state — we gate that.
  const onOpenReject = (): void => {
    setShowTakedown(true);
  };
  const onConfirmReject = (): void => {
    setShowTakedown(false);
    if (!takedownEnabled) {
      toast('admin action: not yet wired', { kind: 'warn' });
      return;
    }
    toast('rejection sent · awaiting 2nd moderator', { kind: 'warn' });
  };
  const onCancelReject = (): void => {
    setShowTakedown(false);
  };

  return (
    <div className="adm-page">
      {/* Page header — title + actions row. */}
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">marketplace moderation</h1>
          <p className="adm-page-sub">
            listings, reports, featured queue. takedowns are 4-eyes.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {/* Canon uses `icon="filter"` — the production Icon set has no
              `filter` glyph (see `@/components/ui/icon`), so we omit it
              rather than introduce a phantom icon. The button text + canon
              styling is unchanged. */}
          <Btn kind="ghost" size="sm" onClick={openFilters}>
            filters
          </Btn>
          <Btn kind="ink" size="sm" onClick={onBulkApprove}>
            bulk approve · 12
          </Btn>
        </div>
      </div>

      {/* Tab strip — canon `adm-tabs` styling. */}
      <div className="adm-tabs">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`adm-tab ${tab === t.id ? 'sel' : ''}`.trim()}
            onClick={(): void => setTab(t.id)}
            role="tab"
            tabIndex={0}
            aria-selected={tab === t.id}
            onKeyDown={(e): void => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setTab(t.id);
              }
            }}
            data-testid={`adm-marketplace-tab-${t.id}`}
          >
            {t.label}
          </div>
        ))}
      </div>

      {tab === 'queue' ? (
        <QueueTab
          queue={queue}
          sel={sel}
          onSelect={(item): void => setSelId(item.id)}
          onApprove={onApprove}
          onRequestChanges={onRequestChanges}
          onReject={onOpenReject}
        />
      ) : (
        <Card style={{ marginTop: 18 }}>
          <EmptyState title={`${tab} — preview only`} />
        </Card>
      )}

      {showTakedown ? (
        <TakedownModal
          target={sel}
          onCancel={onCancelReject}
          onConfirm={onConfirmReject}
        />
      ) : null}
    </div>
  );
}

// ─── Queue tab (split layout) ──────────────────────────────────────────────

interface QueueTabProps {
  readonly queue: ReadonlyArray<AdminModerationItem>;
  readonly sel: AdminModerationItem;
  readonly onSelect: (item: AdminModerationItem) => void;
  readonly onApprove: () => void;
  readonly onRequestChanges: () => void;
  readonly onReject: () => void;
}

const QUEUE_GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 1fr',
  gap: 16,
  marginTop: 18,
};

function QueueTab({
  queue,
  sel,
  onSelect,
  onApprove,
  onRequestChanges,
  onReject,
}: QueueTabProps): JSX.Element {
  const headers: ReadonlyArray<ReactNode> = [
    'server',
    'submitted by',
    'risk',
    'waiting',
    '',
  ];

  const rows: ReactNode[][] = queue.map((q) => [
    <div key="server-cell">
      <div style={{ fontWeight: 600 }}>{q.name}</div>
      <div className="muted mc-mono" style={{ fontSize: 11 }}>
        {q.id}
      </div>
    </div>,
    <span key="submitter-cell" className="mc-mono" style={{ fontSize: 12 }}>
      {q.submitter}
    </span>,
    <Pill key="risk-cell" kind={pillKindForRisk(q.risk)}>
      {q.risk}
    </Pill>,
    <span key="waiting-cell" className="mc-mono">
      {q.waiting}
    </span>,
    <Btn
      key="action-cell"
      kind="ghost"
      size="sm"
      onClick={(): void => onSelect(q)}
    >
      review
    </Btn>,
  ]);

  return (
    <div style={QUEUE_GRID_STYLE}>
      <Card>
        <SectionLabel>
          <span>review queue · oldest first</span>
          <span className="adm-page-sub" style={{ fontSize: 11 }}>
            14 pending · sla 4h
          </span>
        </SectionLabel>
        {rows.length > 0 ? (
          <Table headers={[...headers]} rows={rows} />
        ) : (
          <EmptyState
            title="moderation queue · awaiting backend"
            sub="GET /api/admin/v1/moderation/queue not yet implemented"
          />
        )}
      </Card>

      <Card>
        <SectionLabel>
          <span>{sel.name}</span>
          <Pill kind={detailPillKindForRisk(sel.risk)}>{sel.risk} risk</Pill>
        </SectionLabel>
        <div
          className="mc-mono muted"
          style={{ fontSize: 12, marginBottom: 12 }}
        >
          {sel.id} · submitted {sel.waiting} ago by {sel.submitter}
        </div>

        <SectionLabel>
          <span>auto-checks</span>
        </SectionLabel>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            marginBottom: 14,
          }}
        >
          {AUTO_CHECKS.map(([label, ok], i) => (
            <div
              key={i}
              className="row"
              style={{
                gap: 8,
                fontSize: 12.5,
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              <span
                style={{
                  color: ok ? 'var(--ok)' : 'var(--accent)',
                  fontWeight: 700,
                }}
              >
                {ok ? '✓' : '✗'}
              </span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        <div className="adm-approval" style={{ marginBottom: 12 }}>
          policy hit: <strong>oauth scope `admin:org`</strong> exceeds
          least-privilege guideline. owner asked to justify in description but
          did not.
        </div>

        <SectionLabel>
          <span>moderator notes</span>
        </SectionLabel>
        <textarea
          className="mc-input"
          style={{ height: 60, padding: 10, marginBottom: 12 }}
          placeholder="visible to other moderators"
          aria-label="moderator notes"
        />
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ink" size="sm" onClick={onApprove}>
            approve &amp; list
          </Btn>
          <Btn kind="ghost" size="sm" onClick={onRequestChanges}>
            request changes
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
            onClick={onReject}
          >
            reject
          </Btn>
        </div>
      </Card>
    </div>
  );
}
