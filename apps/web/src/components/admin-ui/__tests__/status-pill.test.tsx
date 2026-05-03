// apps/web/src/components/admin-ui/__tests__/status-pill.test.tsx
//
// Phase 3 / C1 — `<StatusPill>` mirrors canon `StatusDotForServer`:
// maps a status string to the right `<Pill>` kind.

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import { StatusPill } from '../status-pill';

afterEach(() => cleanup());

describe('<StatusPill>', () => {
  it.each([
    ['live', 'ok'],
    ['healthy', 'ok'],
    ['flagged', 'warn'],
    ['degraded', 'warn'],
    ['incident', 'alert'],
    ['suspended', 'alert'],
    ['pending', 'info'],
    ['maint', 'info'],
  ] as const)('maps %s → %s pill kind', (status, expectedKind) => {
    const { container } = render(<StatusPill status={status} />);
    const pill = container.querySelector('.adm-pill');
    expect(pill?.className).toContain(expectedKind);
    expect(pill?.textContent).toContain(status);
  });

  it('renders unknown status with no kind class', () => {
    const { container } = render(<StatusPill status="unknown-state" />);
    const pill = container.querySelector('.adm-pill');
    expect(pill?.textContent).toContain('unknown-state');
    // No 'ok'/'warn'/'alert'/'info' class.
    expect(pill?.classList.contains('ok')).toBe(false);
    expect(pill?.classList.contains('warn')).toBe(false);
    expect(pill?.classList.contains('alert')).toBe(false);
    expect(pill?.classList.contains('info')).toBe(false);
  });
});
