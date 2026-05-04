// apps/web/src/components/screens/canvas/canvas.tsx
//
// Canvas screen — post-paste analysis canvas, driven by REAL backend data.
//
// Source of truth: claude-design-reference/canon/screen-canvas.jsx (visual).
// All numerical content (tool list, endpoint count, totals) flows from the
// running BFF job — no canon-static TOOL_DATA literal.
//
// Behaviors:
//   * `?spec_url=...` query → POST /api/v1/generate, then redirect to
//     /generate/[jobId] (same as before).
//   * `jobId` prop (from /generate/[jobId] route) → poll BFF status via
//     `useJob` and render real `partial_result.final_tools` once Pass 5 has
//     completed. While waiting: render canon's empty/loading state, NOT
//     canon's static TOOL_DATA literals.
//   * Refinement chat / quick-action toasts kept verbatim (canon parity —
//     backend not implemented).

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
import { submitGeneration } from '@/lib/api/generate';
import { useJob } from '@/lib/api/jobs';
import { toast } from '@/lib/toast';

// ─── Types from real engine output (Pass 5 final tools) ──────────────────────
//
// We accept a minimal shape — engine pass 5 yields tool objects with at least
// `name` (str), `description` (str), `inputSchema.properties` (record), and
// optionally `tk` / `raw_tk` token estimates. Anything missing → graceful
// fallback to "…" or hidden.

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
  readonly source: string;
  readonly params: ReadonlyArray<CanvasParam>;
  readonly composite?: boolean;
  readonly category: string;
}

interface CanvasCategory {
  readonly label: string;
  readonly tools: ReadonlyArray<CanvasTool>;
}

// Adapt a free-form engine tool blob into a `CanvasTool`. Conservative — any
// missing field becomes a placeholder; the screen never invents numbers.
function adaptTool(raw: unknown): CanvasTool | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? r['name'] : null;
  if (name === null || name === '') return null;

  const description = typeof r['description'] === 'string' ? r['description'] : '';
  const isWorkflow = r['type'] === 'workflow';
  const sourceEndpoints = Array.isArray(r['source_endpoints'])
    ? (r['source_endpoints'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];

  // inputSchema.properties — JSON Schema object map.
  const schema = (r['inputSchema'] ?? r['input_schema']) as Record<string, unknown> | undefined;
  const properties = (schema?.['properties'] ?? {}) as Record<string, unknown>;
  const requiredList = Array.isArray(schema?.['required'])
    ? (schema!['required'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  const params: ReadonlyArray<CanvasParam> = Object.entries(properties).map(
    ([pname, pschema]) => {
      const ps = (pschema ?? {}) as Record<string, unknown>;
      const type = typeof ps['type'] === 'string' ? ps['type'] : 'unknown';
      return { name: pname, type, req: requiredList.includes(pname) };
    },
  );

  // Token estimates — engine may surface `tk`/`raw_tk`/`tokens`/`raw_tokens`;
  // until pass 5 emits these we conservatively return 0 and let the badge
  // collapse to a single number (no fake savings %).
  const tk =
    typeof r['tk'] === 'number'
      ? (r['tk'] as number)
      : typeof r['tokens'] === 'number'
        ? (r['tokens'] as number)
        : 0;
  const rawTk =
    typeof r['raw_tk'] === 'number'
      ? (r['raw_tk'] as number)
      : typeof r['raw_tokens'] === 'number'
        ? (r['raw_tokens'] as number)
        : 0;

  // Category bucket — default "tools"; known engine tags map to friendlier
  // canon labels.
  const rawCat = typeof r['category'] === 'string' ? r['category'] : null;
  const rawType = typeof r['type'] === 'string' ? r['type'] : null;
  const category = rawCat ?? rawType ?? 'tools';

  const out: CanvasTool = {
    id: name,
    name,
    tk,
    rawTk,
    desc: description,
    source: sourceEndpoints[0] ?? '',
    params,
    category,
    ...(isWorkflow ? { composite: true } : {}),
  };
  return out;
}

// Group tools by `category` while preserving insertion order.
function groupByCategory(tools: ReadonlyArray<CanvasTool>): Record<string, CanvasCategory> {
  const out: Record<string, CanvasCategory> = {};
  for (const t of tools) {
    const existing = out[t.category];
    if (existing === undefined) {
      out[t.category] = { label: t.category, tools: [t] };
    } else {
      out[t.category] = { label: existing.label, tools: [...existing.tools, t] };
    }
  }
  return out;
}

// ─── TokenSaveBadge ──────────────────────────────────────────────────────────

interface TokenSaveBadgeProps {
  readonly raw: number | undefined;
  readonly tk: number;
  readonly size?: 'sm' | 'md';
}

function TokenSaveBadge({ raw, tk, size = 'sm' }: TokenSaveBadgeProps): JSX.Element {
  if (raw === undefined || raw <= tk || tk === 0) {
    return <span className="mc-tk">{tk > 0 ? `${tk} tk` : '— tk'}</span>;
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
  readonly sample?: { readonly name?: string };
  /** Spec URL pulled from `?spec_url=` — when present, auto-submits on mount. */
  readonly specUrl?: string | undefined;
  /** Job ID (when arriving on /generate/[jobId]). */
  readonly jobId?: string | undefined;
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

// FNV-1a 32-bit hash → hex idempotency bucket for the spec URL.
function hashSpecUrl(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i += 1) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Derive a human-readable server slug from a spec URL hostname. Strips common
// API subdomain prefixes and TLDs so `https://petstore3.swagger.io/api/v3/openapi.json`
// → `petstore3`. Falls back to `mcp-server` when parsing fails.
export function deriveServerNameFromSpecUrl(url: string | undefined): string {
  if (url === undefined || url === '') return 'mcp-server';
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // Take leftmost label that isn't a generic prefix.
    const labels = host.split('.').filter((l) => l !== '');
    if (labels.length === 0) return 'mcp-server';
    const skip = new Set(['www', 'api', 'docs', 'developer', 'developers']);
    const first = labels.find((l) => !skip.has(l)) ?? labels[0]!;
    // Sanitize to slug.
    const slug = first.replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
    return slug !== '' ? slug : 'mcp-server';
  } catch {
    return 'mcp-server';
  }
}

export function Canvas({
  sample,
  specUrl,
  jobId,
  onPlay,
  onDeploy,
  onCmdK,
  onBack,
}: CanvasProps): JSX.Element {
  const router = useRouter();

  // Fire LLM cache warmup the moment the user lands on /generate (paste
  // form). Even if they came directly here without visiting / first,
  // the de-duped client will still warm the upstream prefix cache so
  // their POST /generate hits a hot provider.
  useEffect(() => {
    if (jobId !== undefined && jobId !== '') return; // post-gen view, no warmup needed
    void import('@/lib/api/warmup').then((m) => m.fireWarmup());
  }, [jobId]);

  // ─── Auto-submit when arriving with ?spec_url=... ───────────────────────────
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
      // Canon flow: paste -> REVIEW (preview) -> AUTH -> STREAM -> CANVAS.
      // After a job is created we land on /preview so the user can see the
      // detected format/endpoints/auth before the heavy LLM passes finish.
      router.push(`/generate/${encodeURIComponent(result.data.job_id)}/preview`);
    })();
  }, [router, specUrl]);

  // ─── Real backend data ──────────────────────────────────────────────────────
  // Poll the BFF every 1.5s while the job is in-flight so freshly-completed
  // passes show up. Disabled when there is no jobId (i.e. the un-wired
  // /generate landing canvas without a query param).
  const jobQuery = useJob(
    jobId,
    jobId !== undefined ? { refetchIntervalMs: 1500 } : undefined,
  );
  const job = jobQuery.data?.ok === true ? jobQuery.data.data : null;
  const partial = job?.partial_result ?? null;
  // BFF surfaces `spec_name` once Pass 1 has run — it's the smart-id prefix
  // (e.g. "stripe", "petstore"). Until then we derive a slug from the spec URL
  // hostname so the breadcrumb stops claiming "lumen-payments" for every job.
  const specNameFromJob =
    partial !== null && typeof partial.spec_name === 'string' && partial.spec_name !== ''
      ? partial.spec_name
      : null;
  const specNameFromUrl = deriveServerNameFromSpecUrl(specUrl);
  const derivedServerName: string =
    sample?.name ?? specNameFromJob ?? specNameFromUrl;

  // Endpoint count from Stage A (available within ~1s of submit).
  const endpointCount: number | null =
    partial !== null && typeof partial.endpoint_count === 'number'
      ? partial.endpoint_count
      : null;

  // Final tools list — populated once Pass 5 has completed and the BFF has
  // proxied artifacts (`/api/v1/generate/{job_id}/artifacts`). Until then
  // `final_tools` is undefined → empty list.
  const realTools: ReadonlyArray<CanvasTool> = useMemo(() => {
    if (partial === null) return [];
    const ft = partial.final_tools;
    if (!Array.isArray(ft)) return [];
    return ft
      .map((t) => adaptTool(t))
      .filter((t): t is CanvasTool => t !== null);
  }, [partial]);

  const grouped = useMemo(() => groupByCategory(realTools), [realTools]);
  const groupedKeys = useMemo(() => Object.keys(grouped), [grouped]);

  const ALL_TOOLS = realTools;

  const findTool = useCallback(
    (id: string): CanvasTool | null =>
      ALL_TOOLS.find((t) => t.id === id) ?? null,
    [ALL_TOOLS],
  );

  // ─── Canvas-local state ─────────────────────────────────────────────────────
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string>('');
  const [filter, setFilter] = useState<string>('');
  const [chatOpen, setChatOpen] = useState<boolean>(true);
  const [tool, setTool] = useState<CanvasTool | null>(null);
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [autoCountdown, setAutoCountdown] = useState<number>(0);
  const [changedSet, setChangedSet] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [editing, setEditing] = useState<boolean>(false);

  // When tools first arrive, auto-select the first one + auto-open all cats.
  useEffect(() => {
    if (ALL_TOOLS.length === 0) return;
    setOpenCats((prev) => {
      const next = { ...prev };
      for (const k of groupedKeys) {
        if (next[k] === undefined) next[k] = true;
      }
      return next;
    });
    setSelected((prev) => {
      if (prev !== '' && ALL_TOOLS.some((t) => t.id === prev)) return prev;
      return ALL_TOOLS[0]!.id;
    });
  }, [ALL_TOOLS, groupedKeys]);

  // Sync detail tool when sidebar selection changes.
  useEffect(() => {
    if (selected === '') {
      setTool(null);
      return;
    }
    const t = findTool(selected);
    if (t !== null) setTool(t);
  }, [selected, findTool]);

  // First-visit summary card.
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
      /* swallow */
    }
  }, []);

  const acceptDiff = useCallback((): void => {
    if (diff === null || tool === null) return;
    const { id, after, afterTk } = diff;
    setChangedSet((s) => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    setTool({ ...tool, tk: afterTk, desc: after });
    setDiff(null);
    setAutoCountdown(0);
  }, [diff, tool]);

  const revertDiff = useCallback((): void => {
    setDiff(null);
    setAutoCountdown(0);
  }, []);

  const triggerDiff = useCallback((): void => {
    if (tool === null) return;
    setDiff({
      id: tool.id,
      before: tool.desc,
      after: tool.desc.length > 60 ? tool.desc.slice(0, 60) + '…' : tool.desc,
      beforeTk: tool.tk,
      afterTk: Math.max(1, Math.floor(tool.tk * 0.6)),
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
          s + (changedSet.has(t.id) && tool !== null && t.id === tool.id ? tool.tk : t.tk),
        0,
      ),
    [ALL_TOOLS, changedSet, tool],
  );

  const totalRawTk = useMemo(
    () => ALL_TOOLS.reduce((s, t) => s + t.rawTk, 0),
    [ALL_TOOLS],
  );

  const compressionPct =
    totalRawTk > 0 && totalTk < totalRawTk
      ? Math.round((1 - totalTk / totalRawTk) * 100)
      : 0;

  const onShareClick = useCallback((): void => {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined && typeof window !== 'undefined') {
      void navigator.clipboard
        .writeText(window.location.href)
        .then(() => toast('share link copied'))
        .catch(() => toast('share link copy failed', { kind: 'error' }));
      return;
    }
    toast('share link copied · expires in 24 h');
  }, []);
  // Default top-bar handlers — wired only when no parent override is supplied.
  // Gated on jobId so they collapse to a friendly stub when the canvas is on
  // /generate without a real job context.
  const onCmdKDefault = useCallback((): void => {
    toast('command palette: not yet wired', { kind: 'info' });
  }, []);
  const onPlayDefault = useCallback((): void => {
    if (jobId === undefined || jobId === '') {
      toast('start a generation first', { kind: 'info' });
      return;
    }
    router.push(`/generate/${encodeURIComponent(jobId)}/playground`);
  }, [router, jobId]);
  const onDeployDefault = useCallback((): void => {
    if (jobId === undefined || jobId === '') {
      toast('start a generation first', { kind: 'info' });
      return;
    }
    // Canon flow: canvas "review & deploy" goes to QUALITY first, not
    // straight to deploy. The /quality screen owns "continue -> deploy"
    // so quality scores can't be silently skipped.
    router.push(`/generate/${encodeURIComponent(jobId)}/quality`);
  }, [router, jobId]);
  const cmdKHandler = onCmdK ?? onCmdKDefault;
  const playHandler = onPlay ?? onPlayDefault;
  const deployHandler = onDeploy ?? onDeployDefault;
  const onChatLinkClick = useCallback((): void => {
    toast('opening diff inline…');
  }, []);
  const onQAExample = useCallback((): void => {
    toast('drafted example');
  }, []);
  const onQACombine = useCallback((): void => {
    toast('analyzing tool overlap…');
  }, []);
  const onQATone = useCallback((): void => {
    toast('tone updated to formal across all tools');
  }, []);

  const onDescBlur = useCallback(
    (e: FocusEvent<HTMLTextAreaElement>): void => {
      const next = e.target.value;
      if (tool === null) return;
      setTool({ ...tool, desc: next });
      setEditing(false);
    },
    [tool],
  );

  // Drop the "draft" tag once the engine has emitted a quality_report (i.e.
  // generation is terminal-complete and the user is reviewing real output).
  const isComplete =
    partial !== null && partial.quality_report !== null && partial.quality_report !== undefined;
  const breadcrumb = `${derivedServerName}-mcp${isComplete ? '' : ' · draft'}`;

  // Derived loading state — shown when no jobId or no tools yet.
  const isLoading = jobId !== undefined && ALL_TOOLS.length === 0;
  const isEmpty = jobId === undefined && ALL_TOOLS.length === 0;

  const compositeCount = useMemo(
    () => ALL_TOOLS.filter((t) => t.composite === true).length,
    [ALL_TOOLS],
  );

  return (
    <div className="mc-screen" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={breadcrumb}
        {...(onBack !== undefined ? { onLogo: onBack } : {})}
        right={
          <>
            <Btn kind="ghost" size="sm" icon="cmd" onClick={cmdKHandler}>
              K
            </Btn>
            <Btn kind="ghost" size="sm" icon="play" onClick={playHandler}>
              test
            </Btn>
            <Btn kind="ghost" size="sm" icon="share" onClick={onShareClick}>
              share
            </Btn>
            <Btn kind="primary" size="sm" icon="cloud" onClick={deployHandler}>
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
              {totalTk > 0 ? `${totalTk} tk` : '—'}
            </span>
          </div>

          <div className="mc-tools-list">
            {isLoading ? (
              <div className="mc-mono muted" style={{ fontSize: 12, padding: 8 }}>
                loading tools…
              </div>
            ) : isEmpty ? (
              <div className="mc-mono muted" style={{ fontSize: 12, padding: 8 }}>
                paste a spec url to begin
              </div>
            ) : null}
            {Object.entries(grouped).map(([key, cat]) => (
              <div key={key}>
                <div
                  className="mc-tool-cat"
                  onClick={() =>
                    setOpenCats((s) => ({ ...s, [key]: !(s[key] ?? false) }))
                  }
                >
                  <Icon name={openCats[key] ? 'caret-d' : 'caret-r'} size={10} />
                  <span>{cat.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, opacity: 0.6 }}>
                    {cat.tools.length}
                  </span>
                </div>
                {openCats[key]
                  ? cat.tools.filter(matchFilter).map((t) => {
                      const isSel = selected === t.id;
                      const liveTk =
                        isSel && tool !== null && t.id === tool.id ? tool.tk : t.tk;
                      const pct =
                        t.rawTk > 0 && liveTk > 0
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
                            {t.rawTk > 0 ? (
                              <span
                                style={{
                                  opacity: 0.55,
                                  textDecoration: 'line-through',
                                  marginRight: 3,
                                }}
                              >
                                {t.rawTk}
                              </span>
                            ) : null}
                            {liveTk > 0 ? liveTk : '—'}
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
              categoryCount={Object.keys(grouped).length}
              compositeCount={compositeCount}
              totalTk={totalTk}
              endpointCount={endpointCount}
              compressionPct={compressionPct}
              onDismiss={dismissSummary}
            />
          ) : null}

          {tool === null ? (
            <div className="mc-mono muted" style={{ padding: 24 }}>
              {isLoading ? 'waiting for the engine to finish pass 5…' : 'no tool selected'}
            </div>
          ) : (
            <>
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

              <div style={{ marginBottom: 24 }}>
                <SectionLabel>source</SectionLabel>
                <div className="mc-code" style={{ background: 'var(--paper-alt)' }}>
                  <span className="muted"># mapped from openapi spec</span>
                  {'\n'}
                  {tool.source !== '' ? (
                    <>
                      <span style={{ color: 'var(--accent)' }}>
                        {tool.source.split(' ')[0]}
                      </span>{' '}
                      {tool.source.split(' ').slice(1).join(' ')}
                    </>
                  ) : (
                    <span className="muted">(source endpoints not yet available)</span>
                  )}
                </div>
              </div>

              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ghost" size="sm" icon="spark" onClick={triggerDiff}>
                  auto-shorten
                </Btn>
                <Btn kind="ghost" size="sm" onClick={() => setEditing(true)}>
                  edit description
                </Btn>
                <Btn kind="ink" size="sm" icon="play" onClick={playHandler}>
                  test in playground
                </Btn>
              </div>
            </>
          )}
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

            <div className="mc-bubble">
              <small>mcpgen · ready</small>
              ask anything about the tools on the left, or use the quick
              actions below to refine.
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
              <Btn kind="ghost" size="sm" full onClick={onChatLinkClick}>
                show diff
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
        <span>{totalTk > 0 ? `${totalTk.toLocaleString()} tokens` : '— tokens'}</span>
        {compressionPct > 0 ? (
          <span style={{ color: 'var(--success)' }}>↓{compressionPct}%</span>
        ) : null}
        <span style={{ marginLeft: 'auto' }}>
          {jobId !== undefined ? `job ${jobId.slice(0, 16)}…` : 'no job'}
        </span>
        <span>
          <Icon name="cmd" size={10} /> K
        </span>
      </div>
    </div>
  );
}

// ─── SummaryCard subcomponent ────────────────────────────────────────────────

interface SummaryCardProps {
  readonly toolCount: number;
  readonly categoryCount: number;
  readonly compositeCount: number;
  readonly totalTk: number;
  readonly endpointCount: number | null;
  readonly compressionPct: number;
  readonly onDismiss: () => void;
}

function SummaryCard({
  toolCount,
  categoryCount,
  compositeCount,
  totalTk,
  endpointCount,
  compressionPct,
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
        {toolCount > 0
          ? `${toolCount} tools · ${categoryCount} categories · ${totalTk > 0 ? `${totalTk} tk total` : 'tokens pending'}`
          : 'analyzing your spec…'}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <SummaryStat
          value={`${toolCount}`}
          caption={
            endpointCount !== null
              ? `tools (from ${endpointCount} endpoints)`
              : 'tools'
          }
        />
        <SummaryStat
          value={
            <>
              {compositeCount}
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}> ⚡</span>
            </>
          }
          caption="composite (multi-step)"
        />
        <SummaryStat
          value={compressionPct > 0 ? `↓${compressionPct}%` : '—'}
          caption="fewer tokens vs naive"
          highlight
        />
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

// ─── DiffPanel subcomponent ──────────────────────────────────────────────────

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
  const pct = diff.beforeTk > 0 ? Math.round((1 - diff.afterTk / diff.beforeTk) * 100) : 0;
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
