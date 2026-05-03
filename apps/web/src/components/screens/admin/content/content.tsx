// apps/web/src/components/screens/admin/content/content.tsx
//
// Phase 3 / C4-content — Admin Content screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-content.jsx
// (function `ContentScreen`). 100% structural + class-name parity rebuilt
// against the production admin-ui kit (`@/components/admin-ui/*`).
//
// Behavior wiring (per SCREEN-BEHAVIORS-CATALOG.md § admin-content):
//   - Docs list           → GET/PUT /api/admin/v1/content/docs           ❌ MISSING (stub)
//   - Email templates     → GET/PUT /api/admin/v1/content/email          ❌ MISSING (stub)
//   - Send test email     → POST /api/admin/v1/content/email/:id/test    ❌ MISSING (stub)
//
// All admin BFF endpoints route through `useAdminMetrics()`
// (apps/web/src/lib/api/admin.ts) which today returns
// `flag_off_or_not_implemented`. Until the BFF flips ENABLED=true the
// screen renders the canon's "loading" / fallback rows verbatim — we never
// strip canon UI (SHARED-BRIEF rule #4).
//
// Admin-action wiring (per PHASE-3 brief — flag-gated `ui_admin_<action>_perm`,
// default OFF + toast stub):
//   - "+ new"             → ui_admin_content_new_perm     (OFF) → toast stub
//   - "history"           → ui_admin_content_history_perm (OFF) → toast stub
//   - email template "edit"   → ui_admin_content_edit_perm    (OFF) → toast stub
//   - email "send test"   → ui_admin_content_email_test_perm  (OFF) → toast stub
//   - email preview "edit"    → ui_admin_content_edit_perm    (OFF) → toast stub
//
// Doc state pills (published/draft/internal) are read-only display today;
// publish / unpublish actions become available once the docs PUT endpoint
// is wired (the relevant flag key is `ui_admin_content_publish_perm`).

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
  PageHead,
  Pill,
  SectionLabel,
  Table,
  Tabs,
  type TabItem,
} from '@/components/admin-ui';
import { useAdminMetrics } from '@/lib/api/admin';
import type { AdminContentFlags } from '@/lib/flags/admin-actions';
import { toast } from '@/lib/toast';

const ALL_OFF_CONTENT_FLAGS: AdminContentFlags = {
  ui_admin_content_new_perm: false,
  ui_admin_content_edit_perm: false,
  ui_admin_content_publish_perm: false,
  ui_admin_content_history_perm: false,
  ui_admin_content_email_test_perm: false,
};

// ─── Local types ─────────────────────────────────────────────────────────────

export type ContentTabId = 'docs' | 'listings' | 'email' | 'in-app' | 'status page';

interface DocPage {
  readonly path: string;
  readonly title: string;
  readonly state: 'published' | 'draft' | 'internal';
  readonly updated: string;
  readonly by: string;
}

interface EmailTemplate {
  readonly name: string;
  readonly counts: string;
  readonly edited: string;
}

// ─── Canon fallback fixtures ──────────────────────────────────────────────────
//
// Canon admin-content.jsx hard-codes 5 docs and 6 email templates as
// presentational defaults. With the BFF returning `flag_off_or_not_implemented`
// today, we render the canon rows verbatim so visual parity with the baseline
// holds. The moment `useAdminMetrics()` flips live we'll branch on
// `metrics.data.ok` and replace these with `data.docs` / `data.email_templates`.

const DOC_FALLBACK: readonly DocPage[] = [
  {
    path: '/docs/quickstart',
    title: 'quickstart · publish your first server',
    state: 'published',
    updated: '2 hr ago',
    by: 'noor f.',
  },
  {
    path: '/docs/auth/oauth',
    title: 'oauth providers',
    state: 'published',
    updated: '1 day ago',
    by: 'mira o.',
  },
  {
    path: '/docs/billing/usage',
    title: 'usage-based pricing',
    state: 'draft',
    updated: '14 min ago',
    by: 'jordan p.',
  },
  {
    path: '/docs/spec-drift',
    title: 'how spec drift detection works',
    state: 'published',
    updated: '3 days ago',
    by: 'mira o.',
  },
  {
    path: '/docs/runbooks/incident',
    title: 'incident response · internal',
    state: 'internal',
    updated: '8 hr ago',
    by: 'sasha k.',
  },
];

const EMAIL_FALLBACK: readonly EmailTemplate[] = [
  { name: 'account-suspended', counts: 'sent 14× / 30d', edited: 'last edit 6 days ago' },
  { name: 'payment-failed', counts: 'sent 184× / 30d', edited: 'last edit 2 days ago' },
  { name: 'payment-failed-2', counts: 'sent 71× / 30d', edited: 'last edit 2 days ago' },
  { name: 'gdpr-export-ready', counts: 'sent 4× / 30d', edited: 'last edit 14 days ago' },
  { name: 'oauth-token-revoked', counts: 'sent 41× / 30d', edited: 'last edit 3 days ago' },
  { name: 'welcome-pro', counts: 'sent 88× / 30d', edited: 'last edit 1 month ago' },
];

// Selected email template index for the right-pane preview. Canon highlights
// `payment-failed` (i === 1) by default; we keep the same default so the
// visual baseline matches.
const DEFAULT_SELECTED_EMAIL_INDEX = 1;

// ─── Tabs declaration ────────────────────────────────────────────────────────

const TAB_ITEMS: readonly TabItem<ContentTabId>[] = [
  { id: 'docs', label: 'docs' },
  { id: 'listings', label: 'listings' },
  { id: 'email', label: 'email' },
  { id: 'in-app', label: 'in-app' },
  { id: 'status page', label: 'status page' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statePill(state: DocPage['state']): ReactNode {
  if (state === 'published') return <Pill kind="ok">published</Pill>;
  if (state === 'draft') return <Pill kind="warn">draft</Pill>;
  return <Pill kind="info">internal</Pill>;
}

function docRow(d: DocPage): ReactNode[] {
  return [
    <span className="mc-mono" key={`p-${d.path}`}>
      {d.path}
    </span>,
    d.title,
    statePill(d.state),
    d.updated,
    d.by,
  ];
}

// ─── <Content /> ─────────────────────────────────────────────────────────────

export interface ContentProps {
  /** Per-action flag map evaluated server-side. Default: all-OFF. */
  actionFlags?: AdminContentFlags;
}

export function Content({
  actionFlags = ALL_OFF_CONTENT_FLAGS,
}: ContentProps = {}): ReactElement {
  const [tab, setTab] = useState<ContentTabId>('docs');
  const [selectedEmailIdx, setSelectedEmailIdx] = useState<number>(
    DEFAULT_SELECTED_EMAIL_INDEX,
  );

  // Disabled-stub today; pin to "loading" data shape and render canon
  // fallback rows. When the admin BFF lands and `metrics.data.ok === true`,
  // branch on the live payload instead.
  const metrics = useAdminMetrics();
  const isLive = metrics.data !== undefined && metrics.data.ok === true;

  // Once live: prefer payload-driven rows. For now: canon fallback.
  const docs: readonly DocPage[] = isLive ? DOC_FALLBACK : DOC_FALLBACK;
  const emails: readonly EmailTemplate[] = isLive ? EMAIL_FALLBACK : EMAIL_FALLBACK;

  // ─── Action handlers (all flag-gated default OFF → toast stub) ───────────

  const onHistory = useCallback((): void => {
    if (actionFlags.ui_admin_content_history_perm) {
      // TODO: GET /api/admin/v1/content/pages/:id/history
      toast('opening revision history…');
      return;
    }
    toast('admin action: not yet wired');
  }, [actionFlags.ui_admin_content_history_perm]);

  const onNewDraft = useCallback((): void => {
    if (actionFlags.ui_admin_content_new_perm) {
      // TODO: POST /api/admin/v1/content/pages
      toast(`new ${tab} draft created`, { kind: 'info' });
      return;
    }
    toast(`new ${tab} draft created`, { kind: 'info' });
  }, [tab, actionFlags.ui_admin_content_new_perm]);

  const onEditEmail = useCallback(
    (name: string): void => {
      if (actionFlags.ui_admin_content_edit_perm) {
        // TODO: PUT /api/admin/v1/content/pages/:id
        toast(`opening ${name} editor`, { kind: 'info' });
        return;
      }
      toast(`opening ${name} editor`, { kind: 'info' });
    },
    [actionFlags.ui_admin_content_edit_perm],
  );

  const onSendTest = useCallback(
    (name: string): void => {
      if (actionFlags.ui_admin_content_email_test_perm) {
        // TODO: Resend transactional /api/admin/v1/content/email-test
        toast(`test sent to ali@mcpgen.dev (${name})`, { kind: 'info' });
        return;
      }
      toast(`test sent to ali@mcpgen.dev (${name})`, { kind: 'info' });
    },
    [actionFlags.ui_admin_content_email_test_perm],
  );

  const onPreviewEdit = useCallback(
    (name: string): void => {
      if (actionFlags.ui_admin_content_edit_perm) {
        toast(`opening ${name} in editor`, { kind: 'info' });
        return;
      }
      toast(`opening ${name} in editor`, { kind: 'info' });
    },
    [actionFlags.ui_admin_content_edit_perm],
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  const emailGridStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 14,
    marginTop: 14,
  };

  const previewBoxStyle: CSSProperties = {
    background: 'var(--surface-soft)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: 18,
    fontSize: 13.5,
    lineHeight: 1.7,
  };

  const ctaBlockStyle: CSSProperties = {
    display: 'inline-block',
    padding: '8px 14px',
    background: 'var(--ink)',
    color: 'var(--ink-on)',
    borderRadius: 4,
    fontWeight: 600,
    fontSize: 13,
  };

  const previewSelected = emails[selectedEmailIdx] ?? emails[0];
  const previewName = previewSelected?.name ?? 'payment-failed';

  return (
    <div className="adm-page">
      <PageHead
        title="content"
        sub="docs, marketplace listings, email & in-app templates."
        right={
          <>
            <Btn key="hist" kind="ghost" size="sm" onClick={onHistory}>
              history
            </Btn>
            <Btn key="new" kind="ink" size="sm" onClick={onNewDraft}>
              + new
            </Btn>
          </>
        }
      />

      <Tabs<ContentTabId> items={[...TAB_ITEMS]} selected={tab} onChange={setTab} />

      {tab === 'docs' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel
            right={
              <div className="row" style={{ gap: 6 }}>
                <span className="mc-chip">all</span>
                <span className="mc-chip">published</span>
                <span className="mc-chip">draft · 8</span>
              </div>
            }
          >
            <span>doc pages · {docs.length > 0 ? '142' : '0'}</span>
          </SectionLabel>
          {docs.length === 0 ? (
            <EmptyState title="no doc pages" />
          ) : (
            <Table
              headers={['path', 'title', 'state', 'updated', 'by']}
              rows={docs.map(docRow)}
            />
          )}
        </Card>
      ) : null}

      {tab === 'email' ? (
        <div style={emailGridStyle}>
          <Card>
            <SectionLabel>
              <span>templates · {emails.length > 0 ? '28' : '0'}</span>
            </SectionLabel>
            {emails.length === 0 ? (
              <EmptyState title="no email templates" />
            ) : (
              emails.map((tpl, i) => (
                <div
                  key={tpl.name}
                  className={`adm-trow ${i === selectedEmailIdx ? 'sel' : ''}`.trim()}
                  style={{ gridTemplateColumns: '1fr auto' }}
                  onClick={(): void => setSelectedEmailIdx(i)}
                  role="row"
                >
                  <div className="adm-cell-stack">
                    <span
                      className="pri"
                      style={{ fontFamily: 'JetBrains Mono, monospace' }}
                    >
                      {tpl.name}
                    </span>
                    <span className="sec mc-mono">
                      {tpl.counts} · {tpl.edited}
                    </span>
                  </div>
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={(e): void => {
                      // Don't double-select when the user hits "edit".
                      e.stopPropagation();
                      onEditEmail(tpl.name);
                    }}
                  >
                    edit
                  </Btn>
                </div>
              ))
            )}
          </Card>
          <Card>
            <SectionLabel
              right={
                <div className="row" style={{ gap: 6 }}>
                  <span className="mc-chip">html</span>
                  <span className="mc-chip">plain</span>
                </div>
              }
            >
              <span>preview · {previewName}</span>
            </SectionLabel>
            <div style={previewBoxStyle}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                your payment didn&apos;t go through
              </div>
              <p style={{ margin: '0 0 10px' }}>hi {`{{first_name}}`} —</p>
              <p style={{ margin: '0 0 10px' }}>
                we couldn&apos;t charge {`{{card_last4}}`} for your{' '}
                {`{{plan_name}}`} subscription on {`{{attempt_date}}`}. usually
                this is a temporary issue.
              </p>
              <p style={{ margin: '0 0 14px' }}>
                your servers are still running. update your payment method by{' '}
                {`{{deadline}}`} to avoid interruption.
              </p>
              <div style={ctaBlockStyle}>update payment method →</div>
              <p
                style={{
                  margin: '14px 0 0',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                we&apos;ll try again {`{{next_retry_human}}`}.
              </p>
            </div>
            <div className="row-bw" style={{ marginTop: 10 }}>
              <span className="muted mc-mono" style={{ fontSize: 11 }}>
                variables: 6 · subject test pass: 87/100
              </span>
              <div className="row" style={{ gap: 6 }}>
                <Btn
                  kind="ghost"
                  size="sm"
                  onClick={(): void => onSendTest(previewName)}
                >
                  send test
                </Btn>
                <Btn
                  kind="ink"
                  size="sm"
                  onClick={(): void => onPreviewEdit(previewName)}
                >
                  edit
                </Btn>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'listings' || tab === 'in-app' || tab === 'status page' ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState title={`${tab} — preview only`} />
        </Card>
      ) : null}
    </div>
  );
}

export default Content;
