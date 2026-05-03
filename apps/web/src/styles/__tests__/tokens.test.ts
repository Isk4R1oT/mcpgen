// apps/web/src/styles/__tests__/tokens.test.ts
//
// Self-test for the TS-ported `makeCssVars` and `TWEAK_DEFAULTS`. Asserts the
// returned record contains every key the rebuild relies on, and that the
// concrete values for TWEAK_DEFAULTS match what apps/web/src/styles/globals.css
// has baked into `:root`.
//
// If this test fails after a tokens.jsx update, re-run the trace by hand from
// canon and re-emit globals.css `:root` block. Keep them in sync.

import { describe, expect, it } from 'vitest';

import {
  DENSITY,
  FONT_PAIRS,
  PALETTES,
  TWEAK_DEFAULTS,
  casing,
  getPalette,
  makeCssVars,
} from '../tokens-emit';

describe('makeCssVars(TWEAK_DEFAULTS)', () => {
  const vars = makeCssVars(TWEAK_DEFAULTS);

  it('emits all required keys from canon', () => {
    const requiredKeys = [
      '--paper',
      '--paper-alt',
      '--smoke',
      '--ink',
      '--ink-soft',
      '--text',
      '--text-muted',
      '--text-faint',
      '--border',
      '--border-sharp',
      '--border-w',
      '--primary',
      '--primary-hover',
      '--primary-ink',
      '--accent',
      '--success',
      '--info',
      '--card',
      '--tint',
      '--gradient',
      '--page-bg',
      '--hero-grad',
      '--font-serif',
      '--font-sans',
      '--font-mono',
      '--radius',
      '--radius-lg',
      '--shadow',
      '--gap',
      '--pad',
      '--row',
      '--scale',
    ] as const;

    for (const key of requiredKeys) {
      expect(vars, `missing key ${key}`).toHaveProperty(key);
      expect(vars[key], `empty value for ${key}`).toBeTruthy();
    }
  });

  it('matches palette A light surface tokens', () => {
    expect(vars['--paper']).toBe('#F5EFE3');
    expect(vars['--paper-alt']).toBe('#EFE8D8');
    expect(vars['--smoke']).toBe('#E8E2D6');
    expect(vars['--card']).toBe('#FAF6EC');
  });

  it('matches palette A light ink + text scale', () => {
    expect(vars['--ink']).toBe('#0F0E0A');
    expect(vars['--ink-soft']).toBe('#1F1D18');
    expect(vars['--text']).toBe('#0F0E0A');
    expect(vars['--text-muted']).toBe('#6B645A');
    expect(vars['--text-faint']).toBe('#9A9388');
  });

  it('uses soft borders → coloured border + sharp ink for borderSharp', () => {
    expect(vars['--border']).toBe('#DDD6C8');
    expect(vars['--border-sharp']).toBe('#0F0E0A');
    expect(vars['--border-w']).toBe('1px');
  });

  it('uses pp font stack', () => {
    expect(vars['--font-sans']).toContain('PP Neue Montreal');
    expect(vars['--font-serif']).toContain('PP Editorial New');
    expect(vars['--font-mono']).toContain('Berkeley Mono');
  });

  it('uses soft radii (6/10) and block shadow with borderSharp ink', () => {
    expect(vars['--radius']).toBe('6px');
    expect(vars['--radius-lg']).toBe('10px');
    expect(vars['--shadow']).toBe('4px 4px 0 #0F0E0A');
  });

  it('uses compact density (gap 8 / pad 12 / row 28 / scale 0.85)', () => {
    expect(vars['--gap']).toBe('8px');
    expect(vars['--pad']).toBe('12px');
    expect(vars['--row']).toBe('28px');
    expect(vars['--scale']).toBe('0.85');
  });

  it('falls back gradient → paper and heroGrad → primary when palette omits them', () => {
    // Palette A.light has no gradient/heroGrad → canon falls back per spec.
    expect(vars['--gradient']).toBe('#F5EFE3');
    expect(vars['--hero-grad']).toBe('#C8E84A');
    expect(vars['--page-bg']).toBe('#F5EFE3');
  });
});

describe('makeCssVars branches', () => {
  it('sharp borders → 0px radius + borderSharp colour for border', () => {
    const vars = makeCssVars({ ...TWEAK_DEFAULTS, borders: 'sharp' });
    expect(vars['--radius']).toBe('0px');
    expect(vars['--radius-lg']).toBe('0px');
    expect(vars['--border']).toBe(vars['--border-sharp']);
  });

  it('blur shadow → multi-layer rgba shadow', () => {
    const vars = makeCssVars({ ...TWEAK_DEFAULTS, shadows: 'blur' });
    expect(vars['--shadow']).toContain('rgba(0,0,0,0.12)');
    expect(vars['--shadow']).toContain('rgba(0,0,0,0.06)');
  });

  it('shadows none → "none"', () => {
    const vars = makeCssVars({ ...TWEAK_DEFAULTS, shadows: 'none' });
    expect(vars['--shadow']).toBe('none');
  });

  it('palette D dark + bg gradient → uses heroGrad-style gradient string', () => {
    const vars = makeCssVars({
      palette: 'D',
      fonts: 'free',
      borders: 'soft',
      shadows: 'block',
      case: 'lower',
      density: 'comfortable',
      bg: 'gradient',
      dark: true,
    });
    expect(vars['--page-bg']).toContain('linear-gradient(170deg');
    expect(vars['--hero-grad']).toContain('linear-gradient(120deg');
    expect(vars['--paper']).toBe('#15100A');
  });

  it('palette F light tint bg → uses paperAlt for page-bg', () => {
    const vars = makeCssVars({
      palette: 'F',
      fonts: 'fraunces',
      borders: 'sharp',
      shadows: 'block',
      case: 'sentence',
      density: 'cozy',
      bg: 'tint',
    });
    expect(vars['--page-bg']).toBe('#EFE8DC');
    expect(vars['--gap']).toBe('16px');
    expect(vars['--scale']).toBe('1.15');
  });
});

describe('palette + font + density tables exposed', () => {
  it('PALETTES has A/D/F', () => {
    expect(Object.keys(PALETTES).sort()).toEqual(['A', 'D', 'F']);
  });

  it('FONT_PAIRS has pp/free/fraunces', () => {
    expect(Object.keys(FONT_PAIRS).sort()).toEqual(['fraunces', 'free', 'pp']);
  });

  it('DENSITY has compact/comfortable/cozy', () => {
    expect(Object.keys(DENSITY).sort()).toEqual(['comfortable', 'compact', 'cozy']);
  });
});

describe('getPalette', () => {
  it('returns light by default', () => {
    expect(getPalette('A', undefined)).toBe(PALETTES.A.light);
    expect(getPalette('A', false)).toBe(PALETTES.A.light);
  });

  it('returns dark when truthy', () => {
    expect(getPalette('A', true)).toBe(PALETTES.A.dark);
  });
});

describe('casing', () => {
  it('lower mode passes through', () => {
    expect(casing('hello world', 'lower')).toBe('hello world');
  });

  it('sentence mode capitalises first letter at start + after sentence punctuation', () => {
    // The regex matches ^ as well, so the very first letter is capitalised too.
    expect(casing('hello. world', 'sentence')).toBe('Hello. World');
    expect(casing('one. two. three', 'sentence')).toBe('One. Two. Three');
    expect(casing('what? yes! ok.', 'sentence')).toBe('What? Yes! Ok.');
  });
});
