// apps/web/src/lib/logto/password.ts
//
// Password-strength rule used by the embedded sign-up form. Mirrors the
// canon rule (PasswordField in canon screen-account.jsx — score >= 2):
//   - min 8 chars
//   - at least 2 of the 3 character classes:
//       upper-case, digit, symbol (non-alphanumeric)
//
// Returns a discriminated result so the route handler can map the
// failure reason to a field-specific error_message.

export interface PasswordValidationOk {
  ok: true;
  score: number;
}

export interface PasswordValidationFail {
  ok: false;
  reason: 'too_short' | 'too_weak';
  score: number;
}

export type PasswordValidation = PasswordValidationOk | PasswordValidationFail;

const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

export function validatePassword(password: string): PasswordValidation {
  if (password.length < 8) {
    return { ok: false, reason: 'too_short', score: 0 };
  }
  let score = 0;
  if (HAS_UPPER.test(password)) score += 1;
  if (HAS_DIGIT.test(password)) score += 1;
  if (HAS_SYMBOL.test(password)) score += 1;
  if (score < 2) {
    return { ok: false, reason: 'too_weak', score };
  }
  return { ok: true, score };
}
