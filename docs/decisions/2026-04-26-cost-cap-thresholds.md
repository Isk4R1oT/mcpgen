# 2026-04-26 — Cost cap thresholds (free $0.50, pro $2.00 per generation)

## Status

Accepted.

## Context

`packages/contracts/src/launch-criteria.ts` introduces two new immutable runtime
constants for per-generation cost cap enforcement (Phase 8 CTRL-06 / D-13):

| Constant                                | Value | Purpose                                                        |
| --------------------------------------- | ----- | -------------------------------------------------------------- |
| `LAUNCH_CRITERIA.COST_CAP_FREE_USD`     | 0.50  | Maximum LLM cost per generation for Free tier; hard fail above |
| `LAUNCH_CRITERIA.COST_CAP_PRO_USD`      | 2.00  | Maximum LLM cost per generation for Pro tier; hard fail above  |

The pre-commit hook
[`launch-criteria-paired-decision.sh`](../../.pre-commit-hooks/launch-criteria-paired-decision.sh)
requires that any commit which modifies `launch-criteria.ts` ALSO commits a
paired `docs/decisions/<YYYY-MM-DD>-<slug>.md` entry. This file is that paired
entry for the Phase 8 cost-cap addition (T-1-03 / D-13 / Pitfall #29 — defense
against "AI-fix-by-lowering-threshold").

## Decision

Adopt the values above verbatim from `docs/mcpgen-architecture.md §10`
("Max bundle 1MB, max spec 10MB, max 2 retries/pass, **cost cap $0.50 free /
$2.00 pro**") and `CLAUDE.md` ("Cost cap: $0.50 free / $2.00 pro per generation.
Превышение → hard fail с partial result + bill"). Per Phase 8 CONTEXT.md D-13
and PROJECT.md Constraints: "Cost cap exceeded → hard fail with partial result
+ bill, never silent overrun."

### Why $0.50 (Free)

- One generation should not cost more than the eventual subscription price ÷ 2
  ≈ $30/2 = $15/mo budget for the founder; $0.50 = 30 free generations/mo
  before MCPGen runs at a loss.
- Pre-empts viral-fork misuse: a free user pasting 5 popular APIs at once does
  not blow up MCPGen's OpenRouter bill.
- Per Phase 8 RESEARCH §15 + PITFALLS.md Pitfall #16 mitigation: TimescaleDB is
  quota truth (real-time hourly aggregate); cost cap fires per-generation
  server-side BEFORE runaway LLM spend can accumulate, independent of Stripe
  Meters' eventual-consistency lag.

### Why $2.00 (Pro)

- 4× Free for paid users gives headroom for genuinely large API specs (Stripe
  ~$1.50 baseline per generation per architecture §5.6 cost model + RESEARCH §6).
- Hard fail above $2.00 still prevents pathological cases (specs > 1000
  endpoints; the Pass 0 hard cap should multi-server-split first).
- Per Phase 8 CONTEXT.md "Specifics": cost-cap kill is "in-flight cancel," not
  "post-hoc reject" — engine MUST honor cancel signal mid-pass; first-pass-
  after-cap completes (typical overage <$0.10 until engine cooperative-abort
  lands per Phase 5 follow-up).

## Three-layer immutability defense (T-1-03)

1. **Pre-commit hook** `launch-criteria-paired-decision.sh` requires this very
   document on the same commit that modifies `launch-criteria.ts`. The hook
   regex requires date-prefix format
   `^docs/decisions/[0-9]{4}-[0-9]{2}-[0-9]{2}-.+\.md$`.
2. **CI assertion** (`launch-criteria-assertion` job in
   `.github/workflows/main-ci.yml`) uses `grep -qF` to check that each constant
   matches its documented value across `CLAUDE.md` + `docs/mcpgen-architecture.md`.
3. **TypeScript `as const`** prevents widening of the literal types.
4. **Test cross-doc consistency** (`packages/contracts/tests/launch-criteria.test.ts`)
   asserts the same regexes against `CLAUDE.md` and `docs/mcpgen-architecture.md`
   so doc drift fails before CI.

## Consequences

- **Pre-commit guard active:** any future change to either constant requires a
  NEW paired decision file in the SAME commit.
- **Phase 8 Inngest cost-cap-enforcer (D-13)** imports both constants and
  applies based on `organizations.plan_tier` (`'free'` →
  `COST_CAP_FREE_USD`; `'pro'` → `COST_CAP_PRO_USD`; `'payg'` → no hard cap,
  every overage bills).
- **Engine cooperative-abort dependency (RESEARCH §20 Q2):** filed as
  `chore(engine): support mid-pass cancel via cooperative abort` for Phase 5
  acceptance gate (`.planning/todos/pending/engine-cooperative-abort.md`).
  Until engine ships cooperative abort, the cost cap is a soft cap (one extra
  pass spend; <$0.10 typical overage), then enforcement fires.
- **CI grep-target updated:** if `mcpgen-architecture.md §10` text changes its
  literal "cost cap $0.50 free / $2.00 pro" phrasing, the cross-doc test breaks
  — by design (single-edit-multi-file invariant).

## References

- `.planning/phases/08-auth-billing/08-CONTEXT.md` D-13
- `.planning/phases/08-auth-billing/08-RESEARCH.md` §6 D-13, §12
- `docs/mcpgen-architecture.md` §10 (billing + cost cap)
- `docs/mcpgen-implementation-plan.md` §11.7 (launch criteria)
- `CLAUDE.md` §3 / §11.7 (operating reference; canonical phrasing)
- `PROJECT.md` Constraints: "Cost cap exceeded → hard fail with partial
  result + bill"
- `.pre-commit-hooks/launch-criteria-paired-decision.sh` (paired-decision guard)
- `.github/workflows/main-ci.yml` `launch-criteria-assertion` job
