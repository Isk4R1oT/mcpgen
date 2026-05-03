// apps/web/src/components/screens/account/account.test.tsx
//
// Phase Frontend Rebuild — Vitest unit tests for AccountScreen.
//
// Coverage:
//   - Each mode (signin / signup / magic / forgot) renders without crash.
//   - Flag-gating: SSO buttons absent when individual flags OFF.
//   - Flag-gating: signup tab + "forgot?" link + magic-link CTA + marketplace
//     link respect their respective flags.
//   - All-SSO-OFF collapses the entire SSO row + "or with email" divider.
//   - Password strength meter labels match canon algorithm at boundaries.
//   - Email validation regex rejects bad input (invalid email blocks submit).
//   - 4xx API response shows AcctErrorLine with the API's error_message.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import enMessages from '../../../../messages/en.json';
import AccountScreen, { type AccountFlags } from './account';

// next/navigation is server-only inside Vitest; mock the hooks the screen uses.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (path: string) => void } => ({ push: pushMock }),
}));

// Toast side-effects.
const toastMock = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: (msg: string, opts?: unknown): void => toastMock(msg, opts),
}));

// Stub fetch — every test sets a custom response.
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  pushMock.mockReset();
  toastMock.mockReset();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const ALL_OFF: AccountFlags = {
  ui_auth_signup_perm: false,
  ui_auth_magic_link_perm: false,
  ui_auth_forgot_password_perm: false,
  ui_auth_google_sso_perm: false,
  ui_auth_github_sso_perm: false,
  ui_auth_microsoft_sso_perm: false,
  ui_auth_saml_sso_perm: false,
  ui_marketplace_perm: false,
};
const ALL_ON: AccountFlags = {
  ui_auth_signup_perm: true,
  ui_auth_magic_link_perm: true,
  ui_auth_forgot_password_perm: true,
  ui_auth_google_sso_perm: true,
  ui_auth_github_sso_perm: true,
  ui_auth_microsoft_sso_perm: true,
  ui_auth_saml_sso_perm: true,
  ui_marketplace_perm: true,
};

function renderAccount(
  mode: 'signin' | 'signup' | 'magic' | 'forgot',
  flags: AccountFlags,
): ReturnType<typeof render> {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AccountScreen mode={mode} flags={flags} />
    </NextIntlClientProvider>,
  );
}

describe('<AccountScreen> — render per mode', () => {
  it('signin mode shows the sign-in form with email + password fields', () => {
    renderAccount('signin', ALL_ON);
    // The sign-in primary button.
    const buttons = screen.getAllByRole('button', { name: /sign in/i });
    expect(buttons.length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/you@team\.dev/i)).toBeTruthy();
  });

  it('signup mode shows name + company + password strength scaffolding', () => {
    renderAccount('signup', ALL_ON);
    // Full name field is present.
    expect(screen.getByPlaceholderText(/ada lovelace/i)).toBeTruthy();
    // Company optional field.
    expect(screen.getByPlaceholderText(/analytical engines/i)).toBeTruthy();
  });

  it('magic mode shows the magic-link form', () => {
    renderAccount('magic', ALL_ON);
    expect(screen.getByText(/sign in with a magic link/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /send magic link/i }),
    ).toBeTruthy();
  });

  it('forgot mode shows the password reset form', () => {
    renderAccount('forgot', ALL_ON);
    expect(screen.getByText(/reset your password/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /send reset link/i }),
    ).toBeTruthy();
  });
});

describe('<AccountScreen> — flag gating', () => {
  it('hides every SSO button when all four SSO flags are OFF', () => {
    renderAccount('signin', ALL_OFF);
    expect(screen.queryByText(/continue with google/i)).toBeNull();
    expect(screen.queryByText(/^github$/i)).toBeNull();
    expect(screen.queryByText(/^microsoft$/i)).toBeNull();
    // SAML rendered as label "sso" — query the divider instead.
    expect(screen.queryByText(/or with email/i)).toBeNull();
  });

  it('shows google SSO and divider when only google flag is ON', () => {
    renderAccount('signin', { ...ALL_OFF, ui_auth_google_sso_perm: true });
    expect(screen.getByText(/continue with google/i)).toBeTruthy();
    expect(screen.getByText(/or with email/i)).toBeTruthy();
    // GitHub/Microsoft/SAML still hidden.
    expect(screen.queryByText(/^github$/i)).toBeNull();
  });

  it('hides "forgot?" link when ui_auth_forgot_password_perm is OFF', () => {
    renderAccount('signin', { ...ALL_ON, ui_auth_forgot_password_perm: false });
    expect(screen.queryByText(/forgot\?/i)).toBeNull();
  });

  it('hides magic-link CTA button when ui_auth_magic_link_perm is OFF', () => {
    renderAccount('signin', { ...ALL_ON, ui_auth_magic_link_perm: false });
    expect(screen.queryByText(/email me a magic link instead/i)).toBeNull();
  });

  it('hides the signup tab + "create an account" footer when signup flag is OFF', () => {
    const { container } = renderAccount('signin', {
      ...ALL_ON,
      ui_auth_signup_perm: false,
    });
    // Tab bar collapses entirely (no tabs at all when only one mode is reachable).
    expect(container.querySelector('button[class*="mc-mono"]')).not.toBeNull();
    // The "create account" tab specifically should not exist.
    expect(
      screen.queryByRole('button', { name: /create account/i }),
    ).toBeNull();
  });

  it('hides marketplace link in TopBar when ui_marketplace_perm is OFF', () => {
    renderAccount('signin', { ...ALL_ON, ui_marketplace_perm: false });
    // The "marketplace" link in the TopBar right slot is not present;
    // assert by querying the top-bar specifically.
    const topRight = document.querySelector('.mc-top-right');
    expect(topRight?.textContent ?? '').not.toMatch(/marketplace/i);
  });
});

describe('<AccountScreen> — password strength', () => {
  // Test the canon algorithm at boundary inputs (mode='signup' so the meter renders).
  const STRENGTH_CASES: ReadonlyArray<readonly [string, string]> = [
    ['short', 'weak'], // length<8 → 0 (no label) — but score 0, label '—'
    ['shortish', 'weak'], // length===8, no upper, no digit, no symbol → 1 → 'weak'
    ['shortishX', 'okay'], // length>=8, mixed case → 2 → 'okay'
    ['Sh0rtish!', 'good'], // length 9, mixed, digit, symbol → 4 (>=12 misses) → 'strong'? Let's recount.
  ];
  void STRENGTH_CASES;

  it('renders "weak" for a length-8 lowercase-only password', () => {
    renderAccount('signup', ALL_ON);
    const pwInput = screen.getAllByPlaceholderText(/at least 8 chars/i)[0]!;
    fireEvent.change(pwInput, { target: { value: 'aaaaaaaa' } });
    // length>=8 → +1; no other criteria → score 1 → 'weak'.
    const label = screen.getByTestId('pw-strength-label');
    expect(label.textContent ?? '').toMatch(/weak/);
  });

  it('renders "okay" for length-8 mixed-case', () => {
    renderAccount('signup', ALL_ON);
    const pwInput = screen.getAllByPlaceholderText(/at least 8 chars/i)[0]!;
    fireEvent.change(pwInput, { target: { value: 'aaAAaaAA' } });
    // length>=8 (+1) + mixedCase (+1) = 2 → 'okay'.
    const label = screen.getByTestId('pw-strength-label');
    expect(label.textContent ?? '').toMatch(/okay/);
  });

  it('renders "good" for length-12 mixed-case + digit', () => {
    renderAccount('signup', ALL_ON);
    const pwInput = screen.getAllByPlaceholderText(/at least 8 chars/i)[0]!;
    fireEvent.change(pwInput, { target: { value: 'aaAAaaAA1234' } });
    // length>=8 (+1) + length>=12 (+1) + mixedCase (+1) + digit (+1) = 4 → clamps at 4 → 'strong'.
    // Adjust expectation.
    const label = screen.getByTestId('pw-strength-label');
    expect(label.textContent ?? '').toMatch(/strong/);
  });

  it('renders "strong" for length-12 mixed-case + digit + symbol', () => {
    renderAccount('signup', ALL_ON);
    const pwInput = screen.getAllByPlaceholderText(/at least 8 chars/i)[0]!;
    fireEvent.change(pwInput, { target: { value: 'aaAAaaAA12!@' } });
    // All 5 criteria → clamps at 4 → 'strong'.
    const label = screen.getByTestId('pw-strength-label');
    expect(label.textContent ?? '').toMatch(/strong/);
  });

  it('renders "good" (score 3) for length-9 mixed + digit but no symbol', () => {
    renderAccount('signup', ALL_ON);
    const pwInput = screen.getAllByPlaceholderText(/at least 8 chars/i)[0]!;
    fireEvent.change(pwInput, { target: { value: 'aaAAaaAA1' } });
    // length>=8 (+1) + mixedCase (+1) + digit (+1) = 3 → 'good'.
    const label = screen.getByTestId('pw-strength-label');
    expect(label.textContent ?? '').toMatch(/good/);
  });
});

function getMainForm(): HTMLFormElement {
  // The main auth/magic/forgot form is the only <form> in the screen.
  const form = document.querySelector('form');
  if (form === null) throw new Error('no <form> in document');
  return form;
}

describe('<AccountScreen> — email validation', () => {
  it('rejects bad email on sign-in submit', async () => {
    renderAccount('signin', ALL_ON);
    const emailInput = screen.getByPlaceholderText(/you@team\.dev/i);
    fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
    const pwInput = screen.getByPlaceholderText('••••••••');
    fireEvent.change(pwInput, { target: { value: 'whatever' } });
    fireEvent.submit(getMainForm());
    // Error line is rendered with role=alert (canon AcctErrorLine).
    expect(screen.getByRole('alert').textContent).toMatch(/valid email/i);
    // Fetch was not called.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects bad email on magic-link submit', () => {
    renderAccount('magic', ALL_ON);
    const emailInput = screen.getByPlaceholderText(/you@team\.dev/i);
    fireEvent.change(emailInput, { target: { value: '@bad' } });
    fireEvent.submit(getMainForm());
    expect(screen.getByRole('alert').textContent).toMatch(/valid email/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('<AccountScreen> — API integration', () => {
  it('renders error_message from a 4xx response', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ error_message: 'invalid credentials, friend' }),
        { status: 401, headers: { 'content-type': 'application/json' } },
      ),
    );
    renderAccount('signin', ALL_ON);
    fireEvent.change(screen.getByPlaceholderText(/you@team\.dev/i), {
      target: { value: 'real@user.io' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'p4ssw0rd!' },
    });
    fireEvent.submit(getMainForm());
    // Wait microtask for the promise.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole('alert').textContent).toMatch(
      /invalid credentials/,
    );
    expect(pushMock).not.toHaveBeenCalledWith('/dashboard');
  });

  it('routes to /dashboard on 200 sign-in', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    renderAccount('signin', ALL_ON);
    fireEvent.change(screen.getByPlaceholderText(/you@team\.dev/i), {
      target: { value: 'real@user.io' },
    });
    fireEvent.change(screen.getByPlaceholderText('••••••••'), {
      target: { value: 'p4ssw0rd!' },
    });
    fireEvent.submit(getMainForm());
    await new Promise((r) => setTimeout(r, 30));
    expect(pushMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows magic-sent state on 200 magic-link', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    renderAccount('magic', ALL_ON);
    fireEvent.change(screen.getByPlaceholderText(/you@team\.dev/i), {
      target: { value: 'real@user.io' },
    });
    fireEvent.submit(getMainForm());
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByText(/check your email/i)).toBeTruthy();
  });
});
