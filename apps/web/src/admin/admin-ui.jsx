// admin-ui.jsx — small reusable bits for the ops console.

function Pill({ kind = '', children, dot = true }) {
  return (
    <span className={`adm-pill ${kind}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

function Sparkline({ values = [], width = 64, height = 18, kind = '' }) {
  if (!values.length) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const r = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / r) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg className="adm-spark" width={width} height={height}>
      <polyline points={pts} className={`adm-mini-spark ${kind}`} />
    </svg>
  );
}

function Toggle({ on, onChange, label }) {
  return (
    <span className={`adm-toggle ${on ? 'on' : ''}`} onClick={() => onChange && onChange(!on)}>
      <span className="track"><span className="knob" /></span>
      {label && <span>{label}</span>}
    </span>
  );
}

function StatusDotForServer(s) {
  if (s === 'live') return <Pill kind="ok">live</Pill>;
  if (s === 'flagged') return <Pill kind="warn">flagged</Pill>;
  if (s === 'incident') return <Pill kind="alert">incident</Pill>;
  if (s === 'suspended') return <Pill kind="alert">suspended</Pill>;
  if (s === 'pending') return <Pill kind="info">pending</Pill>;
  return <Pill>{s}</Pill>;
}

function PageHead({ title, sub, right }) {
  return (
    <div className="adm-page-head">
      <div>
        <h1 className="adm-page-title">{title}</h1>
        {sub && <div className="adm-page-sub">{sub}</div>}
      </div>
      {right && <div className="row" style={{ gap: 8 }}>{right}</div>}
    </div>
  );
}

function KPI({ label, value, delta, deltaKind, spark, sparkKind }) {
  return (
    <div className="adm-kpi">
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-num">{value}</div>
      {delta && <div className={`adm-kpi-delta ${deltaKind || ''}`}>{delta}</div>}
      {spark && <div className="adm-kpi-spark"><Sparkline values={spark} kind={sparkKind} /></div>}
    </div>
  );
}

function EmptyState({ title, sub, action }) {
  return (
    <div className="adm-empty">
      <div style={{ fontSize: 14, marginBottom: 6, color: 'var(--text)' }}>{title}</div>
      {sub && <div style={{ fontSize: 12 }}>{sub}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

function IncidentBanner({ children, onDismiss }) {
  return (
    <div className="adm-incident">
      <span className="strong">⚠ incident</span>
      <span style={{ flex: 1 }}>{children}</span>
      {onDismiss && <Btn kind="ghost" size="sm" onClick={onDismiss}>dismiss</Btn>}
    </div>
  );
}

Object.assign(window, { Pill, Sparkline, Toggle, StatusDotForServer, PageHead, KPI, EmptyState, IncidentBanner, Table });

function Table({ headers = [], rows = [], cols }) {
  const colCount = cols || headers.length || (rows[0] ? rows[0].length : 0);
  const grid = Array(colCount).fill('1fr').join(' ');
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>
      {headers.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '10px 14px', background: 'var(--surface-soft)', borderBottom: '1px solid var(--border)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--text-muted)' }}>
          {headers.map((h, i) => <div key={i} style={{ textAlign: i === headers.length - 1 && (h === '' || !h) ? 'right' : 'left' }}>{h}</div>)}
        </div>
      )}
      {rows.map((r, ri) => (
        <div key={ri} style={{ display: 'grid', gridTemplateColumns: grid, gap: 12, padding: '10px 14px', borderBottom: ri < rows.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
          {r.map((c, ci) => <div key={ci} style={{ textAlign: ci === r.length - 1 && (headers[ci] === '' || !headers[ci]) ? 'right' : 'left', minWidth: 0 }}>{c}</div>)}
        </div>
      ))}
    </div>
  );
}
