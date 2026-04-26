import { defineConfig, mergeConfig } from 'vitest/config';
import base from '@mcpgen/shared-config/vitest';

export default mergeConfig(base, defineConfig({}));
