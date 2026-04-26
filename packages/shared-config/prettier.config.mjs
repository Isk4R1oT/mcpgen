// Shared Prettier config for the MCPGen monorepo.
// Consumers extend by re-exporting:
//   export { default } from '@mcpgen/shared-config/prettier';

export default {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
  endOfLine: 'lf',
};
