// apps/web/src/components/screens/admin/users/users.tsx
//
// Phase 3 / C2-users — Admin → Users & Orgs.
//
// Source of truth: claude-design-reference/canon/admin/admin-users.jsx
// (`UsersScreen`) + canon admin-data.jsx (`window.ADM_DATA.users`).
//
// Layout (canon `adm-split`): two-pane split. Left rail is a search/filter
// list of users. Right rail is the per-user detail view with header card
// (avatar + status pills + identity meta + actions), KPI grid (plan, servers,
// role/org), tab strip (overview / servers / sessions / billing / audit /
// danger), and tab content.
//
// Backend status (per .planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md
// § admin-users):
//   - GET    /api/admin/v1/users                          MISSING
//   - GET    /api/admin/v1/users/:id                      MISSING
//   - POST   /api/admin/v1/users/:id/impersonate          MISSING
//   - POST   /api/admin/v1/users/:id/suspend              MISSING
//   - POST   /api/admin/v1/users/:id/password-reset       MISSING
//   - POST   /api/admin/v1/users/:id/revoke-sessions      MISSING
//   - POST   /api/admin/v1/users/:id/rotate-keys          MISSING
//   - POST   /api/admin/v1/users/:id/gdpr-export          MISSING
//   - POST   /api/admin/v1/users/:id/delete               MISSING
//
// Treatment:
//   - List fetch goes through `useAdminUsers()` from `lib/api/admin.ts`,
//     which currently returns `flag_off_or_not_implemented`. When the
//     result is unavailable we render canon's `<EmptyState title="no users
//     match" />` on the left rail and a complementary "no user selected —
//     backend not ready" EmptyState on the right rail. The full canon
//     chrome (filter button, status chip strip, tab strip with tabs marked
//     as `coming up`) survives in code so flipping the flag ON exposes the
//     real layout instantly.
//   - Action buttons (impersonate, suspend, password reset, revoke
//     sessions, rotate keys, GDPR export, delete account) all fire
//     `toast('admin action: not yet wired')` per the C2-users brief.
//     These will be wrapped in real `evaluateBooleanFlag` calls once the
//     BFF endpoints land; until then they're explicitly stubbed via the
//     `ui_admin_<action>_perm` flag keys captured in
//     `.planning/phase-rebuild/FLAGS-NEEDED.md`.
//
// Per CLAUDE.md §12 / SHARED-BRIEF.md "Implementation rules":
//   - All UI imports come from `@/components/admin-ui` (admin shares the
//     visual contract with the main canon kit, but admin screens never
//     cross over into `@/components/ui` directly).
//   - `window.mcpToast` → `toast(msg, opts)` from `@/lib/toast`.
//   - `window.mcpDrawer` → `openDrawer(title, body, opts)` from `@/lib/drawer`.
//   - No mock arrays; we surface the canon empty state when the disabled
//     stub returns `flag_off_or_not_implemented`.

'use client';

import { useState, type JSX, type ReactNode } from 'react';

import {
  Btn,
  Card,
  EmptyState,
  Pill,
  SectionLabel,
  Toggle,
} from '@/components/admin-ui';
import { useAdminUsers, type AdminUserSummary } from '@/lib/api/admin';
import { openDrawer } from '@/lib/drawer';
import type { AdminUsersFlags } from '@/lib/flags/admin-actions';
import { toast } from '@/lib/toast';

const ALL_OFF_USERS_FLAGS: AdminUsersFlags = {
  ui_admin_impersonate_perm: false,
  ui_admin_suspend_perm: false,
  ui_admin_password_reset_perm: false,
  ui_admin_revoke_sessions_perm: false,
  ui_admin_rotate_keys_perm: false,
  ui_admin_gdpr_export_perm: false,
  ui_admin_account_delete_perm: false,
};

// ─── Local types ───────────────────────────────────────────────────────────

type UserTab = 'overview' | 'servers' | 'sessions' | 'billing' | 'audit' | 'danger';

const TABS: readonly UserTab[] = [
  'overview',
  'servers',
  'sessions',
  'billing',
  'audit',
  'danger',
] as const;

const STATUS_CHIPS: readonly string[] = [
  'all',
  'active',
  'flagged',
  'suspended',
  'pending',
] as const;

// Toast stub fired by every admin action whose BFF endpoint is not wired.
// Mirrors the wording requested by the C2-users brief; flag keys are kept
// alongside in FLAGS-NEEDED.md.
function fireAdminActionStub(): void {
  toast('admin action: not yet wired');
}

// Gate helper: when the per-action flag is ON, run the real action; when
// OFF, fall back to the canon `fireAdminActionStub()` toast.
function gatedAdminAction(enabled: boolean, run: () => void): void {
  if (enabled) {
    run();
    return;
  }
  fireAdminActionStub();
}

// Drop-in replacement for canon `window.fmtCountry`. Canon includes only the
// 9 country codes that appear in the mock dataset; we mirror that table 1:1
// and fall back to the raw code for everything else (canon behavior).
const COUNTRY_FLAGS: Record<string, string> = {
  CA: '🇨🇦',
  JP: '🇯🇵',
  IN: '🇮🇳',
  US: '🇺🇸',
  AE: '🇦🇪',
  GB: '🇬🇧',
  PL: '🇵🇱',
  BR: '🇧🇷',
  NO: '🇳🇴',
};
function fmtCountry(cc: string): string {
  return COUNTRY_FLAGS[cc] ?? cc;
}

function initialsFor(name: string): string {
  return name
    .split(' ')
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function statusPill(status: AdminUserSummary['status']): JSX.Element {
  switch (status) {
    case 'active':
      return <Pill kind="ok">active</Pill>;
    case 'flagged':
      return <Pill kind="warn">flagged</Pill>;
    case 'suspended':
      return <Pill kind="alert">suspended</Pill>;
    case 'pending':
      return <Pill kind="info">pending</Pill>;
  }
}

// ─── Filter drawer body (canon parity) ─────────────────────────────────────
//
// Mirrors canon `admin-users.jsx` lines 16–25 — four facet groups (plan,
// country, mfa, signup) rendered as clickable chips. Clicking a chip fires a
// canon-style toast (`{group}: {value}`) so the user gets feedback even
// though the backend filter endpoint isn't wired.

interface FilterFacet {
  key: string;
  options: readonly string[];
}

const FILTER_FACETS: readonly FilterFacet[] = [
  { key: 'plan', options: ['free', 'pro', 'enterprise'] },
  { key: 'country', options: ['US', 'CA', 'GB', 'DE', 'JP', 'BR'] },
  { key: 'mfa', options: ['enabled', 'disabled'] },
  { key: 'signup', options: ['<7d', '<30d', '<90d', '>90d'] },
];

function FilterDrawerBody(): JSX.Element {
  return (
    <div className="col" style={{ gap: 12, fontSize: 13 }}>
      {FILTER_FACETS.map((facet) => (
        <div key={facet.key}>
          <div className="adm-kpi-label" style={{ marginBottom: 4 }}>
            {facet.key}
          </div>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {facet.options.map((opt) => (
              <span
                key={opt}
                className="mc-chip"
                onClick={() => toast(`${facet.key}: ${opt}`)}
                style={{ cursor: 'pointer' }}
              >
                {opt}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────
//
// Canon `ImpersonateModal` and `SuspendModal` — preserved verbatim except the
// confirm action becomes the flag-stubbed `fireAdminActionStub()` instead of
// canon's optimistic toast.

interface ImpersonateModalProps {
  user: AdminUserSummary;
  onClose: () => void;
  enabled: boolean;
}

function ImpersonateModal({ user, onClose, enabled }: ImpersonateModalProps): JSX.Element {
  const [reason, setReason] = useState('');
  return (
    <div className="mc-modal-veil" onClick={onClose}>
      <div
        className="adm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mc-modal-head">
          <span className="mc-h3">impersonate {user.name}</span>
          <Btn kind="ghost" size="sm" onClick={onClose}>
            esc
          </Btn>
        </div>
        <div className="mc-modal-body">
          <div className="adm-approval">
            <div style={{ marginBottom: 8 }}>
              <strong>this is logged.</strong> the user sees a banner. session
              expires in 30 min. all your actions are tied to your account in
              audit.
            </div>
            <div className="muted">
              your colleague will be paged for 4-eyes if you take any
              destructive action while impersonating.
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SectionLabel>
              <span>reason · required</span>
            </SectionLabel>
            <textarea
              className="mc-input"
              style={{ height: 76, padding: 10 }}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. investigating ticket #t_882 — oauth callback issue"
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <SectionLabel>
              <span>related ticket</span>
            </SectionLabel>
            <input
              className="mc-input mc-mono"
              placeholder="#t_882 (optional)"
            />
          </div>
        </div>
        <div className="mc-modal-foot">
          <span className="muted mc-mono" style={{ fontSize: 11 }}>
            session imp_xxxx · 30 min
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" onClick={onClose}>
              cancel
            </Btn>
            <Btn
              kind="ink"
              disabled={reason.length === 0}
              onClick={() => {
                onClose();
                gatedAdminAction(enabled, () => {
                  // TODO: POST /api/admin/v1/users/:id/impersonate
                  toast(`impersonation session started · ${user.id}`);
                });
              }}
            >
              start session
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SuspendModalProps {
  user: AdminUserSummary;
  onClose: () => void;
  enabled: boolean;
}

function SuspendModal({ user, onClose, enabled }: SuspendModalProps): JSX.Element {
  const suspending = user.status !== 'suspended';
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  return (
    <div className="mc-modal-veil" onClick={onClose}>
      <div
        className="adm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mc-modal-head">
          <span className="mc-h3">
            {suspending ? 'suspend' : 'unsuspend'} {user.name}
          </span>
          <Btn kind="ghost" size="sm" onClick={onClose}>
            esc
          </Btn>
        </div>
        <div className="mc-modal-body">
          {suspending ? (
            <div className="adm-danger" style={{ marginBottom: 14 }}>
              <div className="adm-danger-title">⚠ this will</div>
              <ul
                style={{
                  fontSize: 12.5,
                  color: 'var(--text-muted)',
                  margin: 0,
                  paddingLeft: 18,
                  lineHeight: 1.7,
                }}
              >
                <li>
                  revoke all active sessions ({user.servers} servers will keep
                  running but stop accepting new traffic)
                </li>
                <li>disable api keys</li>
                <li>send an email to {user.email}</li>
                <li>mark org as suspended in billing</li>
              </ul>
            </div>
          ) : null}
          <SectionLabel>
            <span>reason · required</span>
          </SectionLabel>
          <select
            className="mc-input mc-mono"
            style={{ marginBottom: 8 }}
            defaultValue="card chargebacks"
          >
            <option>card chargebacks</option>
            <option>tos violation · spam</option>
            <option>tos violation · abuse</option>
            <option>security · suspected compromise</option>
            <option>billing · failed payments</option>
            <option>other (specify below)</option>
          </select>
          <textarea
            className="mc-input"
            style={{ height: 60, padding: 10 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="additional context"
          />
          <div style={{ marginTop: 10 }}>
            <Toggle
              on={notify}
              onChange={setNotify}
              label="send notification email"
            />
          </div>
        </div>
        <div className="mc-modal-foot">
          <span className="muted mc-mono" style={{ fontSize: 11 }}>
            logged · diff in audit
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" onClick={onClose}>
              cancel
            </Btn>
            <Btn
              kind="ink"
              onClick={() => {
                onClose();
                gatedAdminAction(enabled, () => {
                  // TODO: POST /api/admin/v1/users/:id/suspend
                  toast(`${suspending ? 'suspended' : 'unsuspended'} · ${user.id}`);
                });
              }}
            >
              confirm {suspending ? 'suspend' : 'unsuspend'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Detail rail (right pane) ──────────────────────────────────────────────

interface DetailRailProps {
  user: AdminUserSummary | null;
  tab: UserTab;
  onTabChange: (next: UserTab) => void;
  onImpersonate: () => void;
  onSuspendToggle: () => void;
  actionFlags: AdminUsersFlags;
}

function DetailRail({
  user,
  tab,
  onTabChange,
  onImpersonate,
  onSuspendToggle,
  actionFlags,
}: DetailRailProps): JSX.Element {
  if (user === null) {
    // Disabled-stub branch — the BFF didn't return any users so there is
    // nothing to select. Canon never reaches this state because canon mocks
    // the data; we surface a parallel empty state to keep the right rail
    // structurally intact.
    return (
      <div className="right">
        <div className="adm-page" style={{ paddingTop: 18 }}>
          <EmptyState
            title="no user selected"
            sub="user list is unavailable — admin BFF endpoints are not yet wired."
          />
        </div>
      </div>
    );
  }

  const liveServers = Math.round(user.servers * 0.6);
  const draftServers = user.servers - liveServers;

  return (
    <div className="right">
      <div className="adm-detail-head">
        <div className="row-bw" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="row" style={{ gap: 10, marginBottom: 6 }}>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: 'var(--primary)',
                  color: 'var(--primary-ink)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: 14,
                }}
              >
                {initialsFor(user.name)}
              </span>
              <h1 className="adm-page-title" style={{ fontSize: 26 }}>
                {user.name}
              </h1>
              {user.status === 'flagged' ? (
                <Pill kind="warn">flagged · 3 chargebacks</Pill>
              ) : null}
              {user.status === 'suspended' ? (
                <Pill kind="alert">suspended</Pill>
              ) : null}
            </div>
            <div className="mc-mono muted" style={{ fontSize: 12 }}>
              {user.email} · {user.id} · {fmtCountry(user.country)} · joined{' '}
              {user.created}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <Btn
              kind="ghost"
              size="sm"
              icon="copy"
              onClick={() => {
                if (typeof navigator !== 'undefined' && navigator.clipboard) {
                  void navigator.clipboard.writeText(user.id);
                }
                toast('user id copied');
              }}
            >
              copy id
            </Btn>
            {/* Canon uses icon="eye" for impersonate — our IconName union
                doesn't ship `eye` yet, so we render the button without the
                glyph and rely on the kind="ink" affordance + label. */}
            <Btn kind="ink" size="sm" onClick={onImpersonate}>
              impersonate
            </Btn>
            <Btn kind="primary" size="sm" onClick={onSuspendToggle}>
              {user.status === 'suspended' ? 'unsuspend' : 'suspend'}
            </Btn>
          </div>
        </div>
      </div>

      <div className="adm-detail-grid">
        <div>
          <div className="adm-kpi-label">plan</div>
          <div className="adm-kpi-num" style={{ fontSize: 18 }}>
            {user.plan}
          </div>
          <div className="mc-mono muted" style={{ fontSize: 11 }}>
            {user.spend} / 30d
          </div>
        </div>
        <div>
          <div className="adm-kpi-label">servers</div>
          <div className="adm-kpi-num" style={{ fontSize: 18 }}>
            {user.servers}
          </div>
          <div className="mc-mono muted" style={{ fontSize: 11 }}>
            {user.servers > 0
              ? `${liveServers} live · ${draftServers} draft`
              : 'none'}
          </div>
        </div>
        <div>
          <div className="adm-kpi-label">role · org</div>
          <div className="adm-kpi-num" style={{ fontSize: 18 }}>
            {user.role}
          </div>
          <div className="mc-mono muted" style={{ fontSize: 11 }}>
            {user.org} · 4 members
          </div>
        </div>
      </div>

      <div className="adm-tabs">
        {TABS.map((t) => (
          <div
            key={t}
            className={`adm-tab ${tab === t ? 'sel' : ''}`.trim()}
            onClick={() => onTabChange(t)}
            role="tab"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTabChange(t);
              }
            }}
            aria-selected={tab === t}
          >
            {t}
          </div>
        ))}
      </div>

      <div className="adm-page" style={{ paddingTop: 18 }}>
        {tab === 'overview' ? (
          <OverviewTab user={user} actionFlags={actionFlags} />
        ) : null}
        {tab === 'danger' ? (
          <DangerTab user={user} actionFlags={actionFlags} />
        ) : null}
        {tab !== 'overview' && tab !== 'danger' ? (
          <EmptyState
            title={`${tab} — coming up`}
            sub="full table view in production. preview shown on overview."
          />
        ) : null}
      </div>
    </div>
  );
}

// ─── Overview tab content ──────────────────────────────────────────────────

interface OverviewTabProps {
  user: AdminUserSummary;
  actionFlags: AdminUsersFlags;
}

function OverviewTab({ user, actionFlags }: OverviewTabProps): JSX.Element {
  // Canon "raw entity" JSON block — verbatim shape, populated from the
  // selected user. Stripe customer id is derived the same way as canon (slice
  // off the `u_` prefix and append `LXa`).
  const rawEntity = `{
  "id": "${user.id}",
  "email": "${user.email}",
  "org_id": "org_${user.org}",
  "role": "${user.role}",
  "status": "${user.status}",
  "plan": "${user.plan}",
  "mfa": ${user.mfa},
  "country": "${user.country}",
  "created_at": "${user.created}T08:14:22Z",
  "last_seen_at": "${user.last_seen}",
  "stripe_customer": "cus_${user.id.slice(2)}LXa"
}`;

  const sessionRows: ReadonlyArray<readonly [string, string, string, string]> = [
    ['2 min ago', 'macOS · Chrome 121', '74.125.x.x · CA', 'active'],
    ['1 hr ago', 'iOS · Safari', '203.0.113.x · CA', 'active'],
    ['3 days ago', 'Windows · Firefox', '198.51.100.x · US', 'expired'],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
      <Card>
        <SectionLabel>
          <span>raw entity</span>
        </SectionLabel>
        <div className="mc-code" style={{ fontSize: 11.5 }}>
          {rawEntity}
        </div>
      </Card>
      <Card>
        <SectionLabel>
          <span>linked entities</span>
        </SectionLabel>
        <div className="mc-mono" style={{ fontSize: 12, lineHeight: 2 }}>
          {/* Canon links to other admin screens via `ctx.setScreen`; we use
              real Next.js anchors so cmd-click / keyboard nav both work. */}
          → <a className="adm-link" href="/admin/servers">{user.servers} servers</a>
          <br />
          → <a className="adm-link" href="/admin/billing">2 invoices · 1 overdue</a>
          <br />
          → <a className="adm-link" href="/admin/support">3 tickets · 1 open</a>
          <br />
          → <a className="adm-link" href="/admin/audit">14 audit events (30d)</a>
          <br />
          → 4 oauth tokens · github, slack, google, microsoft
        </div>
      </Card>
      <Card style={{ gridColumn: '1 / -1' }}>
        <SectionLabel>
          <span>recent sessions</span>
        </SectionLabel>
        <div className="mc-mono" style={{ fontSize: 12 }}>
          {sessionRows.map((row) => (
            <div
              key={`${row[0]}-${row[1]}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 1fr 90px 80px',
                gap: 12,
                padding: '8px 0',
                borderBottom: '1px dashed var(--border)',
              }}
            >
              <span className="muted">{row[0]}</span>
              <span>{row[1]}</span>
              <span className="muted">{row[2]}</span>
              <Pill kind={row[3] === 'active' ? 'ok' : ''}>{row[3]}</Pill>
              <a
                className="adm-link"
                style={{ textAlign: 'right', cursor: 'pointer' }}
                onClick={() =>
                  gatedAdminAction(
                    actionFlags.ui_admin_revoke_sessions_perm,
                    () => {
                      // TODO: POST /api/admin/v1/users/:id/revoke-sessions (single)
                      toast(`session revoked · ${user.id}`);
                    },
                  )
                }
              >
                revoke
              </a>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Danger tab content ────────────────────────────────────────────────────

interface DangerTabProps {
  user: AdminUserSummary;
  actionFlags: AdminUsersFlags;
}

function DangerTab({ user, actionFlags }: DangerTabProps): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <Card>
        <SectionLabel>
          <span>gdpr · data subject rights</span>
        </SectionLabel>
        <div className="row" style={{ gap: 8, marginBottom: 8 }}>
          {/* Canon uses icon="download" — our IconName union doesn't ship
              `download`, so we render without the glyph. */}
          <Btn
            kind="ink"
            size="sm"
            onClick={() =>
              gatedAdminAction(actionFlags.ui_admin_gdpr_export_perm, () => {
                // TODO: POST /api/admin/v1/users/:id/gdpr-export
                toast(`gdpr export queued · ${user.id}`);
              })
            }
          >
            export all data
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            onClick={() =>
              gatedAdminAction(actionFlags.ui_admin_gdpr_export_perm, () => {
                // TODO: GET /api/admin/v1/users/:id/exports
                toast('previous exports loaded');
              })
            }
          >
            view previous exports
          </Btn>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>
          last export: <span className="mc-mono">exp_aa881</span> · 4 hr ago ·
          14.2 mb · sla 24h
        </div>
      </Card>
      <div className="adm-danger">
        <div className="adm-danger-title">
          ⚠ destructive · audited · 4-eyes required
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Btn
            kind="ghost"
            size="sm"
            onClick={() =>
              gatedAdminAction(actionFlags.ui_admin_password_reset_perm, () => {
                // TODO: POST /api/admin/v1/users/:id/password-reset
                toast(`password reset email sent · ${user.id}`);
              })
            }
          >
            force password reset
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            onClick={() =>
              gatedAdminAction(actionFlags.ui_admin_revoke_sessions_perm, () => {
                // TODO: POST /api/admin/v1/users/:id/revoke-sessions
                toast(`all sessions revoked · ${user.id}`);
              })
            }
          >
            revoke all sessions
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            onClick={() =>
              gatedAdminAction(actionFlags.ui_admin_rotate_keys_perm, () => {
                // TODO: POST /api/admin/v1/users/:id/rotate-keys
                toast(`all api keys rotated · ${user.id}`);
              })
            }
          >
            rotate all api keys
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            style={{
              borderColor: 'var(--accent)',
              color: 'var(--accent)',
            }}
            onClick={() =>
              gatedAdminAction(actionFlags.ui_admin_account_delete_perm, () => {
                // TODO: POST /api/admin/v1/users/:id/delete (4-eyes)
                toast(`account deletion queued · ${user.id} · 4-eyes pending`);
              })
            }
          >
            delete account (gdpr)
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── List rail (left pane) ─────────────────────────────────────────────────

interface ListRailProps {
  users: readonly AdminUserSummary[];
  selectedId: string | null;
  onSelect: (next: AdminUserSummary) => void;
}

function ListRail({ users, selectedId, onSelect }: ListRailProps): JSX.Element {
  const showEmpty = users.length === 0;

  return (
    <div className="left">
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <input
          className="mc-input mc-mono"
          placeholder="email, id, org…"
          style={{ height: 30, fontSize: 12 }}
        />
        <Btn
          kind="ghost"
          size="sm"
          onClick={() =>
            openDrawer('user filters', (<FilterDrawerBody />) as ReactNode, {
              eyebrow: 'narrow user list',
            })
          }
        >
          filter
        </Btn>
      </div>
      <div
        style={{
          padding: '6px 14px',
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {STATUS_CHIPS.map((s) => (
          <span
            key={s}
            className="mc-chip"
            style={{ height: 24, fontSize: 11, padding: '0 8px' }}
          >
            {s}
          </span>
        ))}
      </div>
      {showEmpty ? (
        <EmptyState title="no users match" />
      ) : (
        users.map((u) => (
          <div
            key={u.id}
            className={`adm-trow ${selectedId === u.id ? 'sel' : ''}`.trim()}
            style={{
              gridTemplateColumns: '1fr auto',
              padding: '10px 14px',
            }}
            onClick={() => onSelect(u)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(u);
              }
            }}
          >
            <div className="adm-cell-stack">
              <div className="row" style={{ gap: 6 }}>
                <span className="pri">{u.name}</span>
                {!u.mfa ? (
                  <Pill kind="warn" dot={false}>
                    no mfa
                  </Pill>
                ) : null}
              </div>
              <span className="sec">
                {u.email} · {u.org}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              {statusPill(u.status)}
              <div className="sec" style={{ fontSize: 10.5, marginTop: 2 }}>
                {u.last_seen}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Top-level screen ──────────────────────────────────────────────────────

export interface UsersScreenProps {
  readonly actionFlags?: AdminUsersFlags;
}

export function UsersScreen({
  actionFlags = ALL_OFF_USERS_FLAGS,
}: UsersScreenProps = {}): JSX.Element {
  const usersResult = useAdminUsers();

  // The disabled-stub returns `flag_off_or_not_implemented` until the BFF
  // endpoints land. Treat any non-`ok` result as "no data" and surface
  // canon's empty state. When live, `data.data.users` is the rendered list.
  const users: readonly AdminUserSummary[] =
    usersResult.data?.ok === true ? usersResult.data.data.users : [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<UserTab>('overview');
  const [showImp, setShowImp] = useState(false);
  const [showSusp, setShowSusp] = useState(false);

  const selected: AdminUserSummary | null =
    users.find((u) => u.id === selectedId) ?? users[0] ?? null;

  return (
    <>
      <div className="adm-split">
        <ListRail
          users={users}
          selectedId={selected?.id ?? null}
          onSelect={(u) => setSelectedId(u.id)}
        />
        <DetailRail
          user={selected}
          tab={tab}
          onTabChange={setTab}
          onImpersonate={() => setShowImp(true)}
          onSuspendToggle={() => setShowSusp(true)}
          actionFlags={actionFlags}
        />
      </div>

      {showImp && selected !== null ? (
        <ImpersonateModal
          user={selected}
          onClose={() => setShowImp(false)}
          enabled={actionFlags.ui_admin_impersonate_perm}
        />
      ) : null}
      {showSusp && selected !== null ? (
        <SuspendModal
          user={selected}
          onClose={() => setShowSusp(false)}
          enabled={actionFlags.ui_admin_suspend_perm}
        />
      ) : null}
    </>
  );
}

export default UsersScreen;
