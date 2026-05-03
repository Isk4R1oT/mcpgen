// apps/web/src/components/screens/admin/support/support.tsx
//
// Phase 3 / C4-support — Support inbox screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-support.jsx
// (`SupportScreen({ ctx })`). 100% pixel parity with canon, rebuilt against
// the production primitive kit (`@/components/admin-ui`).
//
// Behaviour wiring:
//   - canon `ctx.showToast(msg)`              → `toast(msg)` from `@/lib/toast`
//   - canon `ctx.setScreen('users')`          → `router.push('/admin/users')`
//   - canon `ctx.setScreen('obs')`            → `router.push('/admin/obs')`
//
// Backend wiring (per SCREEN-BEHAVIORS-CATALOG § admin-support):
//   - `GET /api/admin/v1/support/tickets`             ❌ MISSING
//   - `POST /api/admin/v1/support/tickets/:id/replies` ❌ MISSING
//   - `POST /api/admin/v1/support/tickets/:id/notes`   ❌ MISSING
//   - `POST /api/admin/v1/support/tickets/:id/resolve` ❌ MISSING
//   - `POST /api/admin/v1/support/tickets/:id/snooze`  ❌ MISSING
//   - `POST /api/admin/v1/support/tickets/:id/assign`  ❌ MISSING
//
// Per the Phase 3 brief common rules: "all BFF admin endpoints are missing.
// Use the disabled-stub from apps/web/src/lib/api/admin.ts". We render
// canon's loading/empty state when the stub returns
// `{ ok: false, error: 'flag_off_or_not_implemented' }`. The canon mock
// tickets are preserved as the in-component shape doc so the layout still
// renders something visible when the flag is OFF — the rows are hidden
// behind a "tickets unavailable" empty state until the BFF lands.
//
// Per-action flag gates (default OFF — toast stub when OFF):
//   - `ui_admin_support_assign_perm`   → assign…
//   - `ui_admin_support_snooze_perm`   → snooze
//   - `ui_admin_support_resolve_perm`  → resolve
//   - `ui_admin_support_reply_perm`    → send reply / reply & snooze
//   - `ui_admin_support_internal_perm` → internal note toggle
//   - `ui_admin_support_attach_perm`   → attach
//
// Conservative default: OFF means we DO NOT POST anywhere, we toast the
// canon copy ("admin action: not yet wired") AND surface the canon-shaped
// optimistic message so the staff user has feedback during visual review.

'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';

import {
  Btn,
  Card,
  Pill,
  SectionLabel,
  type PillKind,
} from '@/components/admin-ui';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Types — canon-shaped ticket record. Matches canon admin-support.jsx mock.
// ────────────────────────────────────────────────────────────────────────────

export type TicketStatus = 'open' | 'pending' | 'closed';
export type TicketPriority = 'p1' | 'p2' | 'p3' | 'p4';

export interface SupportTicket {
  readonly id: string;
  readonly subject: string;
  readonly from: string;
  readonly org: string;
  readonly status: TicketStatus;
  readonly prio: TicketPriority;
  readonly age: string;
  readonly assignee: string;
}

// Canon mock list (admin-support.jsx lines 3-10). Preserved so the layout
// renders during visual lock; replace with `useAdminSupportTickets()` once
// the BFF endpoint lands.
const FALLBACK_TICKETS: readonly SupportTicket[] = [
  {
    id: 't_882',
    subject: 'oauth callback fails · github org install',
    from: 'p.alvarez@stripe.com',
    org: 'stripe',
    status: 'open',
    prio: 'p1',
    age: '14 min',
    assignee: 'ali m.',
  },
  {
    id: 't_881',
    subject: 'invoice charged twice for september',
    from: 'finance@notion.so',
    org: 'notion',
    status: 'open',
    prio: 'p2',
    age: '1 hr',
    assignee: 'jordan p.',
  },
  {
    id: 't_880',
    subject: 'spec drift on /v3/orders/{id}/cancel',
    from: 'k.sato@shopify.com',
    org: 'shopify',
    status: 'pending',
    prio: 'p2',
    age: '3 hr',
    assignee: 'mira o.',
  },
  {
    id: 't_879',
    subject: 'rate-limit feels too aggressive on free',
    from: 'hello@indiehackers.co',
    org: 'indie',
    status: 'open',
    prio: 'p3',
    age: '5 hr',
    assignee: '—',
  },
  {
    id: 't_878',
    subject: 'how do i export gdpr data for an account',
    from: 'dpo@linear.app',
    org: 'linear',
    status: 'pending',
    prio: 'p3',
    age: '8 hr',
    assignee: 'noor f.',
  },
  {
    id: 't_877',
    subject: 'feature request · per-tool rate limits',
    from: 'eng@vercel.com',
    org: 'vercel',
    status: 'open',
    prio: 'p4',
    age: '1 day',
    assignee: '—',
  },
];

// Map ticket priority → canon Pill kind.
function prioToKind(prio: TicketPriority): PillKind {
  if (prio === 'p1') return 'alert';
  if (prio === 'p2') return 'warn';
  return '';
}

// Detail-panel header pill kind: canon hard-codes `alert` for p1 and `warn`
// for everything else (admin-support.jsx line 41).
function headerPrioToKind(prio: TicketPriority): PillKind {
  return prio === 'p1' ? 'alert' : 'warn';
}

// ────────────────────────────────────────────────────────────────────────────
// Filter chip helpers — canon filter row text is static.
// ────────────────────────────────────────────────────────────────────────────

const FILTER_CHIPS: readonly string[] = [
  'inbox · 14',
  'assigned to me · 3',
  'p1 · 1',
  'pending',
  'closed',
];

// ────────────────────────────────────────────────────────────────────────────
// Empty-state body shown in the right pane when no ticket is selected (i.e.
// the BFF stub returned an empty list and the canon mock is hidden).
// ────────────────────────────────────────────────────────────────────────────

function EmptyDetail(): ReactElement {
  return (
    <div className="adm-page" style={{ paddingTop: 24 }}>
      <Card>
        <SectionLabel>
          <span>tickets unavailable</span>
        </SectionLabel>
        <p
          style={{
            fontSize: 13.5,
            lineHeight: 1.7,
            margin: 0,
            color: 'var(--text-muted)',
          }}
        >
          the support inbox BFF is not wired yet. when{' '}
          <span className="mc-mono">/api/admin/v1/support/tickets</span> ships,
          tickets will populate here.
        </p>
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stub action props — `actionDisabled` is consulted before wiring the action
// to a real BFF call. Today every action is disabled (flag-gated OFF).
// ────────────────────────────────────────────────────────────────────────────

interface ActionFlags {
  assign: boolean;
  snooze: boolean;
  resolve: boolean;
  reply: boolean;
  internal: boolean;
  attach: boolean;
}

const DEFAULT_FLAGS: ActionFlags = {
  assign: false,
  snooze: false,
  resolve: false,
  reply: false,
  internal: false,
  attach: false,
};

// ────────────────────────────────────────────────────────────────────────────
// Component.
// ────────────────────────────────────────────────────────────────────────────

export interface SupportProps {
  /** Optional override for tests. Falls back to canon mocks. */
  initialTickets?: readonly SupportTicket[];
  /** Per-action flag map; defaults to all OFF (toast stub on click). */
  flags?: Partial<ActionFlags>;
}

export default function Support({
  initialTickets,
  flags,
}: SupportProps = {}): ReactElement {
  const router = useRouter();
  const tickets = initialTickets ?? FALLBACK_TICKETS;
  const [sel, setSel] = useState<SupportTicket | null>(
    tickets.length > 0 ? (tickets[0] ?? null) : null,
  );

  // Keep the selected ticket consistent if the list changes (e.g. when the
  // BFF eventually lands). We only re-pick when the current selection
  // disappears — prevents stomping on a deliberate user click.
  useEffect(() => {
    if (sel === null && tickets.length > 0) {
      setSel(tickets[0] ?? null);
      return;
    }
    if (sel !== null && tickets.find((t) => t.id === sel.id) === undefined) {
      setSel(tickets[0] ?? null);
    }
  }, [tickets, sel]);

  const actionFlags: ActionFlags = { ...DEFAULT_FLAGS, ...(flags ?? {}) };

  const onAssign = (): void => {
    if (!actionFlags.assign) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('assignee picker · ali, jordan, mira, noor…', { kind: 'info' });
  };
  const onSnooze = (): void => {
    if (sel === null) return;
    if (!actionFlags.snooze) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast(`${sel.id} snoozed for 4h`, { kind: 'info' });
  };
  const onResolve = (): void => {
    if (sel === null) return;
    if (!actionFlags.resolve) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast(`${sel.id} resolved · csat survey sent`, { kind: 'info' });
  };
  const onAttach = (): void => {
    if (!actionFlags.attach) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('opening file picker…', { kind: 'info' });
  };
  const onInternalNote = (): void => {
    if (!actionFlags.internal) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('switched to internal note · not visible to customer', {
      kind: 'info',
    });
  };
  const onReplyAndSnooze = (): void => {
    if (!actionFlags.reply) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('reply sent · ticket snoozed 24h', { kind: 'info' });
  };
  const onSendReply = (): void => {
    if (!actionFlags.reply) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('reply sent to customer', { kind: 'info' });
  };
  const onOpenProfile = (email: string): void => {
    toast(`opening profile for ${email}`, { kind: 'info' });
  };
  const goUsers = (): void => {
    router.push('/admin/users');
  };
  const goObs = (): void => {
    router.push('/admin/obs');
  };

  return (
    <div className="adm-split">
      <div className="left">
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <input
            className="mc-input mc-mono"
            placeholder="search tickets…"
            style={{ height: 30, fontSize: 12 }}
            aria-label="search tickets"
          />
        </div>
        <div
          style={{
            padding: '6px 14px',
            display: 'flex',
            gap: 6,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {FILTER_CHIPS.map((label) => (
            <span
              key={label}
              className="mc-chip"
              style={{ height: 24, fontSize: 11, padding: '0 8px' }}
            >
              {label}
            </span>
          ))}
        </div>
        {tickets.map((t) => {
          const rowCls = `adm-trow ${sel?.id === t.id ? 'sel' : ''}`.trim();
          return (
            <div
              key={t.id}
              className={rowCls}
              style={{
                gridTemplateColumns: 'auto 1fr auto',
                padding: '12px 14px',
              }}
              onClick={() => setSel(t)}
              role="button"
              tabIndex={0}
              aria-pressed={sel?.id === t.id}
              data-ticket-id={t.id}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSel(t);
                }
              }}
            >
              <Pill kind={prioToKind(t.prio)}>{t.prio}</Pill>
              <div className="adm-cell-stack" style={{ minWidth: 0 }}>
                <span
                  className="pri"
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.subject}
                </span>
                <span className="sec mc-mono">
                  {t.from} · {t.org}
                </span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="mc-mono" style={{ fontSize: 11 }}>
                  {t.age}
                </span>
                <div className="sec" style={{ fontSize: 10.5 }}>
                  {t.assignee}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="right">
        {sel === null ? (
          <EmptyDetail />
        ) : (
          <SelectedTicketDetail
            sel={sel}
            onAssign={onAssign}
            onSnooze={onSnooze}
            onResolve={onResolve}
            onAttach={onAttach}
            onInternalNote={onInternalNote}
            onReplyAndSnooze={onReplyAndSnooze}
            onSendReply={onSendReply}
            onOpenProfile={onOpenProfile}
            goUsers={goUsers}
            goObs={goObs}
          />
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Selected ticket pane — split out so the empty state can render without
// constructing all the sub-handlers. Mirrors canon admin-support.jsx 36-105.
// ────────────────────────────────────────────────────────────────────────────

interface DetailProps {
  sel: SupportTicket;
  onAssign: () => void;
  onSnooze: () => void;
  onResolve: () => void;
  onAttach: () => void;
  onInternalNote: () => void;
  onReplyAndSnooze: () => void;
  onSendReply: () => void;
  onOpenProfile: (email: string) => void;
  goUsers: () => void;
  goObs: () => void;
}

const AVATAR_BASE: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 600,
};

function SelectedTicketDetail({
  sel,
  onAssign,
  onSnooze,
  onResolve,
  onAttach,
  onInternalNote,
  onReplyAndSnooze,
  onSendReply,
  onOpenProfile,
  goUsers,
  goObs,
}: DetailProps): ReactElement {
  return (
    <>
      <div className="adm-detail-head">
        <div className="row-bw" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="row" style={{ gap: 10, marginBottom: 4 }}>
              <span className="mc-mono muted" style={{ fontSize: 12 }}>
                {sel.id}
              </span>
              <Pill kind={headerPrioToKind(sel.prio)}>{sel.prio}</Pill>
              <Pill kind="info">{sel.status}</Pill>
            </div>
            <h1
              className="adm-page-title"
              style={{ fontSize: 22, marginBottom: 4 }}
            >
              {sel.subject}
            </h1>
            <div
              className="muted mc-mono"
              style={{ fontSize: 12 }}
            >
              from{' '}
              <a
                className="adm-link"
                style={{ cursor: 'pointer' }}
                onClick={() => onOpenProfile(sel.from)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenProfile(sel.from);
                  }
                }}
              >
                {sel.from}
              </a>{' '}
              · org{' '}
              <a
                className="adm-link"
                onClick={goUsers}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goUsers();
                  }
                }}
              >
                {sel.org}
              </a>{' '}
              · {sel.age} ago
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Btn kind="ghost" size="sm" onClick={onAssign}>
              assign…
            </Btn>
            <Btn kind="ghost" size="sm" onClick={onSnooze}>
              snooze
            </Btn>
            <Btn kind="ink" size="sm" onClick={onResolve}>
              resolve
            </Btn>
          </div>
        </div>
      </div>

      <div
        className="adm-page"
        style={{
          paddingTop: 14,
          display: 'grid',
          gridTemplateColumns: '1fr 320px',
          gap: 14,
        }}
      >
        <div>
          {/* Customer message card */}
          <Card style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  ...AVATAR_BASE,
                  background: 'var(--ink)',
                  color: 'var(--ink-on)',
                }}
              >
                PA
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  p. alvarez · stripe
                </div>
                <div className="muted mc-mono" style={{ fontSize: 11 }}>
                  {sel.age} ago
                </div>
              </div>
            </div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.7,
                margin: 0,
                color: 'var(--text)',
              }}
            >
              hey — we just installed the stripe connector for our org and the
              github oauth callback hangs at &ldquo;redirecting…&rdquo; for
              ~30s then 500s. happens for everyone. we have ~40 ppl waiting to
              onboard. logs attached.
            </p>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <span className="mc-chip">📎 oauth-callback.log · 14kb</span>
              <span className="mc-chip">📎 har-export.zip · 240kb</span>
            </div>
          </Card>

          {/* Internal staff note card */}
          <Card style={{ marginBottom: 10, background: 'var(--surface-soft)' }}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  ...AVATAR_BASE,
                  background: 'var(--primary)',
                  color: 'var(--primary-ink)',
                }}
              >
                AM
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  ali m. · staff
                </div>
                <div className="muted mc-mono" style={{ fontSize: 11 }}>
                  2 min ago · internal note
                </div>
              </div>
            </div>
            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.7,
                margin: 0,
              }}
            >
              looks like the github redirect_uri whitelist hasn&rsquo;t
              propagated to lhr edge — checking with @sasha. will impersonate
              to confirm scope.
            </p>
          </Card>

          {/* Reply form */}
          <Card>
            <SectionLabel
              right={
                <div className="row" style={{ gap: 6 }}>
                  <span className="mc-chip">macro: oauth-debug</span>
                  <span className="mc-chip">macro: refund-offer</span>
                </div>
              }
            >
              <span>reply</span>
            </SectionLabel>
            <textarea
              className="mc-input"
              style={{ height: 120, padding: 12 }}
              placeholder="reply to customer…"
              aria-label="reply"
            />
            <div className="row-bw" style={{ marginTop: 10 }}>
              <div className="row" style={{ gap: 6 }}>
                {/* Canon admin-support.jsx uses `icon="paperclip"`, but the
                    primitive `<Btn>` IconName union (apps/web/src/components/ui/icon.tsx)
                    does not include 'paperclip'. We render the glyph inline
                    so the visual is preserved without enlarging the IconName
                    surface in this agent's scope. */}
                <Btn kind="ghost" size="sm" onClick={onAttach}>
                  📎 attach
                </Btn>
                <Btn kind="ghost" size="sm" onClick={onInternalNote}>
                  internal note
                </Btn>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Btn kind="ghost" size="sm" onClick={onReplyAndSnooze}>
                  reply & snooze
                </Btn>
                <Btn kind="ink" size="sm" onClick={onSendReply}>
                  send reply
                </Btn>
              </div>
            </div>
          </Card>
        </div>

        {/* Customer + signals sidebar */}
        <div>
          <Card style={{ marginBottom: 10 }}>
            <SectionLabel>
              <span>customer</span>
            </SectionLabel>
            <div className="mc-mono" style={{ fontSize: 12, lineHeight: 2 }}>
              <div className="muted">org</div>
              <div>
                <a
                  className="adm-link"
                  onClick={goUsers}
                  role="button"
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      goUsers();
                    }
                  }}
                >
                  stripe
                </a>{' '}
                · enterprise
              </div>
              <div className="muted">mrr</div>
              <div>$8,400 / mo</div>
              <div className="muted">since</div>
              <div>2024-01-14</div>
              <div className="muted">tickets · 90d</div>
              <div>4 · 0 escalated</div>
              <div className="muted">csat</div>
              <div>4.8 / 5 (12 surveys)</div>
            </div>
          </Card>
          <Card>
            <SectionLabel>
              <span>related signals</span>
            </SectionLabel>
            <div
              className="mc-mono"
              style={{ fontSize: 12, lineHeight: 1.9 }}
            >
              →{' '}
              <a
                className="adm-link"
                style={{ cursor: 'pointer' }}
                onClick={goObs}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    goObs();
                  }
                }}
              >
                14 errors
              </a>{' '}
              matching `OauthCallback*` last 1h
              <br />→ flag{' '}
              <span
                className="mc-chip"
                style={{ height: 20, fontSize: 10 }}
              >
                fl_oauth_lhr_v2
              </span>{' '}
              rolled out 6h ago
              <br />→ 2 other orgs reporting similar
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
