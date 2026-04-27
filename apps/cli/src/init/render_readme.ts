// apps/cli/src/init/render_readme.ts
//
// Render the README.md for a generated MCP server stub. Surfaces:
//   - Tool count + names (links to Pass 1 final tools)
//   - Coverage % (proof against upstream endpoints)
//   - Quickstart commands
//   - Claude Desktop config snippet (absolute-path args, no cwd field —
//     Claude Desktop ignores cwd and resolves args relative to its own
//     launch dir; verified during Phase-2 manual gate)
//   - Phase-2 known limitations
//
// References:
// - 02-CONTEXT.md D-43 (output dir layout)
// - docs/decisions/2026-04-28-quantization-pin-fp8-together.md (lessons
//   from Phase-2 manual gate — README path absoluteness is one of them)

import type { Pass1Output } from '@mcpgen/ir';

export function renderReadme(specSlug: string, pass1: Pass1Output, outputDirAbs: string): string {
  const toolNames = pass1.tools.map((t) => `\`${t.name}\``).join(', ');
  const serverPathAbs = `${outputDirAbs}/server.ts`;
  // Claude Desktop ignores the `cwd` field and resolves `args` paths
  // against its own launch dir, so we MUST emit an absolute path to
  // server.ts in args. No cwd field. Verified during Phase-2 manual gate.
  const claudeDesktopConfig = JSON.stringify(
    {
      mcpServers: {
        [specSlug]: {
          command: 'tsx',
          args: [serverPathAbs],
        },
      },
    },
    null,
    2,
  );

  return `# mcpgen-${specSlug}

Generated MCP server stub by mcpgen Phase 2.

## Tools (${pass1.tools.length})

${toolNames}

Coverage: ${pass1.coverage_pct}% of upstream endpoints mapped.

## Quickstart

\`\`\`bash
npm install
npm start
\`\`\`

## Claude Desktop

Add this snippet to \`~/Library/Application Support/Claude/claude_desktop_config.json\`
(macOS) or \`%APPDATA%\\Claude\\claude_desktop_config.json\` (Windows). The
\`args\` path is the absolute path to \`server.ts\` in this directory — Claude
Desktop ignores any \`cwd\` field and resolves \`args\` against its own launch
dir, so the absolute path is required.

\`\`\`json
${claudeDesktopConfig}
\`\`\`

Restart Claude Desktop. The tool list should appear in the tool picker.

## Known limitations (Phase 2 stub)

- \`tools/list\` — real (Pass 1 final tools).
- \`tools/call\` — returns a placeholder. Stage E codegen lands in Phase 4 with real handler bodies.
- Full per-parameter JSON Schema with rich descriptions — Pass 3, Phase 3.

## Regenerate

\`\`\`bash
npx mcpgen init <spec-url>
\`\`\`
`;
}
