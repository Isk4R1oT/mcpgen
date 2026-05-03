// apps/web/src/components/screens/admin/login/login.test.tsx
//
// Phase 3 / C4-login — vitest unit smoke for `<Login />`.
//
// Covers:
//   - default render shows SSO stage with canon copy ("sign in to ops"),
//     staff badge, Okta + Passkey buttons, and the system-status mock;
//   - non-@mcpgen.dev email surfaces the canon error message;
//   - clicking "continue with Okta" advances to the MFA stage (after the
//     280ms canon timeout — flushed via fake timers);
//   - MFA validates the 6-digit code length, accepts `123456` and lands
//     on the success stage;
//   - `back` from MFA returns to SSO and clears state.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';

// next/navigation router stub — unit tests don't have an App Router.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: (): { push: (href: string) => void } => ({
    push: (href: string): void => {
      pushMock(href);
    },
  }),
}));

import { Login } from './login';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  pushMock.mockReset();
});

describe('<Login />', () => {
  it('renders the SSO stage with canon copy', () => {
    const { getByText, getByRole } = render(<Login />);
    expect(getByText('sign in to ops')).toBeTruthy();
    expect(getByText(/staff only · not a customer area/i)).toBeTruthy();
    expect(getByRole('button', { name: /continue with okta/i })).toBeTruthy();
    expect(getByRole('button', { name: /sign in with passkey/i })).toBeTruthy();
    // Left rail mock status row.
    expect(getByText('all systems')).toBeTruthy();
    expect(getByText('operational')).toBeTruthy();
  });

  it('blocks non-@mcpgen.dev addresses with the canon error', () => {
    // The canon flow hard-codes the email; we exercise the validator by
    // initialising with a mismatching address and submitting the form.
    const { container, getByRole } = render(
      <Login initialEmail="external@example.com" />,
    );
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(
      getByRole('alert').textContent?.includes(
        'staff sso requires an @mcpgen.dev address',
      ),
    ).toBe(true);
  });

  it('advances to the MFA stage after clicking "continue with okta"', () => {
    const { getByRole, getByText } = render(<Login />);
    fireEvent.click(getByRole('button', { name: /continue with okta/i }));
    // Canon delays the stage flip by 280ms.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(getByText('second factor')).toBeTruthy();
  });

  it('validates the 6-digit code and reaches the success stage', () => {
    const { getByLabelText, getByRole, getByText } = render(
      <Login initialStage="mfa" disableRedirect />,
    );

    // Sub-6-digit attempt → canon error message.
    const codeInput = getByLabelText(/authenticator code/i);
    fireEvent.change(codeInput, { target: { value: '123' } });
    const submitBtn = getByRole('button', { name: /start session/i });
    // Button is disabled until the code reaches 6 digits — the start-session
    // path can only be exercised after a complete code.
    expect(submitBtn).toHaveProperty('disabled', true);

    // Full canon dev-mock code.
    fireEvent.change(codeInput, { target: { value: '123456' } });
    expect(submitBtn).toHaveProperty('disabled', false);
    fireEvent.click(submitBtn);
    expect(getByText('session opened')).toBeTruthy();
  });

  it('back link from MFA returns to SSO', () => {
    const { getByRole, getByText } = render(
      <Login initialStage="mfa" disableRedirect />,
    );
    fireEvent.click(getByRole('button', { name: /^back$/i }));
    expect(getByText('sign in to ops')).toBeTruthy();
  });
});
