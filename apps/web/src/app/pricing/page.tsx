// apps/web/src/app/pricing/page.tsx
//
// Plan 07-03 — Minimal pricing route. Per CONTEXT D-06 + RESEARCH Open
// Questions #3 ("if even composing primitives feels like a visual addition,
// drop the pricing route and inline a placeholder until Phase 8 ships
// Stripe-backed pricing"), Plan 07-03 ships a placeholder that redirects
// to landing with `?pricing=true` so external links don't 404.
//
// Phase 8 (`ops` workstream) wires the real Stripe-product-backed pricing
// page; until then any `/pricing` traffic lands on the landing screen,
// preserving the visual lock.

import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PricingPage(): never {
  redirect('/?pricing=true');
}
