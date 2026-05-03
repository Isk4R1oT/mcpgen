// apps/web/src/components/screens/playground/playground.tsx
//
// Phase 1 / Agent A5 — Playground screen.
//
// Source of truth: claude-design-reference/canon/screen-playground.jsx
// (`Playground({ onBack, onDeploy, sample })`). Pixel-faithful rebuild against
// the production primitive kit (`@/components/ui/*`) + typed BFF clients.
//
// Backend wiring (per A5 brief + SCREEN-BEHAVIORS-CATALOG § playground):
//   - The `POST /api/v1/playground/:id/invoke` endpoint is MISSING (REQ-001).
//     We use the disabled-stub `runPlaygroundTool()` from `@/lib/api/playground`
//     gated behind `ui_playground_run_tool_perm` (default OFF). When the stub
//     returns `flag_off_or_not_implemented`, we render canon's "trace failed"
//     branch (an inline agent message + zero-state in the trace rail) instead
//     of the canon fake-success path with `FAKE_TRANSACTIONS`.
//   - Real tool list comes from `useJobArtifact(jobId, 'final-tools')` —
//     populated by the engine after Pass 1. Until artefacts arrive, the
//     dropdown shows canon's hard-coded fallback "list_charges".
//   - Tool-name dropdown sits where canon's "agent" model dropdown lived — the
//     BYOK model dropdown is gated behind `ui_playground_byok_perm` and is
//     out of scope for A5.
//
// State preserved verbatim from canon:
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
import { useJobArtifact } from '@/lib/api/jobs';
import { runPlaygroundTool } from '@/lib/api/playground';

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
  readonly onBack?: () => void;
  readonly onDeploy?: () => void;
  /** Override the default OFF playground-run flag (used by tests). */
  readonly runToolEnabled?: boolean;
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
// Canon-verbatim suggested prompts + seed history.
// ────────────────────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS: readonly string[] = [
  'show last 5 transactions',
  'find account by email rio@example.com',
  'refund charge ch_8a2f',
  'list active plans',
];

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

const SEED_HISTORY: readonly HistoryRun[] = [
  { id: 'h1', label: 'list active plans',                  prompt: 'list active plans',                          tools: ['list_plans'],          tk: 412,  ms: 180, when: '2m ago',   savedAsTest: false },
  { id: 'h2', label: 'find rio@example.com',               prompt: 'find account by email rio@example.com',     tools: ['find_customer'],       tk: 388,  ms: 220, when: '7m ago',   savedAsTest: true  },
  { id: 'h3', label: 'order_lifecycle composite test',     prompt: 'create order for new customer kira@x.com',   tools: ['order_lifecycle'],     tk: 624,  ms: 410, when: '14m ago',  savedAsTest: true  },
  { id: 'h4', label: 'refund w/ audit trail',              prompt: 'refund charge ch_8a2f and log it',          tools: ['refund_with_audit'],   tk: 506,  ms: 320, when: '22m ago',  savedAsTest: false },
  { id: 'h5', label: 'last 10 transactions',               prompt: 'show last 10 transactions for customer ali', tools: ['list_charges'],        tk: 478,  ms: 260, when: '38m ago',  savedAsTest: false },
];

// ────────────────────────────────────────────────────────────────────────────
// Tool-list extraction from `useJobArtifact(jobId, 'final-tools')`.
// ────────────────────────────────────────────────────────────────────────────

interface FinalToolsArtifact {
  readonly final_tools?: ReadonlyArray<{ readonly name?: unknown }>;
}

function extractToolNames(raw: unknown): readonly string[] {
  if (raw === null || typeof raw !== 'object') return [];
  // Engine writes either `{ final_tools: [...] }` or a bare array.
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const t of raw) {
      if (t !== null && typeof t === 'object' && typeof (t as { name?: unknown }).name === 'string') {
        out.push((t as { name: string }).name);
      }
    }
    return out;
  }
  const obj = raw as FinalToolsArtifact;
  if (Array.isArray(obj.final_tools)) {
    const out: string[] = [];
    for (const t of obj.final_tools) {
      if (typeof t?.name === 'string') out.push(t.name);
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
  readonly rows?: ReadonlyArray<{ amt: string; date: string }>;
  readonly totalAmount?: string;
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
  onBack,
  onDeploy,
  runToolEnabled = false,
}: PlaygroundProps): ReactElement {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [keyTtl, setKeyTtl] = useState<number>(47 * 60);
  const [history, setHistory] = useState<readonly HistoryRun[]>(SEED_HISTORY);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'tests'>('all');
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string>('');
  const [selectedTool, setSelectedTool] = useState<string>(FALLBACK_TOOL);

  // Tool catalog — engine artefact, populated post-Pass-1.
  const artifactQuery = useJobArtifact(jobId, 'final-tools');
  const toolNames = useMemo<readonly string[]>(() => {
    const r = artifactQuery.data;
    if (r === undefined || !r.ok) return [];
    return extractToolNames(r.data);
  }, [artifactQuery.data]);

  const visibleTools = toolNames.length > 0 ? toolNames : [FALLBACK_TOOL];

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

    // Insert pending agent message.
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        { role: 'agent', text: 'fetching…', tool: selectedTool },
      ]);
    }, 400);

    // Real or stub invocation.
    const result = await runPlaygroundTool({
      jobId,
      toolName: selectedTool,
      prompt: text,
    });

    if (!runToolEnabled || !result.ok) {
      // FLAG OFF or stub returned `flag_off_or_not_implemented` / network err.
      // Render canon's "trace failed" branch (per A5 brief).
      const reason =
        result.ok === false
          ? result.error === 'flag_off_or_not_implemented'
            ? 'tool execution is not yet available in this build.'
            : `trace failed: ${result.error}`
          : 'tool execution disabled.';
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

    // Real success path (post-flag-flip).
    const { trace, text: replyText, rows, totalAmount } = result.data;
    setTraces((t) => [
      ...t,
      { n: t.length + 1, name: trace.name, in: trace.in, out: trace.out, lat: trace.lat },
    ]);
    setMessages((m) => {
      const copy = [...m];
      copy[copy.length - 1] = {
        role: 'agent',
        done: true,
        text: replyText,
        ...(rows !== undefined ? { rows } : {}),
        ...(totalAmount !== undefined ? { totalAmount } : {}),
      };
      return copy;
    });
    const newId = 'h' + Date.now();
    setHistory((h) =>
      [
        {
          id: newId,
          label: text.length > 40 ? text.slice(0, 38) + '…' : text,
          prompt: text,
          tools: [trace.name],
          tk: trace.in + trace.out,
          ms: trace.lat,
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
    setHistory((h) => h.map((r) => (r.id === id ? { ...r, savedAsTest: true } : r)));
    setSavedToast('saved as test');
    setTimeout(() => setSavedToast(''), 1800);
  };

  const filteredHistory = history.filter(
    (r) => historyFilter === 'all' || r.savedAsTest,
  );
  const testCount = history.filter((r) => r.savedAsTest).length;

  // Token-economy math (canon formula, kept verbatim).
  const totalNew = traces.reduce((s, t) => s + t.in + t.out + 1022, 0);
  const totalNaive = traces.length ? totalNew * 3.9 : 0;
  const cost = ((totalNew / 1e6) * 15).toFixed(3);
  const naiveCost = ((totalNaive / 1e6) * 15).toFixed(3);

  const crumb = `${sample?.name ?? 'lumen-payments'}-mcp · playground`;

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

          {testCount > 0 && (
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
                run all {testCount} tests on every spec change. fails block
                auto-regenerate.
              </div>
              <button
                type="button"
                className="mc-btn mc-btn-ink mc-btn-sm mc-btn-full"
                style={{ height: 28, fontSize: 11 }}
                disabled
                title="regression suite is not yet available"
              >
                <Icon name="play" size={9} /> run suite
              </button>
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

          <SectionLabel>try a prompt</SectionLabel>
          <div className="mc-chiprow" style={{ marginBottom: 24 }}>
            {SUGGESTED_PROMPTS.map((p) => (
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
                      <div>
                        <div style={{ fontSize: 15, marginBottom: 8 }}>{m.text}</div>
                        {m.rows !== undefined && (
                          <div
                            className="mc-mono"
                            style={{
                              fontSize: 13.5,
                              lineHeight: 1.7,
                              paddingLeft: 14,
                              borderLeft: '2px solid var(--border)',
                            }}
                          >
                            {m.rows.map((r) => (
                              <div key={r.amt + r.date}>
                                • {r.amt} <span className="muted">{r.date}</span>
                              </div>
                            ))}
                            {m.totalAmount !== undefined && (
                              <div
                                style={{
                                  marginTop: 6,
                                  paddingTop: 6,
                                  borderTop: '1px dashed var(--border)',
                                }}
                              >
                                total: <strong>{m.totalAmount}</strong>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
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
            <div className="mc-mono" style={{ marginBottom: 16 }}>
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="muted">this run</span>
                <span>
                  <CountUp value={totalNew} /> tk
                </span>
              </div>
              <div className="row-bw">
                <span className="muted">cost</span>
                <span>${cost}</span>
              </div>
            </div>
            <div
              className="mc-mono"
              style={{ marginBottom: 16, opacity: traces.length ? 1 : 0.4 }}
            >
              <div className="row-bw" style={{ marginBottom: 4 }}>
                <span className="muted">same on naive</span>
                <span>
                  <CountUp value={Math.round(totalNaive)} /> tk
                </span>
              </div>
              <div className="row-bw">
                <span className="muted">would cost</span>
                <span>${naiveCost}</span>
              </div>
            </div>

            {traces.length > 0 && (
              <div
                style={{
                  padding: 14,
                  background: 'var(--primary)',
                  color: 'var(--primary-ink)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border-sharp)',
                }}
              >
                <div
                  className="mc-caption-up"
                  style={{ color: 'var(--primary-ink)', opacity: 0.7 }}
                >
                  saved this session
                </div>
                <div
                  className="mc-mono"
                  style={{ fontSize: 26, fontWeight: 500, marginTop: 4 }}
                >
                  ${(parseFloat(naiveCost) - parseFloat(cost)).toFixed(3)}{' '}
                  <span style={{ fontSize: 14 }}>· ↓75%</span>
                </div>
              </div>
            )}
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
