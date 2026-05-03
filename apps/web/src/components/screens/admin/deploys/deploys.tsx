// apps/web/src/components/screens/admin/deploys/deploys.tsx
//
// Phase 3 / C3-deploys — admin deploys & infra screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-deploys.jsx
// (`DeploysScreen`).
//
// Scope (from PHASE-3.md + SCREEN-BEHAVIORS-CATALOG.md § admin-deploys):
//   - Region health grid (8 regions per canon).
//   - Recent deploys table (24h) with per-row rollback action.
//   - Five hardcoded global kill switches with a 4-eyes approval flow.
//   - Master "global kill switch" modal (INC reference + typed phrase).
//   - Per-flag flip approval modal.
//
// All admin actions in this screen are flag-gated (`ui_admin_*_perm`,
// default OFF) and currently fall back to a `toast()` stub per the canon
// pattern. The Flipt eval is not done at the call site yet (matches Phase 1
// A3 / Phase 2 B1 conventions in FLAGS-NEEDED.md) — Phase 3+ wraps these
// with `evaluateBooleanFlag` so the toast becomes the OFF-branch fallback.
//
// All BFF endpoints (`/api/admin/v1/regions`, `/api/admin/v1/deploys`,
// `/api/admin/v1/killswitches`, `/api/admin/v1/deploys/:id/rollback`) are
// MISSING; the screen consumes the disabled-stub hooks from
// `lib/api/admin-deploys.ts` and renders the canon loading state when the
// data is not yet available.

'use client';

import { useState, type CSSProperties, type JSX } from 'react';

import {
  Btn,
  Card,
  Pill,
  SectionLabel,
  Table,
  Toggle,
  type PillKind,
} from '@/components/admin-ui';
import {
  useAdminDeploys,
  useAdminRegions,
  type AdminDeploy,
  type AdminRegion,
} from '@/lib/api/admin-deploys';
import { toast } from '@/lib/toast';

// Canon hardcoded kill-switch list. Order is meaningful — replicates the
// admin-deploys.jsx inline tuple list 1:1.
const KILL_SWITCHES: ReadonlyArray<readonly [string, boolean]> = [
  ['accept new signups', true],
  ['accept new server publishes', true],
  ['allow tool invocations · global', true],
  ['allow oauth installs · github', true],
  ['allow stripe charges', true],
] as const;

const REGION_PILL_KIND: Record<AdminRegion['status'], PillKind> = {
  healthy: 'ok',
  degraded: 'warn',
  down: 'alert',
  maint: 'info',
};

const DEPLOY_PILL_KIND: Record<AdminDeploy['status'], PillKind> = {
  success: 'ok',
  'in-progress': 'info',
  failed: 'alert',
  'rolled-back': 'warn',
};

const HEADER_ROW: CSSProperties = { marginBottom: 16 };
const HEADER_BTNS: CSSProperties = { gap: 8 };
const CARD_GAP: CSSProperties = { marginBottom: 14 };
const SUB_LINE: CSSProperties = { fontSize: 11 };
const REGION_NAME: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  fontFamily: 'JetBrains Mono, monospace',
};
const REGION_DOT: CSSProperties = { marginBottom: 6 };
const REGION_META: CSSProperties = { fontSize: 11 };
const TWO_COL: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 1fr',
  gap: 14,
};
const KS_COL: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };
const KS_LABEL: CSSProperties = {
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 12.5,
};
const APPROVAL_NOTE: CSSProperties = { marginTop: 12, fontSize: 12 };
const KILL_DANGER_LIST: CSSProperties = {
  fontSize: 12.5,
  color: 'var(--text-muted)',
  margin: 0,
  paddingLeft: 18,
  lineHeight: 1.7,
};
const KILL_BLOCK: CSSProperties = { marginTop: 14 };
const PHRASE_BLOCK: CSSProperties = { marginTop: 12 };
const FOOT_HINT: CSSProperties = { fontSize: 11 };
const FLAG_REASON_HEAD: CSSProperties = { marginTop: 12 };
const FLAG_TEXTAREA: CSSProperties = { height: 60, padding: 10 };
const ROW_GAP: CSSProperties = { gap: 8 };
const KILL_PRIMARY: CSSProperties = {
  background: 'var(--accent)',
  color: '#fff',
  borderColor: 'var(--accent)',
};
const VIEW_ALL: CSSProperties = { cursor: 'pointer' };
const FLAG_MODAL_W: CSSProperties = { width: 460 };

// ─── Stub action handlers ──────────────────────────────────────────────────
//
// All admin destructive actions are flag-gated (`ui_admin_*_perm`, OFF by
// default). Until the action wires up to a real BFF route, the click fires
// a toast that mirrors the canon copy. See FLAGS-NEEDED.md § Phase 3.

interface DeploysActionFlags {
  readonly regionResync: boolean;
  readonly rollback: boolean;
  readonly viewAll: boolean;
  readonly killGlobal: boolean;
  readonly killFlag: boolean;
}

function makeOnResync(enabled: boolean): () => void {
  return (): void => {
    if (enabled) {
      // TODO: GET /api/admin/v1/regions?refresh=1
      toast('region health resynced');
      return;
    }
    toast('region health resynced');
  };
}

function makeOnRollback(
  enabled: boolean,
): (serverName: string, fromVersion: string) => void {
  return (serverName, fromVersion): void => {
    if (enabled) {
      // TODO: POST /api/admin/v1/deploys/:id/rollback (4-eyes)
      toast(`rolling back ${serverName} · ${fromVersion}`);
      return;
    }
    toast(`rolling back ${serverName} · ${fromVersion}`);
  };
}

function makeOnViewAll(enabled: boolean): () => void {
  return (): void => {
    if (enabled) {
      // TODO: navigate to /admin/deploys/history
      toast('opening full deploy history…');
      return;
    }
    toast('opening full deploy history…');
  };
}

function makeOnRequestKillApproval(enabled: boolean): () => void {
  return (): void => {
    if (enabled) {
      // TODO: POST /api/admin/v1/killswitches/global (2-approver flow)
      toast('approval request sent to sasha · awaiting 2nd hand', { kind: 'warn' });
      return;
    }
    toast('approval request sent to sasha · awaiting 2nd hand', { kind: 'warn' });
  };
}

function makeOnPageFlagApprover(enabled: boolean): () => void {
  return (): void => {
    if (enabled) {
      // TODO: POST /api/admin/v1/killswitches/:key (page approver)
      toast('paged sasha k. · awaiting 2nd approval');
      return;
    }
    toast('paged sasha k. · awaiting 2nd approval');
  };
}

// ─── Region card ───────────────────────────────────────────────────────────

interface RegionGridProps {
  regions: AdminRegion[];
}

function RegionGrid({ regions }: RegionGridProps): JSX.Element {
  if (regions.length === 0) {
    return (
      <div className="muted mc-mono" style={REGION_META}>
        loading region health…
      </div>
    );
  }
  return (
    <div className="adm-region-grid">
      {regions.map((r) => (
        <div key={r.code} className="adm-region">
          <div className="row-bw" style={REGION_DOT}>
            <span style={REGION_NAME}>
              {r.code} · {r.city}
            </span>
            <Pill kind={REGION_PILL_KIND[r.status]}>{r.status}</Pill>
          </div>
          <div className="muted mc-mono" style={REGION_META}>
            p95 {r.p95} · err {r.errors} · {r.servers} servers · {r.qps} qps
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Deploy table ──────────────────────────────────────────────────────────

interface DeployTableProps {
  deploys: AdminDeploy[];
  onRollback: (serverName: string, fromVersion: string) => void;
}

function DeployTable({ deploys, onRollback }: DeployTableProps): JSX.Element {
  if (deploys.length === 0) {
    return (
      <div className="muted mc-mono" style={REGION_META}>
        loading deploy history…
      </div>
    );
  }
  return (
    <Table
      headers={['time', 'server', 'version', 'status', 'by', '']}
      rows={deploys.map((d) => [
        <span className="mc-mono" key="t">
          {d.time}
        </span>,
        <span style={{ fontWeight: 600 }} key="s">
          {d.server}
        </span>,
        <span className="mc-mono" key="v">
          {d.from} → <strong>{d.to}</strong>
        </span>,
        <Pill kind={DEPLOY_PILL_KIND[d.status]} key="p">
          {d.status}
        </Pill>,
        <span className="mc-mono" style={{ fontSize: 11 }} key="b">
          {d.by}
        </span>,
        <Btn
          kind="ghost"
          size="sm"
          key="x"
          onClick={(): void => onRollback(d.server, d.from)}
        >
          rollback
        </Btn>,
      ])}
    />
  );
}

// ─── Modals ────────────────────────────────────────────────────────────────

interface KillSwitchModalProps {
  onClose: () => void;
  onRequestKillApproval: () => void;
}

function KillSwitchModal({ onClose, onRequestKillApproval }: KillSwitchModalProps): JSX.Element {
  return (
    <div className="mc-modal-veil" onClick={onClose} role="dialog" aria-modal="true">
      <div className="adm-modal" onClick={(e): void => e.stopPropagation()}>
        <div className="mc-modal-head">
          <span className="mc-h3">global kill switch</span>
          <Btn kind="ghost" size="sm" onClick={onClose}>
            esc
          </Btn>
        </div>
        <div className="mc-modal-body">
          <div className="adm-danger">
            <div className="adm-danger-title">
              ⚠ this stops all tool invocations across all regions immediately
            </div>
            <ul style={KILL_DANGER_LIST}>
              <li>~1.4M qps will start receiving 503</li>
              <li>auto-broadcast to #ops-incident, #eng-leads, status page</li>
              <li>requires 4-eyes (you + 1 more)</li>
              <li>logged with full context — any caller can subpoena</li>
            </ul>
          </div>
          <div style={KILL_BLOCK}>
            <SectionLabel>
              <span>incident reference · required</span>
            </SectionLabel>
            <input className="mc-input mc-mono" placeholder="INC-2025-0742" />
          </div>
          <div style={PHRASE_BLOCK}>
            <SectionLabel>
              <span>type &apos;kill all invocations&apos; to confirm</span>
            </SectionLabel>
            <input className="mc-input mc-mono" />
          </div>
        </div>
        <div className="mc-modal-foot">
          <span className="mc-mono muted" style={FOOT_HINT}>
            4-eyes pending · ali → sasha
          </span>
          <div className="row" style={ROW_GAP}>
            <Btn kind="ghost" onClick={onClose}>
              cancel
            </Btn>
            <Btn kind="ink" disabled onClick={onRequestKillApproval}>
              request approval
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FlagApprovalModalProps {
  onClose: () => void;
  onConfirm: () => void;
}

function FlagApprovalModal({
  onClose,
  onConfirm,
}: FlagApprovalModalProps): JSX.Element {
  return (
    <div className="mc-modal-veil" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="adm-modal"
        onClick={(e): void => e.stopPropagation()}
        style={FLAG_MODAL_W}
      >
        <div className="mc-modal-head">
          <span className="mc-h3">request approval to flip</span>
        </div>
        <div className="mc-modal-body">
          <div className="adm-approval">
            flipping a kill switch is destructive. another admin must confirm.
            paging on-call (sasha k.).
          </div>
          <div style={FLAG_REASON_HEAD}>
            <SectionLabel>
              <span>reason</span>
            </SectionLabel>
          </div>
          <textarea
            className="mc-input"
            style={FLAG_TEXTAREA}
            placeholder="why now?"
          />
        </div>
        <div className="mc-modal-foot">
          <Btn kind="ghost" onClick={onClose}>
            cancel
          </Btn>
          <Btn kind="ink" onClick={onConfirm}>
            page approver
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export interface DeploysScreenProps {
  /** Per-action flag map. Defaults to all-OFF for tests / legacy callers. */
  readonly actionFlags?: Partial<DeploysActionFlags>;
}

const ALL_OFF_DEPLOY_FLAGS: DeploysActionFlags = {
  regionResync: false,
  rollback: false,
  viewAll: false,
  killGlobal: false,
  killFlag: false,
};

export function DeploysScreen({
  actionFlags,
}: DeploysScreenProps = {}): JSX.Element {
  const flags: DeploysActionFlags = { ...ALL_OFF_DEPLOY_FLAGS, ...(actionFlags ?? {}) };
  const onResync = makeOnResync(flags.regionResync);
  const onRollback = makeOnRollback(flags.rollback);
  const onViewAllDeploys = makeOnViewAll(flags.viewAll);
  const onRequestKillApproval = makeOnRequestKillApproval(flags.killGlobal);
  const onPageFlagApprover = makeOnPageFlagApprover(flags.killFlag);

  const [showKill, setShowKill] = useState(false);
  const [showFlag, setShowFlag] = useState(false);

  const regionsQuery = useAdminRegions();
  const deploysQuery = useAdminDeploys();

  const regions: AdminRegion[] =
    regionsQuery.data && regionsQuery.data.ok ? regionsQuery.data.data.regions : [];
  const deploys: AdminDeploy[] =
    deploysQuery.data && deploysQuery.data.ok ? deploysQuery.data.data.deploys : [];

  const healthy = regions.filter((r) => r.status === 'healthy').length;
  const degraded = regions.filter((r) => r.status === 'degraded').length;
  const down = regions.filter((r) => r.status === 'down').length;

  const handleFlagConfirm = (): void => {
    setShowFlag(false);
    onPageFlagApprover();
  };

  return (
    <div className="adm-page">
      <div className="row-bw" style={HEADER_ROW}>
        <div>
          <h1 className="adm-page-title">deploys & infra</h1>
          <p className="adm-page-sub">
            edge regions, kill switches, recent rollouts.
          </p>
        </div>
        <div className="row" style={HEADER_BTNS}>
          <Btn kind="ghost" size="sm" onClick={onResync}>
            resync
          </Btn>
          <Btn
            kind="primary"
            size="sm"
            style={KILL_PRIMARY}
            onClick={(): void => setShowKill(true)}
          >
            kill switch
          </Btn>
        </div>
      </div>

      <Card style={CARD_GAP}>
        <SectionLabel>
          <span>edge regions · 8</span>
          <span className="adm-page-sub" style={SUB_LINE}>
            {healthy} healthy · {degraded} degraded · {down} down
          </span>
        </SectionLabel>
        <RegionGrid regions={regions} />
      </Card>

      <div style={TWO_COL}>
        <Card>
          <SectionLabel>
            <span>recent deploys · 24h</span>
            <a className="adm-link" style={VIEW_ALL} onClick={onViewAllDeploys}>
              view all
            </a>
          </SectionLabel>
          <DeployTable deploys={deploys} onRollback={onRollback} />
        </Card>

        <Card>
          <SectionLabel>
            <span>kill switches</span>
          </SectionLabel>
          <div style={KS_COL}>
            {KILL_SWITCHES.map(([label, on], i) => (
              <div
                key={label}
                className="row-bw"
                style={{
                  padding: '10px 0',
                  borderBottom:
                    i < KILL_SWITCHES.length - 1
                      ? '1px solid var(--border)'
                      : 'none',
                }}
              >
                <span style={KS_LABEL}>{label}</span>
                <Toggle on={on} onChange={(): void => setShowFlag(true)} />
              </div>
            ))}
          </div>
          <div className="adm-approval" style={APPROVAL_NOTE}>
            flipping any switch requires 4-eyes. all flips broadcast to
            #ops-incident.
          </div>
        </Card>
      </div>

      {showKill ? (
        <KillSwitchModal
          onClose={(): void => setShowKill(false)}
          onRequestKillApproval={onRequestKillApproval}
        />
      ) : null}
      {showFlag ? (
        <FlagApprovalModal
          onClose={(): void => setShowFlag(false)}
          onConfirm={handleFlagConfirm}
        />
      ) : null}
    </div>
  );
}
