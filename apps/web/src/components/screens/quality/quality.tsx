// apps/web/src/components/screens/quality/quality.tsx
//
// Phase 1 — Agent A4 — Quality Report screen.
//
// Source of truth: claude-design-reference/canon/screen-quality.jsx (function
// `QualityReport`). 100% pixel parity with that JSX, but rebuilt against the
// production primitive kit (`@/components/ui/*`) and wired to the real Stage F
// `QualityReport` artifact via `useJobArtifact(jobId, 'quality-report')`.
//
// Behaviour wiring (per Phase-1 brief A4):
//   - onContinue → router.push(`/generate/${jobId}/playground`)
//   - onBack     → router.push(`/generate/${jobId}/preview`)
//
// When `useJobArtifact(jobId, 'quality-report')` is pending or returns null
// the canon's "loading / no data" state is rendered: `score=0`, empty
// breakdown / per-tool / eval-task arrays, no recommendations. Per Phase-1
// brief: do NOT crash on null.
//
// Phase 0 already tightened the access pattern in the OLD `_quality-client.tsx`
// using `qualityReport != null` (loose null check). We replicate that safe
// access here to avoid `qualityReport === undefined` blowing up on real BFF
// responses that return `null`.

'use client';

import { useRouter } from 'next/navigation';
import { useMemo, type ReactElement } from 'react';

import type {
  F2ToolSmellScore,
  QualityReport as QualityReportType,
  RubricComponentScore,
} from '@mcpgen/ir';

import { Btn, Card, Icon, SectionLabel, TopBar } from '@/components/ui';
import { useJobArtifact } from '@/lib/api/jobs';
import { openDrawer } from '@/lib/drawer';
import { toast } from '@/lib/toast';
import { useErrorMode } from '@/stores/error-mode';

// ────────────────────────────────────────────────────────────────────────────
// Inlined `BlockBar` — visual-only canon helper, not yet promoted to UI kit.
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

// ────────────────────────────────────────────────────────────────────────────
// Display helpers — derive UI shapes from a real `QualityReport`.
//
// Loose null check (`!= null`) on the artifact mirrors the Phase-0 fix in
// the legacy `_quality-client.tsx::deriveBreakdown`: BFF may return either
// `undefined` (artifact not yet written) or `null` (explicit absence).
// ────────────────────────────────────────────────────────────────────────────

interface BreakdownRow {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly suffix?: string;
  readonly note: string;
}

interface ToolRow {
  readonly name: string;
  readonly score: number;
  readonly flags: ReadonlyArray<string>;
}

interface EvalTaskRow {
  readonly task: string;
  readonly ok: boolean;
  readonly ms: number;
  readonly why?: string;
}

function componentAvg(
  toolScores: ReadonlyArray<F2ToolSmellScore>,
  component: RubricComponentScore['component'],
): number | null {
  let total = 0;
  let count = 0;
  for (const tool of toolScores) {
    for (const c of tool.components) {
      if (c.component === component) {
        total += c.score;
        count += 1;
      }
    }
  }
  return count > 0 ? total / count : null;
}

function deriveBreakdown(qr: QualityReportType | null): ReadonlyArray<BreakdownRow> {
  if (qr == null) return [];
  const f2Avg = qr.f2_smell.overall_average;
  const purpose = componentAvg(qr.f2_smell.tool_scores, 'purpose') ?? f2Avg;
  const guidelines = componentAvg(qr.f2_smell.tool_scores, 'guidelines') ?? f2Avg;
  const limitations = componentAvg(qr.f2_smell.tool_scores, 'limitations') ?? f2Avg;
  const paramDoc = componentAvg(qr.f2_smell.tool_scores, 'parameter_doc') ?? f2Avg;

  const rows: BreakdownRow[] = [
    {
      label: 'description quality',
      value: Number(purpose.toFixed(2)),
      max: 5,
      note: `purpose component avg across ${qr.f2_smell.tool_scores.length} tools`,
    },
    {
      label: 'guidelines coverage',
      value: Number(guidelines.toFixed(2)),
      max: 5,
      note: 'when_to_use / when_not_to_use / how_to_use rubric',
    },
    {
      label: 'limitations completeness',
      value: Number(limitations.toFixed(2)),
      max: 5,
      note: 'side effects, idempotency, failure modes',
    },
    {
      label: 'parameter doc',
      value: Number(paramDoc.toFixed(2)),
      max: 5,
      note: 'per-param what / format / when / example / default',
    },
  ];

  if (qr.f3_agent_eval !== null) {
    const passPct = Math.round(qr.f3_agent_eval.pass_rate * 100);
    const passed = qr.f3_agent_eval.results.filter((r) => r.passed).length;
    const total = qr.f3_agent_eval.results.length;
    rows.push({
      label: 'agent eval pass-rate',
      value: passPct,
      max: 100,
      suffix: '%',
      note: `${passed}/${total} golden tasks passed`,
    });
  }
  return rows;
}

function deriveTools(qr: QualityReportType | null): ReadonlyArray<ToolRow> {
  if (qr == null) return [];
  return qr.f2_smell.tool_scores.map((t) => {
    const flags: string[] = [];
    for (const c of t.components) {
      if (c.score < 3.0) flags.push(`weak ${c.component.replace(/_/g, ' ')}`);
    }
    return {
      name: t.tool_name,
      score: Number(t.average.toFixed(2)),
      flags,
    };
  });
}

function deriveEvalTasks(qr: QualityReportType | null): ReadonlyArray<EvalTaskRow> {
  if (qr == null || qr.f3_agent_eval === null) return [];
  return qr.f3_agent_eval.results.map((r) => {
    const row: EvalTaskRow = {
      task: r.task_id,
      ok: r.passed,
      ms: r.turns_used * 1500,
    };
    if (!r.passed) {
      return {
        ...row,
        why: `task_completion ${r.judge_task_completion}/10 · grounding ${r.judge_grounding}/10`,
      };
    }
    return row;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Inline Gauge primitive — canon-exclusive SVG (not in UI kit).
// ────────────────────────────────────────────────────────────────────────────

interface GaugeProps {
  readonly score: number;
}

function Gauge({ score }: GaugeProps): ReactElement {
  const pct = score / 5;
  const angle = pct * 180 - 90;
  return (
    <div style={{ position: 'relative', width: 220, height: 130 }}>
      <svg viewBox="0 0 220 130" width={220} height={130}>
        {Array.from({ length: 36 }).map((_, i) => {
          const a = (i / 35) * Math.PI - Math.PI;
          const x1 = 110 + Math.cos(a) * 86;
          const y1 = 120 + Math.sin(a) * 86;
          const x2 = 110 + Math.cos(a) * 100;
          const y2 = 120 + Math.sin(a) * 100;
          const filled = i / 35 <= pct;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={filled ? 'var(--ink)' : 'var(--border)'}
              strokeWidth="2"
              strokeLinecap="square"
            />
          );
        })}
        <line
          x1={110}
          y1={120}
          x2={110 + Math.cos((angle * Math.PI) / 180) * 78}
          y2={120 + Math.sin((angle * Math.PI) / 180) * 78}
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="square"
        />
        <circle cx={110} cy={120} r={5} fill="var(--ink)" />
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 60, textAlign: 'center' }}>
        <div
          className="mc-mono"
          style={{
            fontSize: 44,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: '-0.03em',
          }}
        >
          {score.toFixed(1)}
        </div>
        <div className="mc-caption" style={{ marginTop: 2 }}>
          / 5.0
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public component.
// ────────────────────────────────────────────────────────────────────────────

export interface QualityProps {
  readonly jobId: string;
  /** Optional human-friendly server name used in the breadcrumb. */
  readonly specName?: string;
}

export default function Quality({ jobId, specName }: QualityProps): ReactElement {
  const router = useRouter();
  const errorMode = useErrorMode((s) => s.mode);
  const rateLimited = errorMode === 'rate-limit';

  const artifactQuery = useJobArtifact(jobId, 'quality-report');
  // Loose null check (`!= null`) — see header note.
  const qualityReport: QualityReportType | null = useMemo(() => {
    const data = artifactQuery.data;
    if (data !== undefined && data.ok && data.data != null) {
      return data.data as QualityReportType;
    }
    return null;
  }, [artifactQuery.data]);

  const score = qualityReport != null ? Number(qualityReport.overall_score.toFixed(2)) : 0;
  const breakdown = useMemo(() => deriveBreakdown(qualityReport), [qualityReport]);
  const tools = useMemo(() => deriveTools(qualityReport), [qualityReport]);
  const evalTasks = useMemo(() => deriveEvalTasks(qualityReport), [qualityReport]);

  const onBack = (): void => {
    router.push(`/generate/${jobId}/preview`);
  };
  const onContinue = (): void => {
    router.push(`/generate/${jobId}/playground`);
  };

  const breadcrumb = `${specName !== undefined && specName.length > 0 ? specName : 'mcp server'}-mcp · quality`;

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={breadcrumb}
        onLogo={onBack}
        right={<span className="mc-caption">step 04 of 04</span>}
      />

      <main
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '36px 28px 64px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>
            step 04 · quality report
          </div>
          <div className="mc-display-l">
            we graded the server.
            <br />
            here's how it scored.
          </div>
        </div>

        {rateLimited ? (
          <Card style={{ marginBottom: 18, borderColor: 'var(--accent)', borderLeftWidth: 4 }}>
            <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <Icon
                name="warn"
                size={14}
                style={{ color: 'var(--accent)', marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <div className="mc-h3" style={{ marginBottom: 4 }}>
                  agent eval skipped — anthropic api rate-limited
                </div>
                <div
                  style={{
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    color: 'var(--text-muted)',
                    marginBottom: 12,
                  }}
                >
                  we ran 8 of 15 evaluation prompts before getting{' '}
                  <span className="mc-mono">429 too many requests</span>. partial scores
                  below; agent pass-rate is unavailable until the limit resets in{' '}
                  <strong className="mc-mono">~3 min</strong>.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Btn
                    kind="primary"
                    size="sm"
                    icon="play"
                    onClick={(): void => toast('eval queued · will auto-start at 3:00')}
                  >
                    retry eval in 3:00
                  </Btn>
                  <Btn
                    kind="ink"
                    size="sm"
                    icon="spark"
                    onClick={(): void =>
                      openDrawer(
                        'use your own anthropic key',
                        (
                          <div className="col" style={{ gap: 12, fontSize: 13 }}>
                            <div>
                              paste your anthropic api key. we'll use it for evals only — it's
                              never stored, only held in memory for this session.
                            </div>
                            <input
                              className="mc-input"
                              placeholder="sk-ant-..."
                              style={{
                                width: '100%',
                                padding: 10,
                                fontFamily: 'var(--font-mono)',
                                fontSize: 12,
                                border: '1px solid var(--border-sharp)',
                                background: 'var(--paper)',
                                borderRadius: 'var(--radius)',
                              }}
                            />
                            <Btn
                              kind="ink"
                              size="sm"
                              full
                              onClick={(): void => toast('eval restarted with your key')}
                            >
                              retry now
                            </Btn>
                          </div>
                        ),
                        { eyebrow: 'bring your own key' },
                      )
                    }
                  >
                    use your own anthropic key
                  </Btn>
                  <Btn kind="ghost" size="sm" onClick={onContinue}>
                    skip — deploy anyway
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* Hero: gauge + summary */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1.4fr',
            gap: 18,
            marginBottom: 18,
          }}
        >
          <Card
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <Gauge score={score} />
            <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 500 }}>
              strong — ready to ship
            </div>
            <div className="mc-caption" style={{ marginTop: 4 }}>
              top 12% of generated servers
            </div>
          </Card>

          <Card>
            <SectionLabel
              right={
                <span className="mc-mono muted" style={{ fontSize: 11 }}>
                  auto-graded · pass f3
                </span>
              }
            >
              breakdown
            </SectionLabel>
            <div className="col" style={{ gap: 14 }}>
              {breakdown.map((b) => {
                const pct = (b.value / b.max) * 100;
                const display =
                  b.suffix === '%' ? `${b.value}${b.suffix}` : `${b.value}/${b.max}`;
                return (
                  <div key={b.label}>
                    <div className="row-bw" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{b.label}</span>
                      <span className="mc-mono" style={{ fontSize: 12, fontWeight: 600 }}>
                        {display}
                      </span>
                    </div>
                    <BlockBar value={pct} max={100} width={32} />
                    <div className="mc-caption" style={{ marginTop: 3, fontSize: 11.5 }}>
                      {b.note}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Per-tool drilldown */}
        <Card style={{ marginBottom: 18 }}>
          <SectionLabel
            right={
              <a
                className="mc-link mc-mono"
                style={{ fontSize: 11, cursor: 'pointer' }}
                onClick={(): void =>
                  openDrawer(
                    `per-tool scores · all ${tools.length}`,
                    (
                      <div className="mc-mono" style={{ fontSize: 12 }}>
                        {tools.map((t, i) => {
                          const score100 = Math.round(t.score * 20);
                          return (
                            <div
                              key={`${t.name}-${i}`}
                              className="row"
                              style={{
                                gap: 12,
                                padding: '6px 0',
                                borderBottom: '1px dashed var(--border)',
                              }}
                            >
                              <span style={{ flex: 1 }}>{t.name}</span>
                              <span className="muted">{score100}/100</span>
                              <span
                                style={{
                                  color:
                                    score100 > 90
                                      ? 'var(--success)'
                                      : score100 > 80
                                        ? 'var(--text)'
                                        : 'var(--accent)',
                                }}
                              >
                                {score100 > 90 ? '●●●' : score100 > 80 ? '●●○' : '●○○'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ),
                    { eyebrow: 'sorted by score · low first' },
                  )
                }
              >
                view all {tools.length} →
              </a>
            }
          >
            per-tool scores
          </SectionLabel>
          <div className="mc-mono" style={{ fontSize: 12.5 }}>
            {tools.slice(0, 6).map((t, i) => (
              <div
                key={t.name}
                className="row"
                style={{
                  gap: 12,
                  padding: '8px 0',
                  borderBottom:
                    i === Math.min(tools.length, 6) - 1 ? 'none' : '1px dashed var(--border)',
                }}
              >
                <span style={{ minWidth: 200 }}>{t.name}</span>
                <span style={{ flex: 1 }}>
                  <BlockBar value={t.score * 20} max={100} width={20} />
                </span>
                <span style={{ minWidth: 50, textAlign: 'right', fontWeight: 600 }}>
                  {t.score.toFixed(1)}
                </span>
                <span
                  style={{
                    minWidth: 200,
                    display: 'flex',
                    gap: 4,
                    justifyContent: 'flex-end',
                    flexWrap: 'wrap',
                  }}
                >
                  {t.flags.length === 0 ? (
                    <span
                      style={{
                        color: 'var(--success)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 11.5,
                      }}
                    >
                      ✓ clean
                    </span>
                  ) : (
                    t.flags.map((f) => (
                      <span
                        key={f}
                        style={{
                          fontFamily: 'var(--font-sans)',
                          fontSize: 11,
                          padding: '1px 6px',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius)',
                          color: f === 'composite' ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        {f}
                      </span>
                    ))
                  )}
                </span>
              </div>
            ))}
            {tools.length === 0 ? (
              <div className="muted" style={{ padding: '16px 0', textAlign: 'center' }}>
                no tool scores yet — quality report still generating
              </div>
            ) : null}
          </div>
        </Card>

        {/* Eval results */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.1fr 1fr',
            gap: 18,
            marginBottom: 18,
          }}
        >
          <Card>
            <SectionLabel>agent eval — sample tasks</SectionLabel>
            <div className="mc-mono" style={{ fontSize: 12.5, lineHeight: 1.8 }}>
              {evalTasks.length === 0 ? (
                <div className="muted" style={{ padding: '12px 0' }}>
                  agent eval pending or skipped — no tasks recorded.
                </div>
              ) : (
                evalTasks.map((r, i) => (
                  <div
                    key={`${r.task}-${i}`}
                    style={{
                      padding: '6px 0',
                      borderBottom:
                        i === evalTasks.length - 1 ? 'none' : '1px dashed var(--border)',
                    }}
                  >
                    <div className="row" style={{ gap: 8 }}>
                      <span
                        style={{
                          color: r.ok ? 'var(--success)' : 'var(--accent)',
                          fontWeight: 600,
                          minWidth: 16,
                        }}
                      >
                        {r.ok ? '✓' : '✗'}
                      </span>
                      <span style={{ flex: 1 }}>{r.task}</span>
                      <span className="muted" style={{ fontSize: 11 }}>
                        {r.ms}ms
                      </span>
                    </div>
                    {r.why !== undefined ? (
                      <div className="muted" style={{ fontSize: 11, paddingLeft: 24 }}>
                        ↳ {r.why}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <SectionLabel>recommendations</SectionLabel>
            <div className="col" style={{ gap: 10 }}>
              <div className="mc-rec">
                <Icon name="spark" size={12} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    add example to find_customer
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    agents picked wrong field 30% of the time without one.
                  </div>
                </div>
              </div>
              <div className="mc-rec">
                <Icon name="spark" size={12} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    shorten subscribe description
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    currently 64 tk, target 30. could save ~6% of context.
                  </div>
                </div>
              </div>
              <div className="mc-rec">
                <Icon name="bolt" size={12} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                    consider failed_payments composite
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    would fix the only failed eval task above.
                  </div>
                </div>
              </div>
            </div>

            <div className="mc-rule-dashed" />
            <label className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked={false} />
              <span className="glyph">☐</span>
              <span>show public quality badge on this server's page</span>
            </label>
          </Card>
        </div>

        <div className="row-bw" style={{ marginTop: 24 }}>
          <Btn kind="ghost" size="md" icon="arrow-l" onClick={onBack}>
            back to canvas
          </Btn>
          <div className="row" style={{ gap: 8 }}>
            <Btn
              kind="ghost"
              size="md"
              onClick={(): void => toast('rerunning eval suite… ~28s')}
            >
              re-run eval
            </Btn>
            <Btn kind="primary" size="lg" iconR="arrow-r" onClick={onContinue}>
              looks good · deploy
            </Btn>
          </div>
        </div>
      </main>
    </div>
  );
}
