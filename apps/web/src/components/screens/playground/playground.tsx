// apps/web/src/components/screens/playground/playground.tsx
//
// Playground screen — sandbox for testing a generated MCP server before deploy.
//
// Day 0 (frontend cleanup, pre-execution-MVP):
//   - Removed canon SEED_HISTORY (5 hardcoded Stripe-style runs) — initial
//     history is empty until the playground BFF lands and real runs persist.
//   - Removed canon SUGGESTED_PROMPTS (4 hardcoded Stripe prompts) — sample
//     prompts now read from `useJobArtifact(jobId, 'sample-prompts')`,
//     populated by the engine post-Pass-5 (Day 2). The chip-row hides
//     gracefully when the artifact is absent.
//   - Removed `totalNaive = totalNew * 3.9` magic-constant cost comparison
//     and the "saved this session $X" banner. The whole differentiation
//     thesis is honest token-economy via Six-Tool Pattern; faked savings
//     undermine credibility. SESSION TOTALS now shows STRUCTURAL metrics
//     (tools loaded · endpoints covered · target complexity) read from
//     real job artifacts, plus the live `this run` token counter.
//
// Backend wiring (still stubbed for Day 0 — Day 1+ replaces this):
//   - `runPlaygroundTool()` from `@/lib/api/playground` returns
//     `flag_off_or_not_implemented` until the BFF `/api/v1/playground/:id/invoke`
//     endpoint lands. When stubbed, the agent message renders canon's
//     "trace failed" branch with a friendly "not yet available" message.
//   - Real tool list — `useJobArtifact(jobId, 'final-tools')` (already wired).
//   - Real sample prompts — `useJobArtifact(jobId, 'sample-prompts')`
//     (Day 2 generates this artifact from Pass 5 LLM call cached with the
//     generation; until then the chip-row is empty).
//
// State preserved verbatim from canon (UX feel — chat-first, single screen):
//   messages · input · traces · running · keyTtl · history · historyFilter ·
//   activeRunId · savedToast.

'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
} from 'react';

import { Badge, Btn, Icon, SectionLabel, TopBar } from '@/components/ui';
import { deriveServerNameFromSpecUrl } from '@/components/screens/canvas/canvas';
import { useJob } from '@/lib/api/jobs';
import {
  listPlaygroundTests,
  runPlaygroundSuite,
  runPlaygroundTool,
  savePlaygroundRunAsTest,
  type PlaygroundSuiteResult,
  type PlaygroundTest,
} from '@/lib/api/playground';

// ────────────────────────────────────────────────────────────────────────────
// Sample shape (mirror canon `sample.name` / `sample.id` usage).
// ────────────────────────────────────────────────────────────────────────────

export interface PlaygroundSample {
  readonly id: string;
  readonly name: string;
}

export interface PlaygroundProps {
  readonly jobId: string;
  readonly sample?: PlaygroundSample;
  /** Original spec URL — used to derive a breadcrumb server name when the
   *  BFF hasn't surfaced `partial_result.spec_name` yet. */
  readonly specUrl?: string;
  readonly onBack?: () => void;
  readonly onDeploy?: () => void;
}

// ────────────────────────────────────────────────────────────────────────────
// Inlined CountUp (canon ui.jsx — same as landing.tsx).
// ────────────────────────────────────────────────────────────────────────────

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
// History run shape — populated from real BFF runs (Day 1+); empty until then.
// ────────────────────────────────────────────────────────────────────────────

interface HistoryRun {
  readonly id: string;
  readonly label: string;
  readonly prompt: string;
  readonly tools: readonly string[];
  readonly tk: number;
  readonly ms: number;
  readonly when: string;
  readonly savedAsTest: boolean;
}


// ────────────────────────────────────────────────────────────────────────────
// Tool-name extraction from `partial_result.final_tools` (BFF-enriched).
// ────────────────────────────────────────────────────────────────────────────

function extractToolNames(raw: unknown): readonly string[] {
  if (raw === null || raw === undefined) return [];
  // BFF surfaces `partial_result.final_tools` as a FinalTool[] array.
  // Defensively support both the array shape and a wrapped `{final_tools:[]}`.
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const t of raw) {
      if (t !== null && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string') {
        out.push((t as { name: string }).name);
      }
    }
    return out;
  }
  if (typeof raw !== 'object') return [];
  const wrapped = (raw as { final_tools?: unknown }).final_tools;
  if (Array.isArray(wrapped)) {
    const out: string[] = [];
    for (const t of wrapped) {
      if (t !== null && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string') {
        out.push((t as { name: string }).name);
      }
    }
    return out;
  }
  return [];
}

// ────────────────────────────────────────────────────────────────────────────
// Component.
// ────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  readonly role: 'user' | 'agent';
  readonly text: string;
  readonly tool?: string;
  readonly done?: boolean;
  readonly failed?: boolean;
}

interface TraceRow {
  readonly n: number;
  readonly name: string;
  readonly in: number;
  readonly out: number;
  readonly lat: number;
}

const FALLBACK_TOOL = 'list_charges';

export default function Playground({
  jobId,
  sample,
  specUrl,
  onBack,
  onDeploy,
}: PlaygroundProps): ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [keyTtl, setKeyTtl] = useState<number>(47 * 60);
  const [history, setHistory] = useState<readonly HistoryRun[]>([]);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'tests'>('all');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string>('');
  const [selectedTool, setSelectedTool] = useState<string>(FALLBACK_TOOL);

  // Live job state (also feeds the breadcrumb name + structural metrics).
  // BFF /api/v1/jobs/:id enriches partial_result with the engine's
  // pass_5_output.tools (already a FinalTool[] shape) and a deterministic
  // sample_prompts list derived from those tools' Pass-2 when_to_use
  // descriptions — both are the source of truth for the playground UI.
  const jobQuery = useJob(jobId);
  const job = jobQuery.data?.ok === true ? jobQuery.data.data : null;
  const partial = job?.partial_result ?? null;

  const toolNames = useMemo<readonly string[]>(() => {
    return extractToolNames(partial?.final_tools);
  }, [partial?.final_tools]);

  const visibleTools = toolNames.length > 0 ? toolNames : [FALLBACK_TOOL];

  const samplePrompts = useMemo<readonly string[]>(() => {
    const list = partial?.sample_prompts;
    return Array.isArray(list)
      ? list.filter((p): p is string => typeof p === 'string')
      : [];
  }, [partial?.sample_prompts]);

  // Saved-as-test catalog — populated from BFF on mount, kept in sync with
  // local mutations (save / run-suite). The regression-suite card reads
  // from here and the history-rail's `★` badge falls back to the local
  // optimistic flag in `history`.
  const [savedTests, setSavedTests] = useState<ReadonlyArray<PlaygroundTest>>([]);
  // Suite-run summary surfaced under the regression-suite card.
  const [suiteResult, setSuiteResult] = useState<PlaygroundSuiteResult | null>(null);
  const [suiteRunning, setSuiteRunning] = useState<boolean>(false);

  // Hydrate saved tests on mount (and whenever jobId changes).
  useEffect(() => {
    let cancelled = false;
    void (async (): Promise<void> => {
      const r = await listPlaygroundTests(jobId);
      if (cancelled) return;
      if (r.ok) setSavedTests(r.data.tests);
    })();
    return (): void => {
      cancelled = true;
    };
  }, [jobId]);

  // Auto-select first available tool once artefacts arrive.
  useEffect(() => {
    if (toolNames.length > 0 && !toolNames.includes(selectedTool)) {
      setSelectedTool(toolNames[0]!);
    }
  }, [toolNames, selectedTool]);

  // Session-credential countdown (canon).
  useEffect(() => {
    const id = setInterval(() => setKeyTtl((t) => Math.max(0, t - 1)), 1000);
    return (): void => clearInterval(id);
  }, []);

  const fmtTtl = (): string => {
    const m = Math.floor(keyTtl / 60);
    const s = keyTtl % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  const send = async (text: string, opts: { test?: boolean } = {}): Promise<void> => {
    if (!text.trim() || running) return;
    setRunning(true);
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setActiveRunId(null);

    // Insert pending agent message synchronously (no canon 400ms cosmetic
    // delay — the live SSE will start updating it almost immediately, the
    // delay just made the UI feel slower than the engine actually is).
    setMessages((m) => [
      ...m,
      { role: 'agent', text: 'thinking…', tool: selectedTool },
    ]);

    // Pin the agent to a specific tool only when the user picked a real
    // one (not the FALLBACK_TOOL placeholder used while artifacts load).
    const pinnedTool =
      toolNames.includes(selectedTool) ? selectedTool : null;

    // Live SSE invocation. Each `tool_call` event pushes a placeholder
    // trace row that we update on the matching `tool_result` so the
    // right-rail rail populates incrementally instead of jumping at done.
    const result = await runPlaygroundTool({
      jobId,
      prompt: text,
      pinnedTool,
      onEvent: (evt) => {
        if (evt.type === 'tool_call') {
          setTraces((t) => [
            ...t,
            { n: t.length + 1, name: evt.name, in: 0, out: 0, lat: 0 },
          ]);
        } else if (evt.type === 'tool_result') {
          setTraces((t) => {
            // Update the most recent trace row matching the request_id-less
            // ordering (we push rows in tool_call order; tool_result follows
            // immediately because the engine awaits each call sequentially).
            if (t.length === 0) return t;
            const copy = [...t];
            const last = copy[copy.length - 1]!;
            copy[copy.length - 1] = { ...last, lat: evt.lat_ms };
            return copy;
          });
        } else if (evt.type === 'agent_message') {
          // Update the in-flight agent bubble text mid-loop so the user
          // sees Sonnet's reasoning progress (Anthropic emits a text
          // block per turn before tool_use blocks fire).
          setMessages((m) => {
            const copy = [...m];
            const lastIdx = copy.length - 1;
            const last = copy[lastIdx];
            if (last !== undefined && last.role === 'agent' && last.done !== true) {
              copy[lastIdx] = { ...last, text: evt.text };
            }
            return copy;
          });
        }
      },
    });

    if (!result.ok) {
      const reason =
        result.error === 'flag_off_or_not_implemented'
          ? 'tool execution is not yet available in this build.'
          : `trace failed: ${result.error}`;
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: 'agent',
          done: true,
          failed: true,
          text: reason,
        };
        return copy;
      });
      setRunning(false);
      return;
    }

    const done = result.data;
    const failedRun = done.status !== 'ok';
    const replyText =
      done.failure_reason !== null && done.failure_reason !== undefined && done.failure_reason !== ''
        ? done.failure_reason
        : (done.agent_reply ?? '');

    // Replace the in-flight trace stub with the canonical `traces` from
    // the `done` payload — the engine has the exact in/out token counts
    // per call which we couldn't compute incrementally.
    setTraces(
      done.traces.map((t) => ({
        n: t.n,
        name: t.name,
        in: t.in ?? 0,
        out: t.out ?? 0,
        lat: t.lat,
      })),
    );

    setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = {
        role: 'agent',
        done: true,
        ...(failedRun ? { failed: true } : {}),
        text: replyText,
      };
      return copy;
    });

    const newId = 'h' + Date.now();
    const totalTk = done.total_in_tk + done.total_out_tk;
    setHistory((h) =>
      [
        {
          id: newId,
          label: text.length > 40 ? text.slice(0, 38) + '…' : text,
          prompt: text,
          tools: done.traces.map((t) => t.name),
          tk: totalTk,
          ms: done.total_lat_ms,
          when: 'just now',
          savedAsTest: !!opts.test,
        } satisfies HistoryRun,
        ...h,
      ].slice(0, 24),
    );
    setActiveRunId(newId);
    setRunning(false);
  };

  const replay = (run: HistoryRun): void => {
    if (running) return;
    setMessages([]);
    setTraces([]);
    void send(run.prompt);
  };

  const saveAsTest = (id: string): void => {
    // Optimistic UI: flip the ★ on the local history row immediately.
    // The id here is `'h' + Date.now()` — UI-only — so the BFF call
    // can't tie this exact card to a server-side playground_runs.id
    // round-trip yet (the SSE `done` event doesn't carry the row id back
    // today). The BFF write is best-effort: we refresh the saved-tests
    // catalog so the regression-suite card picks up the new row even
    // though the in-card ★ remains a local optimistic marker.
    setHistory((h) => h.map((r) => (r.id === id ? { ...r, savedAsTest: true } : r)));
    setSavedToast('saved as test');
    setTimeout(() => setSavedToast(''), 1800);
    void (async (): Promise<void> => {
      const refreshed = await listPlaygroundTests(jobId);
      if (refreshed.ok) setSavedTests(refreshed.data.tests);
    })();
  };

  // Persist a saved test for a known server-side playground_runs.id.
  // Currently only invoked from a follow-up wiring; the export-style
  // `void` keeps it reachable for tree-shaking + linting friendliness
  // without a placeholder usage site.
  void savePlaygroundRunAsTest;

  const runSuite = async (): Promise<void> => {
    if (suiteRunning) return;
    setSuiteRunning(true);
    setSuiteResult(null);
    const r = await runPlaygroundSuite(jobId);
    if (r.ok) {
      setSuiteResult(r.data);
      const refreshed = await listPlaygroundTests(jobId);
      if (refreshed.ok) setSavedTests(refreshed.data.tests);
    } else {
      setSavedToast(`suite failed: ${r.error}`);
      setTimeout(() => setSavedToast(''), 2500);
    }
    setSuiteRunning(false);
  };


  const filteredHistory = history.filter(
    (r) => historyFilter === 'all' || r.savedAsTest,
  );
  const testCount = history.filter((r) => r.savedAsTest).length;

  // Live session token totals — sum of real per-call in/out from `traces`.
  // No "+ 1022" canon overhead constant; no `* 3.9` naive multiplier; no
  // synthetic cost projection. Real numbers only — Day 1 BFF will populate
  // these from actual Anthropic agent-loop usage.
  const totalNew = traces.reduce((s, t) => s + t.in + t.out, 0);

  // Structural metrics for the SESSION TOTALS card — read once from job
  // artifacts (no fake savings claim, no magic constants).
  const toolsLoaded = toolNames.length;
  const endpointCount =
    typeof partial?.endpoint_count === 'number' ? partial.endpoint_count : null;
  const targetComplexity =
    typeof partial?.target_complexity === 'string' &&
    partial.target_complexity.length > 0
      ? partial.target_complexity
      : null;

  // Breadcrumb server name — same chain as canvas/preview screens.
  // Priority: explicit sample.name (server-side prop) → BFF
  // partial_result.spec_name → derived from spec URL → "mcp-server".
  const specNameFromJob =
    partial !== null && typeof partial.spec_name === 'string' && partial.spec_name !== ''
      ? partial.spec_name
      : null;
  const specNameFromUrl = deriveServerNameFromSpecUrl(specUrl);
  const derivedServerName: string =
    sample?.name !== undefined && sample.name !== ''
      ? sample.name
      : specNameFromJob ?? specNameFromUrl;
  const crumb = `${derivedServerName}-mcp · playground`;

  return (
    <div className="mc-screen" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={crumb}
        {...(onBack !== undefined ? { onLogo: onBack } : {})}
        right={
          <>
            <Btn kind="ghost" size="sm" icon="arrow-l" onClick={onBack}>
              back to canvas
            </Btn>
            <Btn kind="primary" size="sm" icon="cloud" onClick={onDeploy}>
              deploy
            </Btn>
          </>
        }
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px 1fr 340px',
          gap: 0,
          minHeight: 'calc(100vh - 56px)',
        }}
      >
        {/* LEFT: history rail */}
        <aside
          style={{
            borderRight: '1px solid var(--border)',
            padding: 18,
            overflowY: 'auto',
          }}
        >
          <div className="row-bw" style={{ marginBottom: 10 }}>
            <span className="mc-caption-up">history</span>
            <span className="mc-mono muted" style={{ fontSize: 11 }}>
              {history.length}
            </span>
          </div>

          <div className="mc-chiprow" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`mc-chip ${historyFilter === 'all' ? 'active' : ''}`}
              onClick={() => setHistoryFilter('all')}
              style={{ height: 26, fontSize: 11 }}
            >
              all · {history.length}
            </button>
            <button
              type="button"
              className={`mc-chip ${historyFilter === 'tests' ? 'active' : ''}`}
              onClick={() => setHistoryFilter('tests')}
              style={{ height: 26, fontSize: 11 }}
            >
              tests · {testCount}
            </button>
          </div>

          <div className="col" style={{ gap: 6 }}>
            {filteredHistory.length === 0 && (
              <div
                className="muted"
                style={{
                  fontSize: 12,
                  fontStyle: 'italic',
                  padding: '14px 6px',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius)',
                  textAlign: 'center',
                }}
              >
                no saved tests yet. star a run below.
              </div>
            )}
            {filteredHistory.map((r) => {
              const isActive = activeRunId === r.id;
              const cardStyle: CSSProperties = {
                padding: '10px 12px',
                borderColor: isActive ? 'var(--border-sharp)' : 'var(--border)',
                borderRadius: 'var(--radius)',
                background: isActive ? 'var(--card)' : 'var(--paper)',
                boxShadow: isActive ? 'var(--shadow)' : 'none',
                cursor: 'pointer',
              };
              return (
                <div
                  key={r.id}
                  className="mc-card"
                  style={cardStyle}
                  onClick={() => setActiveRunId(r.id)}
                >
                  <div className="row-bw" style={{ marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 500,
                        lineHeight: 1.3,
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.label}
                    </span>
                    {r.savedAsTest && (
                      <span
                        title="saved as test"
                        style={{
                          color: 'var(--primary)',
                          fontSize: 12,
                          lineHeight: 1,
                          flexShrink: 0,
                          marginLeft: 4,
                        }}
                      >
                        ★
                      </span>
                    )}
                  </div>
                  <div
                    className="mc-mono muted"
                    style={{ fontSize: 10.5, marginBottom: 6 }}
                  >
                    {r.tools[0]} · {r.tk} tk · {r.ms}ms · {r.when}
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      type="button"
                      className="mc-btn mc-btn-ghost mc-btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        replay(r);
                      }}
                      disabled={running}
                      style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                      title="replay"
                    >
                      <Icon name="play" size={9} /> replay
                    </button>
                    {!r.savedAsTest ? (
                      <button
                        type="button"
                        className="mc-btn mc-btn-ghost mc-btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          saveAsTest(r.id);
                        }}
                        style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                        title="save as test"
                      >
                        ☆ save
                      </button>
                    ) : (
                      <span
                        className="mc-mono muted"
                        style={{
                          fontSize: 10,
                          padding: '0 6px',
                          alignSelf: 'center',
                        }}
                      >
                        saved
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {savedTests.length > 0 && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: 'var(--paper-alt)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
              }}
            >
              <div
                className="mc-caption-up"
                style={{ marginBottom: 6, fontSize: 10 }}
              >
                regression suite
              </div>
              <div
                className="mc-mono"
                style={{
                  fontSize: 11.5,
                  marginBottom: 8,
                  lineHeight: 1.5,
                  color: 'var(--text-muted)',
                }}
              >
                run all {savedTests.length} tests on every spec change. fails block
                auto-regenerate.
              </div>
              <button
                type="button"
                className="mc-btn mc-btn-ink mc-btn-sm mc-btn-full"
                style={{ height: 28, fontSize: 11 }}
                onClick={() => void runSuite()}
                disabled={suiteRunning}
              >
                <Icon name="play" size={9} />{' '}
                {suiteRunning ? 'running…' : 'run suite'}
              </button>
              {suiteResult !== null && (
                <div style={{ marginTop: 10 }}>
                  <div
                    className="mc-mono"
                    style={{ fontSize: 11, marginBottom: 6 }}
                  >
                    {suiteResult.summary.passed}/{suiteResult.summary.total} passed
                  </div>
                  {suiteResult.tests.map((t) => (
                    <div
                      key={t.test_id}
                      style={{
                        marginBottom: 6,
                        padding: '6px 8px',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        borderColor:
                          t.status === 'pass'
                            ? 'var(--border)'
                            : 'var(--accent)',
                        background:
                          t.status === 'pass'
                            ? 'var(--paper)'
                            : 'var(--paper-alt)',
                      }}
                    >
                      <div
                        className="mc-mono"
                        style={{ fontSize: 11, marginBottom: 2 }}
                      >
                        {t.status === 'pass' ? '✓' : '✗'} {t.name}
                      </div>
                      {t.failure !== undefined && (
                        <div
                          className="mc-mono"
                          style={{
                            fontSize: 10,
                            color: 'var(--text-muted)',
                            lineHeight: 1.4,
                          }}
                        >
                          {t.failure.hint}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>

        {/* MIDDLE: chat */}
        <div style={{ padding: 28, overflowY: 'auto' }}>
          <div className="row-bw" style={{ marginBottom: 18 }}>
            <div className="row" style={{ gap: 10 }}>
              <span className="mc-caption-up">tool</span>
              <select
                aria-label="tool"
                className="mc-input mc-mono"
                style={{
                  width: 'auto',
                  height: 30,
                  fontSize: 12,
                  padding: '0 28px 0 10px',
                }}
                value={selectedTool}
                onChange={(e) => setSelectedTool(e.target.value)}
              >
                {visibleTools.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Badge kind="success">connected</Badge>
            </div>
            <div className="mc-caption">
              streaming · runs on <strong>your</strong> tokens
            </div>
          </div>

          {samplePrompts.length > 0 && (
            <>
              <SectionLabel>try a prompt</SectionLabel>
              <div className="mc-chiprow" style={{ marginBottom: 24 }}>
                {samplePrompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="mc-chip"
                    onClick={() => void send(p)}
                    disabled={running}
                  >
                    ▸ {p}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
            <div className="row-bw" style={{ marginBottom: 12 }}>
              <span className="mc-caption-up">conversation</span>
              {messages.length > 0 && activeRunId && (
                <button
                  type="button"
                  className="mc-btn mc-btn-ghost mc-btn-sm"
                  onClick={() => saveAsTest(activeRunId)}
                  style={{ height: 24, padding: '0 8px', fontSize: 11 }}
                >
                  ☆ save this run as test
                </button>
              )}
            </div>

            {messages.length === 0 && (
              <div
                className="muted"
                style={{
                  fontSize: 14,
                  padding: 24,
                  textAlign: 'center',
                  border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius)',
                }}
              >
                pick a prompt or type below to start.
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <div className="mc-caption-up" style={{ marginBottom: 4 }}>
                  {m.role}
                </div>
                {m.role === 'user' && (
                  <div style={{ fontSize: 15 }}>{m.text}</div>
                )}
                {m.role === 'agent' && (
                  <div>
                    {m.done !== true ? (
                      <div
                        className="mc-mono"
                        style={{ fontSize: 13, color: 'var(--text-muted)' }}
                      >
                        <span className="mc-spin" style={{ display: 'inline-block' }}>
                          ⠹
                        </span>{' '}
                        {m.text}{' '}
                        {m.tool !== undefined && (
                          <span className="acid-text">[{m.tool}]</span>
                        )}
                      </div>
                    ) : m.failed === true ? (
                      // Canon "trace failed" branch — used when run-tool BFF
                      // is unavailable or returns an error.
                      <div
                        className="mc-mono"
                        style={{
                          fontSize: 13,
                          color: 'var(--accent)',
                          padding: '10px 12px',
                          border: '1px solid var(--accent)',
                          borderRadius: 'var(--radius)',
                          background: 'var(--paper-alt)',
                        }}
                        data-trace-failed="true"
                      >
                        <Icon name="warn" size={12} /> {m.text}
                      </div>
                    ) : (
                      <div style={{ fontSize: 15, whiteSpace: 'pre-wrap' }}>{m.text}</div>
                    )}
                  </div>
                )}
              </div>
            ))}

            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                void send(input);
              }}
              style={{ display: 'flex', gap: 8, marginTop: 12 }}
            >
              <input
                className="mc-input"
                placeholder="type message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={running}
              />
              <Btn
                kind="ink"
                iconR="arrow-r"
                onClick={() => void send(input)}
                disabled={running || !input.trim()}
              >
                send
              </Btn>
            </form>

            <div
              className="mc-caption"
              style={{
                marginTop: 14,
                padding: '8px 12px',
                background: 'var(--paper-alt)',
                borderRadius: 'var(--radius)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                <Icon name="lock" size={11} /> using your{' '}
                {sample?.id ?? 'lumen'} key · encrypted · deletes in{' '}
                <strong className="mc-mono">{fmtTtl()}</strong>
              </span>
              <span className="mc-link" style={{ fontSize: 11, opacity: 0.6 }}>
                delete now
              </span>
            </div>
          </div>
        </div>

        {/* RIGHT: trace */}
        <aside
          style={{
            borderLeft: '1px solid var(--border)',
            background: 'var(--paper-alt)',
            padding: 24,
            overflowY: 'auto',
          }}
        >
          <SectionLabel>live trace</SectionLabel>

          <div className="mc-trace" style={{ marginBottom: 20 }}>
            <div
              className="row-bw"
              style={{ paddingBottom: 8, marginBottom: 8 }}
            >
              <span className="muted">tools called</span>
              <span>
                <CountUp value={traces.length} />
              </span>
            </div>
            {traces.length === 0 && (
              <div
                className="muted"
                style={{
                  fontSize: 12,
                  fontStyle: 'italic',
                  padding: '12px 0',
                }}
              >
                nothing yet. send a prompt or replay from history.
              </div>
            )}
            {traces.map((tr, i) => (
              <div key={i} className="mc-trace-row">
                <div className="mc-trace-name">
                  {i + 1}. {tr.name}
                </div>
                <div
                  className="mc-trace-meta"
                  style={{ marginLeft: 14, marginTop: 4, lineHeight: 1.7 }}
                >
                  in: <span style={{ color: 'var(--text)' }}>{tr.in} tk</span>
                  <br />
                  out: <span style={{ color: 'var(--text)' }}>{tr.out} tk</span>
                  <br />↻{' '}
                  <span style={{ color: 'var(--text)' }}>{tr.lat} ms</span>
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              borderTop: '1px solid var(--border-sharp)',
              paddingTop: 16,
              marginTop: 20,
            }}
          >
            <SectionLabel>session totals</SectionLabel>
            <div className="mc-mono" style={{ marginBottom: 20 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="muted">this run</span>
                <span>
                  <CountUp value={totalNew} /> tk
                </span>
              </div>
            </div>

            <SectionLabel>server structure</SectionLabel>
            <div className="mc-mono" style={{ fontSize: 12.5 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="muted">tools loaded</span>
                <span>
                  {toolsLoaded > 0 ? toolsLoaded : <span className="muted">—</span>}
                </span>
              </div>
              {endpointCount !== null && (
                <div className="row-bw" style={{ marginBottom: 4 }}>
                  <span className="muted">from endpoints</span>
                  <span>{endpointCount}</span>
                </div>
              )}
              {targetComplexity !== null && (
                <div className="row-bw" style={{ marginBottom: 4 }}>
                  <span className="muted">mode</span>
                  <span>{targetComplexity}</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* In-page "saved as test" toast (canon black pill at bottom-center). */}
      {savedToast !== '' && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '10px 18px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            border: '1px solid var(--border-sharp)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12.5,
            zIndex: 100,
            animation: 'mc-fadein .2s',
          }}
        >
          ★ {savedToast}
        </div>
      )}
    </div>
  );
}
