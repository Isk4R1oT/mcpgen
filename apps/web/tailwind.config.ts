// apps/web/tailwind.config.ts
//
// Phase 0 / F-Tokens — Tailwind 4 theme extension that surfaces canon CSS
// vars as Tailwind utility tokens. Class patterns like `bg-paper`,
// `text-ink`, `border-border-sharp`, `font-mono`, `rounded-lg`,
// `shadow-DEFAULT` resolve through to `var(--paper)`, `var(--ink)`, etc.,
// which are emitted by apps/web/src/styles/globals.css `:root` (the static
// snapshot of `makeCssVars(TWEAK_DEFAULTS)` from tokens-emit.ts).
//
// All variable names are 1:1 with canon tokens.jsx; only the access path
// (Tailwind class → CSS var) is added on top. The mc-* canon classes still
// work as-is (they pull from the same CSS vars), so screens can mix the two
// freely.
//
// Note (Tailwind 4): we keep this JS config file because the rebuild will
// generate types (e.g. via tailwind-merge) that need a parseable theme. The
// CSS-first `@theme` directive could replace this file in a follow-up; for
// Phase 0 the JS config matches the brief literally.

import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,jsx}'],
  theme: {
    extend: {
      colors: {
        // Surface neutrals.
        paper: 'var(--paper)',
        'paper-alt': 'var(--paper-alt)',
        smoke: 'var(--smoke)',
        card: 'var(--card)',
        // Ink + text scale.
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        text: 'var(--text)',
        'text-muted': 'var(--text-muted)',
        'text-faint': 'var(--text-faint)',
        // Borders.
        border: 'var(--border)',
        'border-sharp': 'var(--border-sharp)',
        // Brand.
        primary: 'var(--primary)',
        'primary-hover': 'var(--primary-hover)',
        'primary-ink': 'var(--primary-ink)',
        accent: 'var(--accent)',
        success: 'var(--success)',
        info: 'var(--info)',
        tint: 'var(--tint)',
      },
      backgroundImage: {
        gradient: 'var(--gradient)',
        'page-bg': 'var(--page-bg)',
        'hero-grad': 'var(--hero-grad)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        DEFAULT: 'var(--shadow)',
      },
      borderWidth: {
        DEFAULT: 'var(--border-w)',
      },
      spacing: {
        gap: 'var(--gap)',
        pad: 'var(--pad)',
        row: 'var(--row)',
      },
    },
  },
  plugins: [],
};

export default config;
