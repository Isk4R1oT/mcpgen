// apps/web/src/components/ui/__tests__/top-bar.test.tsx
//
// F-UIKit — `<TopBar>` mirrors canon `mc-top` markup: logo button + breadcrumb
// + right slot. Accepts both `breadcrumb` (brief API) and `crumb` (canon alias).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { TopBar } from '../top-bar';

afterEach(() => cleanup());

describe('<TopBar>', () => {
  it('renders header with mc-top class + logo + word', () => {
    const { container, getByRole } = render(<TopBar />);
    const header = container.querySelector('header.mc-top');
    expect(header).not.toBeNull();
    expect(getByRole('button', { name: 'home' })).not.toBeNull();
    expect(container.querySelector('.mc-logo-mark')?.textContent).toBe('◤');
    expect(container.querySelector('.mc-logo-word')?.textContent).toBe('mcpgen');
  });

  it('omits crumb when no breadcrumb/crumb provided', () => {
    const { container } = render(<TopBar />);
    expect(container.querySelector('.mc-crumb')).toBeNull();
  });

  it('renders breadcrumb prop', () => {
    const { container } = render(<TopBar breadcrumb="dashboard" />);
    const crumb = container.querySelector('.mc-crumb');
    expect(crumb).not.toBeNull();
    expect(crumb?.textContent).toContain('dashboard');
  });

  it('falls back to canon `crumb` alias', () => {
    const { container } = render(<TopBar crumb="alias-trail" />);
    expect(container.querySelector('.mc-crumb')?.textContent).toContain('alias-trail');
  });

  it('renders right slot inside mc-top-right', () => {
    const { container } = render(<TopBar right={<span data-testid="r">R</span>} />);
    const right = container.querySelector('.mc-top-right [data-testid="r"]');
    expect(right).not.toBeNull();
  });

  it('fires onLogo on logo click', () => {
    const onLogo = vi.fn();
    const { getByRole } = render(<TopBar onLogo={onLogo} />);
    fireEvent.click(getByRole('button', { name: 'home' }));
    expect(onLogo).toHaveBeenCalledTimes(1);
  });
});
