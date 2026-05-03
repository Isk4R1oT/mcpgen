// apps/web/src/components/admin-ui/__tests__/tabs.test.tsx
//
// Phase 3 / C1 — `<Tabs>` emits `.adm-tabs` + per-tab `.adm-tab` (sel
// modifier on the selected tab) and fires onChange(id) on click.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import { Tabs } from '../tabs';

afterEach(() => cleanup());

const items = [
  { id: 'overview', label: 'overview' },
  { id: 'servers', label: 'servers', count: 4 },
  { id: 'audit', label: 'audit' },
] as const;

describe('<Tabs>', () => {
  it('renders adm-tabs with items', () => {
    const { container } = render(
      <Tabs items={[...items]} selected="overview" onChange={() => {}} />,
    );
    expect(container.querySelector('.adm-tabs')).not.toBeNull();
    expect(container.querySelectorAll('.adm-tab').length).toBe(3);
  });

  it('marks the selected tab with .sel', () => {
    const { container } = render(
      <Tabs items={[...items]} selected="servers" onChange={() => {}} />,
    );
    const sel = container.querySelector('.adm-tab.sel');
    expect(sel?.textContent).toContain('servers');
  });

  it('fires onChange(id) on click', () => {
    const onChange = vi.fn();
    const { container } = render(
      <Tabs items={[...items]} selected="overview" onChange={onChange} />,
    );
    const tabs = container.querySelectorAll('.adm-tab');
    fireEvent.click(tabs[2]!);
    expect(onChange).toHaveBeenCalledWith('audit');
  });

  it('renders count chip when present', () => {
    const { container } = render(
      <Tabs items={[...items]} selected="overview" onChange={() => {}} />,
    );
    const counts = container.querySelectorAll('.adm-tab .count');
    expect(counts.length).toBe(1);
    expect(counts[0]?.textContent).toBe('4');
  });
});
