// apps/api/src/lib/iso-week.ts
//
// CTRL-03 / D-18: ISO Monday-week helper for drift_email_log composite PK.
// Returns Monday 00:00 UTC of the week containing the given Date.
//
// References:
//   - .planning/phases/08-auth-billing/08-RESEARCH.md §6 D-18 (rate-limit composite key)
//   - .planning/phases/08-auth-billing/08-CONTEXT.md D-18

export function isoWeekStart(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff),
  );
  return monday; // Monday 00:00:00.000 UTC
}
