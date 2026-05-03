// apps/web/src/providers/i18n-provider.tsx
//
// Phase M-4-INFRA — Foundation for new UI canon.
//
// This provider serves the dual-consumer i18n contract documented in
// .planning/ui-rebuild-sandbox/PROP-CONTRACTS.md (cross-screen patterns):
//
//   1. New TSX code may import `useI18n()` directly from this module.
//   2. Locked .jsx canon screens call `window.useI18n()` at the top of
//      their function bodies (e.g. screen-landing.jsx line 12).
//
// The dictionary itself lives in apps/web/src/i18n.jsx (37K — locked canon
// per RULES.md UI-locked invariant). That file already does
// `Object.assign(window, { I18nProvider, useI18n, ... })` at module
// bottom on side-effect import. This TSX provider:
//
//   - mounts the locked window.I18nProvider via createElement
//     (so the locked dictionary + LocalStorage persistence + setLang
//     all keep working);
//   - exposes a thin React.useContext-friendly hook
//     `useI18n()` that delegates to `window.useI18n()` after the locked
//     module has self-registered;
//   - keeps `window.useI18n` reachable for legacy JSX callers.
//
// Side-effect import order matters: tokens.jsx → ui.jsx → i18n.jsx must
// have run before any consumer renders. The jsx-bridge/loader.ts owns
// that ordering; this provider is mounted by app/layout.tsx and depends
// on the loader having executed (the loader is imported transitively
// via the bridge whenever a screen wrapper is rendered).

'use client';

import { createElement, useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

// MUST come BEFORE '@/i18n' import — installs globalThis.React so the
// canon i18n.jsx (which uses unresolved `React.createContext`, designed
// for the HTML-preview global-script load model) can evaluate under
// Next.js SSR. ESM evaluation order is top-down per source.
import './global-react-shim';

// Trigger the locked i18n.jsx module to evaluate. Its module-bottom
// `Object.assign(window, { I18nProvider, useI18n, ... })` populates the
// globals we rely on. The TS ambient `*.jsx` declaration in
// src/types/jsx.d.ts makes this import resolve for tsc without parsing
// the actual JSX.
import '@/i18n';

// ----------------------------------------------------------------------
// Public types & hook
// ----------------------------------------------------------------------

export interface I18nApi {
  /** Active locale id (e.g. 'en', 'ru', 'fr'). */
  readonly lang: string;
  /** Translate by dictionary key. Returns the key itself on miss. */
  readonly t: (key: string) => string;
  /** Switch active locale (persists to localStorage). */
  readonly setLang: (lang: string) => void;
}

interface WindowI18nGlobals {
  I18nProvider?: (props: { children: ReactNode }) => ReactElement;
  useI18n?: () => I18nApi;
}

/**
 * Read the locked i18n hook from `window.useI18n` (registered by i18n.jsx
 * on side-effect import). Used by both new TSX code and the
 * legacy-compat re-export below. Returns a safe fallback before the
 * locked module has registered (very early SSR or test setups).
 */
export function useI18n(): I18nApi {
  const w = (typeof window === 'undefined' ? undefined : window) as
    | (Window & WindowI18nGlobals)
    | undefined;
  if (w !== undefined && typeof w.useI18n === 'function') {
    return w.useI18n();
  }
  // Fallback: identity translator. Should only fire pre-hydration.
  return {
    lang: 'en',
    t: (key: string): string => key,
    setLang: (): void => {},
  };
}

// ----------------------------------------------------------------------
// Provider
// ----------------------------------------------------------------------

interface Props {
  children: ReactNode;
}

/**
 * Mount the locked I18nProvider (from i18n.jsx) so its React context
 * value is available to descendants — including the locked screen-*.jsx
 * components that call `window.useI18n()` to read it.
 *
 * The locked provider also handles browser-language preference
 * detection via `localStorage.getItem('mcpgen-lang')` and falls back to
 * 'en' (see i18n.jsx line 471). We deliberately do not duplicate that
 * detection here.
 */
export default function I18nProvider({ children }: Props): ReactElement {
  // Force a single re-render once the locked window.I18nProvider is
  // available. On first mount in SSR/hydration, the side-effect import
  // is async w.r.t. window assignment timing in some Next.js setups.
  const [ready, setReady] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return typeof (window as unknown as WindowI18nGlobals).I18nProvider === 'function';
  });

  useEffect(() => {
    if (ready) return;
    const w = window as unknown as WindowI18nGlobals;
    if (typeof w.I18nProvider === 'function') {
      setReady(true);
      return;
    }
    // Schedule a microtask retry — the side-effect import may resolve
    // on the next tick in dev with React Strict Mode double-mounts.
    const id = window.setTimeout(() => {
      const w2 = window as unknown as WindowI18nGlobals;
      if (typeof w2.I18nProvider === 'function') setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, [ready]);

  if (!ready || typeof window === 'undefined') {
    // Render children unwrapped during the brief window before the
    // locked provider self-registers. window.useI18n's fallback above
    // returns identity translation in that gap.
    return <>{children}</>;
  }

  const w = window as unknown as WindowI18nGlobals;
  const LockedProvider = w.I18nProvider;
  if (LockedProvider === undefined) {
    // Should not happen given the ready guard, but keeps types tight.
    return <>{children}</>;
  }
  return createElement(LockedProvider, { children });
}
