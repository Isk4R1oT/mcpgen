# Stripe local-dev workflow

This runbook is a discoverable pointer; the canonical content lives next to
the BFF and infrastructure scripts that consume it.

See:

- [`apps/api/README.md`](../../apps/api/README.md) — three-terminal startup
  (BFF + Inngest dev server + `stripe listen`), env-var contract, Wave 3
  verification commands (`stripe trigger`, replay, cost-cap synthetic smoke).
- [`infrastructure/stripe/README.md`](../../infrastructure/stripe/README.md) —
  Stripe products / prices / meters setup script + reachability check
  (`bun run infrastructure/stripe/setup.ts`).
- [`docs/runbooks/manual-customer-portal.md`](manual-customer-portal.md) —
  founder-mediated Customer Portal workflow (Q3 fallback until full Customer
  Portal integration ships in v1.x).
