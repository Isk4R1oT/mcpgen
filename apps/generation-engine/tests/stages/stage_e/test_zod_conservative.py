"""Pitfall #33 — outputs.ts conservative-format invariant.

CONTEXT D-26 / D-55: outputs.ts dual-exports a rich Zod-derived schema
(includes `format: "date-time"` etc.) AND a conservative variant that strips
all `format` strings. The default export = conservative; the named export
`richSchemas` = rich. Older MCP clients (per D-24 capability gate) receive the
conservative variant via runtime selection in `runtime/response_shaping.ts`
(plan 04-08).

This test file asserts that the default-export region of outputs.ts contains
NO `format: "<value>"` strings for any of the Zod 4 format extensions:
- date-time
- email
- uri
- uuid
- url

The `richSchemas` named-export region MAY contain those strings (and our
synthetic fixtures intentionally include some of them so we can verify the
strip is real, not an empty-input artifact).

References:
- 04-CONTEXT.md D-26 (Pitfall #33 dual-export)
- 04-RESEARCH.md §"Pattern 6: Zod 4 Conservative-Format Fallback" / Code Example
"""

from __future__ import annotations

from mcpgen_ir.types import FinalTool, Pass1Output

from mcpgen_engine.stages.stage_e.schemas import render_schema_files


def _outputs_ts_content(
    final_tools: list[FinalTool],
    pass_1_output: Pass1Output,
) -> str:
    files = render_schema_files(final_tools, pass_1_output)
    outputs = next(f for f in files if f.relative_path == "src/schemas/outputs.ts")
    return outputs.content


def _default_export_region(content: str) -> str:
    """Return the substring starting at the `export default` line.

    Pitfall #33 mitigation only requires the default-export region to be
    format-free; the rich-schemas region above is allowed to retain formats.
    """
    idx = content.index("export default")
    return content[idx:]


def test_no_format_date_time_in_default_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """`format: "date-time"` is stripped in the default (conservative) export."""
    content = _outputs_ts_content(final_tools_synthetic, pass_1_output_synthetic)
    tail = _default_export_region(content)
    assert (
        '"date-time"' not in tail
    ), f"CONSERVATIVE FALLBACK FAILED — `date-time` leaked into default export:\n{tail}"


def test_no_format_email_in_default_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """`format: "email"` is stripped in the default (conservative) export."""
    content = _outputs_ts_content(final_tools_synthetic, pass_1_output_synthetic)
    tail = _default_export_region(content)
    assert (
        '"email"' not in tail
    ), f"CONSERVATIVE FALLBACK FAILED — `email` leaked into default export:\n{tail}"


def test_no_format_uri_in_default_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """`format: "uri"` is stripped in the default (conservative) export."""
    content = _outputs_ts_content(final_tools_synthetic, pass_1_output_synthetic)
    tail = _default_export_region(content)
    assert (
        '"uri"' not in tail
    ), f"CONSERVATIVE FALLBACK FAILED — `uri` leaked into default export:\n{tail}"


def test_no_format_uuid_in_default_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """`format: "uuid"` is stripped in the default (conservative) export."""
    content = _outputs_ts_content(final_tools_synthetic, pass_1_output_synthetic)
    tail = _default_export_region(content)
    assert (
        '"uuid"' not in tail
    ), f"CONSERVATIVE FALLBACK FAILED — `uuid` leaked into default export:\n{tail}"


def test_no_format_url_in_default_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """`format: "url"` is stripped in the default (conservative) export."""
    content = _outputs_ts_content(final_tools_synthetic, pass_1_output_synthetic)
    tail = _default_export_region(content)
    assert (
        '"url"' not in tail
    ), f"CONSERVATIVE FALLBACK FAILED — `url` leaked into default export:\n{tail}"


def test_rich_schemas_block_exists(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """The named `richSchemas` export block survives in the same file.

    Pitfall #33 dual-export contract: default = conservative AND
    `richSchemas` = Zod-derived (with format strings). Runtime
    `response_shaping.ts` (plan 04-08) selects between them based on
    `clientVersion` per D-24.
    """
    content = _outputs_ts_content(final_tools_synthetic, pass_1_output_synthetic)
    assert "export const richSchemas" in content
    # Sanity: the rich-schemas region — defined here as everything BEFORE
    # `export default` — should retain at least one format string from our
    # synthetic fixtures (we ship date-time / email / uri / uuid / url).
    rich_region = content[: content.index("export default")]
    has_any_format = any(
        marker in rich_region for marker in ['"date-time"', '"email"', '"uri"', '"uuid"', '"url"']
    )
    assert has_any_format, (
        "richSchemas region should retain at least one format string from the "
        "synthetic fixtures; if it doesn't, the strip ran too eagerly:\n"
        f"{rich_region}"
    )
