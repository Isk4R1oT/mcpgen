import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@mcpgen/shared-config/vitest';

export default mergeConfig(
  base,
  defineConfig({
    test: {
      // Codegen tests spawn `tsx scripts/codegen.ts` which can take ~10–20s
      // when datamodel-code-generator runs. Bump the default 5s timeout.
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  }),
);
