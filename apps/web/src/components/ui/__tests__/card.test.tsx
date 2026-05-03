// apps/web/src/components/ui/__tests__/card.test.tsx
//
// F-UIKit — `<Card>` emits `mc-card mc-card-pad` by default; padding=false drops
// the pad modifier; onClick + style + className forwarded.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Card } from '../card';

afterEach(() => cleanup());

describe('<Card>', () => {
  it('renders mc-card mc-card-pad by default', () => {
    const { container } = render(<Card>body</Card>);
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.className).toContain('mc-card');
    expect(div.className).toContain('mc-card-pad');
    expect(div.textContent).toBe('body');
  });

  it('drops mc-card-pad when padding=false', () => {
    const { container } = render(<Card padding={false}>body</Card>);
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.className).toContain('mc-card');
    expect(div.className).not.toContain('mc-card-pad');
  });

  it('appends user className + forwards style + onClick', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Card className="x" style={{ minHeight: 24 }} onClick={onClick}>
        body
      </Card>,
    );
    const div = container.firstElementChild as HTMLDivElement;
    expect(div.className).toContain('x');
    expect(div.style.minHeight).toBe('24px');
    fireEvent.click(div);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
