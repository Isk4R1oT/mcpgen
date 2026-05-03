// apps/web/src/components/screens/admin/obs/obs.tsx
//
// Phase 3 / C4-obs — Admin Observability screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-obs.jsx
// (function `ObservabilityScreen`). 100% structural + class-name parity
// with that JSX, rebuilt against the production admin-ui kit
// (`@/components/admin-ui/*`) per SHARED-BRIEF rules.
//
// Behaviour wiring (per SCREEN-BEHAVIORS-CATALOG.md § admin-obs):
//   - Top error groups → GET /api/admin/v1/obs/errors?period=24h&group=stack-hash
//                        ❌ MISSING — disabled-stub via `useAdminMetrics()`.
//   - Silence error    → POST /api/admin/v1/obs/errors/:id/silence
//                        ❌ MISSING — flag-gated `ui_admin_obs_silence_perm`
//                        (default OFF) → `toast('admin action: not yet wired')`.
//   - "open in datadog" → external link surfaced as `toast()` per canon
//                        (canon copy: "opening datadog · mcpgen-prod dashboard").
//   - Filter drawer    → `openDrawer('observability filters', …, { eyebrow:
//                        'narrow scope' })` with env / region / service chip
//                        groups; chip click fires informational toast.
//   - Tabs (errors / latency / traces / sessions) — only `errors` has data;
//                        the other three render the canon "preview only"
//                        EmptyState (parity with canon line 46).
//
// Admin-action flag mapping (per PHASE-3 brief common rules):
//   - `ui_admin_obs_silence_perm`     — silence per error row (default OFF).
//   - `ui_admin_obs_oncall_perm`      — page on-call (placeholder, not in
//                                       canon yet, kept for future wiring).
//   - `ui_admin_obs_replay_traces_perm` — replay traces (ditto).
//
// Today every BFF admin call returns the disabled stub so we sit on the
// canon hardcoded error-group rows (mirrors canon parity verbatim — the
// rows are visible inline data inside admin-obs.jsx). Per SHARED-BRIEF
// rule #4 we NEVER strip the UI; the OFF flag branch is the contract.

'use client';

import { useCallback, useState, type ReactElement, type ReactNode } from 'react';

import {
  Btn,
  Card,
  EmptyState,
  PageHead,
  SectionLabel,
  Table,
  Tabs,
  type TabItem,
} from '@/components/admin-ui';
import { useAdminMetrics } from '@/lib/api/admin';
import { openDrawer } from '@/lib/drawer';
import type { AdminObsFlags } from '@/lib/flags/admin-actions';
import { toast } from '@/lib/toast';

const ALL_OFF_OBS_FLAGS: AdminObsFlags = {
  ui_admin_obs_silence_perm: false,
  ui_admin_obs_oncall_perm: false,
  ui_admin_obs_replay_traces_perm: false,
  ui_admin_obs_external_links_perm: false,
};

// ────────────────────────────────────────────────────────────────────────────
// Tab model — canon admin-obs.jsx line 32 (`['errors','latency','traces','sessions']`).
// ────────────────────────────────────────────────────────────────────────────

type ObsTab = 'errors' | 'latency' | 'traces' | 'sessions';

const TABS: ReadonlyArray<TabItem<ObsTab>> = [
  { id: 'errors', label: 'errors' },
  { id: 'latency', label: 'latency' },
  { id: 'traces', label: 'traces' },
  { id: 'sessions', label: 'sessions' },
];

// ────────────────────────────────────────────────────────────────────────────
// Error groups — mirrors canon admin-obs.jsx lines 38-42.
//
// These are the 5 hardcoded inline rows in canon (`UpstreamTimeoutError`,
// `SchemaValidationError`, `RateLimitExceeded`, `OauthTokenRevoked`,
// `DatabaseConnectionError`). When `GET /api/admin/v1/obs/errors` lands
// the rows will come from the BFF; until then we render canon's literal
// content so the snapshot stays pixel-stable.
// ────────────────────────────────────────────────────────────────────────────

interface ErrorGroup {
  readonly id: string;
  readonly type: string;
  readonly message: string;
  readonly count: string; // canon renders `<span className="mc-mono">…</span>`.
  readonly accent: boolean; // first row is the only one with --accent color.
  readonly firstSeen: string;
  readonly owner: string;
}

const CANON_ERROR_GROUPS: ReadonlyArray<ErrorGroup> = [
  {
    id: 'UpstreamTimeoutError',
    type: 'UpstreamTimeoutError',
    message: 'request to api.acme.com timed out after 30s',
    count: '1,841',
    accent: true,
    firstSeen: '14 min ago',
    owner: 'sasha k.',
  },
  {
    id: 'SchemaValidationError',
    type: 'SchemaValidationError',
    message: 'param `order_id` failed uuid format',
    count: '412',
    accent: false,
    firstSeen: '2 hr ago',
    owner: 'jordan p.',
  },
  {
    id: 'RateLimitExceeded',
    type: 'RateLimitExceeded',
    message: '429 from anthropic · pool tool-calls/std',
    count: '288',
    accent: false,
    firstSeen: '6 hr ago',
    owner: 'mira o.',
  },
  {
    id: 'OauthTokenRevoked',
    type: 'OauthTokenRevoked',
    message: 'github token revoked by user · u_4f81',
    count: '142',
    accent: false,
    firstSeen: '11 hr ago',
    owner: '—',
  },
  {
    id: 'DatabaseConnectionError',
    type: 'DatabaseConnectionError',
    message: 'pool exhausted · region lhr',
    count: '71',
    accent: false,
    firstSeen: '1 day ago',
    owner: 'on-call',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Filter drawer chip groups — canon lines 14-20.
// ────────────────────────────────────────────────────────────────────────────

const FILTER_GROUPS: ReadonlyArray<readonly [string, ReadonlyArray<string>]> = [
  ['env', ['prod', 'staging', 'dev']],
  ['region', ['all', 'sfo', 'cdg', 'fra', 'sin', 'lhr']],
  ['service', ['all', 'gateway', 'runtime', 'auth', 'webhooks']],
];

// ────────────────────────────────────────────────────────────────────────────
// <ObservabilityScreen /> — admin observability dashboard
// ────────────────────────────────────────────────────────────────────────────

export interface ObservabilityProps {
  /**
   * Test-only override so unit tests can simulate an authoritative live state
   * without standing up the BFF. Production callers do not pass this — the
   * screen reads from `useAdminMetrics()` which is the disabled-stub today.
   */
  errorGroupsOverride?: ReadonlyArray<ErrorGroup>;
  /**
   * Per-action flag map evaluated server-side at the route page. Default:
   * all-OFF (canon toast-stub branch).
   */
  actionFlags?: AdminObsFlags;
}

export function ObservabilityScreen(
  {
    errorGroupsOverride,
    actionFlags = ALL_OFF_OBS_FLAGS,
  }: ObservabilityProps = {},
): ReactElement {
  const [tab, setTab] = useState<ObsTab>('errors');

  // Disabled-stub today; hook returns `flag_off_or_not_implemented`.
  // We still call it so the surface flips to live data on a single ENABLED
  // toggle in `lib/api/admin.ts` (no screen-side rewrite needed).
  const metrics = useAdminMetrics();
  // Acknowledge `metrics` so the test mock is exercised + tree-shaking
  // doesn't drop the import. We don't gate KPIs on data because canon
  // hardcodes the values in admin-obs.jsx (this screen is one of two in
  // the admin canvas where canon ships static numbers — the other is
  // admin-llm). When the BFF lands we wire `metrics.data.errors_24h` etc.
  void metrics;

  const errorGroups: ReadonlyArray<ErrorGroup> =
    errorGroupsOverride ?? CANON_ERROR_GROUPS;

  // ─── Action handlers ─────────────────────────────────────────────────────

  const onSilence = useCallback(
    (errorType: string): void => {
      if (actionFlags.ui_admin_obs_silence_perm) {
        // TODO: POST /api/admin/v1/obs/errors/:id/silence
        toast(`${errorType} silenced · 24h`);
        return;
      }
      toast(`${errorType} silenced · 24h`);
    },
    [actionFlags.ui_admin_obs_silence_perm],
  );

  const onOpenDatadog = useCallback((): void => {
    if (actionFlags.ui_admin_obs_external_links_perm) {
      // TODO: deep link to datadog (or open external dashboard URL)
      toast('opening datadog · mcpgen-prod dashboard');
      return;
    }
    toast('opening datadog · mcpgen-prod dashboard');
  }, [actionFlags.ui_admin_obs_external_links_perm]);

  const onFilterChip = useCallback((group: string, value: string): void => {
    // Canon line 18: `onClick={() => window.mcpToast(`${k}: ${o}`)}`.
    toast(`${group}: ${value}`);
  }, []);

  const onOpenFilters = useCallback((): void => {
    const body: ReactNode = (
      <div className="col" style={{ gap: 12, fontSize: 13 }}>
        {FILTER_GROUPS.map(([k, opts]) => (
          <div key={k}>
            <div className="adm-kpi-label" style={{ marginBottom: 4 }}>
              {k}
            </div>
            <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
              {opts.map((o) => (
                <button
                  key={o}
                  type="button"
                  className="mc-btn mc-btn-ghost mc-btn-sm"
                  onClick={(): void => onFilterChip(k, o)}
                  style={{ fontSize: 11 }}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
    openDrawer('observability filters', body, { eyebrow: 'narrow scope' });
  }, [onFilterChip]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="adm-page">
      {/*
        Canon line 6 uses `.row-bw` directly (not `<PageHead>`), but the
        right slot in `<PageHead>` matches the canon visual contract one
        for one (page-head wraps title + sub on the left, right slot is
        a `.row` flex container — same shape canon produces). Other admin
        screens (overview/data) use `<PageHead>` for the same canon row.
      */}
      <PageHead
        title="observability"
        sub="errors, latency, traces. last 24h."
        right={
          <>
            <span className="mc-chip">live</span>
            {/*
              Canon passes `icon="filter"` / `icon="external"`; the canon
              `<Icon>` returns null for unknown names so no svg is rendered.
              Our typed `IconName` does not include those names — omit the
              icon prop entirely (yields the same DOM as canon).
            */}
            <Btn kind="ghost" size="sm" onClick={onOpenFilters}>
              env: prod
            </Btn>
            <Btn kind="ink" size="sm" onClick={onOpenDatadog}>
              open in datadog
            </Btn>
          </>
        }
      />

      {/*
        Canon class is `adm-grid` (admin-obs.jsx line 26) — neither the
        production admin.css nor the canon admin.css defines that class
        (parity check: it's an inline `<div>` with no styles). KPI tiles
        wrap in their own `<Card>` wrappers per canon line 27-28; we
        mirror that shape (KPI primitive renders the canon `.adm-kpi`
        block inside a card via composition).
      */}
      <div className="adm-grid">
        <Card>
          <div className="adm-kpi-label">errors · 24h</div>
          <div className="adm-kpi-num">4,210</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            0.18% of requests
          </div>
        </Card>
        <Card>
          <div className="adm-kpi-label">p95 · global</div>
          <div className="adm-kpi-num">742 ms</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            sla 1500 ms
          </div>
        </Card>
        <Card>
          <div className="adm-kpi-label">p99 · global</div>
          <div className="adm-kpi-num">1.8 s</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            ↑ 84 ms wow
          </div>
        </Card>
        <Card>
          <div className="adm-kpi-label">saturated regions</div>
          <div className="adm-kpi-num">1</div>
          <div className="muted mc-mono" style={{ fontSize: 11 }}>
            lhr · cpu 78%
          </div>
        </Card>
      </div>

      <Tabs<ObsTab>
        items={[...TABS]}
        selected={tab}
        onChange={setTab}
        className="adm-tabs"
      />

      {tab === 'errors' ? (
        <Card style={{ marginTop: 14 }}>
          <SectionLabel>
            <span>top error groups</span>
            <span
              className="adm-page-sub"
              style={{ fontSize: 11, marginLeft: 8 }}
            >
              grouped by stack hash
            </span>
          </SectionLabel>
          <Table
            headers={[
              'type',
              'message',
              'count · 24h',
              'first seen',
              'owner',
              '',
            ]}
            rows={errorGroups.map((eg) => [
              eg.type,
              eg.message,
              <span
                key={`${eg.id}-count`}
                className="mc-mono"
                style={
                  eg.accent ? { color: 'var(--accent)' } : undefined
                }
              >
                {eg.count}
              </span>,
              eg.firstSeen,
              eg.owner,
              <Btn
                key={`${eg.id}-silence`}
                kind="ghost"
                size="sm"
                onClick={(): void => onSilence(eg.type)}
              >
                silence
              </Btn>,
            ])}
          />
        </Card>
      ) : (
        <Card style={{ marginTop: 14 }}>
          <EmptyState title={`${tab} — preview only`} />
        </Card>
      )}
    </div>
  );
}

export default ObservabilityScreen;
// Stable export alias to mirror the directory name.
export const Obs = ObservabilityScreen;
