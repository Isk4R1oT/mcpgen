// apps/web/src/components/admin-ui/card.tsx
//
// Phase 3 / C1 — admin `<Card>` primitive.
//
// Canon admin screens import the SAME `<Card>` global as the main canon
// (ui.jsx). admin.css does not override `mc-card`. Re-export rather than
// duplicate, so admin screens can stay inside `@/components/admin-ui`.

export { Card } from '@/components/ui/card';
export type { CardProps } from '@/components/ui/card';
