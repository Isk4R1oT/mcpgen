// apps/web/src/components/admin-ui/__tests__/pill.test.tsx
//
// Phase 3 / C1 — `<Pill>` emits canon `adm-pill {kind}` and renders the
// optional dot span. Mirrors canon admin-ui.jsx (`Pill`).

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { Pill } from '../pill';

afterEach(() => cleanup());

describe('<Pill>', () => {
  it('renders default (no kind, dot=true) with adm-pill class + dot', () => {
    const { container } = render(<Pill>live</Pill>);
    const span = container.querySelector('span.adm-pill');
    expect(span).not.toBeNull();
    expect(span?.querySelector('.dot')).not.toBeNull();
    expect(span?.textContent).toContain('live');
  });

  it.each(['ok', 'warn', 'alert', 'info', 'ink'] as const)(
    'emits adm-pill %s when kind=%s',
    (kind) => {
      const { container } = render(<Pill kind={kind}>x</Pill>);
      const span = container.querySelector('span.adm-pill');
      expect(span?.className).toContain(kind);
    },
  );

  it('drops dot span when dot=false', () => {
    const { container } = render(<Pill dot={false}>x</Pill>);
    expect(container.querySelector('span.adm-pill .dot')).toBeNull();
  });
});
