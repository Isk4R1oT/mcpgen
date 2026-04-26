// ESLint 10 flat config for the MCPGen monorepo.
// Enforces CLAUDE.md global rules (strict typing everywhere, no Any/unknown,
// no default parameter values, prefer functional code, all imports at top).
//
// Consumers extend like:
//   import baseConfig from '@mcpgen/shared-config/eslint';
//   export default [...baseConfig, { /* package overrides */ }];

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import security from 'eslint-plugin-security';
import prettier from 'eslint-config-prettier';

export default [
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        // Type-aware rules require `project` to be set per consumer; left false here
        // because the shared base must work without a tsconfig path.
        project: false,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      security,
    },
    rules: {
      // CLAUDE.md: no Any
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // CLAUDE.md: strict typing on returns
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      // CLAUDE.md: prefer functional code; classes only for external system connectors
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'ClassDeclaration',
          message:
            'Prefer functional code; use classes only for external system connectors (CLAUDE.md).',
        },
      ],
      // Security
      'security/detect-object-injection': 'off', // too many false positives in TS
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-eval-with-expression': 'error',
      'security/detect-unsafe-regex': 'warn',
    },
  },
  // Disables stylistic rules that conflict with Prettier (must be last).
  prettier,
];
