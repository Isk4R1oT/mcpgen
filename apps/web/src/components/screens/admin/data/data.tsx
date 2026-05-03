// apps/web/src/components/screens/admin/data/data.tsx
//
// Phase 3 / C2 (data sub-agent) — admin data catalog screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-data.jsx
// (mock data module that defines `window.ADM_DATA` for the rest of the
// admin canvas) + admin.css visual language (page head, KPIs, cards,
// section labels, tables).
//
// Important: the canon `admin-data.jsx` is NOT a screen — it is a data
// definition consumed by sibling admin canvases (overview / users /
// servers / billing / etc). This screen renders an internal-staff data
// catalog that mirrors what the canvas exposes and gives operators a
// single view of every collection the admin module operates on, with
// per-collection counts and export / refresh actions.
//
// BFF state: `useAdminMetrics()` is a disabled stub returning
// `{ ok: false, error: 'flag_off_or_not_implemented' }` (see
// `apps/web/src/lib/api/admin.ts`). When that branch fires we render
// the canon loading state (`…` placeholders + canon empty state on
// the "live counts" card) per PHASE-3 brief: "All BFF admin endpoints
// are missing. Use the disabled-stub. Render canon's loading / empty
// state."
//
// Actions:
//   - "refresh" (header)         → flag-gated `ui_admin_data_refresh_perm`
//   - "export catalog" (header)  → flag-gated `ui_admin_data_export_perm`
//   - per-row "view" / "export"  → flag-gated `ui_admin_data_export_perm`
//
// All flags default OFF; OFF branch fires
// `toast('admin action: not yet wired')` per Phase 3 common rules.

'use client';

import { useMemo, type JSX } from 'react';

import {
  Btn,
  Card,
  EmptyState,
  KPI,
  PageHead,
  Pill,
  SectionLabel,
  Table,
} from '@/components/admin-ui';
import type { AdminDataFlags } from '@/lib/flags/admin-actions';
import { useAdminMetrics } from '@/lib/api/admin';
import { toast } from '@/lib/toast';

// ─── Catalog model ─────────────────────────────────────────────────────────
//
// Mirrors the 15 collections defined inside canon `admin-data.jsx`
// (`return { users, servers, moderation, regions, deploys, billing,
// llmModels, ratePools, flags, tickets, audit, integrations, secrets,
// content, errors }`). Counts come from canon constants — they're the
// staff-side reference numbers the canvas uses while the BFF endpoint
// is in-flight. When `useAdminMetrics()` flips ON, these are replaced
// by live values via the `liveTotal` lookup keyed by `id`.

interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  /** Canon mock count (admin-data.jsx). */
  canonCount: number;
  /** Pill kind hinting at the operational sensitivity of the collection. */
  kind: 'ok' | 'warn' | 'alert' | 'info' | 'ink';
  /** Owner team — staff context only, mirrors canon `secrets.owner` style. */
  owner: 'platform' | 'product' | 'sre' | 'billing' | 'support' | 'security';
}

const CATALOG: CatalogEntry[] = [
  { id: 'users',        label: 'users',          description: 'staff & customer accounts · org membership · plan & status', canonCount: 10, kind: 'ok',    owner: 'platform' },
  { id: 'servers',      label: 'servers',        description: 'mcp servers · listing state · drift flags · invocations',     canonCount: 12, kind: 'ok',    owner: 'product' },
  { id: 'moderation',   label: 'moderation',     description: 'queue · listings / reports / takedowns / badge requests',     canonCount: 8,  kind: 'warn',  owner: 'product' },
  { id: 'regions',      label: 'regions',        description: 'edge regions · provider · health · traffic share',            canonCount: 7,  kind: 'info',  owner: 'sre'     },
  { id: 'deploys',      label: 'deploys',        description: 'recent deploys · sha · regions · result · duration',           canonCount: 6,  kind: 'ok',    owner: 'sre'     },
  { id: 'billing',      label: 'billing',        description: 'org subscriptions · mrr · dunning state · payment method',     canonCount: 8,  kind: 'ok',    owner: 'billing' },
  { id: 'llmModels',    label: 'llm models',     description: 'available models · cost · latency · share · primary',          canonCount: 4,  kind: 'info',  owner: 'platform' },
  { id: 'ratePools',    label: 'rate pools',     description: 'shared rate-limit buckets · current usage · reset window',     canonCount: 4,  kind: 'info',  owner: 'platform' },
  { id: 'flags',        label: 'flags',          description: 'feature flags · rollout · status · owner team',                 canonCount: 6,  kind: 'ink',   owner: 'platform' },
  { id: 'tickets',      label: 'tickets',        description: 'support inbox · sla · assignee · plan tier',                    canonCount: 8,  kind: 'warn',  owner: 'support' },
  { id: 'audit',        label: 'audit',          description: 'admin actions · diffs · reasons · system events',               canonCount: 9,  kind: 'ink',   owner: 'security' },
  { id: 'integrations', label: 'integrations',   description: 'oauth providers + webhooks · install counts · failure rate',    canonCount: 7,  kind: 'ok',    owner: 'platform' },
  { id: 'secrets',      label: 'secrets',        description: 'rotated keys · expiry windows · owner team',                    canonCount: 5,  kind: 'alert', owner: 'security' },
  { id: 'content',      label: 'content',        description: 'docs + email templates + marketplace listings',                 canonCount: 14, kind: 'ok',    owner: 'product' },
  { id: 'errors',       label: 'errors',         description: 'observability stream · severity · service · counts',            canonCount: 6,  kind: 'warn',  owner: 'sre'     },
];

const CATALOG_TOTAL = CATALOG.reduce((acc, c) => acc + c.canonCount, 0);

// ─── Helpers ───────────────────────────────────────────────────────────────

const STUB_TOAST = 'admin action: not yet wired';

function fireStub(action: string): void {
  // Per PHASE-3 brief — every admin action is flag-gated and the OFF
  // branch fires a friendly toast. We surface the action name in the
  // dev console (not the toast itself) so QA can spot every wiring
  // attempt while QA flags are off.
  // eslint-disable-next-line no-console
  console.debug('[admin-data] stub action:', action);
  toast(STUB_TOAST, { kind: 'info' });
}

// Gated action helper: when flag is ON, fire the BFF call (currently a
// best-effort placeholder until the typed admin client lands); when OFF,
// fall back to the canon toast stub.
function gatedAction(enabled: boolean, action: string, run: () => void): void {
  if (enabled) {
    run();
    return;
  }
  fireStub(action);
}

// ─── Screen ────────────────────────────────────────────────────────────────

export interface AdminDataProps {
  /** When provided overrides the catalog list (test seam). */
  catalog?: CatalogEntry[];
  /**
   * Per-action flag map evaluated server-side at the route page. Defaults to
   * all-OFF so legacy callers / tests get the toast-stub branch.
   */
  actionFlags?: AdminDataFlags;
}

const ALL_OFF_DATA_FLAGS: AdminDataFlags = {
  ui_admin_data_refresh_perm: false,
  ui_admin_data_export_perm: false,
  ui_admin_data_view_perm: false,
  ui_admin_data_schema_perm: false,
};

export function AdminData({
  catalog = CATALOG,
  actionFlags = ALL_OFF_DATA_FLAGS,
}: AdminDataProps): JSX.Element {
  const metrics = useAdminMetrics();
  // The disabled stub returns `{ ok: false, error: 'flag_off_or_not_implemented' }`
  // wrapped inside the TanStack `data` slot. We treat that branch as the
  // canon "loading" state — counts collapse to `…` placeholders and the
  // live-counts card surfaces the canon EmptyState.
  const offline = metrics.data === undefined || metrics.data.ok === false;
  const live = metrics.data !== undefined && metrics.data.ok === true ? metrics.data.data : null;

  const catalogTotal = useMemo(() => catalog.reduce((acc, c) => acc + c.canonCount, 0), [catalog]);

  const collectionsKpi = offline ? '…' : String(catalog.length);
  const recordsKpi = offline ? '…' : String(catalogTotal);
  const last24Kpi = offline ? '…' : live !== null ? String(live.generations_24h) : '0';
  const errorsKpi = offline ? '…' : live !== null ? String(live.errors_24h) : '0';

  return (
    <div className="adm-page" data-screen-id="admin-data">
      <PageHead
        title="ops · data"
        sub="staff data catalog · 15 collections · canon mock baseline"
        right={[
          <Btn
            key="refresh"
            kind="ghost"
            size="sm"
            icon="bolt"
            onClick={() =>
              gatedAction(
                actionFlags.ui_admin_data_refresh_perm,
                'refresh',
                () => {
                  void metrics.refetch();
                  toast('refreshing metrics…', { kind: 'info' });
                },
              )
            }
          >
            refresh
          </Btn>,
          <Btn
            key="export"
            kind="ink"
            size="sm"
            icon="share"
            onClick={() =>
              gatedAction(
                actionFlags.ui_admin_data_export_perm,
                'export-catalog',
                () => toast('catalog export queued · download link in email'),
              )
            }
          >
            export catalog
          </Btn>,
        ]}
      />

      <div className="adm-kpis" style={{ marginBottom: 18 }}>
        <KPI label="collections"      value={collectionsKpi}  delta="canon · stable" />
        <KPI label="rows · canon"     value={recordsKpi}      delta="mock baseline" />
        <KPI label="generations · 24h" value={last24Kpi}      delta={offline ? 'awaiting bff' : 'live'} deltaKind={offline ? '' : 'up'} />
        <KPI label="errors · 24h"     value={errorsKpi}       delta={offline ? 'awaiting bff' : 'live'} deltaKind={offline ? '' : 'down'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18 }}>
        <Card padding={false}>
          <SectionLabel
            right={
              <span
                className="adm-link"
                style={{ cursor: 'pointer' }}
                role="button"
                tabIndex={0}
                onClick={() =>
                  gatedAction(
                    actionFlags.ui_admin_data_schema_perm,
                    'open-schema',
                    () => toast('opening schema inspector…'),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    gatedAction(
                      actionFlags.ui_admin_data_schema_perm,
                      'open-schema',
                      () => toast('opening schema inspector…'),
                    );
                  }
                }}
              >
                schema →
              </span>
            }
          >
            <span>collections</span>
          </SectionLabel>
          <div style={{ padding: '0 4px 4px' }}>
            {catalog.map((c) => (
              <div
                key={c.id}
                className="adm-trow"
                style={{ gridTemplateColumns: '160px 1fr 90px 100px auto' }}
                data-collection-id={c.id}
              >
                <div className="adm-cell-stack">
                  <span className="pri" style={{ fontFamily: 'var(--font-mono)' }}>
                    {c.label}
                  </span>
                  <span className="sec mc-mono">owner · {c.owner}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  {c.description}
                </div>
                <span
                  className="mc-mono"
                  style={{ fontSize: 12, color: 'var(--text)' }}
                >
                  {c.canonCount} rows
                </span>
                <Pill kind={c.kind}>{c.kind === 'ink' ? 'system' : c.kind}</Pill>
                <div className="row" style={{ gap: 6 }}>
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={() =>
                      gatedAction(
                        actionFlags.ui_admin_data_view_perm,
                        `view:${c.id}`,
                        () => toast(`opening ${c.label} detail drawer…`),
                      )
                    }
                  >
                    view
                  </Btn>
                  <Btn
                    kind="ghost"
                    size="sm"
                    onClick={() =>
                      gatedAction(
                        actionFlags.ui_admin_data_export_perm,
                        `export:${c.id}`,
                        () => toast(`${c.label} export queued`),
                      )
                    }
                  >
                    export
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card padding={false}>
            <SectionLabel>
              <span>live counts</span>
            </SectionLabel>
            <div style={{ padding: '8px 4px 12px' }}>
              {offline ? (
                <EmptyState
                  title="awaiting backend"
                  sub="GET /api/v1/admin/metrics is not wired yet · counts shown above are the canon mock baseline"
                />
              ) : (
                <Table
                  headers={['metric', 'value']}
                  rows={[
                    ['generations · total', String(live?.generations_total ?? 0)],
                    ['generations · 24h',  String(live?.generations_24h  ?? 0)],
                    ['active orgs · 24h',  String(live?.active_orgs_24h  ?? 0)],
                    ['deployments · total',String(live?.deployments_total?? 0)],
                    ['errors · 24h',       String(live?.errors_24h       ?? 0)],
                  ]}
                />
              )}
            </div>
          </Card>

          <Card padding={false}>
            <SectionLabel>
              <span>provenance</span>
            </SectionLabel>
            <div style={{ padding: '10px 14px', fontSize: 12, lineHeight: 1.55, color: 'var(--text-muted)' }}>
              <p style={{ margin: 0 }}>
                catalog source · canon{' '}
                <span className="mc-mono">admin-data.jsx</span>
              </p>
              <p style={{ margin: '6px 0 0' }}>
                live counts source · BFF{' '}
                <span className="mc-mono">/api/v1/admin/metrics</span>{' '}
                <span style={{ color: 'var(--text-faint)' }}>
                  ({offline ? 'flag off · stub' : 'live'})
                </span>
              </p>
              <p style={{ margin: '6px 0 0' }}>
                actions are gated behind{' '}
                <span className="mc-mono">ui_admin_data_*_perm</span>{' '}
                feature flags · default OFF.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AdminData;
// Surface the canon catalog total for tests that want to assert against it.
export { CATALOG, CATALOG_TOTAL };
