// apps/web/src/components/screens/admin/llm/llm.tsx
//
// Phase 3 / Agent C3-llm — LLM Ops screen.
//
// Source of truth: claude-design-reference/canon/admin/admin-llm.jsx
// (`LLMScreen`).
//
// Layout (top → bottom):
//   1. PageHead row: title + sub + two CTAs ("run eval", "propose route
//      change"). The propose-CTA opens a vaul drawer with a small form
//      (route / model / justification + submit).
//   2. KPI grid (`adm-grid` block) — 4 inline kpi cards (tokens, model
//      spend, latency, eval pass-rate).
//   3. Tab strip (`adm-tabs`): routing / evals / rate-limits / prompts /
//      safety. Routing + evals are concrete; the other three render an
//      `<EmptyState title="… — preview only" />` card per canon.
//   4. Routing tab: 2-column grid → "active routes" Table on the left,
//      "provider mix · 24h" panel of BarRows on the right; "proposed
//      change · pending review" Card spans the full row underneath with
//      an inline diff and approve / request-changes / reject row buttons.
//   5. Evals tab: single Card with 4 hardcoded recent eval runs in a
//      Table.
//
// Per Phase-3 brief:
//   - All BFF admin endpoints are missing → we render the canon's
//     hardcoded data verbatim (the canon screen itself is hardcoded —
//     these are not "mocks", they are the visual baseline). When the
//     real `/api/admin/v1/llm/*` endpoints land we swap the constants
//     for `useAdminLlm*()` hooks, but the JSX shape stays identical.
//   - Every action (run eval, propose route change, approve / request
//     changes / reject, submit-for-review inside the drawer) is flag-
//     gated. Default OFF → flips to a `toast()` stub. The flag values
//     are evaluated server-side and passed down as boolean props.
//   - We import `Btn`, `Card`, `Pill`, `Table`, `SectionLabel`,
//     `EmptyState` from `@/components/admin-ui` only — never from the
//     main `@/components/ui` per Phase-3 admin import-rule.
//
// Local helpers:
//   - `BarRow({ label, pct, hue })` mirrors canon line 86–99 exactly.

'use client';

import { useState, type JSX } from 'react';

import {
  Btn,
  Card,
  EmptyState,
  Pill,
  SectionLabel,
  Table,
} from '@/components/admin-ui';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';

// ─── Types ─────────────────────────────────────────────────────────────────

type LlmTabId = 'routing' | 'evals' | 'rate-limits' | 'prompts' | 'safety';

type BarHue = 'ok' | 'warn' | 'info' | '';

export interface LlmScreenProps {
  /** Flag `ui_admin_llm_run_eval_perm`. Server-evaluated (default OFF). */
  runEvalEnabled?: boolean;
  /**
   * Flag `ui_admin_llm_propose_route_perm`. Gates both the "propose route
   * change" CTA in the page header and the "submit for review" CTA inside
   * the drawer body. Server-evaluated (default OFF).
   */
  proposeRouteEnabled?: boolean;
  /**
   * Flag `ui_admin_llm_approve_route_perm`. Gates approve / request
   * changes / reject buttons on the pending-review card. Default OFF.
   */
  approveRouteEnabled?: boolean;
}

// ─── Hardcoded canon data ──────────────────────────────────────────────────
//
// All four blocks below mirror canon admin-llm.jsx 1:1. When the
// `/api/admin/v1/llm/*` endpoints exist these become hook-driven props.

const KPIS: ReadonlyArray<readonly [string, string, string]> = [
  ['tokens · 24h', '184.2 m', 'in 102m · out 82m'],
  ['model spend · 30d', '$48,210', 'sonnet 71% · haiku 18%'],
  ['avg latency', '742 ms', 'p95 1.4s'],
  ['eval pass rate', '94.2%', '↑ 1.8 pp wow'],
];

const TABS: ReadonlyArray<LlmTabId> = [
  'routing',
  'evals',
  'rate-limits',
  'prompts',
  'safety',
];

const PROVIDER_MIX: ReadonlyArray<{ label: string; pct: number; hue: BarHue }> = [
  { label: 'anthropic', pct: 72, hue: 'ok' },
  { label: 'openai', pct: 18, hue: 'info' },
  { label: 'google', pct: 7, hue: 'warn' },
  { label: 'self-host', pct: 3, hue: '' },
];

// ─── BarRow helper (canon line 86–99) ──────────────────────────────────────

interface BarRowProps {
  label: string;
  pct: number;
  hue: BarHue;
}

function BarRow({ label, pct, hue }: BarRowProps): JSX.Element {
  const colorMap: Record<BarHue, string> = {
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    info: 'var(--info)',
    '': 'var(--muted)',
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="row-bw" style={{ marginBottom: 4 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
          {label}
        </span>
        <span className="muted mc-mono" style={{ fontSize: 11 }}>
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--surface-soft)',
          border: '1px solid var(--border)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: colorMap[hue],
          }}
        />
      </div>
    </div>
  );
}

// ─── Drawer body for "propose route change" ────────────────────────────────

interface ProposeRouteBodyProps {
  submitEnabled: boolean;
}

function ProposeRouteBody({ submitEnabled }: ProposeRouteBodyProps): JSX.Element {
  const submit = (): void => {
    if (!submitEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('proposal submitted · awaiting 2 approvers');
  };
  return (
    <div className="col" style={{ gap: 12, fontSize: 13 }}>
      <div>route changes require 2 approvers and an audit trail.</div>
      <div className="adm-kpi-label">route</div>
      <select
        className="mc-input mc-mono"
        style={{
          width: '100%',
          padding: 10,
          fontSize: 12,
          border: '1px solid var(--border)',
          background: 'var(--paper)',
          borderRadius: 4,
        }}
        defaultValue="tool-calls/standard"
      >
        <option>tool-calls/standard</option>
        <option>tool-calls/cheap</option>
        <option>spec-synth</option>
      </select>
      <div className="adm-kpi-label">new model</div>
      <select
        className="mc-input mc-mono"
        style={{
          width: '100%',
          padding: 10,
          fontSize: 12,
          border: '1px solid var(--border)',
          background: 'var(--paper)',
          borderRadius: 4,
        }}
        defaultValue="sonnet-4.5 (current)"
      >
        <option>sonnet-4.5 (current)</option>
        <option>opus-4.1</option>
        <option>haiku-4</option>
      </select>
      <div className="adm-kpi-label">justification</div>
      <textarea
        className="mc-input"
        placeholder="why this change?"
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
      <Btn kind="ink" size="sm" full onClick={submit}>
        submit for review
      </Btn>
    </div>
  );
}

// ─── Routing tab content ───────────────────────────────────────────────────

interface RoutingTabProps {
  approveEnabled: boolean;
}

function RoutingTab({ approveEnabled }: RoutingTabProps): JSX.Element {
  const onApprove = (): void => {
    if (!approveEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('approved · 1 of 2 approvals · awaiting noor');
  };
  const onRequestChanges = (): void => {
    if (!approveEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('change request sent to author');
  };
  const onReject = (): void => {
    if (!approveEnabled) {
      toast('admin action: not yet wired', { kind: 'warn' });
      return;
    }
    toast('rejected · author notified', { kind: 'warn' });
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 14,
        marginTop: 14,
      }}
    >
      <Card>
        <SectionLabel>
          <span>active routes</span>
        </SectionLabel>
        <Table
          headers={['route', 'model', 'fallback', 'share']}
          rows={[
            [
              <span className="mc-mono" key="a">
                tool-calls/standard
              </span>,
              'sonnet-4.5',
              'haiku-3.5',
              '71%',
            ],
            [
              <span className="mc-mono" key="b">
                tool-calls/cheap
              </span>,
              'haiku-4',
              'haiku-3.5',
              '18%',
            ],
            [
              <span className="mc-mono" key="c">
                spec-synth
              </span>,
              'opus-4.1',
              'sonnet-4.5',
              '6%',
            ],
            [
              <span className="mc-mono" key="d">
                moderation
              </span>,
              'haiku-3.5',
              '—',
              '5%',
            ],
          ]}
        />
      </Card>

      <Card>
        <SectionLabel>
          <span>provider mix · 24h</span>
        </SectionLabel>
        {PROVIDER_MIX.map((p) => (
          <BarRow key={p.label} label={p.label} pct={p.pct} hue={p.hue} />
        ))}
        <div
          className="muted mc-mono"
          style={{ fontSize: 11, marginTop: 10 }}
        >
          auto-failover triggered 2× this week · both recovered &lt; 30s.
        </div>
      </Card>

      <Card style={{ gridColumn: '1 / -1' }}>
        <SectionLabel>
          <span>proposed change · pending review</span>
          <Pill kind="warn">2 approvers needed</Pill>
        </SectionLabel>
        <div className="adm-diff">
          <div className="adm-diff-line del">
            <span className="ln">042</span>
            <span>- tool-calls/standard → sonnet-4.5</span>
          </div>
          <div className="adm-diff-line add">
            <span className="ln">042</span>
            <span>
              + tool-calls/standard → sonnet-4.5 · canary 5% to opus-4.1
            </span>
          </div>
          <div className="adm-diff-line del">
            <span className="ln">043</span>
            <span>- fallback: haiku-3.5</span>
          </div>
          <div className="adm-diff-line add">
            <span className="ln">043</span>
            <span>+ fallback: haiku-4 (cheaper, equal quality on bench)</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 10 }}>
          <Btn kind="ink" size="sm" onClick={onApprove}>
            approve
          </Btn>
          <Btn kind="ghost" size="sm" onClick={onRequestChanges}>
            request changes
          </Btn>
          <Btn kind="ghost" size="sm" onClick={onReject}>
            reject
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ─── Evals tab content ─────────────────────────────────────────────────────

function EvalsTab(): JSX.Element {
  return (
    <Card style={{ marginTop: 14 }}>
      <SectionLabel>
        <span>recent eval runs</span>
      </SectionLabel>
      <Table
        headers={['run', 'suite', 'started', 'duration', 'pass', 'delta']}
        rows={[
          [
            <span className="mc-mono" key="1">
              eval_8a91
            </span>,
            'tool-calls/standard · 240',
            '14 min ago',
            '4m 12s',
            <Pill kind="ok" key="p1">
              94.2%
            </Pill>,
            <span style={{ color: 'var(--ok)' }} key="d1">
              +1.8
            </span>,
          ],
          [
            <span className="mc-mono" key="2">
              eval_8a90
            </span>,
            'spec-synth · 88',
            '2 hr ago',
            '6m 02s',
            <Pill kind="ok" key="p2">
              91.0%
            </Pill>,
            '+0.0',
          ],
          [
            <span className="mc-mono" key="3">
              eval_8a89
            </span>,
            'safety · 412',
            '5 hr ago',
            '2m 41s',
            <Pill kind="warn" key="p3">
              82.1%
            </Pill>,
            <span style={{ color: 'var(--accent)' }} key="d3">
              −4.2
            </span>,
          ],
          [
            <span className="mc-mono" key="4">
              eval_8a88
            </span>,
            'tool-calls/cheap · 240',
            '11 hr ago',
            '3m 18s',
            <Pill kind="ok" key="p4">
              93.7%
            </Pill>,
            '+0.4',
          ],
        ]}
      />
    </Card>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function LlmScreen({
  runEvalEnabled = false,
  proposeRouteEnabled = false,
  approveRouteEnabled = false,
}: LlmScreenProps): JSX.Element {
  const [tab, setTab] = useState<LlmTabId>('routing');

  const onRunEval = (): void => {
    if (!runEvalEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    toast('eval queued · starting in ~3s');
  };

  const onProposeRouteChange = (): void => {
    if (!proposeRouteEnabled) {
      toast('admin action: not yet wired', { kind: 'info' });
      return;
    }
    openDrawer(
      'propose route change',
      <ProposeRouteBody submitEnabled={proposeRouteEnabled} />,
      { eyebrow: '2 approvers required' },
    );
  };

  return (
    <div className="adm-page">
      <div className="row-bw" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="adm-page-title">ai / llm ops</h1>
          <p className="adm-page-sub">
            model routing, eval suites, rate-limit pools, prompt versions.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Btn kind="ghost" size="sm" icon="play" onClick={onRunEval}>
            run eval
          </Btn>
          <Btn kind="ink" size="sm" onClick={onProposeRouteChange}>
            propose route change
          </Btn>
        </div>
      </div>

      <div className="adm-grid">
        {KPIS.map(([label, value, sub]) => (
          <Card key={label}>
            <div className="adm-kpi-label">{label}</div>
            <div className="adm-kpi-num">{value}</div>
            <div className="muted mc-mono" style={{ fontSize: 11 }}>
              {sub}
            </div>
          </Card>
        ))}
      </div>

      <div className="adm-tabs" style={{ marginTop: 16 }} role="tablist">
        {TABS.map((t) => {
          const sel = tab === t;
          return (
            <div
              key={t}
              className={`adm-tab ${sel ? 'sel' : ''}`.trim()}
              role="tab"
              aria-selected={sel}
              tabIndex={0}
              onClick={() => setTab(t)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setTab(t);
                }
              }}
            >
              {t}
            </div>
          );
        })}
      </div>

      {tab === 'routing' ? <RoutingTab approveEnabled={approveRouteEnabled} /> : null}
      {tab === 'evals' ? <EvalsTab /> : null}
      {tab !== 'routing' && tab !== 'evals' ? (
        <Card style={{ marginTop: 14 }}>
          <EmptyState title={`${tab} — preview only`} />
        </Card>
      ) : null}
    </div>
  );
}

// Re-export the BarRow helper for completeness (canon also exposed it on
// `window` so other admin views could reuse). The typed `LlmTabId` is
// likewise exported for any consumer that needs to mirror the union.
export { BarRow };
export type { LlmTabId };
