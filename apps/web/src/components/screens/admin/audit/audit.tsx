// apps/web/src/components/screens/admin/audit/audit.tsx
//
// Phase 3 / C4-audit — Admin audit log screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-audit.jsx
// (`AuditScreen`). Pixel-faithful migration to a Client Component using
// the production admin-ui kit (`@/components/admin-ui`).
//
// Behavior catalog (.planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md
// § admin-audit):
//   - 9 hardcoded audit events (canon fixture data — kept verbatim because
//     the BFF endpoint `GET /api/admin/v1/audit` does not exist yet).
//   - Kind / actor / target / date filter inputs (rendered, not yet wired).
//   - "view diff" → opens the diff modal with state diff + side effects +
//     signed sha256.
//   - "export · 90d" → toast stub. Action gated behind
//     `ui_admin_audit_export_perm` (default OFF) per Phase 3 brief; the
//     flag does not exist yet, so the gate is a deterministic toast.
//   - "webhook config" → opens the canon drawer (signing secret + rotate
//     link + save button — all toast stubs).
//   - "export json" inside the diff modal → toast stub.
//   - "rotate" signing secret link → toast stub.
//   - "save" webhook updates → toast stub.
//
// Backend interactions (all MISSING — render canon fixture data + toast
// stubs per SHARED-BRIEF.md rule #5; render the canon UI exactly per rule
// #4):
//   - GET /api/admin/v1/audit?period=24h            ❌ MISSING
//   - POST /api/admin/v1/audit/export?days=90       ❌ MISSING
//   - GET / PUT /api/admin/v1/audit/webhook         ❌ MISSING
//
// Flag-gated actions:
//   - All admin actions on this screen are gated behind a per-action
//     `ui_admin_<action>_perm` flag (default OFF). The flags are not yet
//     defined (admin BFF + flags ship together post-Phase 3); each handler
//     emits the canon-style toast string so the UX surface survives.

'use client';

import { useState, type JSX, type ReactNode } from 'react';

import {
  Btn,
  Card,
  Pill,
  SectionLabel,
  Table,
} from '@/components/admin-ui';
import { openDrawer } from '@/lib/drawer';
import type { AdminAuditFlags } from '@/lib/flags/admin-actions';
import { toast } from '@/lib/toast';

// ─── Fixture data ──────────────────────────────────────────────────────────
//
// Mirrors canon admin-audit.jsx events array 1:1. Kept inline because the
// BFF endpoint is missing; once `GET /api/admin/v1/audit` ships, swap the
// const for a `useQuery` against `lib/api/admin.ts`. The shape below is the
// production contract this screen will consume.

export interface AuditEvent {
  ts: string;
  actor: string;
  ip: string;
  action: string;
  target: string;
  fourEyes: boolean;
  hasDiff: boolean;
  ticket?: string;
}

const EVENTS: AuditEvent[] = [
  {
    ts: '2025-10-14 14:42:08',
    actor: 'ali m.',
    ip: '74.125.x.x',
    action: 'user.suspend',
    target: 'u_4f81 · k.lieber@…',
    fourEyes: true,
    hasDiff: true,
  },
  {
    ts: '2025-10-14 14:38:21',
    actor: 'sasha k.',
    ip: '203.0.113.x',
    action: 'flag.flip',
    target: 'fl_haiku_router → 5%',
    fourEyes: true,
    hasDiff: true,
  },
  {
    ts: '2025-10-14 14:31:55',
    actor: 'ali m.',
    ip: '74.125.x.x',
    action: 'user.impersonate',
    target: 'u_2a14 · stripe',
    fourEyes: false,
    hasDiff: false,
    ticket: 't_882',
  },
  {
    ts: '2025-10-14 14:11:02',
    actor: 'jordan p.',
    ip: '198.51.100.x',
    action: 'billing.refund',
    target: 'inv_8841 · $240',
    fourEyes: false,
    hasDiff: true,
  },
  {
    ts: '2025-10-14 13:54:18',
    actor: 'mira o.',
    ip: '74.125.x.x',
    action: 'server.takedown',
    target: 'srv_3f12 · prompt-injector',
    fourEyes: true,
    hasDiff: true,
  },
  {
    ts: '2025-10-14 13:42:41',
    actor: 'system',
    ip: '—',
    action: 'auto.rollback',
    target: 'srv_8a91 · 1.4.2 → 1.4.1',
    fourEyes: false,
    hasDiff: true,
  },
  {
    ts: '2025-10-14 13:18:09',
    actor: 'noor f.',
    ip: '74.125.x.x',
    action: 'marketplace.approve',
    target: 'srv_pending_002',
    fourEyes: false,
    hasDiff: false,
  },
  {
    ts: '2025-10-14 12:55:33',
    actor: 'ali m.',
    ip: '74.125.x.x',
    action: 'user.export.gdpr',
    target: 'u_8s10 · linear',
    fourEyes: false,
    hasDiff: false,
    ticket: 't_878',
  },
  {
    ts: '2025-10-14 12:42:11',
    actor: 'sasha k.',
    ip: '203.0.113.x',
    action: 'killswitch.flip',
    target: 'allow_signups → false',
    fourEyes: true,
    hasDiff: true,
  },
];

// Filter labels + placeholders mirror canon `cols` array exactly.
const FILTER_LABELS = ['kind', 'actor', 'target', 'date'] as const;
const FILTER_PLACEHOLDERS = [
  'user.*, billing.*, …',
  'ali, sasha, system',
  'u_…, srv_…, fl_…',
  'today',
] as const;

// ─── Webhook config drawer body ────────────────────────────────────────────

function WebhookConfigBody(): JSX.Element {
  return (
    <div className="col" style={{ gap: 12, fontSize: 13 }}>
      <div>
        stream every audit row to your siem in real time. signed with hmac-sha256.
      </div>
      <input
        className="mc-input mc-mono"
        defaultValue="https://splunk.mcpgen.dev/audit"
        style={{
          width: '100%',
          padding: 10,
          fontSize: 12,
          border: '1px solid var(--border)',
          background: 'var(--paper)',
          borderRadius: 4,
        }}
      />
      <div className="mc-mono muted" style={{ fontSize: 11 }}>
        signing secret: whsec_a91c•4e2f ·{' '}
        <a
          className="mc-link"
          style={{ cursor: 'pointer' }}
          onClick={() => toast('signing secret rotated')}
        >
          rotate
        </a>
      </div>
      <Btn
        kind="ink"
        size="sm"
        full
        onClick={() => toast('webhook updated · test event sent')}
      >
        save
      </Btn>
    </div>
  );
}

// ─── Diff modal ────────────────────────────────────────────────────────────

interface DiffModalProps {
  event: AuditEvent;
  onClose: () => void;
}

function DiffModal({ event, onClose }: DiffModalProps): JSX.Element {
  return (
    <div className="mc-modal-veil" onClick={onClose}>
      <div
        className="adm-modal"
        onClick={(ev) => ev.stopPropagation()}
        style={{ width: 720 }}
      >
        <div className="mc-modal-head">
          <span className="mc-h3">
            {event.action} · {event.target}
          </span>
          <Btn kind="ghost" size="sm" onClick={onClose}>
            esc
          </Btn>
        </div>
        <div className="mc-modal-body">
          <div
            className="adm-detail-grid"
            style={{
              padding: 0,
              gridTemplateColumns: 'repeat(4, 1fr)',
              marginBottom: 12,
            }}
          >
            <div>
              <div className="adm-kpi-label">actor</div>
              <div style={{ fontWeight: 600 }}>{event.actor}</div>
              <div className="muted mc-mono" style={{ fontSize: 11 }}>
                {event.ip}
              </div>
            </div>
            <div>
              <div className="adm-kpi-label">timestamp</div>
              <div className="mc-mono" style={{ fontSize: 12 }}>
                {event.ts}
              </div>
            </div>
            <div>
              <div className="adm-kpi-label">request id</div>
              <div className="mc-mono" style={{ fontSize: 12 }}>
                req_8a91qp4f
              </div>
            </div>
            <div>
              <div className="adm-kpi-label">approvers</div>
              <div style={{ fontWeight: 600 }}>
                {event.fourEyes ? 'ali m. + sasha k.' : 'ali m. only'}
              </div>
            </div>
          </div>
          <SectionLabel>state diff</SectionLabel>
          <div className="adm-diff">
            <div className="adm-diff-line del">
              <span className="ln">412</span>
              <span>{`-  "status": "active",`}</span>
            </div>
            <div className="adm-diff-line add">
              <span className="ln">412</span>
              <span>{`+  "status": "suspended",`}</span>
            </div>
            <div className="adm-diff-line del">
              <span className="ln">418</span>
              <span>{`-  "suspended_at": null,`}</span>
            </div>
            <div className="adm-diff-line add">
              <span className="ln">418</span>
              <span>{`+  "suspended_at": "2025-10-14T14:42:08Z",`}</span>
            </div>
            <div className="adm-diff-line del">
              <span className="ln">419</span>
              <span>{`-  "suspended_reason": null,`}</span>
            </div>
            <div className="adm-diff-line add">
              <span className="ln">419</span>
              <span>{`+  "suspended_reason": "card chargebacks",`}</span>
            </div>
            <div className="adm-diff-line add">
              <span className="ln">420</span>
              <span>{`+  "suspended_by": "u_admin_ali",`}</span>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <SectionLabel>side effects</SectionLabel>
          </div>
          <ul
            style={{
              fontSize: 12.5,
              lineHeight: 1.9,
              margin: 0,
              paddingLeft: 18,
              color: 'var(--text-muted)',
            }}
          >
            <li>
              3 active sessions revoked (sess_4a..., sess_4b..., sess_4c...)
            </li>
            <li>2 api keys disabled (key_7s..., key_7t...)</li>
            <li>email sent to k.lieber@… (template `account-suspended`)</li>
            <li>org `kraken-labs` marked suspended in stripe (cus_M3xQ…)</li>
          </ul>
        </div>
        <div className="mc-modal-foot">
          <span className="mc-mono muted" style={{ fontSize: 11 }}>
            signed · sha256:8a91qp4f…3c2e
          </span>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" onClick={() => toast('downloaded as json')}>
              export json
            </Btn>
            <Btn kind="ink" onClick={onClose}>
              close
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Audit screen (default export) ─────────────────────────────────────────

export interface AuditProps {
  /**
   * Optional fixture override — only used by tests. Production renders the
   * canon fixture array (BFF endpoint missing).
   */
  events?: AuditEvent[];
  /** Per-action flag map evaluated server-side. Default: all-OFF. */
  actionFlags?: AdminAuditFlags;
}

export default function Audit({
  events = EVENTS,
  actionFlags = { ui_admin_audit_export_perm: false },
}: AuditProps): JSX.Element {
  const [showDiff, setShowDiff] = useState<AuditEvent | null>(null);

  function handleExport(): void {
    if (actionFlags.ui_admin_audit_export_perm) {
      // TODO: POST /api/admin/v1/audit/export
      toast('exporting 90d audit log · csv emailed to ali');
      return;
    }
    toast('exporting 90d audit log · csv emailed to ali');
  }

  function handleWebhookConfig(): void {
    openDrawer('audit webhook config', <WebhookConfigBody />, {
      eyebrow: 'soc2 · stream every action',
    });
  }

  function handleViewDiff(event: AuditEvent): void {
    if (event.hasDiff) {
      setShowDiff(event);
    } else {
      toast('no diff for this event');
    }
  }

  // Build table rows. Each cell is `ReactNode` per `<Table>` API.
  const rows: ReactNode[][] = events.map((e) => [
    <span key="t" className="mc-mono" style={{ fontSize: 11.5 }}>
      {e.ts}
    </span>,
    <div key="a">
      <div style={{ fontWeight: 600 }}>{e.actor}</div>
      <div className="muted mc-mono" style={{ fontSize: 11 }}>
        {e.ip}
      </div>
    </div>,
    <span
      key="ac"
      className="mc-chip"
      style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}
    >
      {e.action}
    </span>,
    <span key="tg" className="mc-mono" style={{ fontSize: 12 }}>
      {e.target}
    </span>,
    <div key="f" className="row" style={{ gap: 4 }}>
      {e.fourEyes ? (
        <Pill kind="warn" dot={false}>
          4-eyes
        </Pill>
      ) : null}
      {e.ticket !== undefined ? (
        <Pill kind="info" dot={false}>
          {e.ticket}
        </Pill>
      ) : null}
    </div>,
    <Btn
      key="x"
      kind="ghost"
      size="sm"
      onClick={() => handleViewDiff(e)}
    >
      {e.hasDiff ? 'view diff' : 'view'}
    </Btn>,
  ]);

  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">audit log</h1>
          <p className="adm-page-sub">
            every privileged action. immutable. exportable for soc2 reviewers.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" onClick={handleExport}>
            export · 90d
          </Btn>
          <Btn kind="ghost" size="sm" onClick={handleWebhookConfig}>
            webhook config
          </Btn>
        </div>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          {FILTER_LABELS.map((label, i) => (
            <div key={label}>
              <div className="adm-kpi-label">{label}</div>
              <input
                className="mc-input mc-mono"
                placeholder={FILTER_PLACEHOLDERS[i]}
                style={{ height: 30, fontSize: 12 }}
                aria-label={`audit filter ${label}`}
              />
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionLabel
          right={
            <span className="mc-mono muted" style={{ fontSize: 11 }}>
              showing 24h · all envs
            </span>
          }
        >
          events · {events.length} of 14,402
        </SectionLabel>
        <Table
          headers={['ts (utc)', 'actor', 'action', 'target', 'flags', '']}
          rows={rows}
        />
      </Card>

      {showDiff !== null ? (
        <DiffModal event={showDiff} onClose={() => setShowDiff(null)} />
      ) : null}
    </div>
  );
}
