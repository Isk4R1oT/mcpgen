// apps/web/src/components/admin-ui/btn.tsx
//
// Phase 3 / C1 — admin `<Btn>` primitive.
//
// Canon admin-ui.jsx + canon admin screen JSX both call the SAME `<Btn>`
// global as the main canon ui.jsx — there is no admin-specific button
// component in canon. Both surfaces share the `mc-btn-*` CSS classes
// (admin.css does not override them).
//
// Rather than duplicate the implementation, admin-ui re-exports the
// main canon `<Btn>`. This keeps a single source of truth, mirrors
// canon, and lets admin screens import everything through
// `@/components/admin-ui` without crossing into `@/components/ui`.

export { Btn } from '@/components/ui/btn';
export type { BtnKind, BtnProps, BtnSize } from '@/components/ui/btn';
