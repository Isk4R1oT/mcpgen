// apps/web/src/types/jsx.d.ts
//
// Ambient module declarations for the locked .jsx canon (claude-design-ui).
// The .jsx files are excluded from tsc parsing because some embed literal
// `}` characters inside JSX text content (e.g. screen-stream.jsx line 158
// renders a code-snippet with curly braces). The TS parser cannot handle
// `.jsx` syntax that exceeds the standard JSX subset, so we exclude them
// from typechecking and let Next.js (Babel/SWC) compile them at runtime.
//
// These ambient declarations let TS code still `import '@/screen-foo'` for
// side effects and resolve named exports as `unknown`. The jsx-bridge then
// reads the registered components from `window.<Name>` (set inside each
// .jsx file at module bottom).

declare module '*.jsx' {
  // Side-effect import; named/default exports unknown to TS.
  const value: unknown;
  export default value;
}
