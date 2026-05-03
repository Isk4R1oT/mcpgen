// apps/web/src/components/ui/__tests__/badge.test.tsx
//
// F-UIKit — `<Badge>` emits canon `mc-badge mc-badge-{kind}` (+ `mc-mono` by default).

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Badge } from '../badge';

afterEach(() => cleanup());

describe('<Badge>', () => {
  it('renders default kind=default with mono token', () => {
    const { container } = render(<Badge>v1</Badge>);
    const span = container.querySelector('span');
    expect(span?.className).toContain('mc-badge');
    expect(span?.className).toContain('mc-badge-default');
    expect(span?.className).toContain('mc-mono');
    expect(span?.textContent).toBe('v1');
  });

  it.each(['primary', 'soft', 'warn', 'success', 'live', 'accent', 'ink'] as const)(
    'emits mc-badge-%s when kind=%s',
    (kind) => {
      const { container } = render(<Badge kind={kind}>x</Badge>);
      expect(container.querySelector('span')?.className).toContain(`mc-badge-${kind}`);
    },
  );

  it('drops mc-mono when mono=false', () => {
    const { container } = render(<Badge mono={false}>x</Badge>);
    expect(container.querySelector('span')?.className).not.toContain('mc-mono');
  });
});
