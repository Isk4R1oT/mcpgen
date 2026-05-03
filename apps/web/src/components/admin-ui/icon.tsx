// apps/web/src/components/admin-ui/icon.tsx
//
// Phase 3 / C1 — admin `<Icon>` primitive (re-export).
//
// Canon admin screens use the SAME `<Icon>` set as the main canon
// (ui.jsx). Re-export so admin imports stay inside `@/components/admin-ui`.

export { Icon } from '@/components/ui/icon';
export type { IconName, IconProps } from '@/components/ui/icon';
