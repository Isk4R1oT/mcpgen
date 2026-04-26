# `@mcpgen/shared-config`

Shared build/lint/test configuration consumed by every other package and app in the monorepo.

## Sub-paths

| Sub-path                              | Use                                                                                                |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@mcpgen/shared-config/eslint`        | Flat ESLint 10 config enforcing CLAUDE.md global rules (no `any`, explicit return types, etc.)     |
| `@mcpgen/shared-config/prettier`      | Prettier defaults (single quotes, trailing commas, 100-width, 2-space indent)                      |
| `@mcpgen/shared-config/tsconfig`      | `tsconfig.base.json` shim that extends the root `tsconfig.base.json` (strict TS6 base)             |
| `@mcpgen/shared-config/vitest`        | Vitest base config — extend with `mergeConfig(base, defineConfig({ /* overrides */ }))`            |

## Consumption examples

### ESLint (flat config)

```js
// apps/api/eslint.config.mjs
import baseConfig from '@mcpgen/shared-config/eslint';

export default [
  ...baseConfig,
  {
    // app-specific overrides (e.g. type-aware rules with `project: './tsconfig.json'`)
  },
];
```

### Prettier

```js
// apps/api/prettier.config.mjs
export { default } from '@mcpgen/shared-config/prettier';
```

### TypeScript

```jsonc
// apps/api/tsconfig.json
{
  "extends": "@mcpgen/shared-config/tsconfig",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src/**/*"]
}
```

### Vitest

```ts
// apps/api/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@mcpgen/shared-config/vitest';

export default mergeConfig(
  base,
  defineConfig({
    test: { include: ['src/**/*.test.ts'] },
  }),
);
```
