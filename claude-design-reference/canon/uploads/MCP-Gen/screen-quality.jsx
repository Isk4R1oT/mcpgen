// screen-quality.jsx — Quality Report (after canvas, before deploy)

function QualityReport({ sample, onContinue, onBack }) {
  const score = 4.3;
  const breakdown = [
    { label: 'description quality',   value: 4.2, max: 5,   note: 'concise, action-led, average 38 tk' },
    { label: 'annotations coverage',  value: 5.0, max: 5,   note: 'every tool tagged · readonly / destructive / idempotent' },
    { label: 'composite tools',       value: 3,   max: 5,   note: '3 created · order_lifecycle, refund_with_audit, customer_with_history' },
    { label: 'agent eval pass-rate',  value: 87,  max: 100, suffix: '%', note: '5 tasks tested · claude opus 4 · 13/15 successful' },
    { label: 'param naming',          value: 4.6, max: 5,   note: 'snake_case throughout · 0 collisions · 2 minor abbreviations' },
  ];

  const tools = [
    { name: 'list_charges',     score: 4.8, flags: [] },
    { name: 'create_charge',    score: 4.5, flags: ['needs example'] },
    { name: 'order_lifecycle',  score: 4.9, flags: ['composite'] },
    { name: 'refund_charge',    score: 4.6, flags: [] },
    { name: 'find_customer',    score: 4.0, flags: ['vague description'] },
    { name: 'subscribe',        score: 3.9, flags: ['missing param doc'] },
  ];

  const Gauge = ({ score }) => {
    const pct = score / 5;
    const angle = pct * 180 - 90;
    return (
      <div style={{ position: 'relative', width: 220, height: 130 }}>
        <svg viewBox="0 0 220 130" width={220} height={130}>
          {/* Track ticks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const a = (i / 35) * Math.PI - Math.PI;
            const x1 = 110 + Math.cos(a) * 86, y1 = 120 + Math.sin(a) * 86;
            const x2 = 110 + Math.cos(a) * 100, y2 = 120 + Math.sin(a) * 100;
            const filled = i / 35 <= pct;
            return (
              <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={filled ? 'var(--ink)' : 'var(--border)'} strokeWidth="2" strokeLinecap="square" />
            );
          })}
          {/* Needle */}
          <line
            x1={110} y1={120}
            x2={110 + Math.cos((angle * Math.PI) / 180) * 78}
            y2={120 + Math.sin((angle * Math.PI) / 180) * 78}
            stroke="var(--accent)" strokeWidth="3" strokeLinecap="square"
          />
          <circle cx={110} cy={120} r={5} fill="var(--ink)" />
        </svg>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 60, textAlign: 'center' }}>
          <div className="mc-mono" style={{ fontSize: 44, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {score.toFixed(1)}
          </div>
          <div className="mc-caption" style={{ marginTop: 2 }}>/ 5.0</div>
        </div>
      </div>
    );
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`${sample?.name || 'lumen-payments'}-mcp · quality`}
        onLogo={onBack}
        right={<span className="mc-caption">step 04 of 04</span>}
      />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '36px 28px 64px', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 28 }}>
          <div className="mc-caption-up" style={{ marginBottom: 6 }}>step 04 · quality report</div>
          <div className="mc-display-l">we graded the server.<br/>here's how it scored.</div>
        </div>

        {/* Hero: gauge + summary */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 18, marginBottom: 18 }}>
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <Gauge score={score} />
            <div style={{ marginTop: 8, fontSize: 13.5, fontWeight: 500 }}>strong — ready to ship</div>
            <div className="mc-caption" style={{ marginTop: 4 }}>top 12% of generated servers</div>
          </Card>

          <Card>
            <SectionLabel right={<span className="mc-mono muted" style={{ fontSize: 11 }}>auto-graded · pass f3</span>}>breakdown</SectionLabel>
            <div className="col" style={{ gap: 14 }}>
              {breakdown.map(b => {
                const pct = (b.value / b.max) * 100;
                const display = b.suffix === '%' ? `${b.value}${b.suffix}` : `${b.value}/${b.max}`;
                return (
                  <div key={b.label}>
                    <div className="row-bw" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{b.label}</span>
                      <span className="mc-mono" style={{ fontSize: 12, fontWeight: 600 }}>{display}</span>
                    </div>
                    <BlockBar value={pct} max={100} width={32} />
                    <div className="mc-caption" style={{ marginTop: 3, fontSize: 11.5 }}>{b.note}</div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Per-tool drilldown */}
        <Card style={{ marginBottom: 18 }}>
          <SectionLabel right={<a className="mc-link mc-mono" style={{ fontSize: 11 }}>view all 47 →</a>}>per-tool scores</SectionLabel>
          <div className="mc-mono" style={{ fontSize: 12.5 }}>
            {tools.map((t, i) => (
              <div key={t.name} className="row" style={{ gap: 12, padding: '8px 0', borderBottom: i === tools.length - 1 ? 'none' : '1px dashed var(--border)' }}>
                <span style={{ minWidth: 200 }}>{t.name}</span>
                <span style={{ flex: 1 }}><BlockBar value={t.score * 20} max={100} width={20} /></span>
                <span style={{ minWidth: 50, textAlign: 'right', fontWeight: 600 }}>{t.score.toFixed(1)}</span>
                <span style={{ minWidth: 200, display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {t.flags.length === 0 ? (
                    <span style={{ color: 'var(--success)', fontFamily: 'var(--font-sans)', fontSize: 11.5 }}>✓ clean</span>
                  ) : t.flags.map(f => (
                    <span key={f} style={{
                      fontFamily: 'var(--font-sans)', fontSize: 11,
                      padding: '1px 6px', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius)',
                      color: f === 'composite' ? 'var(--accent)' : 'var(--text-muted)',
                    }}>{f}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Eval results */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 18, marginBottom: 18 }}>
          <Card>
            <SectionLabel>agent eval — sample tasks</SectionLabel>
            <div className="mc-mono" style={{ fontSize: 12.5, lineHeight: 1.8 }}>
              {[
                { task: '"refund last week\'s charge for alice@x.io"',     ok: true,  ms: 1840 },
                { task: '"how much did we charge in march?"',              ok: true,  ms: 2120 },
                { task: '"create a $99 subscription for new customer"',    ok: true,  ms: 2980 },
                { task: '"list failed payments from last 24h"',            ok: false, ms: 4200, why: 'used 3 calls instead of 1' },
                { task: '"pause then resume bob\'s subscription"',         ok: true,  ms: 2640 },
              ].map((r, i) => (
                <div key={i} style={{ padding: '6px 0', borderBottom: i === 4 ? 'none' : '1px dashed var(--border)' }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ color: r.ok ? 'var(--success)' : 'var(--accent)', fontWeight: 600, minWidth: 16 }}>
                      {r.ok ? '✓' : '✗'}
                    </span>
                    <span style={{ flex: 1 }}>{r.task}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{r.ms}ms</span>
                  </div>
                  {r.why && <div className="muted" style={{ fontSize: 11, paddingLeft: 24 }}>↳ {r.why}</div>}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <SectionLabel>recommendations</SectionLabel>
            <div className="col" style={{ gap: 10 }}>
              <div className="mc-rec">
                <Icon name="spark" size={12} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>add example to find_customer</div>
                  <div className="muted" style={{ fontSize: 12 }}>agents picked wrong field 30% of the time without one.</div>
                </div>
              </div>
              <div className="mc-rec">
                <Icon name="spark" size={12} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>shorten subscribe description</div>
                  <div className="muted" style={{ fontSize: 12 }}>currently 64 tk, target 30. could save ~6% of context.</div>
                </div>
              </div>
              <div className="mc-rec">
                <Icon name="bolt" size={12} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>consider failed_payments composite</div>
                  <div className="muted" style={{ fontSize: 12 }}>would fix the only failed eval task above.</div>
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
          <Btn kind="ghost" size="md" icon="arrow-l" onClick={onBack}>back to canvas</Btn>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="md">re-run eval</Btn>
            <Btn kind="primary" size="lg" iconR="arrow-r" onClick={onContinue}>
              looks good · deploy
            </Btn>
          </div>
        </div>
      </main>
    </div>
  );
}

window.QualityReport = QualityReport;
