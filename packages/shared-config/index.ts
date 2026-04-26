// Type-only entry point for `@mcpgen/shared-config`.
//
// Use sub-paths for actual config consumption:
//   '@mcpgen/shared-config/eslint'    -> flat ESLint 10 config
//   '@mcpgen/shared-config/prettier'  -> Prettier config object
//   '@mcpgen/shared-config/tsconfig'  -> tsconfig.base.json (extends-only)
//   '@mcpgen/shared-config/vitest'    -> Vitest base config
//
// This file exists so `import '@mcpgen/shared-config'` resolves cleanly
// without forcing a runtime side effect.

export {};
