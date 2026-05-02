import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const stub = fileURLToPath(new URL('./tests/_setup/flipt-stub.ts', import.meta.url));

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Load tests live under tests/load/** and use a separate config
    // (vitest.load.config.ts) with a 10-minute timeout. Excluded here so
    // `pnpm test` stays fast and doesn't accidentally include slow
    // sustained workloads in CI runs. Use `pnpm test:load` to opt in.
    exclude: ['tests/load/**', 'node_modules/**', 'dist/**', '.wrangler/**'],
    environment: 'node',
  },
  resolve: {
    // Replace the real Flipt slim+WASM client with a fake that returns
    // defaultValue for every eval. Apps/api unit tests run in plain Node
    // where the WASM imports of the slim AND default builds cannot be
    // resolved without a bundler. Real Flipt behaviour is exercised by
    // the smoke tests in packages/runtime-sdk + manual `wrangler dev`.
    alias: [
      { find: '@flipt-io/flipt-client-js/slim', replacement: stub },
      { find: '@flipt-io/flipt-client-js/engine.wasm', replacement: stub },
      { find: /^@flipt-io\/flipt-client-js$/, replacement: stub },
    ],
  },
});
