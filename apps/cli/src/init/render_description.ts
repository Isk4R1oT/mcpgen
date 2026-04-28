// apps/cli/src/init/render_description.ts
//
// Pure-function 5-component markdown renderer for ToolDescription.
//
// Mirrors apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py::
// render_description_markdown EXACTLY — both produce the SAME bytes given the
// same Description so the sha256 description_hash (D-14) is consistent across
// CLI and engine. Any divergence here breaks Pitfall #7 (description-drift
// surfacing) because hashes computed in the engine wouldn't match hashes
// computed by Stage E (Phase 4) lifting this helper into codegen templates.
//
// Component ordering (5 of 6 paper rubric in v0; Examples deferred to v1.1):
//
//   <purpose paragraph>
//
//   ## When to use
//   - <bullet>
//
//   ## When NOT to use   (only if d.when_not_to_use present and non-empty)
//   - <bullet>
//
//   ## How to use         (only if d.how_to_use present)
//   <paragraph>
//
//   ## Limitations
//   - <bullet>
//
//   ## Parameters
//   <overview paragraph>
//
// References:
// - 03-CONTEXT.md D-14 (description_hash) + D-37 (server.tool render shape)
// - 03-RESEARCH.md §"Code Examples" Example 6 (verbatim source)
// - apps/generation-engine/src/mcpgen_engine/passes/pass_2/validation.py
//   ::render_description_markdown (Python mirror — single source of truth)

import type { ToolDescription } from '@mcpgen/ir';

/**
 * Render a structured ToolDescription to markdown for the MCP SDK
 * `server.tool()` description argument.
 *
 * Optional fields (`when_not_to_use`, `how_to_use`) are dropped from the
 * output entirely when absent so the renderer stays canonical (no empty
 * headers). Bullet items use a single hyphen + space prefix; sections are
 * joined by a single blank line (`\n\n`).
 */
export function renderDescription(d: ToolDescription): string {
  const parts: string[] = [d.purpose];

  parts.push(
    '## When to use\n' + d.when_to_use.map((s: string) => `- ${s}`).join('\n'),
  );

  if (d.when_not_to_use && d.when_not_to_use.length > 0) {
    parts.push(
      '## When NOT to use\n'
        + d.when_not_to_use.map((s: string) => `- ${s}`).join('\n'),
    );
  }

  if (d.how_to_use) {
    parts.push('## How to use\n' + d.how_to_use);
  }

  parts.push(
    '## Limitations\n' + d.limitations.map((s: string) => `- ${s}`).join('\n'),
  );
  parts.push('## Parameters\n' + d.parameter_overview);

  return parts.join('\n\n');
}
