// apps/web/src/components/screens/landing/landing.tsx
//
// Phase 1 — Agent A1 — Landing screen.
//
// Source of truth: claude-design-reference/canon/screen-landing.jsx (function
// `Landing`). 100% pixel parity with that JSX, but rebuilt against the
// production primitive kit (`@/components/ui/*`) and next-intl translations.
//
// Behaviour wiring (per Phase-1 brief A1):
//   - onMakeIt → router.push(`/generate?spec_url=${encodeURIComponent(...)}`)
//   - onMarketplace → router.push('/marketplace')
//   - onPricing → router.push('/pricing')
//   - onSignIn → router.push('/sign-in')  (canon embedded auth screen)
//
// Sample-chip row: canon's static SAMPLE_APIS list is gated behind a future
// `useSampleApis()` BFF hook (per Phase-1 catalog § landing). Until that hook
// lands the chip row is empty; canon's `mc-chiprow` collapses without items
// rendered, so we simply skip the section when the list is empty (avoids a
// dangling "try with" caption hovering above whitespace).
//
// `onSelectSample` is intentionally omitted — there are no chips to wire.
// When the BFF hook lands, re-introduce the local `sample` state + counter
// effect from canon (lines 13-17 of screen-landing.jsx).

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
} from 'react';

import LangSwitcher from '@/components/lang-switcher';
import { Btn, Icon, TopBar } from '@/components/ui';

// ────────────────────────────────────────────────────────────────────────────
// Sample chip row data (Phase 1: empty — see header comment).
// ────────────────────────────────────────────────────────────────────────────

interface SampleApi {
  readonly id: string;
  readonly name: string;
  readonly endpoints: number;
  readonly tools: number;
  readonly save: number;
}

// Until `useSampleApis()` is published in `@/lib/api`, the chip row is empty
// (canon-style "hide row" per Phase-1 SHARED-BRIEF).
const SAMPLE_APIS: ReadonlyArray<SampleApi> = [];

// ────────────────────────────────────────────────────────────────────────────
// Animated count-up (canon ui.jsx lines 114-134, inlined — not in UI kit).
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
// Internal layout helpers (from canon screen-landing.jsx lines 198-263).
// ────────────────────────────────────────────────────────────────────────────

interface CounterCellProps {
  readonly value: number;
  readonly label: string;
  readonly suffix?: string;
  readonly tint?: boolean;
}

function CounterCell({ value, label, suffix = '', tint = false }: CounterCellProps): ReactElement {
  const valueStyle: CSSProperties = {
    fontSize: 32,
    fontWeight: 500,
    lineHeight: 1,
    letterSpacing: '-0.02em',
    background: tint ? 'var(--primary)' : 'transparent',
    color: tint ? 'var(--primary-ink)' : 'var(--text)',
    padding: tint ? '4px 10px' : 0,
    display: 'inline-block',
    width: 'fit-content',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="mc-mono" style={valueStyle}>
        <CountUp value={value} />
        {suffix}
      </div>
      <div className="mc-caption-up">{label}</div>
    </div>
  );
}

function Arrow(): ReactElement {
  return (
    <span className="mc-mono faint" style={{ fontSize: 22, fontWeight: 300 }}>
      →
    </span>
  );
}

interface HowStepProps {
  readonly n: string;
  readonly title: string;
  readonly body: string;
  readonly divider?: boolean;
}

function HowStep({ n, title, body, divider = false }: HowStepProps): ReactElement {
  return (
    <div
      style={{
        padding: 28,
        borderLeft: divider ? '1px solid var(--border)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div
        className="mc-mono"
        style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '.08em' }}
      >
        {n}
      </div>
      <div
        className="mc-h2"
        style={{
          fontFamily: 'var(--font-serif)',
          fontStyle: 'italic',
          fontWeight: 400,
          fontSize: 26,
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>
      <div
        className="mc-mono"
        style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}
      >
        {body}
      </div>
    </div>
  );
}

interface FooterColProps {
  readonly title: string;
  readonly items: ReadonlyArray<readonly [string, (() => void) | null]>;
}

function FooterCol({ title, items }: FooterColProps): ReactElement {
  return (
    <div>
      <div className="mc-caption-up" style={{ marginBottom: 12, color: 'var(--text)' }}>
        {title}
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        {items.map(([label, fn], i) => {
          const linkStyle: CSSProperties = {
            fontSize: 12.5,
            color: 'var(--text-muted)',
            cursor: fn ? 'pointer' : 'default',
            textDecoration: 'none',
            borderBottom: '1px solid transparent',
            paddingBottom: 1,
            transition: 'color .12s, border-color .12s',
          };
          return (
            <li key={`${title}-${i}`}>
              <a
                className="mc-mono"
                onClick={fn ?? undefined}
                style={linkStyle}
                onMouseEnter={(e): void => {
                  if (fn) {
                    e.currentTarget.style.color = 'var(--text)';
                    e.currentTarget.style.borderColor = 'var(--text)';
                  }
                }}
                onMouseLeave={(e): void => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.borderColor = 'transparent';
                }}
              >
                {label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Public component.
// ────────────────────────────────────────────────────────────────────────────

interface LandingProps {
  /** When false, hide the "marketplace" link in the topbar (route is
   *  flag-gated and would 404 — fix for QA BUG-008). Default true so
   *  test fixtures and stories don't need to know about flags. */
  readonly marketplaceEnabled?: boolean;
  /** Same idea for the "docs" link (currently shares onMarketplace). */
  readonly docsEnabled?: boolean;
}

export default function Landing({
  marketplaceEnabled = true,
  docsEnabled = true,
}: LandingProps = {}): ReactElement {
  const t = useTranslations();
  const router = useRouter();

  const [urlText, setUrlText] = useState<string>('');
  const [counter] = useState<{ endpoints: number; tools: number; save: number }>({
    endpoints: 348,
    tools: 47,
    save: 76,
  });

  // Fire-and-forget LLM cache warmup. By the time the user pastes a
  // URL and clicks "make it" (typically 5-30s after landing), the
  // upstream provider's prefix cache is hot for all six pass system
  // prompts. See apps/web/src/lib/api/warmup.ts for the de-duped
  // 30s-rate-limited client.
  useEffect(() => {
    void import('@/lib/api/warmup').then((m) => m.fireWarmup());
  }, []);

  // BUG-011 fix — invalid URL on landing used to be silently swallowed
  // (the button click did nothing, no inline feedback). Validate via the
  // URL constructor and surface a typed inline error so the user knows
  // what to fix. Empty input still routes to /generate which renders its
  // own paste-a-spec entry — the empty path is intentional.
  const [urlError, setUrlError] = useState<string | null>(null);

  const onMakeIt = (): void => {
    const trimmed = urlText.trim();
    if (trimmed.length === 0) {
      router.push('/generate');
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      setUrlError(t('urlInvalid'));
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      setUrlError(t('urlInvalid'));
      return;
    }
    setUrlError(null);
    router.push(`/generate?spec_url=${encodeURIComponent(trimmed)}`);
  };

  const onMarketplace = (): void => router.push('/marketplace');
  const onPricing = (): void => router.push('/pricing');

  // Canon-styled embedded sign-in screen at /sign-in (canon MCPGen(5)).
  // Logto Hosted UI redirect (/api/auth/logto/sign-in) is no longer the
  // primary auth surface — it remains as the SSO bounce-out for connected
  // OAuth providers, gated behind ui_auth_*_sso_perm flags inside the
  // embedded form.
  const onSignIn = (): void => router.push('/sign-in');

  const handleSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    onMakeIt();
  };

  // Final-CTA "paste your spec" focuses the URL input + scrolls to top.
  const onFinalCta = (): void => {
    const input = document.querySelector<HTMLInputElement>('.mc-stamp input');
    input?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Inline gradient style for the hero italic word — canon uses these
  // properties verbatim; spread into a CSSProperties object so React's typed
  // style accepts the WebKit-prefixed variant.
  const heroAccentStyle: CSSProperties = {
    background: 'var(--hero-grad)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    padding: '0 8px',
    fontStyle: 'italic',
  };

  return (
    <div className="mc-screen mc-grain" style={{ minHeight: '100vh' }}>
      <TopBar
        right={
          <>
            {marketplaceEnabled ? (
              <a
                className="mc-link mc-mono"
                style={{ fontSize: 12, cursor: 'pointer' }}
                onClick={onMarketplace}
              >
                {t('marketplace')}
              </a>
            ) : null}
            {docsEnabled ? (
              <a
                className="mc-link mc-mono"
                style={{ fontSize: 12, cursor: 'pointer' }}
                onClick={onMarketplace}
              >
                {t('docs')}
              </a>
            ) : null}
            <a
              className="mc-link mc-mono"
              style={{ fontSize: 12, cursor: 'pointer' }}
              onClick={onPricing}
            >
              {t('pricing')}
            </a>
            <LangSwitcher />
            <Btn kind="ink" size="sm" onClick={onSignIn}>
              {t('signin')}
            </Btn>
          </>
        }
      />

      <main
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '64px 28px 80px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ marginBottom: 48 }}>
          <div className="mc-display-xl" style={{ marginBottom: 12 }}>
            {t('heroLine1')}
            <br />
            {t('heroLine2')}
            <br />
            {t('heroLine3In')} <span style={heroAccentStyle}>{t('heroLine3Time')}</span>
            {t('heroLine3End')}
          </div>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: 'var(--text-muted)',
              maxWidth: 540,
              margin: 0,
            }}
          >
            {t('heroSub')}
          </p>
        </div>

        {/* Big input */}
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 12, marginBottom: 14 }}
        >
          <div className="mc-stamp" style={{ flex: 1 }}>
            <input
              className="mc-input mc-mono"
              placeholder={t('placeholder')}
              value={urlText}
              onChange={(e): void => {
                setUrlText(e.target.value);
                if (urlError !== null) setUrlError(null);
              }}
              autoFocus
              type="url"
              aria-invalid={urlError !== null}
              aria-describedby={urlError !== null ? 'mc-url-error' : undefined}
            />
          </div>
          <Btn kind="primary" size="lg" iconR="arrow-r" onClick={onMakeIt}>
            {t('makeIt')}
          </Btn>
        </form>
        {urlError !== null ? (
          <div
            id="mc-url-error"
            className="mc-mono"
            role="alert"
            style={{
              marginBottom: 14,
              fontSize: 12.5,
              color: 'var(--danger, #c0392b)',
            }}
          >
            {urlError}
          </div>
        ) : null}
        <div className="mc-caption" style={{ marginBottom: 28 }}>
          {t('orDrop')}
        </div>

        {/* Secondary differentiator strip */}
        <div
          style={{
            marginBottom: 44,
            paddingLeft: 14,
            borderLeft: '2px solid var(--primary)',
          }}
        >
          <div className="mc-caption-up" style={{ marginBottom: 10, color: 'var(--text)' }}>
            {t('secondaryHeader')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 24,
              fontSize: 13.5,
              lineHeight: 1.55,
              color: 'var(--text)',
            }}
          >
            <div className="mc-mono">{t('secondaryLine1')}</div>
            <div className="mc-mono">{t('secondaryLine2')}</div>
            <div className="mc-mono">{t('secondaryLine3')}</div>
          </div>
        </div>

        {/* Sample chips — hidden when SAMPLE_APIS is empty (see header). */}
        {SAMPLE_APIS.length > 0 ? (
          <div style={{ marginBottom: 56 }}>
            <div className="mc-caption-up" style={{ marginBottom: 10 }}>
              {t('tryWith')}
            </div>
            <div className="mc-chiprow">
              {SAMPLE_APIS.map((s) => (
                <button key={s.id} className="mc-chip" type="button">
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* CLI line */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            padding: '20px 0',
            marginBottom: 40,
          }}
        >
          <div className="mc-caption-up" style={{ marginBottom: 8 }}>
            {t('cli')}
          </div>
          <div className="mc-mono" style={{ fontSize: 15 }}>
            <span style={{ color: 'var(--text-faint)' }}>$ </span>npx mcpgen init
          </div>
        </div>

        {/* Live counter */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            padding: '32px 0',
            flexWrap: 'wrap',
          }}
        >
          <CounterCell value={counter.endpoints} label={t('endpoints')} />
          <Arrow />
          <CounterCell value={counter.tools} label={t('tools')} />
          <Arrow />
          <CounterCell
            value={counter.save}
            label={t('fewerTokens')}
            suffix="%"
            tint
          />
        </div>
        <div className="mc-caption" style={{ marginTop: -16 }}>
          {t('liveCounter')}
        </div>

        {/* Tiny brag — verbatim social proof, per catalog */}
        <div
          style={{
            marginTop: 80,
            padding: 24,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--paper-alt)',
          }}
        >
          <div className="mc-caption-up" style={{ marginBottom: 12 }}>
            {t('featured')}
          </div>
          <div
            className="mc-mono"
            style={{
              fontSize: 13,
              color: 'var(--text-muted)',
              display: 'flex',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <span>HN front page #1 · apr 18</span>
            <span>show HN top 5</span>
            <span>producthunt #1 dev tools</span>
          </div>
        </div>

        {/* How it works: 3 steps */}
        <section style={{ marginTop: 96 }}>
          <div className="mc-caption-up" style={{ marginBottom: 18 }}>
            {t('howItWorks')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 0,
              border: '1px solid var(--border-sharp)',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              background: 'var(--card)',
            }}
          >
            <HowStep n="01" title={t('step1Title')} body={t('step1Body')} />
            <HowStep n="02" title={t('step2Title')} body={t('step2Body')} divider />
            <HowStep n="03" title={t('step3Title')} body={t('step3Body')} divider />
          </div>
        </section>

        {/* Final CTA strip */}
        <section
          style={{
            marginTop: 80,
            padding: '40px 32px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 'var(--radius-lg)',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 24,
            alignItems: 'center',
          }}
        >
          <div>
            <div className="mc-h1" style={{ color: 'var(--paper)', marginBottom: 8 }}>
              {t('finalCtaTitle')}
            </div>
            <div
              className="mc-mono"
              style={{
                fontSize: 13.5,
                color: 'var(--paper)',
                opacity: 0.7,
                maxWidth: 520,
              }}
            >
              {t('finalCtaBody')}
            </div>
          </div>
          <div className="row" style={{ gap: 10, flexShrink: 0 }}>
            <button
              type="button"
              className="mc-btn mc-btn-primary mc-btn-lg"
              onClick={onFinalCta}
            >
              <span>{t('finalCtaBtn')}</span> <Icon name="arrow-r" size={14} />
            </button>
            <button
              type="button"
              className="mc-btn mc-btn-lg"
              onClick={onMarketplace}
              style={{
                borderColor: 'var(--paper)',
                color: 'var(--paper)',
                background: 'transparent',
              }}
            >
              {t('finalCtaAlt')}
            </button>
          </div>
        </section>

        {/* Big footer: 4 columns + meta strip */}
        <footer
          style={{
            marginTop: 96,
            paddingTop: 40,
            borderTop: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 1fr 1fr 1fr',
              gap: 32,
              marginBottom: 40,
            }}
          >
            {/* Brand cell */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 6,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    lineHeight: 1,
                    transform: 'translateY(2px)',
                  }}
                >
                  ◤
                </span>
                <span
                  style={{
                    fontWeight: 700,
                    letterSpacing: '.04em',
                    textTransform: 'uppercase',
                    fontSize: 13,
                  }}
                >
                  MCPGEN
                </span>
              </div>
              <p
                className="mc-mono"
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  lineHeight: 1.6,
                  margin: '0 0 16px',
                }}
              >
                {t('heroSub')}
              </p>
              <div className="row" style={{ gap: 8 }}>
                <span
                  className="mc-dot"
                  style={{
                    background: 'var(--success)',
                    boxShadow:
                      '0 0 0 3px color-mix(in oklch, var(--success) 30%, transparent)',
                  }}
                />
                <span
                  className="mc-mono"
                  style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
                >
                  {t('allSystems')}
                </span>
              </div>
            </div>

            <FooterCol
              title={t('footerProduct')}
              items={[
                [t('fl_canvas'), null],
                [t('fl_playground'), null],
                [t('fl_marketplace'), onMarketplace],
                [t('fl_pricing'), onPricing],
                [t('fl_changelog'), null],
                [t('fl_roadmap'), null],
              ]}
            />
            <FooterCol
              title={t('footerCommunity')}
              items={[
                [t('fl_github'), null],
                [t('fl_discord'), null],
                [t('fl_examples'), null],
                [t('docs'), null],
                [t('fl_status'), null],
              ]}
            />
            <FooterCol
              title={t('footerCompany')}
              items={[
                [t('fl_about'), null],
                [t('fl_blog'), null],
                [t('fl_jobs'), null],
                [t('fl_contact'), null],
              ]}
            />
            <FooterCol
              title={t('footerLegal')}
              items={[
                [t('fl_terms'), null],
                [t('fl_privacy'), null],
                [t('fl_security'), null],
                [t('fl_dpa'), null],
              ]}
            />
          </div>

          {/* Meta strip */}
          <div
            className="mc-mono"
            style={{
              paddingTop: 20,
              borderTop: '1px dashed var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
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
