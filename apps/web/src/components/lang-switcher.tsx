// apps/web/src/components/lang-switcher.tsx
//
// Phase F-i18n — production replacement for canon `LangSwitcher`
// (claude-design-reference/canon/i18n.jsx lines 489-534).
//
// Visual rule (CLAUDE.md §12 rule 16): MUST match canon styling
// bit-for-bit. Inline styles are intentional — they reference the same
// CSS-vars (`--font-mono`, `--card`, `--border-sharp`, `--radius`,
// `--shadow`, `--ink`, `--paper`, `--text`) that the canon screen uses.
//
// Behavioural difference vs canon:
//   - canon stored selection in `localStorage('mcpgen-lang')`.
//   - We use next-intl URL routing instead (`/`, `/ru`, `/es`, …) +
//     the cookie that next-intl sets automatically. This is the
//     recommended app-router pattern and survives full-page reloads,
//     deep-linking, and crawlers in a way localStorage cannot.
//
// References:
// - canon LANGUAGES list + LangSwitcher JSX: i18n.jsx (lines 4-11, 489-534)
// - Icon component: locked canon `ui.jsx` exposes `window.Icon`
//   (used here only when rendering — wrapped in a span fallback so
//   storybook/test environments without the canon shim still render).

'use client';

import { useLocale } from 'next-intl';
import { useState, type ReactElement } from 'react';

import { usePathname, useRouter } from '@/i18n/navigation';
import { routing, type Locale } from '@/i18n/routing';

interface LanguageMeta {
  readonly id: Locale;
  readonly label: string;
  readonly name: string;
}

// Mirrors canon LANGUAGES (i18n.jsx lines 4-11) — order, labels and
// native-name spellings are preserved 1:1. The `as const` tuple lets
// TS know `LANGUAGES[0]` is always defined (avoids
// noUncheckedIndexedAccess undefined inference for the fallback path).
const LANGUAGES = [
  { id: 'en', label: 'EN', name: 'english' },
  { id: 'ru', label: 'RU', name: 'русский' },
  { id: 'es', label: 'ES', name: 'español' },
  { id: 'fr', label: 'FR', name: 'français' },
  { id: 'de', label: 'DE', name: 'deutsch' },
  { id: 'zh', label: '中', name: '中文' },
] as const satisfies ReadonlyArray<LanguageMeta>;

interface Props {
  readonly size?: 'sm' | 'md' | 'lg';
}

export default function LangSwitcher({ size = 'sm' }: Props): ReactElement {
  const router = useRouter();
  const pathname = usePathname();
  const activeLocale = useLocale() as Locale;

  const [open, setOpen] = useState<boolean>(false);

  const cur = LANGUAGES.find((l) => l.id === activeLocale) ?? LANGUAGES[0];

  // routing.locales is `readonly ['en', 'ru', ...]` — the runtime check
  // protects against drift if a locale id is removed from routing without
  // updating LANGUAGES.
  const visible = LANGUAGES.filter((l) =>
    (routing.locales as ReadonlyArray<string>).includes(l.id),
  );

  const handlePick = (next: Locale): void => {
    setOpen(false);
    if (next === activeLocale) return;
    // Replace (not push) so language switching does not pollute back
    // history — matches canon behaviour where setLang did an in-place
    // re-render without a navigation event.
    router.replace(pathname, { locale: next });
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`mc-btn mc-btn-ghost mc-btn-${size}`}
        style={{
          fontFamily: 'var(--font-mono)',
          letterSpacing: '.04em',
          fontSize: 11.5,
          padding: '0 10px',
        }}
      >
        <span style={{ fontWeight: 600 }}>{cur.label}</span>
        {/* Caret glyph — canon uses <Icon name="caret-d" size={10} />
            which is registered on window.Icon by ui.jsx. We render an
            inline SVG fallback so this component renders even without
            the canon shim (e.g. in unit tests, Storybook, or before
            the locked module has executed). */}
        <span aria-hidden="true" style={{ marginLeft: 4, display: 'inline-flex' }}>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 4 L5 7 L8 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 99 }}
          />
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              zIndex: 100,
              background: 'var(--card)',
              border: '1px solid var(--border-sharp)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow)',
              minWidth: 160,
              padding: 4,
            }}
          >
            {visible.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => handlePick(l.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '7px 10px',
                  border: 0,
                  background: l.id === activeLocale ? 'var(--ink)' : 'transparent',
                  color: l.id === activeLocale ? 'var(--paper)' : 'var(--text)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius)',
                  textAlign: 'left',
                }}
              >
                <span>{l.name}</span>
                <span style={{ opacity: 0.6, fontSize: 10.5, letterSpacing: '.04em' }}>
                  {l.label}
                </span>
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
