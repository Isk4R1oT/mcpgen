// apps/web/src/components/ui/__tests__/stamp.test.tsx
//
// F-UIKit — `<Stamp>` is a layout container with the canon `mc-stamp` class.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Stamp } from '../stamp';

afterEach(() => cleanup());

describe('<Stamp>', () => {
  it('emits mc-stamp class', () => {
    const { container } = render(
      <Stamp>
        <span>inside</span>
      </Stamp>,
    );
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.className).toContain('mc-stamp');
    expect(div.querySelector('span')?.textContent).toBe('inside');
  });

  it('forwards className + style', () => {
    const { container } = render(
      <Stamp className="x" style={{ width: 320 }}>
        body
      </Stamp>,
    );
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.className).toContain('mc-stamp');
    expect(div.className).toContain('x');
    expect(div.style.width).toBe('320px');
  });
});
