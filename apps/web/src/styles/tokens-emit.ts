// apps/web/src/styles/tokens-emit.ts
//
// TS port of claude-design-reference/canon/tokens.jsx `makeCssVars` and
// helpers. Used by the future Phase 1+ tweaks panel to swap tokens at runtime
// (apply the returned record to `<html>.style.setProperty(...)`).
//
// Source-of-truth invariants:
//   - The PALETTES, FONT_PAIRS, DENSITY tables MUST stay in sync with canon
//     tokens.jsx character-for-character. If canon adds a palette letter or
//     font key, mirror it here.
//   - TWEAK_DEFAULTS MUST match the constant baked into apps/web/src/styles/
//     globals.css `:root { ... }`. If you change defaults, regenerate the CSS
//     file from this module's makeCssVars output.
//
// Reading order: PaletteColors → PALETTES → FONT_PAIRS → DENSITY → makeCssVars.

/** A single palette variant (light or dark). Mirror of canon shape. */
export type PaletteColors = {
  paper: string;
  paperAlt: string;
  smoke: string;
  ink: string;
  inkSoft: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderSharp: string;
  primary: string;
  primaryHover: string;
  primaryInk: string;
  accent: string;
  success: string;
  info: string;
  cardBg: string;
  tint: string;
  // Optional gradient/heroGrad — only some palettes provide these.
  gradient?: string;
  heroGrad?: string;
};

export type Palette = {
  name: string;
  light: PaletteColors;
  dark: PaletteColors;
};

export type FontPair = {
  name: string;
  serif: string;
  sans: string;
  mono: string;
};

export type DensityScale = {
  unit: number;
  gap: number;
  pad: number;
  row: number;
};

export type Tweak = {
  palette: 'A' | 'D' | 'F';
  fonts: 'pp' | 'free' | 'fraunces';
  borders: 'soft' | 'sharp';
  shadows: 'block' | 'blur' | 'none';
  case: 'lower' | 'sentence';
  density: 'compact' | 'comfortable' | 'cozy';
  bg: 'paper' | 'gradient' | 'tint';
  // `dark` is optional — canon treats absence as light mode (truthy check).
  dark?: boolean;
};

/** All keys produced by `makeCssVars`. Used by tests + tweaks-panel typing. */
export type CssVarKey =
  | '--paper'
  | '--paper-alt'
  | '--smoke'
  | '--ink'
  | '--ink-soft'
  | '--text'
  | '--text-muted'
  | '--text-faint'
  | '--border'
  | '--border-sharp'
  | '--border-w'
  | '--primary'
  | '--primary-hover'
  | '--primary-ink'
  | '--accent'
  | '--success'
  | '--info'
  | '--card'
  | '--tint'
  | '--gradient'
  | '--page-bg'
  | '--hero-grad'
  | '--font-serif'
  | '--font-sans'
  | '--font-mono'
  | '--radius'
  | '--radius-lg'
  | '--shadow'
  | '--gap'
  | '--pad'
  | '--row'
  | '--scale';

export type CssVars = Record<CssVarKey, string>;

// ---------------------------------------------------------------------------
// PALETTES — character-for-character mirror of canon tokens.jsx PALETTES.
// ---------------------------------------------------------------------------
export const PALETTES: Record<'A' | 'D' | 'F', Palette> = {
  A: {
    name: 'Acid Studio',
    light: {
      // Softer "key lime + cream" — lampy, not toxic
      paper: '#F5EFE3',
      paperAlt: '#EFE8D8',
      smoke: '#E8E2D6',
      ink: '#0F0E0A',
      inkSoft: '#1F1D18',
      text: '#0F0E0A',
      textMuted: '#6B645A',
      textFaint: '#9A9388',
      border: '#DDD6C8',
      borderSharp: '#0F0E0A',
      primary: '#C8E84A',
      primaryHover: '#B5D633',
      primaryInk: '#0F0E0A',
      accent: '#E8634A',
      success: '#1F6B3A',
      info: '#0F0E0A',
      cardBg: '#FAF6EC',
      tint: 'rgba(200, 232, 74, 0.12)',
    },
    dark: {
      paper: '#0F0E0C',
      paperAlt: '#1A1815',
      smoke: '#25221E',
      ink: '#F8F5EE',
      inkSoft: '#E8E2D6',
      text: '#F8F5EE',
      textMuted: '#9A9388',
      textFaint: '#6B645A',
      border: '#2D2A24',
      borderSharp: '#F8F5EE',
      primary: '#C8E84A',
      primaryHover: '#B5D633',
      primaryInk: '#0F0E0A',
      accent: '#E8634A',
      success: '#3FAF6A',
      info: '#F8F5EE',
      cardBg: '#1A1815',
      tint: 'rgba(200, 232, 74, 0.10)',
    },
  },
  D: {
    name: 'Mocha',
    light: {
      // Warm coffeehouse — espresso ink + caramel + cream
      paper: '#F4ECDD',
      paperAlt: '#EADFC8',
      smoke: '#DCCCAB',
      ink: '#2A1810',
      inkSoft: '#3F2820',
      text: '#2A1810',
      textMuted: '#6B5040',
      textFaint: '#9A7E68',
      border: '#D8C6A8',
      borderSharp: '#2A1810',
      primary: '#A8501C',
      primaryHover: '#8A3F12',
      primaryInk: '#F4ECDD',
      accent: '#3D5A2A',
      success: '#3D5A2A',
      info: '#2A1810',
      cardBg: '#FBF4E5',
      tint: 'rgba(168, 80, 28, 0.08)',
      gradient: 'linear-gradient(170deg, #F4ECDD 0%, #E8D5B0 100%)',
      heroGrad: 'linear-gradient(120deg, #A8501C 0%, #D89668 100%)',
    },
    dark: {
      paper: '#15100A',
      paperAlt: '#1F1810',
      smoke: '#2A201A',
      ink: '#F4ECDD',
      inkSoft: '#EADFC8',
      text: '#F4ECDD',
      textMuted: '#B5A088',
      textFaint: '#7A6850',
      border: '#33281C',
      borderSharp: '#F4ECDD',
      primary: '#E89060',
      primaryHover: '#F2A878',
      primaryInk: '#15100A',
      accent: '#88B070',
      success: '#88B070',
      info: '#F4ECDD',
      cardBg: '#1F1810',
      tint: 'rgba(232, 144, 96, 0.12)',
      gradient: 'linear-gradient(170deg, #15100A 0%, #25180F 100%)',
      heroGrad: 'linear-gradient(120deg, #E89060 0%, #88B070 100%)',
    },
  },
  F: {
    name: 'Riviera',
    light: {
      // Mediterranean — sea cobalt + sun-bleached terracotta on whitewash
      paper: '#F8F4ED',
      paperAlt: '#EFE8DC',
      smoke: '#E0D7C6',
      ink: '#0E2A4A',
      inkSoft: '#1A3D60',
      text: '#0E2A4A',
      textMuted: '#5A6B80',
      textFaint: '#8A98AC',
      border: '#D8CDBA',
      borderSharp: '#0E2A4A',
      primary: '#1561B5',
      primaryHover: '#0F4D90',
      primaryInk: '#F8F4ED',
      accent: '#D8693D',
      success: '#1561B5',
      info: '#0E2A4A',
      cardBg: '#FFFFFF',
      tint: 'rgba(21, 97, 181, 0.08)',
      gradient: 'linear-gradient(180deg, #F8F4ED 0%, #C8DCEC 100%)',
      heroGrad: 'linear-gradient(120deg, #1561B5 0%, #6BA8D8 50%, #D8693D 100%)',
    },
    dark: {
      paper: '#06121F',
      paperAlt: '#0E1F33',
      smoke: '#172D48',
      ink: '#F8F4ED',
      inkSoft: '#EFE8DC',
      text: '#F8F4ED',
      textMuted: '#9AAEC4',
      textFaint: '#5A6B80',
      border: '#1F3550',
      borderSharp: '#F8F4ED',
      primary: '#6BA8D8',
      primaryHover: '#8AC0E8',
      primaryInk: '#06121F',
      accent: '#F08860',
      success: '#6BA8D8',
      info: '#F8F4ED',
      cardBg: '#0E1F33',
      tint: 'rgba(107, 168, 216, 0.12)',
      gradient: 'linear-gradient(180deg, #06121F 0%, #102540 100%)',
      heroGrad: 'linear-gradient(120deg, #6BA8D8 0%, #F08860 100%)',
    },
  },
};

// ---------------------------------------------------------------------------
// FONT_PAIRS — character-for-character mirror.
// ---------------------------------------------------------------------------
export const FONT_PAIRS: Record<'pp' | 'free' | 'fraunces', FontPair> = {
  pp: {
    name: 'PP Editorial / Neue Montreal / Berkeley',
    serif: '"PP Editorial New", "Editorial New", "Instrument Serif", Georgia, serif',
    sans: '"PP Neue Montreal", "Neue Montreal", "Inter", system-ui, sans-serif',
    mono: '"Berkeley Mono", "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace',
  },
  free: {
    name: 'Instrument Serif / Inter / JetBrains',
    serif: '"Instrument Serif", Georgia, serif',
    sans: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  fraunces: {
    name: 'Fraunces / Geist / Plex',
    serif: '"Fraunces", Georgia, serif',
    sans: '"Geist", "Inter", system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, monospace',
  },
};

// ---------------------------------------------------------------------------
// DENSITY — character-for-character mirror.
// ---------------------------------------------------------------------------
export const DENSITY: Record<'compact' | 'comfortable' | 'cozy', DensityScale> = {
  compact: { unit: 0.85, gap: 8, pad: 12, row: 28 },
  comfortable: { unit: 1.0, gap: 12, pad: 16, row: 36 },
  cozy: { unit: 1.15, gap: 16, pad: 20, row: 40 },
};

/** Default tweak set baked into globals.css `:root`. */
export const TWEAK_DEFAULTS: Tweak = {
  palette: 'A',
  fonts: 'pp',
  borders: 'soft',
  shadows: 'block',
  case: 'lower',
  density: 'compact',
  bg: 'paper',
};

/** Resolve palette + variant. Mirror of canon `getPalette`. */
export function getPalette(letter: Tweak['palette'], dark: boolean | undefined): PaletteColors {
  const p: Palette = PALETTES[letter] ?? PALETTES.A;
  return dark ? p.dark : p.light;
}

/**
 * Build the CSS-var record for a given tweak set. Mirror of canon
 * `makeCssVars(t)`. Returned object can be applied to `<html>` via:
 *
 *   const vars = makeCssVars(TWEAK_DEFAULTS);
 *   for (const [k, v] of Object.entries(vars)) {
 *     document.documentElement.style.setProperty(k, v);
 *   }
 */
export function makeCssVars(t: Tweak): CssVars {
  const c: PaletteColors = getPalette(t.palette, t.dark);
  const f: FontPair = FONT_PAIRS[t.fonts] ?? FONT_PAIRS.pp;
  const d: DensityScale = DENSITY[t.density] ?? DENSITY.comfortable;
  const sharp: boolean = t.borders === 'sharp';
  const radius: string = sharp ? '0px' : '6px';
  const radiusLg: string = sharp ? '0px' : '10px';
  let shadow: string;
  if (t.shadows === 'block') {
    shadow = `4px 4px 0 ${c.borderSharp}`;
  } else if (t.shadows === 'blur') {
    shadow = '0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)';
  } else {
    shadow = 'none';
  }
  const borderColor: string = sharp ? c.borderSharp : c.border;
  const borderWidth: string = sharp ? '1px' : '1px';

  // page-bg follows canon ternary: gradient → c.gradient (if present),
  // tint → c.paperAlt, otherwise → c.paper.
  let pageBg: string;
  if (t.bg === 'gradient' && c.gradient !== undefined) {
    pageBg = c.gradient;
  } else if (t.bg === 'tint') {
    pageBg = c.paperAlt;
  } else {
    pageBg = c.paper;
  }

  return {
    '--paper': c.paper,
    '--paper-alt': c.paperAlt,
    '--smoke': c.smoke,
    '--ink': c.ink,
    '--ink-soft': c.inkSoft,
    '--text': c.text,
    '--text-muted': c.textMuted,
    '--text-faint': c.textFaint,
    '--border': borderColor,
    '--border-sharp': c.borderSharp,
    '--border-w': borderWidth,
    '--primary': c.primary,
    '--primary-hover': c.primaryHover,
    '--primary-ink': c.primaryInk,
    '--accent': c.accent,
    '--success': c.success,
    '--info': c.info,
    '--card': c.cardBg,
    '--tint': c.tint,
    '--gradient': c.gradient ?? c.paper,
    '--page-bg': pageBg,
    '--hero-grad': c.heroGrad ?? c.primary,
    '--font-serif': f.serif,
    '--font-sans': f.sans,
    '--font-mono': f.mono,
    '--radius': radius,
    '--radius-lg': radiusLg,
    '--shadow': shadow,
    '--gap': `${d.gap}px`,
    '--pad': `${d.pad}px`,
    '--row': `${d.row}px`,
    '--scale': String(d.unit),
  };
}

/**
 * Casing transformer. Mirror of canon `casing(text, mode)`.
 *
 * `'sentence'` capitalizes the first letter after sentence-ending punctuation,
 * preserving any all-caps abbreviations (URL, MCP, JSON, CLI, API). Other
 * modes pass-through (canon authors body text in lowercase).
 */
export function casing(text: string, mode: Tweak['case']): string {
  if (mode === 'sentence') {
    if (text === '' || text === undefined || text === null) return text;
    return text.replace(/(^|\.\s+|\?\s+|!\s+)([a-z])/g, (_m, p: string, ch: string) => p + ch.toUpperCase());
  }
  return text;
}
