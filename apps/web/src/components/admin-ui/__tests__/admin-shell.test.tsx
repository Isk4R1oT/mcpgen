// apps/web/src/components/admin-ui/__tests__/admin-shell.test.tsx
//
// Phase 3 / C1 — `<AdminShell>` smoke test.
//
// The shell pulls in `next/navigation` (`useRouter` + `usePathname`) which
// is server-only in vitest; mock both. We verify:
//   - `.adm-shell` grid renders with the logo block
//   - sidebar nav shows all 14 items across the 4 groups
//   - the active route highlights (`/admin/users` selects "users & orgs")
//   - top bar (`.adm-top`) + status bar (`.adm-statusbar`) are present
//   - Cmd+K opens the command palette overlay

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';

const pushSpy = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: pushSpy }),
  usePathname: (): string => '/admin/users',
}));

// Import after mocks.
import { AdminShell } from '@/components/screens/admin/admin-shell';

afterEach(() => {
  cleanup();
  pushSpy.mockReset();
});

describe('<AdminShell>', () => {
  it('renders the canon shell grid with logo + nav + status bar', () => {
    const { container } = render(
      <AdminShell>
        <div data-testid="content">overview</div>
      </AdminShell>,
    );
    expect(container.querySelector('.adm-shell')).not.toBeNull();
    expect(container.querySelector('.adm-logo')).not.toBeNull();
    expect(container.querySelector('.adm-top')).not.toBeNull();
    expect(container.querySelector('.adm-side')).not.toBeNull();
    expect(container.querySelector('.adm-main')).not.toBeNull();
    expect(container.querySelector('.adm-statusbar')).not.toBeNull();
    expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
  });

  it('renders all 14 nav items across 4 groups', () => {
    const { container } = render(
      <AdminShell>
        <div />
      </AdminShell>,
    );
    const items = container.querySelectorAll('.adm-nav-item');
    expect(items.length).toBe(14);
    const groups = container.querySelectorAll('.adm-nav-group');
    expect(groups.length).toBe(4);
  });

  it('marks the active nav item based on pathname (mocked /admin/users)', () => {
    const { container } = render(
      <AdminShell>
        <div />
      </AdminShell>,
    );
    const sel = container.querySelector('.adm-nav-item.sel');
    expect(sel?.textContent).toContain('users & orgs');
  });

  it('navigates via router.push when nav item clicked', () => {
    const { container } = render(
      <AdminShell>
        <div />
      </AdminShell>,
    );
    const items = container.querySelectorAll('.adm-nav-item');
    // Click on the "audit log" item.
    const audit = Array.from(items).find((el) =>
      el.textContent?.includes('audit log'),
    );
    expect(audit).not.toBeUndefined();
    fireEvent.click(audit!);
    expect(pushSpy).toHaveBeenCalledWith('/admin/audit');
  });

  it('opens the command palette on Cmd+K', () => {
    const { container } = render(
      <AdminShell>
        <div />
      </AdminShell>,
    );
    expect(container.ownerDocument.querySelector('.adm-palette-veil')).toBeNull();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(container.ownerDocument.querySelector('.adm-palette-veil')).not.toBeNull();
  });
});
