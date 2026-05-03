// apps/web/src/components/admin-ui/badge.tsx
//
// Phase 3 / C1 — admin `<Badge>` primitive (canon `mc-badge`).
//
// Canon admin screens use BOTH `<Pill>` (status pills, dot+label) AND
// the main `<Badge>` (mc-badge) where a flat label without a dot is
// needed. Re-export the main Badge so admin screens have a single
// import surface (`@/components/admin-ui`).

export { Badge } from '@/components/ui/badge';
export type { BadgeKind, BadgeProps } from '@/components/ui/badge';
