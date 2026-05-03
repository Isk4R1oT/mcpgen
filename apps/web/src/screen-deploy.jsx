// screen-deploy.jsx — Screen 6: Deploy + Success

const DEPLOY_OPTIONS = [
  { id: 'cloud',  title: 'mcpgen cloud',          tag: 'recommended', desc: 'we host. you get a URL. we bill per tool-call.', meta: 'free: 100K calls/mo · pro: $19/mo + $0.0001/call' },
  { id: 'cf',     title: 'your cloudflare workers', tag: '',          desc: 'we deploy to your CF account. you pay CF directly.', meta: 'one-time setup: $0' },
  { id: 'docker', title: 'docker image',          tag: 'pro',         desc: 'docker pull mcpgen/lumen-mcp-abc123:latest', meta: 'run it anywhere.' },
  { id: 'src',    title: 'source + dockerfile',   tag: 'pro',         desc: 'we generate, you take, we never see runtime.', meta: 'for the truly paranoid.' },
];

// `onSubmit` is the wired-deploy callback (Promise<void> | void). When it
// resolves the wrapper has captured the live result and will navigate to
// `DeploySuccess`; failures bubble as Promise rejection and surface the
// recoverable failed-state UI.
function Deploy({ onDeployed, onBack, sample, onSubmit }) {
  const [errorMode] = window.useErrorMode();
  const willFail = errorMode === 'deploy-fail';
  const [opt, setOpt] = React.useState('cloud');
  const [auth, setAuth] = React.useState('passthrough');
  const [deploying, setDeploying] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  const go = async () => {
    setDeploying(true);
    setFailed(false);
    if (typeof onSubmit === 'function') {
      try {
        await onSubmit({ target: opt, auth });
        if (typeof onDeployed === 'function') onDeployed();
      } catch (_e) {
        setFailed(true);
      }
      return;
    }
    // Visual fallback path used by storybook / canon snapshots.
    setTimeout(() => {
      if (willFail) {
        setFailed(true);
      } else if (typeof onDeployed === 'function') {
        onDeployed();
      }
    }, 1800);
  };

  if (deploying && failed) {
    return (
      <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
        <TopBar crumb="deploy failed" onLogo={onBack}
          right={<Btn kind="ghost" size="sm" icon="arrow-l" onClick={() => { setDeploying(false); setFailed(false); }}>back to options</Btn>}
        />
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '60px 28px' }}>
          <div className="mc-caption-up" style={{ marginBottom: 8, color: 'var(--accent)' }}>
            <span className="mc-dot alert" style={{ marginRight: 6 }} />
            deploy failed · 0 / 3 regions healthy
          </div>
          <div className="mc-display-l" style={{ marginBottom: 28 }}>edge rejected the bundle.</div>

          <Card style={{ marginBottom: 18, borderColor: 'var(--accent)', borderLeftWidth: 4 }}>
            <SectionLabel>what happened</SectionLabel>
            <div className="mc-log">
              <div><span className="ok">✓ </span>bundled typescript module · 4.2 kb</div>
              <div><span className="ok">✓ </span>generated mcp manifest</div>
              <div><span className="ok">✓ </span>uploaded to edge</div>
              <div><span style={{ color: 'var(--accent)' }}>✕ </span>cold-start probe failed in <span className="mc-mono">cdg, sfo, sin</span></div>
              <div className="indent">runtime error · <span className="mc-mono">cannot find module 'mcp-sdk@2.1'</span></div>
              <div className="indent">→ rollback to v1.1.7 was triggered automatically · existing traffic unaffected</div>
            </div>
          </Card>

          <Card style={{ marginBottom: 18 }}>
            <SectionLabel>likely cause</SectionLabel>
            <div className="mc-rec">
              <Icon name="spark" size={12} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 2 }}>your runtime pin doesn't exist on edge</div>
                <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
                  the manifest requests <span className="mc-mono">mcp-sdk@2.1</span>, but the edge runtime ships <span className="mc-mono">2.0.4</span>. either downgrade the pin or switch to <span className="mc-mono">cloud (managed)</span> which auto-bumps.
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Btn kind="primary" size="sm" icon="spark" onClick={() => window.mcpToast('auto-fixing manifest · will retry')}>auto-fix &amp; retry</Btn>
                  <Btn kind="ink" size="sm" onClick={() => window.mcpToast('pinned mcp-sdk@2.0.4 · retrying')}>use mcp-sdk@2.0.4</Btn>
                  <Btn kind="ghost" size="sm" onClick={() => window.mcpDrawer('build log · lumen-payments-mcp', (
                    <pre className="mc-code" style={{ padding: 14, fontSize: 11.5, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{`[12:04:08] resolving "mcp-sdk@2.1" … ok\n[12:04:09] fetching tarball (1.2 MB) … ok\n[12:04:11] runtime probe: edge-v3.8.2 supports mcp-sdk ≤2.0.x\n[12:04:11] ✖ incompatible: requested 2.1, runtime caps 2.0.4\n[12:04:11] candidate fixes:\n           1. pin to 2.0.4 (recommended)\n           2. switch target "edge" → "cloud" (managed runtime)\n           3. wait for edge-v3.9 (≈ may 14)\n[12:04:12] aborting · no auto-fix selected\n[12:04:12] elapsed: 4.1s`}</pre>
                  ), { eyebrow: 'full output' })}>view full log</Btn>
                </div>
              </div>
            </div>
          </Card>

          <div className="row" style={{ gap: 8, marginTop: 24 }}>
            <Btn kind="ink" size="lg" icon="play" onClick={() => { setFailed(false); go(); }}>retry deploy</Btn>
            <Btn kind="ghost" size="lg" onClick={() => { setDeploying(false); setFailed(false); }}>change options</Btn>
            <Btn kind="ghost" size="lg" onClick={onBack}>back to canvas</Btn>
          </div>

          <div className="mc-caption" style={{ marginTop: 16 }}>
            we keep failed deploys for 7 days. open <a className="mc-link" style={{ cursor: 'pointer' }} onClick={() => window.mcpToast('opening deploy log archive\u2026')}>deploy logs</a> if you want to ssh into the failed environment.
          </div>
        </main>
      </div>
    );
  }

  if (deploying) {
    return (
      <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
        <TopBar crumb="deploying…" onLogo={onBack} />
        <main style={{ maxWidth: 600, margin: '0 auto', padding: '120px 28px' }}>
          <div className="mc-display-l" style={{ marginBottom: 32 }}>shipping it.</div>
          <div className="mc-progress" style={{ marginBottom: 12 }}><div style={{ width: '60%' }} /></div>
          <div className="mc-mono muted" style={{ fontSize: 13 }}>
            <div>✓ bundling typescript module</div>
            <div>✓ generating mcp manifest</div>
            <div><span className="mc-spin" style={{ display: 'inline-block' }}>⠹</span> uploading to edge...</div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar crumb={`deploy ${sample?.name || 'lumen-payments'}-mcp`} onLogo={onBack}
        right={<Btn kind="ghost" size="sm" icon="arrow-l" onClick={onBack}>back</Btn>}
      />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '40px 28px' }}>
        <div className="mc-display-l" style={{ marginBottom: 8 }}>where should this live?</div>
        <p className="muted" style={{ marginBottom: 32, fontSize: 15 }}>most people pick cloud and never look back. but the others are real.</p>

        <SectionLabel>deployment target</SectionLabel>
        <div className="col" style={{ gap: 8, marginBottom: 32 }}>
          {DEPLOY_OPTIONS.map(o => (
            <div key={o.id} className={`mc-radio-row ${opt === o.id ? 'sel' : ''}`} onClick={() => setOpt(o.id)}>
              <span className="mc-radio-glyph">{opt === o.id ? '◉' : '○'}</span>
              <div style={{ flex: 1 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{o.title}</span>
                  {o.tag === 'recommended' && <Badge kind="primary" mono={false}>recommended</Badge>}
                  {o.tag === 'pro' && <Badge kind="ink" mono={false}>pro</Badge>}
                </div>
                <div className="mc-mono muted" style={{ fontSize: 12.5 }}>{o.desc}</div>
                <div className="mc-mono" style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 4 }}>{o.meta}</div>
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>server URL</SectionLabel>
        <div className="row" style={{ gap: 8, marginBottom: 32 }}>
          <div className="mc-mono mc-input" style={{ display: 'flex', alignItems: 'center', flex: 1, height: 44 }}>
            {sample?.id || 'lumen'}-mcp-abc123<span className="muted">.mcpgen.app</span>
          </div>
          <Btn kind="ghost" onClick={() => window.mcpToast('opening url customizer')}>customize</Btn>
        </div>

        <SectionLabel>credentials forwarding</SectionLabel>
        <div className="col" style={{ gap: 8, marginBottom: 40 }}>
          <div className={`mc-radio-row ${auth === 'passthrough' ? 'sel' : ''}`} onClick={() => setAuth('passthrough')}>
            <span className="mc-radio-glyph">{auth === 'passthrough' ? '◉' : '○'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>pass-through <Badge kind="success">recommended</Badge></div>
              <div className="muted" style={{ fontSize: 12.5 }}>each agent passes its own key. we never see them.</div>
            </div>
          </div>
          <div className={`mc-radio-row ${auth === 'static' ? 'sel' : ''}`} onClick={() => setAuth('static')}>
            <span className="mc-radio-glyph">{auth === 'static' ? '◉' : '○'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>static, stored in vault <Badge kind="ink">pro</Badge></div>
              <div className="muted" style={{ fontSize: 12.5 }}>for SaaS-style agents acting on behalf of users. <a className="mc-link" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); window.mcpDrawer('vault security', (<div style={{ fontSize: 13, lineHeight: 1.6 }}>credentials are encrypted client-side with a key derived from your account secret, then stored in aws kms. only the deployed runtime can decrypt them at invocation time. plaintext is never written to logs or disks.</div>), { eyebrow: 'how the vault works' }); }}>why this is safe →</a></div>
            </div>
          </div>
        </div>

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={go}>deploy</Btn>
      </main>
    </div>
  );
}

// Real-deploy props (all optional — fall back to canon-shaped defaults for
// snapshot testing / pure-visual storybook):
//   - mcpUrl: full https://...mcp endpoint of the deployed MCP server
//   - claudeDesktopConfig: pre-formatted JSON string (from
//     `formatConfigJson(buildConfig(...))`)
//   - serverName: snake-case server name; used in the share-link slug
//   - onCopy(text, key): override the clipboard write (defaults to
//     navigator.clipboard.writeText) — wrappers may inject toast hooks
function DeploySuccess({
  onDashboard,
  sample,
  mcpUrl,
  claudeDesktopConfig,
  serverName,
  onCopy,
  onDownload,
}) {
  const [copied, setCopied] = React.useState('');     // '' | 'url' | 'install' | 'share'
  const [shareSheet, setShareSheet] = React.useState(false);
  const [visibility, setVisibility] = React.useState('private'); // private|public
  const fallbackId = serverName || sample?.id || 'lumen';
  // `mcpUrl` from props is the full https endpoint. The screen renders it
  // with the protocol split so the muted "https://" reads as a separator;
  // strip it here when the upstream value already includes the scheme.
  const fullUrl = mcpUrl || `https://${fallbackId}-mcp-abc123.mcpgen.app/mcp`;
  const url = fullUrl.replace(/^https?:\/\//, '');
  const installCmd = `npx mcpgen install ${fallbackId}`;
  const shareUrl = `https://mcpgen.app/s/${fallbackId}`;
  const config = claudeDesktopConfig || `{
  "mcpServers": {
    "${fallbackId}": {
      "url": "${fullUrl}",
      "headers": {
        "Authorization": "Bearer \${${fallbackId.toUpperCase()}_KEY}"
      }
    }
  }
}`;

  const copy = (text, key) => {
    if (typeof onCopy === 'function') {
      onCopy(text, key);
    } else {
      navigator.clipboard?.writeText(text);
    }
    setCopied(key);
    setTimeout(() => setCopied(''), 1400);
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar onLogo={onDashboard} right={<Btn kind="ghost" size="sm" onClick={onDashboard}>dashboard →</Btn>} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '60px 28px 80px' }}>
        <div style={{ marginBottom: 36 }}>
          <div className="mc-caption-up" style={{ marginBottom: 8 }}>
            <span className="mc-dot live" style={{ marginRight: 6 }} />
            live · 1.4s ago · all 3 regions healthy
          </div>
          <div className="mc-display-xl" style={{ marginBottom: 0 }}>it's live.</div>
        </div>

        {/* URL card */}
        <Card style={{ marginBottom: 16 }}>
          <div className="mc-caption-up" style={{ marginBottom: 10 }}>your endpoint</div>
          <div className="row-bw" style={{ gap: 12 }}>
            <span className="mc-mono" style={{ fontSize: 16, wordBreak: 'break-all' }}>
              <span className="muted">https://</span>{url}
            </span>
            <Btn kind="ink" size="sm" icon={copied === 'url' ? 'check' : 'copy'} onClick={() => copy('https://' + url, 'url')}>
              {copied === 'url' ? 'copied' : 'copy'}
            </Btn>
          </div>
        </Card>

        {/* What now? — three primary post-deploy actions */}
        <div className="mc-caption-up" style={{ marginBottom: 10 }}>what now?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 32 }}>
          <button
            className="mc-card"
            onClick={() => copy(installCmd, 'install')}
            style={{
              padding: 16, textAlign: 'left', cursor: 'pointer',
              background: 'var(--card)', borderColor: 'var(--border-sharp)',
            }}
          >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Icon name={copied === 'install' ? 'check' : 'copy'} size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>copy install command</span>
            </div>
            <div className="mc-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
              one-liner for any client.
            </div>
            <div className="mc-mono" style={{
              fontSize: 11, padding: '4px 6px',
              background: 'var(--paper-alt)', border: '1px solid var(--border)',
              borderRadius: 3, color: copied === 'install' ? 'var(--success)' : 'var(--text)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {copied === 'install' ? '✓ copied to clipboard' : `$ ${installCmd}`}
            </div>
          </button>

          <button
            className="mc-card"
            onClick={() => setShareSheet(true)}
            style={{
              padding: 16, textAlign: 'left', cursor: 'pointer',
              background: 'var(--card)', borderColor: 'var(--border-sharp)',
            }}
          >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Icon name="share" size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>share with team</span>
            </div>
            <div className="mc-mono" style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6, lineHeight: 1.4 }}>
              link, slack, or invite by email.
            </div>
            <div className="mc-mono" style={{
              fontSize: 11, padding: '4px 6px',
              background: 'var(--paper-alt)', border: '1px solid var(--border)',
              borderRadius: 3, color: 'var(--text-muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {shareUrl.replace('https://', '')}
            </div>
          </button>

          <button
            className="mc-card"
            onClick={() => setVisibility(v => v === 'private' ? 'public' : 'private')}
            style={{
              padding: 16, textAlign: 'left', cursor: 'pointer',
              background: visibility === 'public' ? 'var(--primary)' : 'var(--card)',
              color: visibility === 'public' ? 'var(--primary-ink)' : 'var(--text)',
              borderColor: 'var(--border-sharp)',
            }}
          >
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <Icon name="cloud" size={14} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                {visibility === 'public' ? 'published to marketplace' : 'publish to marketplace'}
              </span>
            </div>
            <div className="mc-mono" style={{
              fontSize: 11.5,
              color: visibility === 'public' ? 'var(--primary-ink)' : 'var(--text-muted)',
              opacity: visibility === 'public' ? .8 : 1,
              marginBottom: 6, lineHeight: 1.4,
            }}>
              {visibility === 'public' ? 'discoverable · forkable · click to unpublish' : 'discoverable · forkable · earn from forks'}
            </div>
            <div className="mc-mono" style={{
              fontSize: 11, padding: '4px 6px',
              background: visibility === 'public' ? 'rgba(0,0,0,.12)' : 'var(--paper-alt)',
              border: '1px solid ' + (visibility === 'public' ? 'rgba(0,0,0,.2)' : 'var(--border)'),
              borderRadius: 3,
            }}>
              {visibility === 'public' ? '◉ public' : '○ private (toggle to publish)'}
            </div>
          </button>
        </div>

        <SectionLabel>connect to</SectionLabel>
        <div className="mc-connect" style={{ marginBottom: 32 }}>
          {[
            { name: 'claude desktop', hint: 'one-click' },
            { name: 'cursor',         hint: 'one-click' },
            { name: 'cline',          hint: 'one-click' },
            { name: 'langgraph',      hint: 'snippet ↓' },
          ].map(c => (
            <div key={c.name} className="mc-connect-card">
              <div className="name">{c.name}</div>
              <div className="hint">▶ {c.hint}</div>
            </div>
          ))}
        </div>

        <SectionLabel>or paste this anywhere</SectionLabel>
        <div className="mc-code" style={{ marginBottom: 32 }}>{config}</div>

        <Btn kind="primary" size="lg" full iconR="arrow-r" onClick={onDashboard}>open dashboard</Btn>
      </main>

      {/* Share sheet */}
      {shareSheet && (
        <div className="mc-modal-veil" onClick={() => setShareSheet(false)}>
          <div className="mc-modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="mc-modal-head">
              <div>
                <div className="mc-caption-up">share</div>
                <div className="mc-h2" style={{ marginTop: 2 }}>send this server</div>
              </div>
              <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={() => setShareSheet(false)} style={{ padding: '0 8px' }}><Icon name="x" size={11} /></button>
            </div>
            <div className="mc-modal-body">
              <SectionLabel>shareable link</SectionLabel>
              <div className="row" style={{ gap: 8, marginBottom: 22 }}>
                <div className="mc-input mc-mono" style={{ flex: 1, height: 40, display: 'flex', alignItems: 'center', fontSize: 12.5 }}>{shareUrl}</div>
                <Btn kind="ink" size="md" icon={copied === 'share' ? 'check' : 'copy'} onClick={() => copy(shareUrl, 'share')}>
                  {copied === 'share' ? 'copied' : 'copy'}
                </Btn>
              </div>

              <SectionLabel>or send directly</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 22 }}>
                {[
                  { name: 'slack', icon: 'share' },
                  { name: 'email', icon: 'share' },
                  { name: 'discord', icon: 'share' },
                ].map(c => (
                  <button key={c.name} className="mc-btn mc-btn-ghost" style={{ height: 38, justifyContent: 'center' }} onClick={() => window.mcpToast(`shared via ${c.name} · link sent`)}>
                    <Icon name={c.icon} size={11} /> {c.name}
                  </button>
                ))}
              </div>

              <SectionLabel>invite teammates</SectionLabel>
              <div className="row" style={{ gap: 8 }}>
                <input className="mc-input" placeholder="email@company.com, comma separated" style={{ flex: 1, height: 40, fontSize: 13 }} />
                <Btn kind="primary" size="md" onClick={() => window.mcpToast('3 invites sent · they\'ll get an email shortly')}>invite</Btn>
              </div>
            </div>
            <div className="mc-modal-foot">
              <span className="mc-caption">link works without sign-up. recipients can clone or fork in one click.</span>
              <Btn kind="ghost" size="sm" onClick={() => setShareSheet(false)}>done</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.Deploy = Deploy;
window.DeploySuccess = DeploySuccess;
