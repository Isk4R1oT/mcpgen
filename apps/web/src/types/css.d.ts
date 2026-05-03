// apps/web/src/types/css.d.ts
//
// Allow side-effect CSS imports (e.g. `import '@/styles/globals.css'`) to
// typecheck. Next.js processes the import via its loader pipeline; TS only
// needs to know the module shape exists.

declare module '*.css';
