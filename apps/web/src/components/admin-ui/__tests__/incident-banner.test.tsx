// apps/web/src/components/admin-ui/__tests__/incident-banner.test.tsx
//
// Phase 3 / C1 — `<IncidentBanner>` emits `.adm-incident` and renders
// the dismiss `<Btn>` only when `onDismiss` is supplied.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { IncidentBanner } from '../incident-banner';

afterEach(() => cleanup());

describe('<IncidentBanner>', () => {
  it('renders adm-incident with strong + content', () => {
    const { container } = render(<IncidentBanner>cdg degraded</IncidentBanner>);
    const banner = container.querySelector('.adm-incident');
    expect(banner).not.toBeNull();
    expect(banner?.querySelector('.strong')?.textContent).toContain('incident');
    expect(banner?.textContent).toContain('cdg degraded');
  });

  it('omits dismiss button when onDismiss is not provided', () => {
    const { container } = render(<IncidentBanner>x</IncidentBanner>);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders + fires dismiss button when onDismiss is provided', () => {
    const onDismiss = vi.fn();
    const { container } = render(<IncidentBanner onDismiss={onDismiss}>x</IncidentBanner>);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
