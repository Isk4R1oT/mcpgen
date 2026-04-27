// apps/cli/src/init/render_package_json.ts
//
// Render a minimal runnable Node/Bun package.json for the generated MCP
// server stub. `npm install && npm start` brings the server up over stdio
// with `tsx server.ts`.
//
// References:
// - 02-CONTEXT.md D-04 (MCP SDK pin) + D-43 (output dir layout)

interface PackageJsonShape {
  name: string;
  version: string;
  type: 'module';
  private: boolean;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export function renderPackageJson(specSlug: string): string {
  const pkg: PackageJsonShape = {
    name: `mcpgen-${specSlug}`,
    version: '0.0.1',
    type: 'module',
    private: true,
    scripts: {
      start: 'tsx server.ts',
      dev: 'tsx --watch server.ts',
    },
    dependencies: {
      '@modelcontextprotocol/sdk': '^1.29.0',
      zod: '^4.3.6',
    },
    devDependencies: {
      tsx: '^4.19.2',
      '@types/node': '^22.10.5',
    },
  };
  return `${JSON.stringify(pkg, null, 2)}\n`;
}
