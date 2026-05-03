// apps/web/src/components/screens/preview/preview.tsx
//
// Preview screen — review pane shown to the user after the engine has chewed
// the spec. Visual layout is canon-locked
// (`claude-design-reference/canon/screen-preview.jsx`). All numerical /
// textual content is sourced from the running BFF job — there are NO canon
// demo literals (no "lumen-payments", no "transactions(24)", no
// "orders.create" merge banner, no "4 750 tk" etc).
//
// Data sources (all via TanStack Query):
//   * `useJob(jobId)` → BFF /api/v1/jobs/:id JSON snapshot. Surfaces
//     `partial_result.{spec_name, spec_format, endpoint_count, auth_modes,
//     composite_candidates, dropped_endpoints, target_complexity,
//     quality_report}`.
//   * `useJobArtifact(jobId, 'final-tools')` → optional per-tool list once
//     Pass 5 has emitted final tools.
//
// Loading semantics: while the engine is mid-pipeline, panels render '—'
// or hidden state instead of fake numbers.

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
import { useJob, useJobArtifact } from '@/lib/api/jobs';
import { toast } from '@/lib/toast';
import { deriveServerNameFromSpecUrl } from '@/components/screens/canvas/canvas';

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
// Helpers — derive UI shapes from real BFF data.
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

interface CompositeCandidate {
  readonly name: string;
  readonly steps: ReadonlyArray<string>;
  readonly rationale: string;
}

// Map Pass 5 FinalTool[] (typed) into category buckets keyed by the engine's
// `type` field (universal | action | workflow | specialized). When tools have
// not yet landed (Pass 5 still running), returns []. NEVER returns the
// canon's hardcoded `transactions(24)` / `accounts(18)` / etc.
function deriveCategories(tools: ReadonlyArray<FinalTool> | null): ReadonlyArray<PreviewCategory> {
  if (tools === null || tools.length === 0) return [];
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

// Format the spec_format enum value for display in the 'detected' panel.
// "openapi-3.0" → "OpenAPI 3.0"; falls back to "—" while pending.
function formatSpecFormat(specFormat: string | null | undefined): string {
  if (specFormat === null || specFormat === undefined || specFormat === '') return '—';
  if (specFormat.startsWith('openapi-')) {
    return `OpenAPI ${specFormat.slice('openapi-'.length)}`;
  }
  if (specFormat === 'graphql') return 'GraphQL';
  if (specFormat === 'postman') return 'Postman Collection';
  return specFormat;
}

// Map raw IR auth_modes scheme strings into a single human-readable label
// for the 'auth' field. Returns "—" while pending (empty list).
function formatAuthModes(authModes: ReadonlyArray<string> | undefined): string {
  if (authModes === undefined || authModes.length === 0) return '—';
  const friendly = authModes.map((s) => {
    if (s === 'apiKey') return 'api key';
    if (s === 'oauth2') return 'oauth';
    if (s === 'http_basic') return 'basic';
    if (s === 'http_bearer') return 'bearer';
    if (s === 'aws_signature') return 'aws sig';
    return s;
  });
  return friendly.join(' + ');
}

// Adapt an unknown CompositeCandidate from BFF into a typed shape, or null
// when the input doesn't conform.
function adaptCompositeCandidate(raw: unknown): CompositeCandidate | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r['name'] === 'string' ? r['name'] : null;
  if (name === null || name === '') return null;
  const steps = Array.isArray(r['steps'])
    ? (r['steps'] as unknown[]).filter((s): s is string => typeof s === 'string')
    : [];
  if (steps.length === 0) return null;
  const rationale = typeof r['rationale'] === 'string' ? r['rationale'] : '';
  return { name, steps, rationale };
}

// Adapt a Pass 0 DroppedEndpoint into our local UI shape. Returns null if
// the BFF blob is malformed.
function adaptDroppedEndpoint(raw: unknown): ExcludedEndpoint | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const method = typeof r['method'] === 'string' ? r['method'] : null;
  const path = typeof r['path'] === 'string' ? r['path'] : null;
  if (method === null || path === null) return null;
  const reasonRaw = typeof r['reason'] === 'string' ? r['reason'] : 'DROPPED';
  const reason = friendlyDropReason(reasonRaw);
  const override = r['can_user_override'] === true;
  return { method, path, reason, override };
}

function friendlyDropReason(reason: string): string {
  switch (reason) {
    case 'DEPRECATED':
      return 'deprecated';
    case 'INTERNAL':
      return 'internal · /admin namespace';
    case 'HEALTH_CHECK':
      return 'meta endpoint · no business value';
    case 'WEBHOOK':
      return 'webhook callback · not callable';
    case 'AUTH_FLOW':
      return 'auth flow endpoint';
    case 'REDUNDANT':
      return 'subsumed by another endpoint';
    case 'LOW_VALUE':
      return 'low value · skipped by default';
    case 'USER_EXCLUDED':
      return 'excluded by user';
    case 'EXCEEDS_CAP':
      return 'over tool cap';
    case 'METHOD_NOT_SUPPORTED':
      return 'http method not supported';
    default:
      return reason.toLowerCase();
  }
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

// Rough $/1k tokens estimate for "saved per session" copy. Anthropic Sonnet
// 4.7 input pricing as of 2026-Q1.
const DOLLARS_PER_KTOKEN = 0.015;

// ────────────────────────────────────────────────────────────────────────────
// Public component.
// ────────────────────────────────────────────────────────────────────────────

export interface PreviewProps {
  readonly jobId: string;
  /** The original spec URL the user pasted (carried via query string from
   *  Stream → Preview). Used for both the "refine spec" CTA and as a
   *  fallback for the breadcrumb's server name. */
  readonly originalSpecUrl?: string;
  /** Optional human-friendly server name used in the breadcrumb/title.
   *  Server-side prop wins over BFF-derived value when both are provided. */
  readonly specName?: string;
  /** Total endpoint count from the BFF (Pass 0 input). Server-side prop
   *  short-circuits the client-side fetch for SSR-friendly first paint. */
  readonly endpointCount?: number;
}

export default function Preview({
  jobId,
  originalSpecUrl,
  specName,
  endpointCount,
}: PreviewProps): ReactElement {
  const router = useRouter();

  // ─── BFF data ──────────────────────────────────────────────────────────────
  const jobQuery = useJob(jobId, { refetchIntervalMs: 1500 });
  const job = jobQuery.data?.ok === true ? jobQuery.data.data : null;
  const partial = job?.partial_result ?? null;

  const artifactQuery = useJobArtifact(jobId, 'final-tools');
  const artifact = artifactQuery.data;
  const finalToolsFromArtifact: ReadonlyArray<FinalTool> | null = useMemo(() => {
    if (artifact !== undefined && artifact.ok && Array.isArray(artifact.data)) {
      return artifact.data as ReadonlyArray<FinalTool>;
    }
    return null;
  }, [artifact]);
  // Prefer artifact endpoint, fall back to job.partial_result.final_tools (the
  // BFF inlines the same payload there for SSR).
  const finalTools: ReadonlyArray<FinalTool> | null = useMemo(() => {
    if (finalToolsFromArtifact !== null) return finalToolsFromArtifact;
    const ft = partial?.final_tools;
    if (Array.isArray(ft) && ft.length > 0) return ft as ReadonlyArray<FinalTool>;
    return null;
  }, [finalToolsFromArtifact, partial]);

  // Composite candidates — Pass 0 hints toward Pass 1 workflow tools. Hidden
  // entirely until at least one candidate lands.
  const compositeCandidates: ReadonlyArray<CompositeCandidate> = useMemo(() => {
    const raw = partial?.composite_candidates;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((c) => adaptCompositeCandidate(c))
      .filter((c): c is CompositeCandidate => c !== null);
  }, [partial]);

  // Dropped endpoints — Pass 0 filtered list.
  const excludedEndpoints: ReadonlyArray<ExcludedEndpoint> = useMemo(() => {
    const raw = partial?.dropped_endpoints;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((d) => adaptDroppedEndpoint(d))
      .filter((d): d is ExcludedEndpoint => d !== null);
  }, [partial]);

  // ─── Local state ───────────────────────────────────────────────────────────
  const initialCats = useMemo(() => deriveCategories(finalTools), [finalTools]);
  const [cats, setCats] = useState<ReadonlyArray<PreviewCategory>>(initialCats);
  const [combine, setCombine] = useState<null | 'yes' | 'no'>(null);
  const [excludedOpen, setExcludedOpen] = useState<boolean>(false);
  const [included, setIncluded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [complexity, setComplexity] = useState<'minimal' | 'standard' | 'comprehensive'>(() => {
    const tc = partial?.target_complexity;
    if (tc === 'minimal' || tc === 'standard' || tc === 'comprehensive') return tc;
    return 'standard';
  });

  // Derived breadcrumb name — same chain as canvas screen.
  const specNameFromJob =
    partial !== null && typeof partial.spec_name === 'string' && partial.spec_name !== ''
      ? partial.spec_name
      : null;
  const specNameFromUrl = deriveServerNameFromSpecUrl(originalSpecUrl);
  const derivedServerName: string =
    specName !== undefined && specName.length > 0
      ? specName
      : specNameFromJob ?? specNameFromUrl;

  const [serverName, setServerName] = useState<string>(`${derivedServerName}-mcp`);
  const serverNameInitRef = useRef<boolean>(false);
  useEffect(() => {
    // One-shot sync: when the BFF resolves spec_name (or we derive a sane
    // value), seed the editable input the first time. After that, respect
    // user edits.
    if (serverNameInitRef.current) return;
    if (derivedServerName !== '' && derivedServerName !== 'mcp-server') {
      setServerName(`${derivedServerName}-mcp`);
      serverNameInitRef.current = true;
    }
  }, [derivedServerName]);

  const [advancedOpen, setAdvancedOpen] = useState<boolean>(false);

  // Sync derived categories when the artifact lands.
  useEffect(() => {
    setCats(initialCats);
  }, [initialCats]);

  // Sync target_complexity from the BFF once it resolves.
  useEffect(() => {
    const tc = partial?.target_complexity;
    if (tc === 'minimal' || tc === 'standard' || tc === 'comprehensive') {
      setComplexity(tc);
    }
  }, [partial]);

  const toggle = (id: string): void =>
    setCats((cs) => cs.map((c) => (c.id === id ? { ...c, on: !c.on } : c)));

  const includeEndpoint = (path: string): void =>
    setIncluded((s) => {
      const next = new Set(s);
      next.add(path);
      return next;
    });

  // ─── Detected panel values ─────────────────────────────────────────────────
  // endpointCount: server-prop (SSR) wins; else partial; else null = pending.
  const totalEndpoints: number | null =
    endpointCount !== undefined
      ? endpointCount
      : typeof partial?.endpoint_count === 'number'
        ? partial.endpoint_count
        : null;

  const includedCount = finalTools !== null ? finalTools.length : null;

  const specFormatLabel = formatSpecFormat(partial?.spec_format ?? null);
  const authLabel = formatAuthModes(partial?.auth_modes);

  // ─── Token budget — real numbers when we have them, '—' otherwise ─────────
  // Both naive and optimized counts come from the engine — we no longer
  // synthesize a `endpointCount * 250` proxy because users perceived it as
  // mock data. Until Pass 5 surfaces real `naive_token_count` and
  // `optimized_token_count` fields, render '—' / 'calculating…' (matches
  // the "with mcpgen" line behaviour).
  const partialAny = partial as Record<string, unknown> | null;
  const naiveFromBff = partialAny !== null ? partialAny['naive_token_count'] : undefined;
  const optFromBff = partialAny !== null ? partialAny['optimized_token_count'] : undefined;
  const naiveTokens: number | null =
    typeof naiveFromBff === 'number' && Number.isFinite(naiveFromBff) && naiveFromBff > 0
      ? naiveFromBff
      : null;
  const optTokens: number | null =
    typeof optFromBff === 'number' && Number.isFinite(optFromBff) && optFromBff > 0
      ? optFromBff
      : null;
  const hasTokenSavings = naiveTokens !== null && optTokens !== null;
  const pct = hasTokenSavings ? Math.round((1 - (optTokens as number) / (naiveTokens as number)) * 100) : null;
  const dollars = hasTokenSavings
    ? ((((naiveTokens as number) - (optTokens as number)) / 1000) * DOLLARS_PER_KTOKEN).toFixed(2)
    : null;

  // ─── Navigation handlers ───────────────────────────────────────────────────
  const onContinue = (): void => {
    // Pipeline order: review → quality → playground → deploy. The /quality
    // screen owns its own "continue → playground" handler; /playground owns
    // "continue → deploy". Skipping straight to /deploy would bypass the
    // quality + playground steps.
    if (jobId !== '') {
      router.push(`/generate/${encodeURIComponent(jobId)}/quality`);
      toast('continuing to auth setup…');
      return;
    }
    if (originalSpecUrl !== undefined && originalSpecUrl.length > 0) {
      router.push(`/generate?spec_url=${encodeURIComponent(originalSpecUrl)}`);
      return;
    }
    router.push('/generate');
  };

  const onBack = (): void => {
    router.push(`/generate/${jobId}`);
  };

  // Drop the "draft" tag once the engine has emitted a quality_report (i.e.
  // generation is terminal-complete and the user is reviewing real output).
  const isComplete =
    partial !== null && partial.quality_report !== null && partial.quality_report !== undefined;
  const breadcrumb = `${derivedServerName}-mcp${isComplete ? '' : ' · draft'}`;

  // ─── Composite candidate banner copy ──────────────────────────────────────
  // Pass 0 surfaces composite candidate hints. Show them as a soft suggestion;
  // the actual merge is deferred to Pass 1 (already run by the time we render
  // here).
  const showCompositeBanner = compositeCandidates.length > 0;
  const compositeStepsTotal = compositeCandidates.reduce(
    (s, c) => s + c.steps.length,
    0,
  );
  const firstCompositeSteps =
    showCompositeBanner ? compositeCandidates[0]!.steps.slice(0, 3) : [];

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
            here&apos;s what we&apos;d build.
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
              <span>{specFormatLabel}</span>
              <span className="muted">endpoints</span>
              <span>
                {totalEndpoints !== null ? totalEndpoints : '—'}
                {includedCount !== null ? (
                  <>
                    {' '}
                    · <span className="muted">{includedCount} included</span>
                  </>
                ) : null}
              </span>
              <span className="muted">categories</span>
              <span>{cats.length > 0 ? cats.length : '—'}</span>
              <span className="muted">complexity</span>
              <span>{COMPLEXITY[complexity].label}</span>
              <span className="muted">auth</span>
              <span>{authLabel}</span>
            </div>

            <div className="mc-caption-up" style={{ marginBottom: 10 }}>
              categories — toggle to include
            </div>
            <div className="col" style={{ gap: 6 }}>
              {cats.length === 0 ? (
                <div className="muted mc-mono" style={{ fontSize: 12, padding: '6px 0' }}>
                  {finalTools === null ? 'analyzing tools…' : 'no categories yet'}
                </div>
              ) : null}
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
                  sonnet pricing
                </span>
              }
            >
              token budget
            </SectionLabel>

            <div style={{ marginBottom: 18 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="mc-caption">naive 1:1</span>
                <span className="mc-mono">
                  {naiveTokens !== null ? `${naiveTokens.toLocaleString()} tk` : '—'}
                </span>
              </div>
              {naiveTokens !== null ? (
                <BlockBar value={naiveTokens} max={naiveTokens} width={28} dim />
              ) : null}
            </div>

            <div style={{ marginBottom: 24 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="mc-caption" style={{ color: 'var(--text)' }}>
                  with mcpgen
                </span>
                <span className="mc-mono">
                  {optTokens !== null ? (
                    <>
                      <CountUp value={optTokens} /> tk
                    </>
                  ) : (
                    'calculating…'
                  )}
                </span>
              </div>
              {optTokens !== null && naiveTokens !== null ? (
                <BlockBar value={optTokens} max={naiveTokens} width={28} />
              ) : null}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
              {pct !== null && dollars !== null ? (
                <>
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
                </>
              ) : (
                <div className="mc-caption muted">
                  optimized token estimate pending
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Composite candidate banner — Pass 0 hint, hidden when none */}
        {showCompositeBanner ? (
          <div className="mc-ai-strip" style={{ marginBottom: 16 }}>
            <Icon name="spark" size={16} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 14 }}>
                {compositeStepsTotal} endpoints look like they belong together.
              </div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                {firstCompositeSteps.map((step, i) => (
                  <span key={step}>
                    {i > 0 ? ', ' : ''}
                    <span className="mc-mono">{step}</span>
                  </span>
                ))}
                {compositeCandidates[0]!.steps.length > firstCompositeSteps.length ? ', …' : ''}
                {' '}combine into {compositeCandidates.length} composite tool
                {compositeCandidates.length === 1 ? '' : 's'}?
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
        ) : null}

        {/* Excluded endpoints (collapsible) */}
        <div className="mc-excluded">
          <div
            className="mc-excluded-head"
            onClick={(): void => setExcludedOpen((o) => !o)}
          >
            <div className="row" style={{ gap: 10 }}>
              <Icon name={excludedOpen ? 'caret-d' : 'caret-r'} size={11} />
              <span className="mc-caption-up">endpoints not included</span>
              <Badge kind="soft">{excludedEndpoints.length - included.size}</Badge>
              {included.size > 0 ? (
                <Badge kind="accent">+{included.size} restored</Badge>
              ) : null}
            </div>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>
              {excludedOpen ? 'hide' : 'show'} →
            </span>
          </div>
          {excludedOpen && excludedEndpoints.length > 0 ? (
            <div className="mc-excluded-table">
              {excludedEndpoints.map((e) => {
                const isIncluded = included.has(e.path);
                return (
                  <div
                    key={`${e.method}-${e.path}`}
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
            <Btn kind="ghost" size="sm" onClick={onContinue}>
              continue without
            </Btn>
          </div>
        ) : null}

        <div style={{ height: 24 }} />

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={onContinue}>
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
                {cats.length === 0 ? (
                  <div className="muted mc-mono" style={{ fontSize: 12 }}>
                    {finalTools === null ? 'analyzing tools…' : 'no categories detected'}
                  </div>
                ) : null}
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
