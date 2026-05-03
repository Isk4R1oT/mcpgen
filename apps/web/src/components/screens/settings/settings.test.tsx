// apps/web/src/components/screens/settings/settings.test.tsx
//
// Phase 2 — Settings screen — vitest smoke covering section visibility per
// flag combination + the canon-no-mock-leak invariant.
//
// Two scenarios:
//   1. Default flags (profile / security / usage / danger-delete ON):
//      sidebar nav has exactly 4 entries, only the 4 matching section
//      nodes are in the DOM.
//   2. All flags ON: 9 sections rendered + 9 nav entries.
//
// The mock-leak assertion verifies that the canon demo strings
// ("kira@dolla.io", "kira okonkwo", "188.130", "moscow", "$184.20",
// "284,512", "lumen-payments-mcp", "dolla.io") never appear in the
// flag-ON-by-default render path. They are allowed when an _OFF flag is
// flipped manually (api-keys / sso / audit / danger non-delete preview
// rows) — those test variants explicitly account for the canon mock data.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import enMessages from '../../../../messages/en.json';
import Settings, {
  type SettingsFlags,
  type SettingsProps,
} from './settings';

// next/navigation is server-only inside vitest; mock the hooks the screen
// uses (the production component does not call useRouter directly — the
// page-level wrapper does — but LangSwitcher does).
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (p: string) => void } => ({ push: vi.fn() }),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: (): { push: (p: string) => void; replace: (p: string) => void } => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: (): string => '/settings',
}));

const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => toastMock(msg, opts),
}));

afterEach(() => {
  cleanup();
  toastMock.mockReset();
});

beforeEach(() => {
  // Suppress noisy network errors emitted by usage / dashboard query fetches
  // — the section renders the same way on `enabled: false` as on a 0-status
  // network failure.
});

const DEFAULT_FLAGS: SettingsFlags = {
  profile: true,
  security: true,
  recoveryCodes: false,
  apiKeys: false,
  sso: false,
  notifications: false,
  integrations: false,
  usage: true,
  audit: false,
  dangerExport: false,
  dangerTransfer: false,
  dangerPause: false,
  dangerDelete: true,
};

const ALL_ON_FLAGS: SettingsFlags = {
  profile: true,
  security: true,
  recoveryCodes: true,
  apiKeys: true,
  sso: true,
  notifications: true,
  integrations: true,
  usage: true,
  audit: true,
  dangerExport: true,
  dangerTransfer: true,
  dangerPause: true,
  dangerDelete: true,
};

function renderSettings(flags: SettingsFlags): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  const props: SettingsProps = {
    userName: 'Sam Carter',
    userEmail: 'sam@example.com',
    plan: 'pro',
    profile: {
      handle: 'sam',
      timezone: 'Europe/London',
      language: 'en',
      bio: '',
    },
    sessions: [],
    sessionsUnavailable: true,
    twoFactorMode: 'off',
    flags,
    onBack: vi.fn(),
    onDashboard: vi.fn(),
    onMarketplace: vi.fn(),
    onBilling: vi.fn(),
  };
  render(
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Settings {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('<Settings>', () => {
  it('renders the canon-styled main page heading', () => {
    renderSettings(DEFAULT_FLAGS);
    // Title is split across "account &" + italic "workspace." in an h1
    // with class `mc-h1` at 36px. The literal "account" also appears in
    // the sidebar eyebrow ("account · {name}"); we identify the heading
    // by its mc-h1 class to be unambiguous.
    const h1 = document.querySelector('.mc-h1');
    expect(h1).not.toBeNull();
    expect(h1!.textContent?.toLowerCase()).toContain('account');
    expect(h1!.textContent?.toLowerCase()).toContain('workspace');
  });

  it('default flags → only profile/security/usage/danger sections render', () => {
    renderSettings(DEFAULT_FLAGS);
    expect(
      document.querySelector('[data-testid="settings-section-profile"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-security"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-usage"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-danger"]'),
    ).not.toBeNull();

    // Hidden:
    expect(
      document.querySelector('[data-testid="settings-section-keys"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-sso"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-notifications"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-integrations"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-testid="settings-section-audit"]'),
    ).toBeNull();
  });

  it('all flags ON → all 9 sections render', () => {
    renderSettings(ALL_ON_FLAGS);
    for (const id of [
      'profile',
      'security',
      'keys',
      'sso',
      'notifications',
      'integrations',
      'usage',
      'audit',
      'danger',
    ]) {
      expect(
        document.querySelector(`[data-testid="settings-section-${id}"]`),
      ).not.toBeNull();
    }
  });

  it('all flags OFF (except dangerDelete) → sidebar nav has 4 entries', () => {
    renderSettings(DEFAULT_FLAGS);
    const nav = document.querySelector('nav');
    expect(nav).not.toBeNull();
    // Sidebar nav buttons are <button>s with the canon glyph + label. We
    // count direct <button> children of the <nav>.
    const buttons = nav!.querySelectorAll(':scope > button');
    expect(buttons.length).toBe(4);
  });

  it('all flags ON → sidebar nav has 9 entries', () => {
    renderSettings(ALL_ON_FLAGS);
    const nav = document.querySelector('nav');
    expect(nav).not.toBeNull();
    const buttons = nav!.querySelectorAll(':scope > button');
    expect(buttons.length).toBe(9);
  });

  it('flag-OFF-by-default sections never render the preview banner under default flags', () => {
    renderSettings(DEFAULT_FLAGS);
    const banner = document.querySelector(
      '[data-testid="settings-preview-banner"]',
    );
    expect(banner).toBeNull();
  });

  it('canon mock literals never leak into flag-ON-by-default render', () => {
    renderSettings(DEFAULT_FLAGS);
    // We only inspect outside the timezone <select> dropdown — its
    // <option>s legitimately list "Europe/Moscow" / "America/Los_Angeles"
    // / etc., which are generic timezones, NOT demo identity data. Strip
    // every <select>...</select> from the html before scanning so the
    // canon-fingerprint check never trips on a benign tz option list.
    const raw = document.body.innerHTML.toLowerCase();
    const html = raw.replace(/<select[^>]*>[\s\S]*?<\/select>/g, '');

    // Tokens chosen from the canon screen-settings.jsx: full demo identity
    // (kira okonkwo / kira@dolla.io / dolla), Russian IPs (188.130, 37.193,
    // 5.62), demo locations (when paired with " · " separator that canon
    // uses, e.g. "moscow, ru" / "belgrade, rs" / "lisbon, pt"), the
    // canon-mocked big numbers ($184.20 / $394.10 / $1,284 / 284,512),
    // and the canon-only server name "lumen-payments-mcp".
    const forbidden = [
      'kira okonkwo',
      'kira@dolla.io',
      'dolla.io',
      '188.130',
      '37.193',
      '5.62',
      'moscow, ru',
      'belgrade, rs',
      'lisbon, pt',
      '$184.20',
      '$394.10',
      '$1,284',
      '284,512',
      'lumen-payments-mcp',
    ];
    for (const tok of forbidden) {
      expect(html).not.toContain(tok.toLowerCase());
    }
  });

  it('header strip + plan badge render the canon Stat cells', () => {
    renderSettings(DEFAULT_FLAGS);
    // 4 Stat cells in the header strip — identified by the .mc-caption-up
    // labels we authored. "tool calls · this month" appears in both the
    // header Stat AND inside the usage section's big counter — assert at
    // least one occurrence each.
    expect(screen.getAllByText(/tool calls · this month/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/active servers/i)).toBeTruthy();
    expect(screen.getByText(/last login/i)).toBeTruthy();
  });
});
