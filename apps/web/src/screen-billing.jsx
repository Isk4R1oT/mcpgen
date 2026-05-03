// screen-billing.jsx — billing & subscription
//
// Phase M-4 §6.2 point edits: PLANS / INVOICES / usage (used+quota) are
// extracted to optional props so the new BFF can supply real Stripe state.
// When omitted, the screen falls back to the canon design literals so it
// renders identically in standalone mode (admin preview, Storybook, etc.).
// Contract §6.2.4: behind ui_billing_active_perm flag the route is 404'd in
// production until Stripe wiring lands, so these defaults never reach end
// users with the flag OFF.

const DEFAULT_PLANS = [
  {
    id: 'free', name: 'free', price: 0, blurb: 'for tinkering and personal use',
    quota: '10K calls / mo',
    features: [
      ['core', '1 server, public marketplace install'],
      ['quota', '10,000 tool calls / month · soft cap'],
      ['servers', '1 deployed server (private or public)'],
      ['regions', '1 region · cdg only'],
      ['support', 'community discord'],
    ],
    cta: 'current plan', current: false,
  },
  {
    id: 'pro', name: 'pro', price: 29, blurb: 'for serious builders shipping mcps to teams',
    quota: '100K calls / mo · then $0.20 / 1K',
    features: [
      ['core', 'unlimited public servers, 5 private'],
      ['quota', '100,000 tool calls / month · overage at $0.20/1K'],
      ['servers', '5 private + unlimited public'],
      ['regions', '3 regions · cdg, sfo, sin'],
      ['features', 'spec drift detection · auto-regenerate'],
      ['support', 'email · 24h sla'],
    ],
    cta: 'manage plan', current: true, recommended: true,
  },
  {
    id: 'team', name: 'team', price: 99, blurb: 'for teams collaborating on shared servers',
    quota: '1M calls / mo · then $0.10 / 1K',
    features: [
      ['core', 'shared workspace, 5 seats included'],
      ['quota', '1,000,000 tool calls / month · overage at $0.10/1K'],
      ['servers', 'unlimited private + public'],
      ['regions', 'all regions · 6 edges worldwide'],
      ['features', 'sso (google, github) · audit log · rbac'],
      ['support', 'priority email · 4h sla'],
    ],
    cta: 'upgrade to team', current: false,
  },
  {
    id: 'enterprise', name: 'enterprise', price: null, blurb: 'self-host, vpc, custom contracts',
    quota: 'custom',
    features: [
      ['core', 'self-hosted or dedicated cloud'],
      ['quota', 'custom — any volume'],
      ['servers', 'unlimited, in your vpc'],
      ['regions', 'any · plus on-prem'],
      ['features', 'saml sso · scim · soc 2 · custom contract'],
      ['support', 'dedicated csm · 1h sla · slack channel'],
    ],
    cta: 'talk to sales', current: false,
  },
];

const DEFAULT_INVOICES = [
  { date: 'apr 2026', period: 'apr 1 – apr 30', amount: '$29.00', status: 'paid',     calls: '82,180', overage: '$0.00' },
  { date: 'mar 2026', period: 'mar 1 – mar 31', amount: '$32.40', status: 'paid',     calls: '117,000', overage: '$3.40' },
  { date: 'feb 2026', period: 'feb 1 – feb 28', amount: '$29.00', status: 'paid',     calls: '64,200', overage: '$0.00' },
  { date: 'jan 2026', period: 'jan 1 – jan 31', amount: '$29.00', status: 'paid',     calls: '41,800', overage: '$0.00' },
];

const DEFAULT_USAGE = { used: 82180, quota: 100000 };

function Billing({ onBack, onLanding, onDashboard, onMarketplace, plans, invoices, usage }) {
  const { t } = window.useI18n();
  const [billingCycle, setBillingCycle] = React.useState('monthly');

  const PLANS = plans ?? DEFAULT_PLANS;
  const INVOICES = invoices ?? DEFAULT_INVOICES;
  const used = (usage ?? DEFAULT_USAGE).used;
  const quota = (usage ?? DEFAULT_USAGE).quota;
  const usedPct = Math.round(used / quota * 100);

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb="billing"
        onLogo={onLanding}
        right={
          <>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onDashboard}>{t('myServers')}</button>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onMarketplace}>{t('marketplace')}</button>
            <LangSwitcher />
            <span className="mc-caption" style={{ marginRight: 4 }}>kira@dolla.io</span>
          </>
        }
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 28px 64px', position: 'relative', zIndex: 2 }}>
        <div className="row-bw" style={{ marginBottom: 24, alignItems: 'flex-end' }}>
          <div>
            <div className="mc-display-l">{t('billingTitle')}</div>
            <div className="mc-mono muted" style={{ fontSize: 13, marginTop: 4 }}>{t('billingSub')}</div>
          </div>
          <Btn kind="ghost" size="md" icon="doc" onClick={() => window.mcpToast(`bundling ${INVOICES.length} invoices · zip will download`)}>download all invoices</Btn>
        </div>

        {/* Current plan summary */}
        <Card style={{ marginBottom: 16, padding: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
            <div style={{ padding: 24, borderRight: '1px solid var(--border)' }}>
              <div className="mc-caption-up" style={{ marginBottom: 8 }}>{t('yourPlan')}</div>
              <div className="row" style={{ gap: 10, marginBottom: 4 }}>
                <span className="mc-h1" style={{ textTransform: 'lowercase' }}>pro</span>
                <Badge kind="primary" mono={false}>{t('active')}</Badge>
              </div>
              <div className="mc-mono muted" style={{ fontSize: 12, marginBottom: 14 }}>
                $29.00 / {t('monthly')} · {t('renews')} may 14, 2026
              </div>
              <div className="row" style={{ gap: 8 }}>
                <Btn kind="ink" size="sm" iconR="arrow-r" onClick={() => window.mcpDrawer('upgrade to team', (
                  <div className="col" style={{ gap: 14, fontSize: 13, lineHeight: 1.6 }}>
                    <div><strong>$99/mo</strong> · includes <strong>500K calls</strong>, 5 seats, sso, audit log retention 90 days.</div>
                    <div className="muted">prorated against your remaining pro period (~$22 credit). next bill: may 14.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                      <Btn kind="ink" size="sm" full onClick={() => window.mcpToast('upgraded to team · invoice emailed')}>confirm upgrade</Btn>
                      <Btn kind="ghost" size="sm" full onClick={() => window.mcpToast('talk to sales: contact@mcpgen.dev')}>talk to sales</Btn>
                    </div>
                  </div>
                ), { eyebrow: 'pro → team' })}>{t('upgradeTeam')}</Btn>
                <Btn kind="ghost" size="sm" onClick={() => window.mcpToast('cancellation flow · you\'ll keep pro until may 14')}>{t('cancel')}</Btn>
              </div>
            </div>
            <div style={{ padding: 24, borderRight: '1px solid var(--border)' }}>
              <div className="mc-caption-up" style={{ marginBottom: 8 }}>{t('thisPeriod')}</div>
              <div className="mc-mono" style={{ fontSize: 32, fontWeight: 500 }}>{used.toLocaleString()}</div>
              <div className="mc-mono muted" style={{ fontSize: 11.5, marginBottom: 12 }}>{t('ofCalls')} {quota.toLocaleString()} {t('calls')} · {usedPct}%</div>
              <div style={{ height: 10, border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)', background: 'var(--paper-alt)', overflow: 'hidden', position: 'relative' }}>
                <div style={{ width: `${usedPct}%`, height: '100%', background: 'var(--ink)' }} />
                <div style={{ position: 'absolute', left: '80%', top: -2, bottom: -2, width: 1, background: 'var(--accent)' }} />
              </div>
              <div className="mc-mono muted" style={{ fontSize: 11, marginTop: 6 }}>
                projecting 105K · ≈ $1.00 overage
              </div>
            </div>
            <div style={{ padding: 24 }}>
              <div className="mc-caption-up" style={{ marginBottom: 8 }}>{t('paymentMethod')}</div>
              <div className="mc-mono" style={{ fontSize: 13, marginBottom: 4 }}>visa ····  4242</div>
              <div className="mc-mono muted" style={{ fontSize: 11.5, marginBottom: 14 }}>expires 09/28 · kira frost</div>
              <Btn kind="ghost" size="sm" icon="copy" onClick={() => window.mcpToast('opening secure stripe form…')}>{t('updateCard')}</Btn>
            </div>
          </div>

          {/* Spending controls */}
          <div style={{ padding: '16px 24px', background: 'var(--paper-alt)' }}>
            <div className="row-bw">
              <div className="row" style={{ gap: 14 }}>
                <Icon name="warn" size={14} style={{ color: 'var(--text-muted)' }} />
                <span className="mc-mono" style={{ fontSize: 12.5 }}>{t('spendingLimit')} · <strong>$50/mo</strong></span>
              </div>
              <a className="mc-link mc-mono" style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => window.mcpDrawer('spending limits', (
                <div className="col" style={{ gap: 14, fontSize: 13 }}>
                  <div>set a monthly cap. when you hit it, agents stop calling tools and we email you. no surprise bills.</div>
                  <div className="col" style={{ gap: 8 }}>
                    {[25, 50, 100, 250].map(v => (
                      <button key={v} className="mc-btn mc-btn-ghost" style={{ justifyContent: 'space-between', width: '100%' }} onClick={() => window.mcpToast(`spending cap set to $${v}/mo`)}><span>${v} / mo</span>{v === 50 && <Badge>current</Badge>}</button>
                    ))}
                  </div>
                </div>
              ), { eyebrow: 'hard cap · we\'ll never charge over' })}>{t('editCaps')} →</a>
            </div>
          </div>
        </Card>

        {/* Usage breakdown by server */}
        <Card style={{ marginBottom: 16 }}>
          <SectionLabel right={<span className="mc-mono muted" style={{ fontSize: 11 }}>{t('thisMonth')}</span>}>{t('usageBy')}</SectionLabel>
          {[
            { name: 'lumen-payments-mcp', calls: 64200, pct: 78 },
            { name: 'helio-commerce-mcp', calls: 12400, pct: 15 },
            { name: 'nimbus-storage-mcp', calls:  4380, pct:  5 },
            { name: 'anvil-forms-mcp',    calls:  1200, pct:  2 },
          ].map((row, i) => (
            <div key={row.name} className="row" style={{ gap: 12, padding: '8px 0', borderBottom: i === 3 ? 'none' : '1px dashed var(--border)' }}>
              <span className="mc-mono" style={{ fontSize: 12.5, minWidth: 220 }}>{row.name}</span>
              <span style={{ flex: 1 }}><BlockBar value={row.pct} max={100} width={28} /></span>
              <span className="mc-mono" style={{ fontSize: 12.5, minWidth: 80, textAlign: 'right' }}>{row.calls.toLocaleString()}</span>
              <span className="mc-mono muted" style={{ fontSize: 11.5, minWidth: 40, textAlign: 'right' }}>{row.pct}%</span>
            </div>
          ))}
        </Card>

        {/* Plan picker */}
        <div className="row-bw" style={{ marginBottom: 14, marginTop: 32 }}>
          <div>
            <div className="mc-h1">{t('plans')}</div>
            <div className="mc-mono muted" style={{ fontSize: 12.5, marginTop: 2 }}>{t('upgradeAnytime')}</div>
          </div>
          <div className="mc-chiprow">
            {[['monthly',t('monthly')],['annual',t('annual')]].map(([id, label]) => (
              <button key={id} className={`mc-chip ${billingCycle === id ? 'active' : ''}`} onClick={() => setBillingCycle(id)}>{label}</button>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
          {PLANS.map(p => <PlanCard key={p.id} p={p} cycle={billingCycle} />)}
        </div>

        {/* Invoices */}
        <Card style={{ marginBottom: 16, padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <SectionLabel right={<a className="mc-link mc-mono" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => window.mcpToast('tax & company details · vat: ee102345678')}>{t('taxInfo')} →</a>}>{t('invoices')}</SectionLabel>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 80px',
            padding: '10px 20px', borderBottom: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)',
            letterSpacing: '.06em', textTransform: 'uppercase', background: 'var(--paper-alt)',
          }}>
            <span>{t('period')}</span><span>{t('billDate')}</span><span>{t('calls')}</span><span>{t('overage')}</span><span>{t('amount')}</span><span></span>
          </div>
          {INVOICES.map((inv, i) => (
            <div key={inv.date} style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 80px',
              padding: '14px 20px', borderBottom: i === INVOICES.length - 1 ? 'none' : '1px solid var(--border)',
              alignItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 13,
            }}>
              <span>{inv.period}</span>
              <span className="muted">{inv.date}</span>
              <span className="tnum">{inv.calls}</span>
              <span className="tnum muted">{inv.overage}</span>
              <span className="tnum" style={{ fontWeight: 500 }}>{inv.amount} <Badge kind="success" mono={false}>{inv.status}</Badge></span>
              <span style={{ textAlign: 'right' }}><a className="mc-link" style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => window.mcpToast(`invoice ${inv.period} · pdf opening…`)}>pdf</a></span>
            </div>
          ))}
        </Card>

        {/* Billing FAQ */}
        <Card>
          <SectionLabel>{t('questions')}</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <FAQ q="what counts as a call?" a="every successful tool invocation by an agent. failed calls (4xx/5xx upstream) don't count. listing tools is free." />
            <FAQ q="do public servers count against my quota?" a="only when you call them. installs by other people use their quotas — not yours. publishing is always free." />
            <FAQ q="can i set hard caps?" a="yes. set a monthly $ limit and we'll hard-stop once you hit it. you'll get alerts at 80% and 95%." />
            <FAQ q="how does annual billing work?" a="pay 10 months, get 12. switch any time — we credit the unused portion against the new plan." />
          </div>
        </Card>
      </main>
    </div>
  );
}

function PlanCard({ p, cycle }) {
  const yearly = cycle === 'annual';
  const displayPrice = p.price === null ? null : yearly ? Math.round(p.price * 10) : p.price;
  return (
    <div className="mc-card" style={{
      padding: 20, position: 'relative',
      borderColor: p.recommended ? 'var(--border-sharp)' : undefined,
      background: p.current ? 'var(--paper-alt)' : 'var(--card)',
    }}>
      {p.recommended && (
        <div style={{
          position: 'absolute', top: -10, left: 16,
          background: 'var(--primary)', color: 'var(--primary-ink)',
          padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 10.5,
          fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
          border: '1px solid var(--border-sharp)', borderRadius: 'var(--radius)',
        }}>recommended</div>
      )}

      <div className="mc-h2" style={{ marginBottom: 4, fontSize: 20 }}>{p.name}</div>
      <div className="mc-mono muted" style={{ fontSize: 11.5, marginBottom: 14, minHeight: 32, lineHeight: 1.4 }}>{p.blurb}</div>

      <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '1px dashed var(--border)' }}>
        {displayPrice === null ? (
          <div className="mc-mono" style={{ fontSize: 28, fontWeight: 500 }}>custom</div>
        ) : (
          <div className="row" style={{ alignItems: 'baseline', gap: 6 }}>
            <span className="mc-mono" style={{ fontSize: 36, fontWeight: 500, letterSpacing: '-0.02em' }}>${displayPrice}</span>
            <span className="mc-mono muted" style={{ fontSize: 12 }}>/{yearly ? 'yr' : 'mo'}</span>
          </div>
        )}
        <div className="mc-mono muted" style={{ fontSize: 11, marginTop: 4 }}>{p.quota}</div>
      </div>

      <div style={{ marginBottom: 16, minHeight: 200 }}>
        {p.features.map(([k, v]) => (
          <div key={k} className="row" style={{ gap: 8, alignItems: 'flex-start', padding: '5px 0', fontSize: 12 }}>
            <Icon name="check" size={11} style={{ marginTop: 4, flexShrink: 0, color: 'var(--success)' }} />
            <span style={{ lineHeight: 1.45 }}>{v}</span>
          </div>
        ))}
      </div>

      <Btn
        kind={p.current ? 'ghost' : p.recommended ? 'primary' : 'ink'}
        size="md" full disabled={p.current}
        onClick={() => {
          if (p.current) return;
          if (p.id === 'enterprise') window.mcpToast('opening contact form · hello@mcpgen.dev');
          else window.mcpToast(`switching to ${p.name} · prorated`);
        }}
      >{p.cta}</Btn>
    </div>
  );
}

function FAQ({ q, a }) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4 }}>{q}</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.55 }}>{a}</div>
    </div>
  );
}

window.Billing = Billing;
