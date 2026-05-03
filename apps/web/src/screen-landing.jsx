// landing.jsx — Screen 0: Landing

const SAMPLE_APIS = [
  { id: 'lumen',    name: 'lumen payments', endpoints: 348, tools: 47, save: 76 },
  { id: 'helio',    name: 'helio commerce', endpoints: 412, tools: 52, save: 78 },
  { id: 'nimbus',   name: 'nimbus storage', endpoints: 167, tools: 28, save: 71 },
  { id: 'rookery',  name: 'rookery issues', endpoints: 234, tools: 31, save: 73 },
  { id: 'parley',   name: 'parley chat',    endpoints: 198, tools: 24, save: 75 },
];

function Landing({ onMakeIt, onSelectSample, sample, urlText, setUrlText, onPricing, onMarketplace, onSignIn }) {
  const { t } = window.useI18n();
  const [counter, setCounter] = React.useState({ endpoints: 348, tools: 47, save: 76 });

  React.useEffect(() => {
    if (sample) setCounter({ endpoints: sample.endpoints, tools: sample.tools, save: sample.save });
  }, [sample?.id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onMakeIt();
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        right={
          <>
            <a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }} onClick={onMarketplace}>{t('marketplace')}</a>
            <a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }} onClick={onMarketplace}>{t('docs')}</a>
            <a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }} onClick={onPricing}>{t('pricing')}</a>
            <LangSwitcher />
            <Btn kind="ink" size="sm" onClick={onSignIn}>{t('signin')}</Btn>
          </>
        }
      />

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 28px 80px', position: 'relative', zIndex: 2 }}>
        <div style={{ marginBottom: 48 }}>
          <div className="mc-display-xl" style={{ marginBottom: 12 }}>
            {t('heroLine1')}<br/>
            {t('heroLine2')}<br/>
            {t('heroLine3In')} <span style={{ background: 'var(--hero-grad)', backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent', padding: '0 8px', fontStyle: 'italic' }}>{t('heroLine3Time')}</span>{t('heroLine3End')}
          </div>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: 'var(--text-muted)', maxWidth: 540, margin: 0 }}>
            {t('heroSub')}
          </p>
        </div>

        {/* Big input */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div className="mc-stamp" style={{ flex: 1 }}>
            <input
              className="mc-input mc-mono"
              placeholder={t('placeholder')}
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              autoFocus
            />
          </div>
          <Btn kind="primary" size="lg" iconR="arrow-r" onClick={onMakeIt}>{t('makeIt')}</Btn>
        </form>
        <div className="mc-caption" style={{ marginBottom: 28 }}>
          {t('orDrop')}
        </div>

        {/* Secondary copy: differentiator strip — three short proof lines */}
        <div style={{ marginBottom: 44, paddingLeft: 14, borderLeft: '2px solid var(--primary)' }}>
          <div className="mc-caption-up" style={{ marginBottom: 10, color: 'var(--text)' }}>{t('secondaryHeader')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, fontSize: 13.5, lineHeight: 1.55, color: 'var(--text)' }}>
            <div className="mc-mono">{t('secondaryLine1')}</div>
            <div className="mc-mono">{t('secondaryLine2')}</div>
            <div className="mc-mono">{t('secondaryLine3')}</div>
          </div>
        </div>

        {/* Sample chips */}
        <div style={{ marginBottom: 56 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>{t('tryWith')}</div>
          <div className="mc-chiprow">
            {SAMPLE_APIS.map(s => (
              <button
                key={s.id}
                className={`mc-chip ${sample?.id === s.id ? 'active' : ''}`}
                onClick={() => onSelectSample(s)}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* CLI line */}
        <div style={{ borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '20px 0', marginBottom: 40 }}>
          <div className="mc-caption-up" style={{ marginBottom: 8 }}>{t('cli')}</div>
          <div className="mc-mono" style={{ fontSize: 15 }}>
            <span style={{ color: 'var(--text-faint)' }}>$ </span>npx mcpgen init
          </div>
        </div>

        {/* Live counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '32px 0', flexWrap: 'wrap' }}>
          <CounterCell value={counter.endpoints} label={t('endpoints')} />
          <Arrow />
          <CounterCell value={counter.tools} label={t('tools')} />
          <Arrow />
          <CounterCell value={counter.save} label={t('fewerTokens')} suffix="%" tint />
        </div>
        <div className="mc-caption" style={{ marginTop: -16 }}>
          {t('liveCounter')}
        </div>

        {/* tiny brag */}
        <div style={{ marginTop: 80, padding: 24, border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--paper-alt)' }}>
          <div className="mc-caption-up" style={{ marginBottom: 12 }}>{t('featured')}</div>
          <div className="mc-mono" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            <span>HN front page #1 · apr 18</span>
            <span>show HN top 5</span>
            <span>producthunt #1 dev tools</span>
          </div>
        </div>

        {/* How it works: 3 steps */}
        <section style={{ marginTop: 96 }}>
          <div className="mc-caption-up" style={{ marginBottom: 18 }}>{t('howItWorks')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', background: 'var(--card)' }}>
            <HowStep n="01" title={t('step1Title')} body={t('step1Body')} />
            <HowStep n="02" title={t('step2Title')} body={t('step2Body')} divider />
            <HowStep n="03" title={t('step3Title')} body={t('step3Body')} divider />
          </div>
        </section>

        {/* Final CTA strip */}
        <section style={{ marginTop: 80, padding: '40px 32px', background: 'var(--ink)', color: 'var(--paper)', borderRadius: 'var(--radius-lg)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'center' }}>
          <div>
            <div className="mc-h1" style={{ color: 'var(--paper)', marginBottom: 8 }}>{t('finalCtaTitle')}</div>
            <div className="mc-mono" style={{ fontSize: 13.5, color: 'var(--paper)', opacity: 0.7, maxWidth: 520 }}>{t('finalCtaBody')}</div>
          </div>
          <div className="row" style={{ gap: 10, flexShrink: 0 }}>
            <button className="mc-btn mc-btn-primary mc-btn-lg" onClick={() => { document.querySelector('.mc-stamp input')?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              <span>{t('finalCtaBtn')}</span> <Icon name="arrow-r" size={14} />
            </button>
            <button className="mc-btn mc-btn-lg" onClick={onMarketplace} style={{ borderColor: 'var(--paper)', color: 'var(--paper)', background: 'transparent' }}>
              {t('finalCtaAlt')}
            </button>
          </div>
        </section>

        {/* Big footer: 4 columns + meta strip */}
        <footer style={{ marginTop: 96, paddingTop: 40, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr', gap: 32, marginBottom: 40 }}>
            {/* Brand cell */}
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 18, lineHeight: 1, transform: 'translateY(2px)' }}>◤</span>
                <span style={{ fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', fontSize: 13 }}>MCPGEN</span>
              </div>
              <p className="mc-mono" style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 16px' }}>
                {t('heroSub')}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <span className="mc-dot" style={{ background: 'var(--success)', boxShadow: '0 0 0 3px color-mix(in oklch, var(--success) 30%, transparent)' }} />
                <span className="mc-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{t('allSystems')}</span>
              </div>
            </div>

            <FooterCol title={t('footerProduct')} items={[
              [t('fl_canvas'), null], [t('fl_playground'), null], [t('fl_marketplace'), onMarketplace],
              [t('fl_pricing'), onPricing], [t('fl_changelog'), null], [t('fl_roadmap'), null],
            ]} />
            <FooterCol title={t('footerCommunity')} items={[
              [t('fl_github'), null], [t('fl_discord'), null], [t('fl_examples'), null],
              [t('docs'), null], [t('fl_status'), null],
            ]} />
            <FooterCol title={t('footerCompany')} items={[
              [t('fl_about'), null], [t('fl_blog'), null], [t('fl_jobs'), null], [t('fl_contact'), null],
            ]} />
            <FooterCol title={t('footerLegal')} items={[
              [t('fl_terms'), null], [t('fl_privacy'), null], [t('fl_security'), null], [t('fl_dpa'), null],
            ]} />
          </div>

          {/* Meta strip */}
          <div style={{ paddingTop: 20, borderTop: '1px dashed var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, color: 'var(--text-muted)', fontSize: 12 }} className="mc-mono">
            <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <span>{t('footer')}</span>
              <span>·</span>
              <span>{t('builtIn')}</span>
            </div>
            <span>v0.4.2 · changelog</span>
          </div>
        </footer>
      </main>
    </div>
  );
}

function CounterCell({ value, label, suffix = '', tint = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div
        className="mc-mono"
        style={{
          fontSize: 32, fontWeight: 500, lineHeight: 1, letterSpacing: '-0.02em',
          background: tint ? 'var(--primary)' : 'transparent',
          color: tint ? 'var(--primary-ink)' : 'var(--text)',
          padding: tint ? '4px 10px' : 0,
          display: 'inline-block',
          width: 'fit-content',
        }}
      >
        <CountUp value={value} />{suffix}
      </div>
      <div className="mc-caption-up">{label}</div>
    </div>
  );
}

function Arrow() {
  return <span className="mc-mono faint" style={{ fontSize: 22, fontWeight: 300 }}>→</span>;
}

function HowStep({ n, title, body, divider }) {
  return (
    <div style={{
      padding: 28,
      borderLeft: divider ? '1px solid var(--border)' : 'none',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div className="mc-mono" style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.08em' }}>{n}</div>
      <div className="mc-h2" style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 26, lineHeight: 1.1 }}>{title}</div>
      <div className="mc-mono" style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function FooterCol({ title, items }) {
  return (
    <div>
      <div className="mc-caption-up" style={{ marginBottom: 12, color: 'var(--text)' }}>{title}</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map(([label, fn], i) => (
          <li key={i}>
            <a
              className="mc-mono"
              onClick={fn || undefined}
              style={{
                fontSize: 12.5, color: 'var(--text-muted)',
                cursor: fn ? 'pointer' : 'default',
                textDecoration: 'none', borderBottom: '1px solid transparent',
                paddingBottom: 1, transition: 'color .12s, border-color .12s',
              }}
              onMouseEnter={(e) => { if (fn) { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--text)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'transparent'; }}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

window.Landing = Landing;
window.SAMPLE_APIS = SAMPLE_APIS;
