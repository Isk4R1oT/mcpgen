// apps/web/src/components/ui/__tests__/section-label.test.tsx
//
// F-UIKit — `<SectionLabel>` defaults to caption-only `mc-caption-up` span;
// renders the row variant `mc-seclbl` when a `right` slot is provided.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { SectionLabel } from '../section-label';

afterEach(() => cleanup());

describe('<SectionLabel>', () => {
  it('renders caption-only mc-caption-up by default', () => {
    const { container } = render(<SectionLabel>spec</SectionLabel>);
    const span = container.firstElementChild as HTMLSpanElement;
    expect(span.tagName.toLowerCase()).toBe('span');
    expect(span.className).toContain('mc-caption-up');
    expect(span.textContent).toBe('spec');
  });

  it('renders row variant mc-seclbl when right slot present', () => {
    const { container } = render(
      <SectionLabel right={<em>v1</em>}>tools</SectionLabel>,
    );
    const wrap = container.firstElementChild as HTMLDivElement;
    expect(wrap.tagName.toLowerCase()).toBe('div');
    expect(wrap.className).toContain('mc-seclbl');
    expect(wrap.querySelector('.mc-seclbl-r em')?.textContent).toBe('v1');
  });

  it('appends user className', () => {
    const { container } = render(<SectionLabel className="x">y</SectionLabel>);
    expect(container.firstElementChild?.className).toContain('x');
  });
});
