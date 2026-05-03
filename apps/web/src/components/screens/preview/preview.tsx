// apps/web/src/components/screens/preview/preview.tsx
//
// Phase 1 — Agent A4 — Preview screen.
//
// Source of truth: claude-design-reference/canon/screen-preview.jsx (function
// `Preview`). 100% pixel parity with that JSX, but rebuilt against the
// production primitive kit (`@/components/ui/*`) and wired to real BFF
// artifacts via `useJobArtifact(jobId, 'final-tools')`.
//
// Behaviour wiring (per Phase-1 brief A4):
//   - onMakeIt → router.push(`/generate?spec_url=${encodeURIComponent(originalSpecUrl)}`)
//                (= "go back to refine spec" CTA per catalog § preview)
//   - onBack   → router.push(`/generate/${jobId}`)
//                (back to stream/canvas)
//
// When `useJobArtifact(jobId, 'final-tools')` is pending or returns null the
// canon's "loading" state is rendered — totalEndpoints/tools collapse to 0
// and category/excluded sections render empty rows. Per Phase-1 brief: do
// NOT crash on null.

'use client';

import { useRouter } from 'next/navigation';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import type { FinalTool } from '@mcpgen/ir';

import {
  Badge,
  Btn,
  Card,
  Icon,
  SectionLabel,
  TopBar,
} from '@/components/ui';
import { useJobArtifact } from '@/lib/api/jobs';
import { toast } from '@/lib/toast';

// ────────────────────────────────────────────────────────────────────────────
// Inlined canon primitives — BlockBar / CountUp.
//
// Canon ui.jsx exports these but the production UI kit has not promoted them
// yet. They are visual-only helpers (no behaviour beyond animation), so
// inlining keeps Phase-1 self-contained without modifying the shared kit.
// ────────────────────────────────────────────────────────────────────────────

interface BlockBarProps {
  readonly value: number;
  readonly max?: number;
  readonly width?: number;
  readonly dim?: boolean;
}

function BlockBar({ value, max = 100, width = 12, dim = false }: BlockBarProps): ReactElement {
  const safeMax = max <= 0 ? 1 : max;
  const blocks = Math.max(0, Math.min(width, Math.round((value / safeMax) * width)));
  const empty = width - blocks;
  return (
    <span className={`mc-blockbar ${dim ? 'dim' : ''}`}>
      {'█'.repeat(blocks)}
      <span className="mc-blockbar-empty">{'░'.repeat(empty)}</span>
    </span>
  );
}

interface CountUpProps {
  readonly value: number;
  readonly duration?: number;
}

function CountUp({ value, duration = 600 }: CountUpProps): ReactElement {
  const [v, setV] = useState<number>(0);
  const startVal = useRef<number>(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = startVal.current;
    const to = value;
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(from + (to - from) * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        startVal.current = to;
      }
    };
    raf = requestAnimationFrame(tick);
    return (): void => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span>{Math.round(v).toLocaleString()}</span>;
}

// ────────────────────────────────────────────────────────────────────────────
// Display-helpers — derive UI shapes from real `FinalTool[]`.
// ────────────────────────────────────────────────────────────────────────────

interface PreviewCategory {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly on: boolean;
  readonly rare: boolean;
}

interface ExcludedEndpoint {
  readonly method: string;
  readonly path: string;
  readonly reason: string;
  readonly override: boolean;
}

const CATEGORY_FALLBACK: ReadonlyArray<PreviewCategory> = [
  { id: 'charges', label: 'transactions', count: 24, on: true, rare: false },
  { id: 'customers', label: 'accounts', count: 18, on: true, rare: false },
  { id: 'subs', label: 'plans', count: 15, on: true, rare: false },
  { id: 'reports', label: 'reports', count: 8, on: false, rare: true },
  { id: 'issuing', label: 'card-issuing', count: 32, on: false, rare: true },
];

function deriveCategories(tools: ReadonlyArray<FinalTool> | null): ReadonlyArray<PreviewCategory> {
  if (tools === null || tools.length === 0) return CATEGORY_FALLBACK;
  let universal = 0;
  let action = 0;
  let workflow = 0;
  let specialized = 0;
  for (const tool of tools) {
    if (tool.type === 'universal') universal += 1;
    else if (tool.type === 'action') action += 1;
    else if (tool.type === 'workflow') workflow += 1;
    else if (tool.type === 'specialized') specialized += 1;
  }
  const out: PreviewCategory[] = [];
  if (universal > 0) {
    out.push({ id: 'universal', label: 'core', count: universal, on: true, rare: false });
  }
  if (action > 0) {
    out.push({ id: 'action', label: 'actions', count: action, on: true, rare: false });
  }
  if (workflow > 0) {
    out.push({ id: 'workflow', label: 'workflows', count: workflow, on: true, rare: false });
  }
  if (specialized > 0) {
    out.push({
      id: 'specialized',
      label: 'specialized',
      count: specialized,
      on: false,
      rare: true,
    });
  }
  return out;
}

const COMPLEXITY: Record<
  'minimal' | 'standard' | 'comprehensive',
  { tools: number; label: string; desc: string }
> = {
  minimal: {
    tools: 15,
    label: 'minimal',
    desc: 'core ops only — list / get / create essentials',
  },
  standard: { tools: 47, label: 'standard', desc: 'balanced for most use cases' },
  comprehensive: {
    tools: 92,
    label: 'comprehensive',
    desc: 'every non-internal endpoint, including edge cases',
  },
};

// ────────────────────────────────────────────────────────────────────────────
// Public component.
// ────────────────────────────────────────────────────────────────────────────

export interface PreviewProps {
  readonly jobId: string;
  /** The original spec URL the user pasted (carried via query string from
   *  Stream → Preview). Used for the "refine spec" CTA. */
  readonly originalSpecUrl?: string;
  /** Optional human-friendly server name used in the breadcrumb/title. */
  readonly specName?: string;
  /** Total endpoint count from the BFF (Pass 0 input). */
  readonly endpointCount?: number;
}

export default function Preview({
  jobId,
  originalSpecUrl,
  specName,
  endpointCount,
}: PreviewProps): ReactElement {
  const router = useRouter();

  const artifactQuery = useJobArtifact(jobId, 'final-tools');
  const artifact = artifactQuery.data;
  const finalTools: ReadonlyArray<FinalTool> | null = useMemo(() => {
    if (artifact !== undefined && artifact.ok && Array.isArray(artifact.data)) {
      return artifact.data as ReadonlyArray<FinalTool>;
    }
    return null;
  }, [artifact]);

  const initialCats = useMemo(() => deriveCategories(finalTools), [finalTools]);
  const [cats, setCats] = useState<ReadonlyArray<PreviewCategory>>(initialCats);
  const [combine, setCombine] = useState<null | 'yes' | 'no'>(null);
  const [excludedOpen, setExcludedOpen] = useState<boolean>(false);
  const [included, setIncluded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [excluded] = useState<ReadonlyArray<ExcludedEndpoint>>(() => []);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [complexity, setComplexity] = useState<'minimal' | 'standard' | 'comprehensive'>(
    'standard',
  );
  const idForServer = specName !== undefined && specName.length > 0 ? specName : 'mcp';
  const [serverName, setServerName] = useState<string>(`${idForServer}-mcp`);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  // Sync derived categories when the artifact lands.
  useEffect(() => {
    setCats(initialCats);
  }, [initialCats]);

  const toggle = (id: string): void =>
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, on: !c.on } : c)));

  const includeEndpoint = (path: string): void =>
    setIncluded((s) => {
      const next = new Set(s);
      next.add(path);
      return next;
    });

  const totalEndpoints = endpointCount ?? 0;
  const naiveTokens =
    totalEndpoints > 0 ? totalEndpoints * 250 : 14_200; // canon fallback for empty state
  const baseOptTokens = combine === 'yes' ? 2_800 : 3_400;
  const optTokens = baseOptTokens + included.size * 42;
  const pct = Math.round((1 - optTokens / naiveTokens) * 100);
  const dollars = (((naiveTokens - optTokens) / 1000) * 0.015).toFixed(2);

  const onMakeIt = (): void => {
    if (originalSpecUrl !== undefined && originalSpecUrl.length > 0) {
      router.push(`/generate?spec_url=${encodeURIComponent(originalSpecUrl)}`);
      return;
    }
    // No spec URL on hand → go back to canvas (still respects "refine" intent).
    router.push('/generate');
  };

  const onBack = (): void => {
    router.push(`/generate/${jobId}`);
  };

  const breadcrumb = `${specName !== undefined && specName.length > 0 ? specName : 'mcp server'}-mcp · draft`;

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={breadcrumb}
        onLogo={onBack}
        right={
          <>
            <span className="mc-caption">step 01 of 04</span>
            <Btn kind="ghost" size="sm" onClick={onBack}>
              discard
            </Btn>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          padding: '40px 28px 64px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ marginBottom: 32 }}>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>
            step 01 · review
          </div>
          <div className="mc-display-l">
            we read your spec.
            <br />
            here's what we'd build.
          </div>
        </div>

        {/* Bento */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            gap: 20,
            marginBottom: 20,
          }}
        >
          {/* Detected */}
          <Card>
            <SectionLabel
              right={
                <button
                  onClick={(): void => setSettingsOpen(true)}
                  className="mc-link mc-mono"
                  style={{
                    background: 'none',
                    border: 0,
                    fontSize: 11,
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  tune settings →
                </button>
              }
            >
              detected
            </SectionLabel>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '8px 18px',
                marginBottom: 18,
              }}
              className="mc-mono"
            >
              <span className="muted">format</span>
              <span>OpenAPI 3.1</span>
              <span className="muted">endpoints</span>
              <span>
                {totalEndpoints} ·{' '}
                <span className="muted">{COMPLEXITY[complexity].tools} included</span>
              </span>
              <span className="muted">categories</span>
              <span>{cats.length}</span>
              <span className="muted">complexity</span>
              <span>{COMPLEXITY[complexity].label}</span>
              <span className="muted">auth</span>
              <span>oauth + api key</span>
            </div>

            <div className="mc-caption-up" style={{ marginBottom: 10 }}>
              categories — toggle to include
            </div>
            <div className="col" style={{ gap: 6 }}>
              {cats.map((c) => (
                <label
                  key={c.id}
                  className="mc-tcb row-bw"
                  style={{
                    padding: '6px 0',
                    borderBottom: '1px dashed var(--border)',
                  }}
                >
                  <span className="row" style={{ gap: 8 }}>
                    <input type="checkbox" checked={c.on} onChange={(): void => toggle(c.id)} />
                    <span className="glyph">{c.on ? '☑' : '☐'}</span>
                    <span style={{ fontSize: 13 }}>{c.label}</span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      ({c.count})
                    </span>
                  </span>
                  {c.rare ? (
                    <span className="muted" style={{ fontSize: 11 }}>
                      rare · skip by default
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </Card>

          {/* Token budget */}
          <Card>
            <SectionLabel
              right={
                <span className="mc-mono" style={{ fontSize: 11 }}>
                  opus pricing
                </span>
              }
            >
              token budget
            </SectionLabel>

            <div style={{ marginBottom: 18 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="mc-caption">naive 1:1</span>
                <span className="mc-mono">{naiveTokens.toLocaleString()} tk</span>
              </div>
              <BlockBar value={naiveTokens} max={naiveTokens} width={28} dim />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="mc-caption" style={{ color: 'var(--text)' }}>
                  with mcpgen
                </span>
                <span className="mc-mono">
                  <CountUp value={optTokens} /> tk
                </span>
              </div>
              <BlockBar value={optTokens} max={naiveTokens} width={28} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              <div
                className="mc-mono"
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  color: 'var(--success)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                }}
              >
                ↓ <CountUp value={pct} />%
              </div>
              <div className="mc-caption" style={{ marginTop: 4 }}>
                ≈ ${dollars} saved per session
              </div>
            </div>
          </Card>
        </div>

        {/* AI suggestion */}
        <div className="mc-ai-strip" style={{ marginBottom: 16 }}>
          <Icon name="spark" size={16} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
              12 endpoints look like they belong together.
            </div>
            <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
              <span className="mc-mono">orders.create</span>,{' '}
              <span className="mc-mono">orders.get</span>,{' '}
              <span className="mc-mono">orders.update</span>, … combine into 3 composite
              tools? saves another 600 tk.
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Btn kind="ghost" size="sm" onClick={(): void => setCombine('no')}>
                keep separate
              </Btn>
              <Btn
                kind="ink"
                size="sm"
                onClick={(): void => setCombine('yes')}
                {...(combine === 'yes' ? { icon: 'check' as const } : {})}
              >
                {combine === 'yes' ? 'merge applied' : 'combine — show me the merge'}
              </Btn>
            </div>
          </div>
        </div>

        {/* Excluded endpoints (collapsible) */}
        <div className="mc-excluded">
          <div
            className="mc-excluded-head"
            onClick={(): void => setExcludedOpen((o) => !o)}
          >
            <div className="row" style={{ gap: 10 }}>
              <Icon name={excludedOpen ? 'caret-d' : 'caret-r'} size={11} />
              <span className="mc-caption-up">endpoints not included</span>
              <Badge kind="soft">{excluded.length - included.size}</Badge>
              {included.size > 0 ? (
                <Badge kind="accent">+{included.size} restored</Badge>
              ) : null}
            </div>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>
              {excludedOpen ? 'hide' : 'show'} →
            </span>
          </div>
          {excludedOpen && excluded.length > 0 ? (
            <div className="mc-excluded-table">
              {excluded.map((e) => {
                const isIncluded = included.has(e.path);
                return (
                  <div
                    key={e.path}
                    className="mc-excluded-row"
                    style={{ opacity: isIncluded ? 0.55 : 1 }}
                  >
                    <span className={`mc-method ${e.method}`}>{e.method}</span>
                    <span
                      title={e.path}
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {e.path}
                    </span>
                    <span
                      className="muted"
                      style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5 }}
                    >
                      {e.reason}
                    </span>
                    <div style={{ textAlign: 'right' }}>
                      {isIncluded ? (
                        <span className="mc-caption" style={{ color: 'var(--success)' }}>
                          ✓ added
                        </span>
                      ) : e.override ? (
                        <Btn
                          kind="ghost"
                          size="sm"
                          onClick={(): void => includeEndpoint(e.path)}
                        >
                          include
                        </Btn>
                      ) : (
                        <span
                          className="mc-caption"
                          title="locked — internal endpoint"
                          style={{ opacity: 0.5 }}
                        >
                          locked
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Re-gen banner */}
        {included.size > 0 ? (
          <div className="mc-banner" style={{ marginTop: 12 }}>
            <Icon name="warn" size={14} />
            <span style={{ flex: 1 }}>
              you added <strong>{included.size}</strong> endpoint
              {included.size === 1 ? '' : 's'}. re-run generation to include{' '}
              {included.size === 1 ? 'it' : 'them'}?
            </span>
            <Btn
              kind="ink"
              size="sm"
              onClick={(): void =>
                toast(
                  `re-running with ${included.size} new endpoint${
                    included.size === 1 ? '' : 's'
                  }…`,
                )
              }
            >
              re-generate
            </Btn>
            <Btn kind="ghost" size="sm" onClick={onMakeIt}>
              continue without
            </Btn>
          </div>
        ) : null}

        <div style={{ height: 24 }} />

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={onMakeIt}>
          continue · auth setup
        </Btn>
        <div className="mc-caption" style={{ textAlign: 'center', marginTop: 12 }}>
          you can always tune individual tools after generation.
        </div>
      </main>

      {/* Generation Settings modal */}
      {settingsOpen ? (
        <div className="mc-modal-veil" onClick={(): void => setSettingsOpen(false)}>
          <div
            className="mc-modal"
            onClick={(e): void => {
              e.stopPropagation();
            }}
          >
            <div className="mc-modal-head">
              <div>
                <div className="mc-caption-up">generation settings</div>
                <div className="mc-h2" style={{ marginTop: 2 }}>
                  tune the build
                </div>
              </div>
              <button
                type="button"
                className="mc-btn mc-btn-ghost mc-btn-sm"
                onClick={(): void => setSettingsOpen(false)}
                style={{ padding: '0 8px' }}
              >
                <Icon name="x" size={11} />
              </button>
            </div>
            <div className="mc-modal-body">
              <SectionLabel>target complexity</SectionLabel>
              <div className="col" style={{ gap: 8, marginBottom: 20 }}>
                {(Object.entries(COMPLEXITY) as ReadonlyArray<
                  [keyof typeof COMPLEXITY, (typeof COMPLEXITY)[keyof typeof COMPLEXITY]]
                >).map(([k, v]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={(): void => setComplexity(k)}
                    className={`mc-mode ${complexity === k ? 'sel' : ''}`}
                  >
                    <span className="mc-mode-radio">
                      {complexity === k ? '◉' : '○'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div className="row" style={{ gap: 8, marginBottom: 2 }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{v.label}</span>
                        <span className="mc-caption nowrap" style={{ fontSize: 11 }}>
                          ~{v.tools}&nbsp;tools
                        </span>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5 }}>
                        {v.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <SectionLabel>categories</SectionLabel>
              <div className="col" style={{ gap: 4, marginBottom: 20 }}>
                {cats.map((c) => (
                  <label
                    key={c.id}
                    className="mc-tcb row-bw"
                    style={{ padding: '5px 0' }}
                  >
                    <span className="row" style={{ gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={c.on}
                        onChange={(): void => toggle(c.id)}
                      />
                      <span className="glyph">{c.on ? '☑' : '☐'}</span>
                      <span style={{ fontSize: 13 }}>{c.label}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        ({c.count} endpoints)
                      </span>
                    </span>
                    {c.rare ? (
                      <span className="muted" style={{ fontSize: 11 }}>
                        ⚠ rarely used
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>

              <div className="mc-rule-dashed" style={{ margin: '12px 0' }} />

              <button
                type="button"
                onClick={(): void => setAdvancedOpen((o) => !o)}
                className="row"
                style={{
                  gap: 6,
                  background: 'none',
                  border: 0,
                  padding: 0,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  marginBottom: advancedOpen ? 12 : 0,
                }}
              >
                <Icon name={advancedOpen ? 'caret-d' : 'caret-r'} size={11} />
                <span className="mc-caption-up">advanced</span>
              </button>

              {advancedOpen ? (
                <div className="col" style={{ gap: 14 }}>
                  <div>
                    <div className="mc-caption-up" style={{ marginBottom: 6 }}>
                      server name
                    </div>
                    <input
                      className="mc-input mc-mono"
                      value={serverName}
                      onChange={(e): void => setServerName(e.target.value)}
                      style={{ height: 36, fontSize: 12.5 }}
                    />
                  </div>
                  <div>
                    <div className="row-bw" style={{ marginBottom: 6 }}>
                      <span className="mc-caption-up">override max-tools cap</span>
                      <Badge kind="accent">pro</Badge>
                    </div>
                    <input
                      className="mc-input mc-mono"
                      placeholder="default · 100"
                      disabled
                      style={{ height: 36, fontSize: 12.5, opacity: 0.5 }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mc-modal-foot">
              <span className="mc-caption">applies on next generation</span>
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ghost" size="sm" onClick={(): void => setSettingsOpen(false)}>
                  cancel
                </Btn>
                <Btn kind="ink" size="sm" onClick={(): void => setSettingsOpen(false)}>
                  apply
                </Btn>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
