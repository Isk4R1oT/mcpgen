// screen-server-detail.jsx — public marketplace listing detail (github-repo-style)
//
// Phase M-4 §6.2 point edit: the legacy fallback `server || window.MARKETPLACE_SERVERS[0]`
// is replaced with a defensive sample lookup against the canon design data.
// Production paths gate the entire /marketplace/[serverId] route behind
// ui_marketplace_perm so this fallback never reaches end users.

function ServerDetail({ server, onBack, onInstall, onDashboard, onMarketplace }) {
  const sampleData = window['MARKETPLACE_SERVERS'];
  const s = server || (Array.isArray(sampleData) ? sampleData[0] : null);
  const [tab, setTab] = React.useState('readme');
  if (!s) return null;

  const tools = [
    { name: 'create_charge',     desc: 'create a charge against a customer or token', tk: 32 },
    { name: 'list_charges',      desc: 'list charges with filters and pagination',     tk: 28 },
    { name: 'refund_charge',     desc: 'issue a full or partial refund',                tk: 24 },
    { name: 'capture_charge',    desc: 'capture a previously authorized charge',        tk: 22 },
    { name: 'attach_payment_method', desc: 'attach a payment method to a customer',     tk: 26 },
    { name: 'create_subscription', desc: 'subscribe a customer to a price',             tk: 36 },
    { name: 'order_lifecycle',   desc: 'composed: list → refund → notify in one call',  tk: 62, comp: true },
  ];

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        crumb={`marketplace / ${s.name}`}
        onLogo={onMarketplace}
        right={
          <>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onMarketplace}>← back</button>
            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onDashboard}>my servers</button>
            <Btn kind="ink" size="sm" icon="copy" onClick={onInstall}>install</Btn>
          </>
        }
      />

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: '32px 28px 64px', position: 'relative', zIndex: 2 }}>
        {/* Header */}
        <div className="row-bw" style={{ marginBottom: 24, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <span className="mc-mono muted" style={{ fontSize: 13 }}>{s.author} /</span>
              <span className="mc-display-l">{s.name}</span>
              {s.verified && <Badge kind="ink" mono={false}><Icon name="check" size={10} /> verified</Badge>}
              <Badge kind="accent" mono={false}>public</Badge>
            </div>
            <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--text-muted)', maxWidth: 720, marginBottom: 12 }}>{s.desc}</div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {s.tags.map(t => <Badge key={t} mono={false}>#{t}</Badge>)}
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <Btn kind="ghost" size="md" icon="src" onClick={() => window.mcpToast(`starred · ${(s.stars + 1).toLocaleString()} stars`)}>★ {s.stars.toLocaleString()}</Btn>
            <Btn kind="ghost" size="md" onClick={() => window.mcpToast('forked into your workspace')}>fork · {s.forks}</Btn>
            <Btn kind="primary" size="md" icon="copy" onClick={onInstall}>install</Btn>
          </div>
        </div>

        {/* Stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 24 }}>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">installs</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6 }}>{s.installs.toLocaleString()}</div>
          </div>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">weekly</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6, color: 'var(--success)' }}>+{s.weekly.toLocaleString()}</div>
          </div>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">tools</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6 }}>{s.tools}</div>
          </div>
          <div className="mc-stat" style={{ padding: 14 }}>
            <div className="mc-stat-lbl">avg tokens / call</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6 }}>284</div>
          </div>
          <div className="mc-stat" style={{ padding: 14, background: 'var(--primary)', borderColor: 'var(--border-sharp)' }}>
            <div className="mc-stat-lbl" style={{ color: 'var(--primary-ink)', opacity: .7 }}>token savings</div>
            <div className="mc-stat-num" style={{ fontSize: 24, marginTop: 6, color: 'var(--primary-ink)' }}>76%</div>
          </div>
        </div>

        {/* Two-column body */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
          <div>
            <div className="mc-tabs">
              {[['readme','readme'],['tools',`tools · ${tools.length}`],['changelog','changelog'],['issues','issues · 3'],['security','security']].map(([id, label]) => (
                <button key={id} onClick={() => setTab(id)} className={`mc-tab ${tab === id ? 'sel' : ''}`}>{label}</button>
              ))}
            </div>

            {tab === 'readme' && (
              <div className="mc-card mc-card-pad">
                <div className="mc-h2" style={{ marginBottom: 8 }}>quick start</div>
                <div className="mc-code" style={{ marginBottom: 14 }}>{`$ npx mcpgen install ${s.author}/${s.name}\n$ mcpgen auth set ${s.author.toUpperCase()}_API_KEY sk_live_•••\n$ mcpgen serve`}</div>
                <div className="mc-h3" style={{ marginBottom: 6 }}>what's inside</div>
                <ul style={{ paddingLeft: 18, lineHeight: 1.7, color: 'var(--text)', fontSize: 14 }}>
                  <li>{s.tools} tools covering core resources, with composed multi-step actions</li>
                  <li>token-optimized schemas — 76% smaller than naive 1:1 conversion</li>
                  <li>oauth + bearer + signing-secret support out of the box</li>
                  <li>typed errors, idempotency keys, automatic retries on 429</li>
                </ul>
                <div className="mc-rule-dashed" />
                <div className="mc-h3" style={{ marginBottom: 6 }}>example</div>
                <div className="mc-code">{`> create_charge customer=cus_8f1a amount=4200 currency=usd\n← charge ch_3Nq7Bx · status=succeeded · 218 tk · 240 ms`}</div>
              </div>
            )}

            {tab === 'tools' && (
              <div className="mc-card" style={{ padding: 0 }}>
                {tools.map((t, i) => (
                  <div key={t.name} style={{ display: 'grid', gridTemplateColumns: '1.4fr 2fr 80px', gap: 12, padding: '14px 18px', borderBottom: i === tools.length - 1 ? 'none' : '1px dashed var(--border)', alignItems: 'center' }}>
                    <span className="mc-mono" style={{ fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.comp && <Icon name="bolt" size={11} />}{t.name}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{t.desc}</span>
                    <span className="mc-mono" style={{ fontSize: 12, textAlign: 'right' }}>{t.tk} tk</span>
                  </div>
                ))}
              </div>
            )}

            {tab === 'changelog' && (
              <div className="mc-card mc-card-pad">
                <div className="mc-mono" style={{ fontSize: 13.5, lineHeight: 1.8 }}>
                  <div style={{ marginBottom: 14 }}>
                    <strong>v2.4.0</strong> · 2 days ago<br/>
                    <span className="muted">+ add incremental_auth, evidence_summary tools<br/>* fix retry on 429 with rate-limit headers</span>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <strong>v2.3.1</strong> · 2 weeks ago<br/>
                    <span className="muted">* trim tax_id schema by 18 tokens</span>
                  </div>
                  <div>
                    <strong>v2.3.0</strong> · 1 month ago<br/>
                    <span className="muted">+ subscriptions.pause_collection<br/>+ disputes composed lifecycle tool</span>
                  </div>
                </div>
              </div>
            )}

            {tab === 'issues' && (
              <div className="mc-card mc-card-pad muted" style={{ fontSize: 13 }}>3 open issues. issue tracker placeholder.</div>
            )}
            {tab === 'security' && (
              <div className="mc-card mc-card-pad">
                <div className="row" style={{ gap: 10, marginBottom: 10 }}>
                  <Icon name="lock" size={14} style={{ color: 'var(--success)' }} />
                  <span className="mc-h3">no known vulnerabilities</span>
                </div>
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                  audited weekly. signed releases. credentials are aes-256 encrypted at rest. read full <a className="mc-link" style={{ cursor: 'pointer' }} onClick={() => window.mcpDrawer('security policy', (
                    <div className="col" style={{ gap: 14, fontSize: 13, lineHeight: 1.6 }}>
                      <div><strong>encryption</strong> — all credentials encrypted at rest with aes-256-gcm. master keys in aws kms with quarterly rotation.</div>
                      <div><strong>signing</strong> — every release is signed with our gpg key (fingerprint <span className="mc-mono">8e3a 1d24 a91c 4e2f</span>). agents verify on install.</div>
                      <div><strong>audits</strong> — third-party penetration test quarterly. last report: feb 2025 — zero critical findings. <a className="mc-link" onClick={() => window.mcpToast('soc2 report request emailed to you')}>request soc2 report</a>.</div>
                      <div><strong>data handling</strong> — no upstream api responses persisted. logs scrubbed of pii within 24 h.</div>
                      <div><strong>incident response</strong> — 24/7 on-call. status page at <span className="mc-mono">status.mcpgen.dev</span>. report a vulnerability to <span className="mc-mono">security@mcpgen.dev</span>.</div>
                    </div>
                  ), { eyebrow: 'how we handle your data' })}>security policy</a>.
                </div>
              </div>
            )}
          </div>

          {/* Right rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Card>
              <SectionLabel>about</SectionLabel>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <Row k="author"   v={s.author + (s.verified ? ' ✓' : '')} />
                <Row k="license"  v={s.license} />
                <Row k="updated"  v={s.updated} />
                <Row k="version"  v="v2.4.0" />
                <Row k="endpoint" v={`${s.author}/${s.name}.mcpgen.app`} mono />
              </div>
            </Card>

            <Card>
              <SectionLabel>install</SectionLabel>
              <div className="mc-mono" style={{ fontSize: 12, marginBottom: 10 }}>via cli</div>
              <div className="mc-code" style={{ fontSize: 11.5, padding: 10, marginBottom: 12 }}>{`mcpgen install ${s.author}/${s.name}`}</div>
              <div className="mc-mono" style={{ fontSize: 12, marginBottom: 10 }}>via desktop</div>
              <Btn kind="ink" size="sm" full icon="copy" onClick={() => { navigator.clipboard?.writeText(`mcpgen install ${s.author}/${s.name}`); window.mcpToast('config copied · paste into claude desktop'); }}>add to claude desktop</Btn>
              <div style={{ height: 6 }} />
              <Btn kind="ghost" size="sm" full icon="copy" onClick={() => { navigator.clipboard?.writeText(`mcpgen install ${s.author}/${s.name}`); window.mcpToast('config copied · paste into cursor settings'); }}>add to cursor</Btn>
            </Card>

            <Card>
              <SectionLabel>top installs</SectionLabel>
              <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', lineHeight: 1.9, color: 'var(--text-muted)' }}>
                <div>linear</div>
                <div>retool</div>
                <div>postscript</div>
                <div>418 others</div>
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function Row({ k, v, mono }) {
  return (
    <div className="row-bw" style={{ padding: '5px 0', borderBottom: '1px dashed var(--border)' }}>
      <span className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{k}</span>
      <span style={{ fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontSize: 12.5, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

window.ServerDetail = ServerDetail;
