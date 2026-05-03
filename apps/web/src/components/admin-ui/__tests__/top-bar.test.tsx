// apps/web/src/components/admin-ui/__tests__/top-bar.test.tsx
//
// Phase 3 / C1 — `<AdminTopBar>` renders the canon `.adm-top` row with
// the search box (.adm-search), env select, density+theme toggles, and
// optional user slot. Verifies handlers fire and selected env tints.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { AdminTopBar } from '../top-bar';

afterEach(() => cleanup());

function renderWith(overrides: Partial<Parameters<typeof AdminTopBar>[0]> = {}) {
  const props = {
    env: 'prod' as const,
    onEnvChange: vi.fn(),
    density: 'compact' as const,
    onDensityToggle: vi.fn(),
    theme: 'dark' as const,
    onThemeToggle: vi.fn(),
    ...overrides,
  };
  return { ...render(<AdminTopBar {...props} />), props };
}

describe('<AdminTopBar>', () => {
  it('renders adm-top + adm-search + ⌘K hint', () => {
    const { container } = renderWith();
    expect(container.querySelector('.adm-top')).not.toBeNull();
    expect(container.querySelector('.adm-search')).not.toBeNull();
    const kbds = container.querySelectorAll('kbd');
    expect(kbds.length).toBeGreaterThanOrEqual(2);
  });

  it('fires onSearchClick when search bar clicked', () => {
    const onSearchClick = vi.fn();
    const { container } = renderWith({ onSearchClick });
    fireEvent.click(container.querySelector('.adm-search')!);
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });

  it('fires onEnvChange when env select changes', () => {
    const onEnvChange = vi.fn();
    const { container } = renderWith({ onEnvChange });
    const select = container.querySelector('.adm-env') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'staging' } });
    expect(onEnvChange).toHaveBeenCalledWith('staging');
  });

  it('fires density + theme toggles on click', () => {
    const onDensityToggle = vi.fn();
    const onThemeToggle = vi.fn();
    const { container } = renderWith({ onDensityToggle, onThemeToggle });
    const toggles = container.querySelectorAll('.adm-top-actions .adm-env');
    // Selects + density + theme = at least 3 .adm-env children;
    // density is at index 1 (after env select), theme at index 2.
    fireEvent.click(toggles[1]!);
    fireEvent.click(toggles[2]!);
    expect(onDensityToggle).toHaveBeenCalledTimes(1);
    expect(onThemeToggle).toHaveBeenCalledTimes(1);
  });

  it('renders user slot when supplied', () => {
    const { container } = renderWith({
      user: <span data-testid="user-chip">JK</span>,
    });
    expect(container.querySelector('[data-testid="user-chip"]')).not.toBeNull();
  });
});
