// apps/cli/tests/test_render_description.test.ts
//
// Pure-function unit tests for renderDescription — verifies the 5-component
// markdown ordering (D-37 verbatim shape) AND the Python mirror parity that
// keeps description_hash (D-14) consistent across CLI + engine.
//
// References:
// - 03-CONTEXT.md D-14 (description_hash) + D-37 (server.tool render shape)
// - apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py
//   ::render_description_markdown (Python mirror)

import { describe, expect, test } from 'bun:test';
import type { ToolDescription } from '@mcpgen/ir';

import { renderDescription } from '../src/init/render_description.js';

const MINIMAL: ToolDescription = {
  purpose: 'Search charges by date and amount.',
  when_to_use: ['User asks for charges'],
  limitations: ['Returns max 25 results'],
  parameter_overview:
    'Required: date_from. Optional: date_to, amount_min, amount_max.',
};

describe('renderDescription', () => {
  test('renders 5 components in order with markdown headers', () => {
    const md = renderDescription(MINIMAL);
    const purposeIdx = md.indexOf('Search charges');
    const whenIdx = md.indexOf('## When to use');
    const limitIdx = md.indexOf('## Limitations');
    const paramIdx = md.indexOf('## Parameters');

    expect(purposeIdx).toBeGreaterThanOrEqual(0);
    expect(whenIdx).toBeGreaterThan(purposeIdx);
    expect(limitIdx).toBeGreaterThan(whenIdx);
    expect(paramIdx).toBeGreaterThan(limitIdx);
  });

  test('omits optional When NOT to use when missing', () => {
    const md = renderDescription(MINIMAL);
    expect(md).not.toContain('## When NOT to use');
  });

  test('omits optional How to use when missing', () => {
    const md = renderDescription(MINIMAL);
    expect(md).not.toContain('## How to use');
  });

  test('includes optional When NOT to use when provided', () => {
    const d: ToolDescription = {
      ...MINIMAL,
      when_not_to_use: ['Use list_objects() instead for general listing.'],
    };
    const md = renderDescription(d);
    expect(md).toContain('## When NOT to use');
    expect(md).toContain('Use list_objects() instead for general listing.');
  });

  test('omits When NOT to use when array is empty', () => {
    const d: ToolDescription = { ...MINIMAL, when_not_to_use: [] };
    const md = renderDescription(d);
    expect(md).not.toContain('## When NOT to use');
  });

  test('includes optional How to use when provided', () => {
    const d: ToolDescription = {
      ...MINIMAL,
      how_to_use: 'Provide date_from in ISO 8601 format.',
    };
    const md = renderDescription(d);
    expect(md).toContain('## How to use');
    expect(md).toContain('Provide date_from in ISO 8601 format.');
  });

  test('renders bullets with hyphen + space prefix', () => {
    const md = renderDescription(MINIMAL);
    expect(md).toContain('- User asks for charges');
    expect(md).toContain('- Returns max 25 results');
  });

  test('joins parts with double newline', () => {
    const md = renderDescription(MINIMAL);
    expect(md).toContain('Search charges by date and amount.\n\n## When to use');
    expect(md).toContain('## Limitations\n- Returns max 25 results\n\n## Parameters');
  });

  test('When to use header lists every bullet with hyphen prefix', () => {
    const d: ToolDescription = {
      ...MINIMAL,
      when_to_use: ['Bullet one', 'Bullet two', 'Bullet three'],
    };
    const md = renderDescription(d);
    expect(md).toContain('## When to use\n- Bullet one\n- Bullet two\n- Bullet three');
  });

  test('Limitations header lists every bullet with hyphen prefix', () => {
    const d: ToolDescription = {
      ...MINIMAL,
      limitations: ['lim a', 'lim b'],
    };
    const md = renderDescription(d);
    expect(md).toContain('## Limitations\n- lim a\n- lim b');
  });

  test('Parameters section is the final block', () => {
    const md = renderDescription(MINIMAL);
    expect(md.endsWith(MINIMAL.parameter_overview)).toBe(true);
  });

  test('all 5 components rendered when every optional present', () => {
    const d: ToolDescription = {
      ...MINIMAL,
      when_not_to_use: ['DO NOT use for batch listing.'],
      how_to_use: 'Pass ISO 8601 date_from + optional amount_min in cents.',
    };
    const md = renderDescription(d);
    const order = [
      'Search charges by date and amount.',
      '## When to use',
      '## When NOT to use',
      '## How to use',
      '## Limitations',
      '## Parameters',
    ];
    let prev = -1;
    for (const marker of order) {
      const idx = md.indexOf(marker);
      expect(idx).toBeGreaterThan(prev);
      prev = idx;
    }
  });

  test('Python mirror parity — known-good fixture string', () => {
    // EXACT byte-equal output Python `render_description_markdown` produces
    // for the same input. Locks the CLI ↔ engine `description_hash` contract
    // (Pitfall #7). If this assertion fails, the Python mirror in
    // pass_2/validation.py::render_description_markdown was changed without
    // a matching CLI update — fix BOTH together.
    const expected
      = 'Search charges by date and amount.\n\n'
      + '## When to use\n'
      + '- User asks for charges\n\n'
      + '## Limitations\n'
      + '- Returns max 25 results\n\n'
      + '## Parameters\n'
      + 'Required: date_from. Optional: date_to, amount_min, amount_max.';
    expect(renderDescription(MINIMAL)).toBe(expected);
  });
});
