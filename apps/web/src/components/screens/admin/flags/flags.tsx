// apps/web/src/components/screens/admin/flags/flags.tsx
//
// Phase 3 / C3-flags — admin "feature flags & experiments" screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-flags.jsx
// (`FlagsScreen`).
//
// Mirrors canon 1:1:
//   - Page header with "new flag" CTA → opens canon drawer (key / description /
//     starting-stage chips / "create flag" button), per `window.mcpDrawer`.
//   - "Active flags · 5 of 28" Card with table (5 rows) — flag name + id,
//     stage Pill, target chip (mono), last-change line, edit button.
//   - "Active experiment · cheap-route haiku-4" Card with 4-column KPI grid
//     (control / variant / latency Δ / cost Δ) and 3 actions (promote 25% /
//     freeze / kill).
//   - Edit modal with stage chip row (5 stages) + targeting SQL display.
//
// Backend: every BFF endpoint listed in
// `.planning/phase-rebuild/SCREEN-BEHAVIORS-CATALOG.md § admin-flags` is
// missing. We render the canon hardcoded mock data verbatim (no random
// arrays, no fetch). Per Phase 3 brief: "All admin actions → flag-gated
// `ui_admin_<action>_perm` (default OFF) + `toast('admin action: not yet
// wired')` stub". Edit / promote / freeze / kill / create / save are all
// stubbed via the `ui_admin_flag_edit_perm` gate (passed in as
// `editEnabled` from the server-component page).
//
// Replaces canon globals:
//   - `window.mcpDrawer(title, body, opts)` → `openDrawer(title, body, opts)`
//     from `@/lib/drawer`.
//   - `window.mcpToast(msg, opts)` and `ctx.showToast(msg)` → `toast(msg, opts)`
//     from `@/lib/toast`.
//
// Tests:
//   - flags.test.tsx — vitest renders + canon strings + edit modal toggles.
//   - flags.snapshot.spec.ts — Playwright pixel diff at 1280 (admin desktop).
//   - flags.flow.spec.ts — Playwright user flow (open edit modal, toast on
//     action, drawer open on "new flag").

'use client';

import { useState, type JSX, type ReactElement } from 'react';

import { Btn, Card, Pill, SectionLabel, Table } from '@/components/admin-ui';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

// ─── Canon hardcoded flag list (mirror canon admin-flags.jsx) ──────────────

type FlagStage = 'on' | 'off' | 'experiment' | 'rolling out';

interface FlagRow {
  id: string;
  name: string;
  stage: FlagStage;
  target: string;
  changed: string;
  changedBy: string;
}

const CANON_FLAGS: readonly FlagRow[] = [
  {
    id: 'fl_drift_v2',
    name: 'spec-drift detector v2',
    stage: 'rolling out',
    target: '40% of orgs',
    changed: '2 hr ago',
    changedBy: 'mira o.',
  },
  {
    id: 'fl_mp_featured',
    name: 'marketplace featured carousel',
    stage: 'on',
    target: 'all',
    changed: '3 days ago',
    changedBy: 'noor f.',
  },
  {
    id: 'fl_haiku_router',
    name: 'cheap-route haiku-4',
    stage: 'experiment',
    target: '5% canary',
    changed: '14 min ago',
    changedBy: 'sasha k.',
  },
  {
    id: 'fl_billing_v3',
    name: 'usage-based pricing v3',
    stage: 'off',
    target: 'internal only',
    changed: '8 days ago',
    changedBy: 'ali m.',
  },
  {
    id: 'fl_admin_panel',
    name: 'admin: bulk approve queue',
    stage: 'on',
    target: 'staff',
    changed: '1 day ago',
    changedBy: 'jordan p.',
  },
];

// Canon Pill kind mapping (same as admin-flags.jsx ternary chain).
function stageKind(stage: FlagStage): 'ok' | '' | 'info' | 'warn' {
  if (stage === 'on') return 'ok';
  if (stage === 'off') return '';
  if (stage === 'experiment') return 'info';
  return 'warn';
}

// Stage chip row used in both the "new flag" drawer and the edit modal.
const NEW_FLAG_STAGES: readonly string[] = ['off', 'internal', 'experiment'];
const EDIT_FLAG_STAGES: readonly string[] = [
  'off',
  'internal',
  'experiment',
  'rolling out',
  'on',
];

// Canon SQL targeting expression for the active experiment edit modal.
const TARGETING_SQL = `org.plan in ('pro','team','enterprise') AND
  rand() < 0.40 AND
  NOT user.email LIKE '%@example.com'`;

// Phase 3 brief: actions OFF → toast stub. Same copy on every action so
// behavior is uniform across the screen until backends land.
const STUB_TOAST = 'admin action: not yet wired';

// ─── Component ─────────────────────────────────────────────────────────────

export interface FlagsScreenProps {
  /**
   * `ui_admin_flag_edit_perm` evaluated server-side. When `true` the screen
   * would call the live BFF; for now (BFF missing) actions still emit the
   * stub toast. Bool is preserved so the gate is explicit and easy to flip
   * once the BFF lands.
   */
  readonly editEnabled?: boolean;
}

export function FlagsScreen({ editEnabled = false }: FlagsScreenProps): ReactElement {
  const [showEdit, setShowEdit] = useState<FlagRow | null>(null);

  // Per-action: every admin action toasts the stub when the gate is OFF.
  // When ON the same call site lands (BFF still missing) so we keep a single
  // toast — the gate is wired but its ON-branch is also a stub today.
  function adminAction(): void {
    toast(STUB_TOAST);
  }

  function killAction(): void {
    // Canon: "confirm: type the flag name to kill" — warn-tone toast.
    if (editEnabled) {
      toast('confirm: type the flag name to kill', { kind: 'warn' });
      return;
    }
    toast(STUB_TOAST, { kind: 'warn' });
  }

  // Canon "new flag" drawer body — preserved verbatim (key input, description
  // textarea, stage chips, "create flag" button). The chips and the create
  // button toast on click; canon mcpToast → our toast().
  function openNewFlagDrawer(): void {
    openDrawer(
      'new feature flag',
      <div className="col" style={{ gap: 12, fontSize: 13 }}>
        <div className="adm-kpi-label">key</div>
        <input
          className="mc-input mc-mono"
          placeholder="my_new_flag"
          style={{
            width: '100%',
            padding: 10,
            fontSize: 12,
            border: '1px solid var(--border)',
            background: 'var(--paper)',
            borderRadius: 4,
          }}
        />
        <div className="adm-kpi-label">description</div>
        <textarea
          className="mc-input"
          placeholder="what does this flag do?"
          style={{
            width: '100%',
            padding: 10,
            fontSize: 12,
            height: 60,
            border: '1px solid var(--border)',
            background: 'var(--paper)',
            borderRadius: 4,
          }}
        />
        <div className="adm-kpi-label">starting stage</div>
        <div className="row" style={{ gap: 6 }}>
          {NEW_FLAG_STAGES.map((s) => (
            <span
              key={s}
              className="mc-chip"
              onClick={(): void => toast(`stage: ${s}`)}
              style={{ cursor: 'pointer' }}
            >
              {s}
            </span>
          ))}
        </div>
        <Btn kind="ink" size="sm" full onClick={(): void => toast(STUB_TOAST)}>
          create flag
        </Btn>
      </div>,
      { eyebrow: 'staged rollout' },
    );
  }

  return (
    <div className="adm-page" data-screen-label="screen-admin-flags">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">feature flags &amp; experiments</h1>
          <p className="adm-page-sub">
            staged rollouts, kill switches per feature, a/b tests.
          </p>
        </div>
        <Btn kind="ink" size="sm" onClick={openNewFlagDrawer}>
          new flag
        </Btn>
      </div>

      <Card>
        <SectionLabel
          right={
            <a
              className="adm-link"
              style={{ cursor: 'pointer' }}
              onClick={(): void => toast('opening full flag list · 28')}
            >
              show all
            </a>
          }
        >
          active flags · 5 of 28
        </SectionLabel>
        <Table
          headers={['flag', 'stage', 'target', 'last change', '']}
          rows={CANON_FLAGS.map((f) => [
            <div key="n">
              <div style={{ fontWeight: 600 }}>{f.name}</div>
              <div className="muted mc-mono" style={{ fontSize: 11 }}>
                {f.id}
              </div>
            </div>,
            <Pill key="p" kind={stageKind(f.stage)}>
              {f.stage}
            </Pill>,
            <span key="t" className="mc-mono" style={{ fontSize: 12 }}>
              {f.target}
            </span>,
            <span key="c" className="muted mc-mono" style={{ fontSize: 11 }}>
              {f.changed} · {f.changedBy}
            </span>,
            <Btn key="x" kind="ghost" size="sm" onClick={(): void => setShowEdit(f)}>
              edit
            </Btn>,
          ])}
        />
      </Card>

      <Card style={{ marginTop: 14 }}>
        <SectionLabel right={<Pill kind="info">canary 5%</Pill>}>
          active experiment · cheap-route haiku-4
        </SectionLabel>
        <div
          className="adm-detail-grid"
          style={{ padding: 0, gridTemplateColumns: 'repeat(4, 1fr)' }}
        >
          <div>
            <div className="adm-kpi-label">control</div>
            <div className="adm-kpi-num" style={{ fontSize: 18 }}>
              92.1%
            </div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>
              n=18,400
            </div>
          </div>
          <div>
            <div className="adm-kpi-label">variant</div>
            <div className="adm-kpi-num" style={{ fontSize: 18, color: 'var(--ok)' }}>
              93.7%
            </div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>
              n=970
            </div>
          </div>
          <div>
            <div className="adm-kpi-label">latency Δ</div>
            <div className="adm-kpi-num" style={{ fontSize: 18 }}>
              −14%
            </div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>
              −104 ms
            </div>
          </div>
          <div>
            <div className="adm-kpi-label">cost Δ</div>
            <div className="adm-kpi-num" style={{ fontSize: 18, color: 'var(--ok)' }}>
              −38%
            </div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>
              $680/d saved
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <Btn kind="ink" size="sm" onClick={adminAction}>
            promote to 25%
          </Btn>
          <Btn kind="ghost" size="sm" onClick={adminAction}>
            freeze
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}
            onClick={killAction}
          >
            kill
          </Btn>
        </div>
      </Card>

      {showEdit !== null ? (
        <EditFlagModal
          flag={showEdit}
          onClose={(): void => setShowEdit(null)}
          onSave={(): void => {
            setShowEdit(null);
            adminAction();
          }}
        />
      ) : null}
    </div>
  );
}

// ─── Edit modal ────────────────────────────────────────────────────────────

interface EditFlagModalProps {
  flag: FlagRow;
  onClose: () => void;
  onSave: () => void;
}

function EditFlagModal({ flag, onClose, onSave }: EditFlagModalProps): JSX.Element {
  return (
    <div className="mc-modal-veil" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="adm-modal"
        onClick={(e): void => e.stopPropagation()}
        role="document"
      >
        <div className="mc-modal-head">
          <span className="mc-h3">edit · {flag.name}</span>
        </div>
        <div className="mc-modal-body">
          <SectionLabel>stage</SectionLabel>
          <div className="row" style={{ gap: 6, marginBottom: 12 }}>
            {EDIT_FLAG_STAGES.map((s) => {
              const active = s === flag.stage;
              return (
                <span
                  key={s}
                  className="mc-chip"
                  style={{
                    background: active ? 'var(--ink)' : 'var(--surface)',
                    color: active ? 'var(--ink-on)' : 'var(--text)',
                    borderColor: active ? 'var(--ink)' : 'var(--border)',
                  }}
                >
                  {s}
                </span>
              );
            })}
          </div>
          <SectionLabel>target audience</SectionLabel>
          <div className="mc-code" style={{ fontSize: 12 }}>
            {TARGETING_SQL}
          </div>
          <div className="adm-approval" style={{ marginTop: 12 }}>
            changes log to audit. flips above 25% require 4-eyes.
          </div>
        </div>
        <div className="mc-modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            cancel
          </Btn>
          <Btn kind="ink" onClick={onSave}>
            save
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default FlagsScreen;
