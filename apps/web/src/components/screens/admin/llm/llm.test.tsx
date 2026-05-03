// apps/web/src/components/screens/admin/llm/llm.test.tsx
//
// Phase 3 / Agent C3-llm — LLM Ops unit smoke.
//
// Verifies the canon-critical surfaces survive in code:
//   - Page head title ("ai / llm ops") and sub-text are present.
//   - Both header CTAs render ("run eval" + "propose route change").
//   - 4 KPI tiles render with their canon labels.
//   - Tab strip renders all 5 tabs (`adm-tabs` + `adm-tab` classes).
//   - Routing tab is the default — both inner cards present plus the
//     pending-review diff with 3 action buttons.
//   - Switching to "evals" mounts the eval-runs Card.
//   - Switching to a preview-only tab renders the EmptyState.
//   - Action buttons fire `toast()` stubs when their flag is OFF.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

import LlmScreen from './llm';

// ─── Mocks ─────────────────────────────────────────────────────────────────

const toastSpy = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: Record<string, unknown>): void => {
    toastSpy(msg, opts);
  },
}));

const drawerSpy = vi.fn();
vi.mock('@/lib/drawer', () => ({
  openDrawer: (
    title: string,
    body: unknown,
    opts?: Record<string, unknown>,
  ): void => {
    drawerSpy(title, body, opts);
  },
}));

afterEach(() => {
  cleanup();
  toastSpy.mockReset();
  drawerSpy.mockReset();
});

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('<LlmScreen>', () => {
  it('renders page head + sub copy from canon', () => {
    const { container } = render(<LlmScreen />);
    const title = container.querySelector('.adm-page-title');
    const sub = container.querySelector('.adm-page-sub');
    expect(title?.textContent).toBe('ai / llm ops');
    expect(sub?.textContent).toContain('model routing, eval suites');
  });

  it('renders both header CTAs', () => {
    const { getByRole } = render(<LlmScreen />);
    expect(getByRole('button', { name: /run eval/i })).toBeTruthy();
    expect(getByRole('button', { name: /propose route change/i })).toBeTruthy();
  });

  it('renders 4 KPI tiles with canon labels', () => {
    const { container } = render(<LlmScreen />);
    const labels = Array.from(container.querySelectorAll('.adm-kpi-label')).map(
      (n) => n.textContent,
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        'tokens · 24h',
        'model spend · 30d',
        'avg latency',
        'eval pass rate',
      ]),
    );
    const nums = Array.from(container.querySelectorAll('.adm-kpi-num')).map(
      (n) => n.textContent,
    );
    expect(nums).toContain('184.2 m');
    expect(nums).toContain('$48,210');
    expect(nums).toContain('742 ms');
    expect(nums).toContain('94.2%');
  });

  it('renders the 5-tab strip with `adm-tabs` / `adm-tab` classes', () => {
    const { container } = render(<LlmScreen />);
    const tabsRow = container.querySelector('.adm-tabs');
    expect(tabsRow).not.toBeNull();
    const tabs = Array.from(tabsRow!.querySelectorAll('.adm-tab')).map(
      (n) => n.textContent,
    );
    expect(tabs).toEqual(['routing', 'evals', 'rate-limits', 'prompts', 'safety']);
  });

  it('routing tab is default and renders active routes + provider mix + pending review', () => {
    const { container, getByText } = render(<LlmScreen />);
    // Active routes table heading text appears verbatim in the SectionLabel
    expect(getByText('active routes')).toBeTruthy();
    expect(getByText('provider mix · 24h')).toBeTruthy();
    expect(getByText('proposed change · pending review')).toBeTruthy();

    // Diff lines exist
    const diff = container.querySelectorAll('.adm-diff-line');
    expect(diff.length).toBe(4);

    // Approve / request-changes / reject buttons are present
    expect(container.textContent).toContain('approve');
    expect(container.textContent).toContain('request changes');
    expect(container.textContent).toContain('reject');
  });

  it('switching to evals tab mounts the eval-runs card', () => {
    const { container, getByText } = render(<LlmScreen />);
    const evalsTab = Array.from(container.querySelectorAll('.adm-tab')).find(
      (n) => n.textContent === 'evals',
    );
    expect(evalsTab).toBeTruthy();
    fireEvent.click(evalsTab!);
    expect(getByText('recent eval runs')).toBeTruthy();
    expect(container.textContent).toContain('eval_8a91');
    expect(container.textContent).toContain('eval_8a88');
  });

  it('rate-limits tab renders the "preview only" empty state', () => {
    const { container } = render(<LlmScreen />);
    const rateLimits = Array.from(container.querySelectorAll('.adm-tab')).find(
      (n) => n.textContent === 'rate-limits',
    );
    expect(rateLimits).toBeTruthy();
    fireEvent.click(rateLimits!);
    const empty = container.querySelector('.adm-empty');
    expect(empty?.textContent).toContain('rate-limits — preview only');
  });

  it('"run eval" with flag OFF (default) toasts the stub', () => {
    const { getByRole } = render(<LlmScreen />);
    fireEvent.click(getByRole('button', { name: /run eval/i }));
    expect(toastSpy).toHaveBeenCalledWith('admin action: not yet wired', {
      kind: 'info',
    });
  });

  it('"run eval" with flag ON toasts the live message', () => {
    const { getByRole } = render(<LlmScreen runEvalEnabled />);
    fireEvent.click(getByRole('button', { name: /run eval/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      'eval queued · starting in ~3s',
      undefined,
    );
  });

  it('"propose route change" with flag OFF toasts the stub (no drawer)', () => {
    const { getByRole } = render(<LlmScreen />);
    fireEvent.click(getByRole('button', { name: /propose route change/i }));
    expect(toastSpy).toHaveBeenCalledWith('admin action: not yet wired', {
      kind: 'info',
    });
    expect(drawerSpy).not.toHaveBeenCalled();
  });

  it('"propose route change" with flag ON opens the drawer with eyebrow', () => {
    const { getByRole } = render(<LlmScreen proposeRouteEnabled />);
    fireEvent.click(getByRole('button', { name: /propose route change/i }));
    expect(drawerSpy).toHaveBeenCalledTimes(1);
    const [title, , opts] = drawerSpy.mock.calls[0]!;
    expect(title).toBe('propose route change');
    expect(opts).toMatchObject({ eyebrow: '2 approvers required' });
  });

  it('"approve" / "request changes" / "reject" with flag OFF toast the stub', () => {
    const { getByRole } = render(<LlmScreen />);
    fireEvent.click(getByRole('button', { name: /^approve$/i }));
    fireEvent.click(getByRole('button', { name: /request changes/i }));
    fireEvent.click(getByRole('button', { name: /^reject$/i }));
    // First two are info, reject is warn
    expect(toastSpy).toHaveBeenCalledTimes(3);
    expect(toastSpy).toHaveBeenNthCalledWith(1, 'admin action: not yet wired', {
      kind: 'info',
    });
    expect(toastSpy).toHaveBeenNthCalledWith(2, 'admin action: not yet wired', {
      kind: 'info',
    });
    expect(toastSpy).toHaveBeenNthCalledWith(3, 'admin action: not yet wired', {
      kind: 'warn',
    });
  });

  it('approve with flag ON fires the live approval toast', () => {
    const { getByRole } = render(<LlmScreen approveRouteEnabled />);
    fireEvent.click(getByRole('button', { name: /^approve$/i }));
    expect(toastSpy).toHaveBeenCalledWith(
      'approved · 1 of 2 approvals · awaiting noor',
      undefined,
    );
  });
});
