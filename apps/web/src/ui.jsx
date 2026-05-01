// ui.jsx — shared primitives: Shell, TopBar, Btn, Badge, Spark, icons
// All styles here are scoped to data-mcpgen-root via global.css below.

// ─────────────────────────────────────────────────────────────────────────────
// Icons — custom 1px square-cap stroke. Not Lucide.
// ─────────────────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 14, style = {} }) => {
  const s = {
    width: size, height: size, display: 'inline-block', verticalAlign: '-2px',
    ...style,
  };
  const common = {
    width: size, height: size, viewBox: '0 0 16 16',
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.25,
    strokeLinecap: 'square', strokeLinejoin: 'miter',
  };
  switch (name) {
    case 'arrow-r': return <svg {...common} style={s}><path d="M3 8h10M9 4l4 4-4 4"/></svg>;
    case 'arrow-l': return <svg {...common} style={s}><path d="M13 8H3M7 4L3 8l4 4"/></svg>;
    case 'check':   return <svg {...common} style={s}><path d="M3 8.5L6.5 12 13 4.5"/></svg>;
    case 'x':       return <svg {...common} style={s}><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>;
    case 'plus':    return <svg {...common} style={s}><path d="M8 3v10M3 8h10"/></svg>;
    case 'spark':   return <svg {...common} style={s}><path d="M8 2v4M8 10v4M2 8h4M10 8h4M4 4l2.5 2.5M9.5 9.5L12 12M12 4L9.5 6.5M6.5 9.5L4 12"/></svg>;
    case 'cmd':     return <svg {...common} style={s}><path d="M5 3a2 2 0 100 4h6a2 2 0 100-4M5 13a2 2 0 110-4h6a2 2 0 110 4M5 7v2M11 7v2"/></svg>;
    case 'cloud':   return <svg {...common} style={s}><path d="M4 11.5c-1 0-2-1-2-2.2 0-1.3 1-2.3 2.3-2.3.3-1.6 1.7-2.7 3.3-2.7 1.6 0 3 1.1 3.3 2.7 1.5.1 2.6 1.3 2.6 2.7 0 1.4-1.2 2.6-2.7 2.6H4z"/></svg>;
    case 'doc':     return <svg {...common} style={s}><path d="M4 2h6l3 3v9H4V2zM10 2v3h3"/></svg>;
    case 'box':     return <svg {...common} style={s}><path d="M2 5l6-3 6 3v6l-6 3-6-3V5zM2 5l6 3 6-3M8 8v6"/></svg>;
    case 'src':     return <svg {...common} style={s}><path d="M5 4L1 8l4 4M11 4l4 4-4 4M9 3l-2 10"/></svg>;
    case 'play':    return <svg {...common} style={s}><path d="M4 3v10l8-5-8-5z"/></svg>;
    case 'share':   return <svg {...common} style={s}><path d="M11 5l3-3v3M14 2L8 8M3 5v8h8M3 5h5"/></svg>;
    case 'caret-r': return <svg {...common} style={s}><path d="M6 4l4 4-4 4"/></svg>;
    case 'caret-d': return <svg {...common} style={s}><path d="M4 6l4 4 4-4"/></svg>;
    case 'bolt':    return <svg {...common} style={s}><path d="M9 1L3 9h4l-1 6 6-8H8l1-6z"/></svg>;
    case 'dot':     return <svg {...common} style={{...s, strokeWidth: 0}}><circle cx="8" cy="8" r="3" fill="currentColor"/></svg>;
    case 'lock':    return <svg {...common} style={s}><path d="M4 7V5a4 4 0 018 0v2M3 7h10v7H3V7z"/></svg>;
    case 'undo':    return <svg {...common} style={s}><path d="M3 7h7a3 3 0 010 6H6M3 7l3-3M3 7l3 3"/></svg>;
    case 'copy':    return <svg {...common} style={s}><path d="M4 4V2h8v8h-2M2 6h8v8H2V6z"/></svg>;
    case 'search':  return <svg {...common} style={s}><circle cx="7" cy="7" r="4"/><path d="M10 10l4 4"/></svg>;
    case 'warn':    return <svg {...common} style={s}><path d="M8 2L1 14h14L8 2zM8 6v4M8 12v.5"/></svg>;
    case 'bell':    return <svg {...common} style={s}><path d="M4 12V8a4 4 0 018 0v4l1 1H3l1-1zM6 13.5c0 1 1 1.5 2 1.5s2-.5 2-1.5"/></svg>;
    default: return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Top bar / chrome
// ─────────────────────────────────────────────────────────────────────────────
function TopBar({ crumb, right, onLogo }) {
  return (
    <header className="mc-top">
      <button className="mc-logo" onClick={onLogo} aria-label="home">
        <span className="mc-logo-mark">◤</span>
        <span className="mc-logo-word">mcpgen</span>
        {crumb && <span className="mc-crumb"> / {crumb}</span>}
      </button>
      <div className="mc-top-right">{right}</div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Btn — solid (primary), ghost (border), link
// ─────────────────────────────────────────────────────────────────────────────
function Btn({ kind = 'ghost', size = 'md', icon, iconR, children, onClick, disabled, full, style }) {
  const cls = `mc-btn mc-btn-${kind} mc-btn-${size}${full ? ' mc-btn-full' : ''}`;
  return (
    <button className={cls} onClick={onClick} disabled={disabled} style={style}>
      {icon && <Icon name={icon} size={13} />}
      {children && <span>{children}</span>}
      {iconR && <Icon name={iconR} size={13} />}
    </button>
  );
}

function Badge({ children, kind = 'default', mono = true }) {
  return <span className={`mc-badge mc-badge-${kind}${mono ? ' mc-mono' : ''}`}>{children}</span>;
}

function Kbd({ children }) {
  return <kbd className="mc-kbd">{children}</kbd>;
}

// Block-style ASCII bar chart
function BlockBar({ value, max = 100, width = 12, dim = false }) {
  const blocks = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  const empty = width - blocks;
  return (
    <span className={`mc-blockbar ${dim ? 'dim' : ''}`}>
      {'█'.repeat(blocks)}<span className="mc-blockbar-empty">{'░'.repeat(empty)}</span>
    </span>
  );
}

// Card with sharp ink border + offset block shadow (when configured)
function Card({ children, className = '', style, padding = true, onClick }) {
  return (
    <div className={`mc-card ${padding ? 'mc-card-pad' : ''} ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

// Section label (small uppercase mono)
function SectionLabel({ children, right }) {
  return (
    <div className="mc-seclbl">
      <span>{children}</span>
      {right && <span className="mc-seclbl-r">{right}</span>}
    </div>
  );
}

// Animated count-up
function CountUp({ value, duration = 600, decimals = 0, prefix = '', suffix = '' }) {
  const [v, setV] = React.useState(0);
  const startVal = React.useRef(0);
  React.useEffect(() => {
    let raf;
    const start = performance.now();
    const from = startVal.current;
    const to = value;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(from + (to - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else startVal.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const display = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString();
  return <span>{prefix}{display}{suffix}</span>;
}

if (typeof window !== 'undefined') {
  Object.assign(window, { Icon, TopBar, Btn, Badge, Kbd, BlockBar, Card, SectionLabel, CountUp });
}