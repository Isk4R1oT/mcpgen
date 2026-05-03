// apps/web/src/components/screens/canvas/canvas.tsx
//
// Phase 1 / A2 — Canvas screen (post-paste analysis canvas).
//
// Source of truth: claude-design-reference/canon/screen-canvas.jsx (`Canvas`).
// Visual baseline: claude-design-reference/visual-baseline/canvas-{375,768,1280,1920}.png.
//
// Behaviors (per SCREEN-BEHAVIORS-CATALOG.md § canvas + PHASE-1.md A2):
// - Three-pane CSS Grid layout (`mc-three`): tools list / detail / refinement chat.
// - Auto-accept countdown 3s on diff; manual accept/revert overrides.
// - First-visit summary card with localStorage persistence (`mcpgen_canvas_summary_seen`).
// - Wired entry: when `?spec_url=...` query param is present, auto-POST /api/v1/generate
//   and redirect to `/generate/${job_id}` on 202.
// - Errors during submit surface via toast (canon `window.mcpToast` → `@/lib/toast`).
//
// Backend wire-ups deferred (per catalog):
// - Description shorten / chat / quick actions: stays as static seed for now (canon
//   already provides static fake diff + seeded chat bubbles + toasts on quick actions).
// - The "edit description" persistence is client-only, dropped on navigation.

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type FocusEvent,
  type JSX,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Btn, Icon, SectionLabel, TopBar } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { submitGeneration } from '@/lib/api/generate';
import { toast } from '@/lib/toast';

// ─── Static seed data (canon TOOL_DATA — replace with engine IR in Phase 2) ───
//
// Each tool exposes `rawTk` (naive 1:1 token estimate from the upstream spec)
// and `tk` (after our optimization passes). The delta is the headline metric
// surfaced in the tools list, the detail header, and the status bar.

interface CanvasParam {
  readonly name: string;
  readonly type: string;
  readonly req: boolean;
}

interface CanvasTool {
  readonly id: string;
  readonly name: string;
  readonly tk: number;
  readonly rawTk: number;
  readonly desc: string;
  readonly short?: string;
  readonly source: string;
  readonly params: ReadonlyArray<CanvasParam>;
  readonly composite?: boolean;
}

interface CanvasCategory {
  readonly label: string;
  readonly tools: ReadonlyArray<CanvasTool>;
  readonly icon?: IconName;
}

const TOOL_DATA: Readonly<Record<string, CanvasCategory>> = {
  transactions: {
    label: 'transactions',
    tools: [
      {
        id: 'create_charge',
        name: 'create_charge',
        tk: 47,
        rawTk: 186,
        desc: "charges a customer's card. returns a charge object.",
        short: 'charges a card. returns charge.',
        source: 'POST /v1/charges',
        params: [
          { name: 'amount', type: 'number', req: true },
          { name: 'currency', type: 'string', req: true },
          { name: 'customer', type: 'string', req: true },
          { name: 'metadata', type: 'object', req: false },
        ],
      },
      {
        id: 'list_charges',
        name: 'list_charges',
        tk: 38,
        rawTk: 142,
        desc: 'lists charges; supports filters by date, customer, status.',
        source: 'GET /v1/charges',
        params: [
          { name: 'limit', type: 'number', req: false },
          { name: 'customer', type: 'string', req: false },
          { name: 'starting_after', type: 'string', req: false },
        ],
      },
      {
        id: 'refund_charge',
        name: 'refund_charge',
        tk: 32,
        rawTk: 118,
        desc: 'refunds a charge by id. partial amounts supported.',
        source: 'POST /v1/charges/:id/refund',
        params: [
          { name: 'charge_id', type: 'string', req: true },
          { name: 'amount', type: 'number', req: false },
        ],
      },
      {
        id: 'capture_charge',
        name: 'capture_charge',
        tk: 28,
        rawTk: 96,
        desc: 'captures a previously authorized charge.',
        source: 'POST /v1/charges/:id/capture',
        params: [{ name: 'charge_id', type: 'string', req: true }],
      },
    ],
  },
  accounts: {
    label: 'accounts',
    tools: [
      {
        id: 'create_customer',
        name: 'create_customer',
        tk: 41,
        rawTk: 152,
        desc: 'creates a customer record.',
        source: 'POST /v1/customers',
        params: [
          { name: 'email', type: 'string', req: true },
          { name: 'name', type: 'string', req: false },
        ],
      },
      {
        id: 'find_customer',
        name: 'find_customer',
        tk: 35,
        rawTk: 128,
        desc: 'finds a customer by id or email.',
        source: 'GET /v1/customers/search',
        params: [{ name: 'query', type: 'string', req: true }],
      },
      {
        id: 'update_customer',
        name: 'update_customer',
        tk: 33,
        rawTk: 124,
        desc: 'updates customer attributes.',
        source: 'PATCH /v1/customers/:id',
        params: [{ name: 'customer_id', type: 'string', req: true }],
      },
    ],
  },
  plans: {
    label: 'plans',
    tools: [
      {
        id: 'list_plans',
        name: 'list_plans',
        tk: 26,
        rawTk: 88,
        desc: 'lists subscription plans.',
        source: 'GET /v1/plans',
        params: [],
      },
      {
        id: 'subscribe',
        name: 'subscribe',
        tk: 44,
        rawTk: 168,
        desc: 'subscribes a customer to a plan.',
        source: 'POST /v1/subscriptions',
        params: [
          { name: 'customer_id', type: 'string', req: true },
          { name: 'plan_id', type: 'string', req: true },
        ],
      },
    ],
  },
  composite: {
    label: 'composite',
    icon: 'bolt',
    tools: [
      {
        id: 'order_lifecycle',
        name: 'order_lifecycle',
        tk: 62,
        rawTk: 412,
        composite: true,
        desc: 'creates a customer if missing, charges them, returns charge + receipt.',
        source: '3 endpoints merged',
        params: [
          { name: 'email', type: 'string', req: true },
          { name: 'amount', type: 'number', req: true },
          { name: 'currency', type: 'string', req: true },
        ],
      },
      {
        id: 'refund_with_audit',
        name: 'refund_with_audit',
        tk: 48,
        rawTk: 286,
        composite: true,
        desc: 'refunds and writes an audit log entry.',
        source: '2 endpoints merged',
        params: [{ name: 'charge_id', type: 'string', req: true }],
      },
    ],
  },
};

// ─── TokenSaveBadge — tiny "raw → tk · ↓N%" pill (canon parity) ───────────────

interface TokenSaveBadgeProps {
  readonly raw: number | undefined;
  readonly tk: number;
  readonly size?: 'sm' | 'md';
}

function TokenSaveBadge({ raw, tk, size = 'sm' }: TokenSaveBadgeProps): JSX.Element {
  if (raw === undefined || raw <= tk) {
    return <span className="mc-tk">{tk} tk</span>;
  }
  const pct = Math.round((1 - tk / raw) * 100);
  const big = size === 'md';
  return (
    <span
      className="mc-tk-save"
      title={`${raw} tokens raw → ${tk} after compression (${pct}% saved)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontFamily: 'var(--font-mono)',
        fontSize: big ? 11.5 : 10.5,
        padding: big ? '2px 7px' : '1px 5px',
        borderRadius: 3,
        lineHeight: 1.4,
        border: '1px solid var(--border)',
        background: 'var(--paper-alt)',
        color: 'var(--text-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ textDecoration: 'line-through', opacity: 0.55 }}>{raw}</span>
      <span style={{ color: 'var(--text)' }}>→</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{tk}</span>
      <span style={{ color: 'var(--success)', fontWeight: 600, marginLeft: 2 }}>
        ↓{pct}%
      </span>
    </span>
  );
}

// ─── Canvas component ─────────────────────────────────────────────────────────

export interface CanvasProps {
  /** Optional sample (for breadcrumb name). Defaults to "lumen-payments". */
  readonly sample?: { readonly name?: string };
  /** Spec URL pulled from `?spec_url=` — when present, auto-submits on mount. */
  readonly specUrl?: string | undefined;
  /** Optional click handlers (router-wire from page.tsx). */
  readonly onPlay?: () => void;
  readonly onDeploy?: () => void;
  readonly onCmdK?: () => void;
  readonly onBack?: () => void;
}

interface DiffState {
  readonly id: string;
  readonly before: string;
  readonly after: string;
  readonly beforeTk: number;
  readonly afterTk: number;
}

// FNV-1a 32-bit hash → hex. Stable spec_hash for the idempotency key bucket
// so retries on the SAME URL reuse the same key. Lightweight; no crypto dep.
function hashSpecUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function findTool(id: string): CanvasTool | null {
  for (const cat of Object.values(TOOL_DATA)) {
    const found = cat.tools.find((t) => t.id === id);
    if (found !== undefined) return found;
  }
  return null;
}

const ALL_TOOLS: ReadonlyArray<CanvasTool> = Object.values(TOOL_DATA).flatMap(
  (c) => c.tools,
);

const FIRST_TOOL: CanvasTool = TOOL_DATA['transactions']!.tools[0]!;

export function Canvas({
  sample,
  specUrl,
  onPlay,
  onDeploy,
  onCmdK,
  onBack,
}: CanvasProps): JSX.Element {
  const router = useRouter();

  // ─── Auto-submit when arriving with ?spec_url=... ───────────────────────────
  // Latch via ref so React 19 strict-mode double-invoke doesn't fire twice.
  const submittedRef = useRef(false);
  useEffect(() => {
    if (submittedRef.current) return;
    if (specUrl === undefined || specUrl === '') return;

    let parsed: URL;
    try {
      parsed = new URL(specUrl);
    } catch {
      toast('that does not look like a valid url', { kind: 'error' });
      return;
    }

    submittedRef.current = true;
    const url = parsed.toString();
    void (async (): Promise<void> => {
      const result = await submitGeneration({
        specUrl: url,
        specHash: hashSpecUrl(url),
        request: { spec_url: url },
      });
      if (!result.ok) {
        toast(result.error, { kind: 'error' });
        return;
      }
      router.push(`/generate/${encodeURIComponent(result.data.job_id)}`);
    })();
  }, [router, specUrl]);

  // ─── Canvas-local state (canon parity) ─────────────────────────────────────
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({
    transactions: true,
    accounts: true,
    plans: false,
    composite: true,
  });
  const [selected, setSelected] = useState<string>('create_charge');
  const [filter, setFilter] = useState<string>('');
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [tool, setTool] = useState<CanvasTool>(FIRST_TOOL);
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [autoCountdown, setAutoCountdown] = useState<number>(0);
  const [changedSet, setChangedSet] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [editing, setEditing] = useState<boolean>(false);

  // First-visit summary card. Persisted via localStorage so a returning user
  // doesn't see it again, but a fresh tab does.
  const [showSummary, setShowSummary] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return true;
    try {
      return localStorage.getItem('mcpgen_canvas_summary_seen') !== '1';
    } catch {
      return true;
    }
  });
  const dismissSummary = useCallback((): void => {
    setShowSummary(false);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('mcpgen_canvas_summary_seen', '1');
      }
    } catch {
      /* swallow — storage quota or disabled. */
    }
  }, []);

  // Sync detail tool when sidebar selection changes.
  useEffect(() => {
    const t = findTool(selected);
    if (t !== null) setTool(t);
  }, [selected]);

  const acceptDiff = useCallback((): void => {
    if (diff === null) return;
    const { id, after, afterTk } = diff;
    setChangedSet((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    setTool((t) => ({ ...t, tk: afterTk, desc: after }));
    setDiff(null);
    setAutoCountdown(0);
  }, [diff]);

  const revertDiff = useCallback((): void => {
    setDiff(null);
    setAutoCountdown(0);
  }, []);

  const triggerDiff = useCallback((): void => {
    setDiff({
      id: tool.id,
      before: tool.desc,
      after: tool.short ?? 'charges a card. returns charge.',
      beforeTk: tool.tk,
      afterTk: 23,
    });
    setAutoCountdown(3);
  }, [tool]);

  // Auto-accept countdown.
  useEffect(() => {
    if (autoCountdown > 0) {
      const id = setTimeout(() => setAutoCountdown((c) => c - 1), 1000);
      return () => clearTimeout(id);
    }
    if (autoCountdown === 0 && diff !== null) {
      acceptDiff();
    }
    return undefined;
  }, [autoCountdown, diff, acceptDiff]);

  const matchFilter = useCallback(
    (t: CanvasTool): boolean =>
      filter === '' || t.name.includes(filter.toLowerCase()),
    [filter],
  );

  const totalTk = useMemo(
    () =>
      ALL_TOOLS.reduce(
        (s, t) =>
          s + (changedSet.has(t.id) && t.id === tool.id ? tool.tk : t.tk),
        0,
      ),
    [changedSet, tool],
  );

  const onShareClick = useCallback((): void => {
    toast('share link copied · expires in 24 h');
  }, []);

  const onChatLinkClick = useCallback((): void => {
    toast('opening diff inline…');
  }, []);

  // Quick action toasts (canon parity — backend not ready yet).
  const onQAExample = useCallback((): void => {
    toast('drafted example · +18 tk');
  }, []);
  const onQACombine = useCallback((): void => {
    toast('analyzing tool overlap… found 2 candidates');
  }, []);
  const onQATone = useCallback((): void => {
    toast('tone updated to formal across all tools');
  }, []);

  const onDescBlur = useCallback(
    (e: FocusEvent<HTMLTextAreaElement>): void => {
      const next = e.target.value;
      setTool((t) => ({ ...t, desc: next }));
      setEditing(false);
    },
    [],
  );

  const breadcrumb = `${sample?.name ?? 'lumen-payments'}-mcp · draft`;

  return (
    <div className="mc-screen" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={breadcrumb}
        {...(onBack !== undefined ? { onLogo: onBack } : {})}
        right={
          <>
            <Btn kind="ghost" size="sm" icon="cmd" onClick={onCmdK}>
              K
            </Btn>
            <Btn kind="ghost" size="sm" icon="play" onClick={onPlay}>
              test
            </Btn>
            <Btn kind="ghost" size="sm" icon="share" onClick={onShareClick}>
              share
            </Btn>
            <Btn kind="primary" size="sm" icon="cloud" onClick={onDeploy}>
              review &amp; deploy
            </Btn>
          </>
        }
      />

      <div className={`mc-three ${chatOpen ? '' : 'collapsed'}`}>
        {/* Left: tools list */}
        <aside className="mc-pane" style={{ background: 'var(--paper-alt)' }}>
          <div className="row-bw" style={{ marginBottom: 14 }}>
            <span className="mc-caption-up">tools · {ALL_TOOLS.length}</span>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>
              {totalTk} tk
            </span>
          </div>

          <div className="mc-tools-list">
            {Object.entries(TOOL_DATA).map(([key, cat]) => (
              <div key={key}>
                <div
                  className="mc-tool-cat"
                  onClick={() =>
                    setOpenCats((s) => ({ ...s, [key]: !(s[key] ?? false) }))
                  }
                >
                  <Icon name={openCats[key] ? 'caret-d' : 'caret-r'} size={10} />
                  {cat.icon !== undefined ? (
                    <Icon name={cat.icon} size={11} />
                  ) : null}
                  <span>{cat.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, opacity: 0.6 }}>
                    {cat.tools.length}
                  </span>
                </div>
                {openCats[key]
                  ? cat.tools.filter(matchFilter).map((t) => {
                      const isSel = selected === t.id;
                      const liveTk =
                        isSel && t.id === tool.id ? tool.tk : t.tk;
                      const pct =
                        t.rawTk > 0
                          ? Math.round((1 - liveTk / t.rawTk) * 100)
                          : 0;
                      return (
                        <div
                          key={t.id}
                          className={`mc-tool-item ${isSel ? 'sel' : ''}`}
                          onClick={() => setSelected(t.id)}
                        >
                          {changedSet.has(t.id) ? (
                            <span className="dot changed" />
                          ) : null}
                          {t.composite === true ? (
                            <Icon name="bolt" size={10} />
                          ) : null}
                          <span className="name">{t.name}</span>
                          <span
                            className="tk"
                            title={`${t.rawTk} raw → ${liveTk} (↓${pct}%)`}
                          >
                            <span
                              style={{
                                opacity: 0.55,
                                textDecoration: 'line-through',
                                marginRight: 3,
                              }}
                            >
                              {t.rawTk}
                            </span>
                            {liveTk}
                          </span>
                        </div>
                      );
                    })
                  : null}
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div className="mc-caption-up" style={{ marginBottom: 6 }}>
              filter
            </div>
            <input
              className="mc-input mc-mono"
              placeholder="search ⌘F"
              value={filter}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setFilter(e.target.value)
              }
              style={{ height: 32, fontSize: 12 }}
            />
          </div>
        </aside>

        {/* Center: detail */}
        <main className="mc-pane" style={{ overflowY: 'auto' }}>
          {showSummary ? (
            <SummaryCard
              toolCount={ALL_TOOLS.length}
              categoryCount={Object.keys(TOOL_DATA).length}
              compositeCount={Object.values(TOOL_DATA).reduce(
                (s, c) => s + c.tools.filter((t) => t.composite === true).length,
                0,
              )}
              totalTk={totalTk}
              onDismiss={dismissSummary}
            />
          ) : null}

          <div style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 10, marginBottom: 8 }}>
              {tool.composite === true ? (
                <Badge kind="primary" mono={false}>
                  <Icon name="bolt" size={10} /> composite
                </Badge>
              ) : null}
              {changedSet.has(tool.id) ? (
                <Badge kind="accent">edited</Badge>
              ) : null}
              <span className="mc-caption">tools / {tool.id}</span>
            </div>
            <div
              className="mc-h1 mc-mono"
              style={{
                fontStyle: 'normal',
                fontFamily: 'var(--font-mono)',
                fontSize: 28,
              }}
            >
              {tool.name}
            </div>
          </div>

          <div className="mc-rule" style={{ margin: '20px 0' }} />

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel
              right={<TokenSaveBadge raw={tool.rawTk} tk={tool.tk} size="md" />}
            >
              description
            </SectionLabel>
            {!editing && diff === null ? (
              <div
                onClick={() => setEditing(true)}
                style={{
                  fontSize: 15,
                  lineHeight: 1.6,
                  cursor: 'text',
                  padding: 8,
                  marginLeft: -8,
                  borderRadius: 'var(--radius)',
                }}
                title="click to edit"
              >
                &quot;{tool.desc}&quot;
              </div>
            ) : null}
            {editing ? (
              <textarea
                autoFocus
                defaultValue={tool.desc}
                onBlur={onDescBlur}
                style={DESC_TEXTAREA_STYLE}
              />
            ) : null}
            {diff !== null ? (
              <DiffPanel
                diff={diff}
                autoCountdown={autoCountdown}
                onAccept={acceptDiff}
                onRevert={revertDiff}
              />
            ) : null}
          </div>

          {/* Params */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>parameters</SectionLabel>
            <div className="mc-mono" style={{ fontSize: 13 }}>
              {tool.params.length === 0 ? (
                <div className="muted">none</div>
              ) : null}
              {tool.params.map((p) => (
                <div
                  key={p.name}
                  className="row"
                  style={{
                    padding: '6px 0',
                    borderBottom: '1px dashed var(--border)',
                    gap: 12,
                  }}
                >
                  <span style={{ minWidth: 140 }}>{p.name}</span>
                  <span className="muted" style={{ minWidth: 80 }}>
                    {p.type}
                  </span>
                  <span className={p.req ? '' : 'faint'}>
                    {p.req ? 'required' : 'optional'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Source */}
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>source</SectionLabel>
            <div className="mc-code" style={{ background: 'var(--paper-alt)' }}>
              <span className="muted"># mapped from openapi spec</span>
              {'\n'}
              <span style={{ color: 'var(--accent)' }}>
                {tool.source.split(' ')[0]}
              </span>{' '}
              {tool.source.split(' ').slice(1).join(' ')}
            </div>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="sm" icon="spark" onClick={triggerDiff}>
              auto-shorten
            </Btn>
            <Btn kind="ghost" size="sm" onClick={() => setEditing(true)}>
              edit description
            </Btn>
            <Btn kind="ink" size="sm" icon="play" onClick={onPlay}>
              test in playground
            </Btn>
          </div>
        </main>

        {/* Right: chat */}
        {chatOpen ? (
          <aside className="mc-pane" style={{ overflowY: 'auto' }}>
            <div className="row-bw" style={{ marginBottom: 14 }}>
              <SectionLabel>refinement chat</SectionLabel>
              <button
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-sm"
                onClick={() => setChatOpen(false)}
                style={{ padding: '0 6px', height: 22 }}
                aria-label="close chat"
              >
                <Icon name="x" size={11} />
              </button>
            </div>

            <div className="mc-bubble user">
              <small>you · 10:42</small>
              make all descriptions in &apos;transactions&apos; 30% shorter
            </div>
            <div className="mc-bubble">
              <small>mcpgen · 10:42</small>
              rewrote 5 descriptions. saved 124 tokens total.
              <br />
              <span className="muted" style={{ fontSize: 12 }}>
                review changes — orange dots in the list.
              </span>
            </div>
            <div className="mc-bubble user">
              <small>you · 10:43</small>
              add example usage to create_charge
            </div>
            <div className="mc-bubble">
              <small>mcpgen · 10:43</small>
              done. cost: +18 tk.{' '}
              <a
                className="mc-link"
                style={{ cursor: 'pointer' }}
                onClick={onChatLinkClick}
              >
                show diff →
              </a>
            </div>

            <div style={{ marginTop: 18 }}>
              <input
                className="mc-input mc-mono"
                placeholder="ask anything about this server…"
                style={{ height: 38, fontSize: 12.5 }}
              />
              <div className="mc-caption" style={{ marginTop: 6 }}>
                scoped to the server. for one tool, click ✨ on it.
              </div>
            </div>

            <div className="mc-rule-dashed" />
            <div className="mc-caption-up" style={{ marginBottom: 8 }}>
              quick actions
            </div>
            <div className="col" style={{ gap: 6 }}>
              <Btn kind="ghost" size="sm" full onClick={triggerDiff}>
                shorten this tool
              </Btn>
              <Btn kind="ghost" size="sm" full onClick={onQAExample}>
                add example for this tool
              </Btn>
              <Btn kind="ghost" size="sm" full onClick={onQACombine}>
                combine related tools…
              </Btn>
              <Btn kind="ghost" size="sm" full onClick={onQATone}>
                set tone: formal
              </Btn>
            </div>
          </aside>
        ) : (
          <aside
            style={{
              borderLeft: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'center',
              paddingTop: 18,
            }}
          >
            <button
              type="button"
              className="mc-btn mc-btn-ghost mc-btn-sm"
              onClick={() => setChatOpen(true)}
              style={{ padding: '0 8px', height: 32, writingMode: 'vertical-rl' }}
              aria-label="open chat"
            >
              <Icon name="spark" size={12} /> chat
            </button>
          </aside>
        )}
      </div>

      {/* status bar */}
      <div className="mc-statusbar">
        <span>{ALL_TOOLS.length} tools</span>
        <span>{totalTk.toLocaleString()} tokens</span>
        <span style={{ color: 'var(--success)' }}>↓76%</span>
        <span style={{ marginLeft: 'auto' }}>last edit 10s ago</span>
        <span>
          <Icon name="cmd" size={10} /> K
        </span>
      </div>
    </div>
  );
}

// ─── SummaryCard subcomponent (canon first-visit "here's what we made") ──────

interface SummaryCardProps {
  readonly toolCount: number;
  readonly categoryCount: number;
  readonly compositeCount: number;
  readonly totalTk: number;
  readonly onDismiss: () => void;
}

function SummaryCard({
  toolCount,
  categoryCount,
  compositeCount,
  totalTk,
  onDismiss,
}: SummaryCardProps): JSX.Element {
  return (
    <div
      className="mc-card mc-screen"
      style={{
        marginBottom: 22,
        padding: 18,
        borderColor: 'var(--border-sharp)',
        background:
          'linear-gradient(180deg, var(--card) 0%, var(--paper-alt) 100%)',
        position: 'relative',
      }}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="dismiss"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'transparent',
          border: 0,
          cursor: 'pointer',
          color: 'var(--text-muted)',
          padding: 4,
          lineHeight: 0,
        }}
      >
        <Icon name="x" size={12} />
      </button>

      <div className="mc-caption-up" style={{ marginBottom: 8 }}>
        <span className="mc-dot live" style={{ marginRight: 6 }} />
        here&apos;s what we made
      </div>
      <div
        className="mc-h2"
        style={{
          marginBottom: 14,
          fontStyle: 'italic',
          fontFamily: 'var(--font-serif)',
          fontWeight: 400,
          fontSize: 26,
          lineHeight: 1.15,
        }}
      >
        {toolCount} tools · {categoryCount} categories · {totalTk} tk total
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <SummaryStat value={`${toolCount}`} caption="tools (from 348 endpoints)" />
        <SummaryStat
          value={
            <>
              {compositeCount}
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}> ⚡</span>
            </>
          }
          caption="composite (multi-step)"
        />
        <SummaryStat value="↓76%" caption="fewer tokens vs naive" highlight />
      </div>

      <div
        className="row-bw"
        style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}
      >
        <span className="mc-mono muted" style={{ fontSize: 11.5 }}>
          next: review tools (left), shorten with chat (right), then deploy.
        </span>
        <div className="row" style={{ gap: 6 }}>
          <Btn kind="ghost" size="sm" onClick={onDismiss}>
            skip tour
          </Btn>
          <Btn kind="ink" size="sm" iconR="arrow-r" onClick={onDismiss}>
            got it
          </Btn>
        </div>
      </div>
    </div>
  );
}

interface SummaryStatProps {
  readonly value: ReactNode;
  readonly caption: string;
  readonly highlight?: boolean;
}

function SummaryStat({
  value,
  caption,
  highlight = false,
}: SummaryStatProps): JSX.Element {
  const baseStyle: CSSProperties = {
    padding: '10px 12px',
    borderRadius: 'var(--radius)',
  };
  const style: CSSProperties = highlight
    ? {
        ...baseStyle,
        border: '1px solid var(--border-sharp)',
        background: 'var(--primary)',
        color: 'var(--primary-ink)',
      }
    : {
        ...baseStyle,
        border: '1px solid var(--border)',
        background: 'var(--paper)',
      };
  return (
    <div style={style}>
      <div
        className="mc-mono"
        style={{
          fontSize: 22,
          fontWeight: 500,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <div
        className={highlight ? 'mc-mono' : 'mc-caption'}
        style={{
          fontSize: 11,
          marginTop: 4,
          ...(highlight ? { opacity: 0.8 } : {}),
        }}
      >
        {caption}
      </div>
    </div>
  );
}

// ─── DiffPanel subcomponent (canon shorten diff) ─────────────────────────────

interface DiffPanelProps {
  readonly diff: DiffState;
  readonly autoCountdown: number;
  readonly onAccept: () => void;
  readonly onRevert: () => void;
}

function DiffPanel({
  diff,
  autoCountdown,
  onAccept,
  onRevert,
}: DiffPanelProps): JSX.Element {
  const pct = Math.round((1 - diff.afterTk / diff.beforeTk) * 100);
  return (
    <div
      style={{
        border: '1px solid var(--border-sharp)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      <div className="mc-diff-row mc-diff-del">
        <span className="muted">−</span> &quot;{diff.before}&quot;
      </div>
      <div className="mc-diff-row mc-diff-add">
        <span style={{ color: 'var(--success)' }}>+</span> &quot;{diff.after}&quot;
      </div>
      <div
        className="row-bw"
        style={{
          padding: '8px 12px',
          background: 'var(--paper-alt)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <span className="mc-mono" style={{ fontSize: 11.5 }}>
          {diff.beforeTk} →{' '}
          <span style={{ color: 'var(--success)', fontWeight: 600 }}>
            {diff.afterTk} tk
          </span>{' '}
          · ↓{pct}%
        </span>
        <div className="row" style={{ gap: 6 }}>
          <Btn kind="primary" size="sm" icon="check" onClick={onAccept}>
            {autoCountdown > 0 ? `accept (auto ${autoCountdown}s)` : 'accept'}
          </Btn>
          <Btn kind="ghost" size="sm" icon="undo" onClick={onRevert}>
            revert
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DESC_TEXTAREA_STYLE: CSSProperties = {
  width: '100%',
  minHeight: 60,
  padding: 10,
  border: '1px solid var(--border-sharp)',
  borderRadius: 'var(--radius)',
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  outline: 'none',
  background: 'var(--card)',
  color: 'var(--text)',
  resize: 'vertical',
};

export default Canvas;
