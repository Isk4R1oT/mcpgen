// tokens.jsx — design tokens, palettes, font stacks, helpers
// Three palettes (A: Acid Studio, B: Cobalt Press, C: Specimen-dark)
// Plus light/dark variants and density.

const PALETTES = {
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
      primary: '#C8E84A',     // soft chartreuse-lime (was D2FF1F)
      primaryHover: '#B5D633',
      primaryInk: '#0F0E0A',
      accent: '#E8634A',      // softer terracotta-coral (was FF5C3D)
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
      primary: '#A8501C',     // caramel/burnt sienna
      primaryHover: '#8A3F12',
      primaryInk: '#F4ECDD',
      accent: '#3D5A2A',      // sage green
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
      primary: '#1561B5',     // sea cobalt
      primaryHover: '#0F4D90',
      primaryInk: '#F8F4ED',
      accent: '#D8693D',      // sun-bleached terracotta
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

function getPalette(letter, dark) {
  const p = PALETTES[letter] || PALETTES.A;
  return p[dark ? 'dark' : 'light'];
}

const FONT_PAIRS = {
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

const DENSITY = {
  compact:  { unit: 0.85, gap: 8, pad: 12, row: 28 },
  comfortable: { unit: 1.0, gap: 12, pad: 16, row: 36 },
  cozy:     { unit: 1.15, gap: 16, pad: 20, row: 40 },
};

// Build the css var blob for a given tweak set
function makeCssVars(t) {
  const c = getPalette(t.palette, t.dark);
  const f = FONT_PAIRS[t.fonts] || FONT_PAIRS.pp;
  const d = DENSITY[t.density] || DENSITY.comfortable;
  const sharp = t.borders === 'sharp';
  const radius = sharp ? '0px' : '6px';
  const radiusLg = sharp ? '0px' : '10px';
  let shadow;
  if (t.shadows === 'block') shadow = `4px 4px 0 ${c.borderSharp}`;
  else if (t.shadows === 'blur') shadow = `0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.06)`;
  else shadow = 'none';
  const borderColor = sharp ? c.borderSharp : c.border;
  const borderWidth = sharp ? '1px' : '1px';

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
    '--gradient': c.gradient || c.paper,
    '--page-bg': (t.bg === 'gradient' && c.gradient) ? c.gradient
                 : (t.bg === 'tint') ? c.paperAlt
                 : c.paper,
    '--hero-grad': c.heroGrad || c.primary,
    '--font-serif': f.serif,
    '--font-sans': f.sans,
    '--font-mono': f.mono,
    '--radius': radius,
    '--radius-lg': radiusLg,
    '--shadow': shadow,
    '--gap': d.gap + 'px',
    '--pad': d.pad + 'px',
    '--row': d.row + 'px',
    '--scale': d.unit,
  };
}

// transform text per case rule. Headings keep their own treatment.
function casing(text, mode) {
  if (mode === 'sentence') {
    if (!text) return text;
    // Preserve all-uppercase abbreviations (URL, MCP, JSON, CLI, API)
    return text.replace(/(^|\.\s+|\?\s+|!\s+)([a-z])/g, (m, p, c) => p + c.toUpperCase());
  }
  return text; // lowercase mode: pass-through (we author in lowercase)
}

if (typeof window !== 'undefined') {
  window.MCPTokens = { PALETTES, FONT_PAIRS, DENSITY, getPalette, makeCssVars, casing };
}
