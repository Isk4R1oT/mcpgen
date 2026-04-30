// apps/web/src/types/css.d.ts
//
// Plan 07-02 — Allow side-effect CSS imports (e.g. `import '@/global.css'`)
// to typecheck. Next.js processes the import via its loader pipeline; TS
// only needs to know the module shape exists.

declare module '*.css';
