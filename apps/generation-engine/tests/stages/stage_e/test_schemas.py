"""Stage E Phase 2 — schemas tests.

Covers `render_schema_files` orchestrator + the three Jinja2 templates
(`inputs.ts.j2`, `outputs.ts.j2`, `routing.ts.j2`). Pitfall #33 dual-export
invariants live in `test_zod_conservative.py`; this file covers the structural
contract (file count, paths, deterministic hashes, required Zod modifiers).

References:
- 04-CONTEXT.md D-26 (Zod 4 dual-export per Pitfall #33)
- 04-PATTERNS.md `templates/inputs.ts.j2` / `outputs.ts.j2` / `routing.ts.j2`
- packages/ir/python/types.py (FinalTool, Pass1Output)
"""

from __future__ import annotations

import re

from mcpgen_ir.types import FinalTool, Pass1Output

from mcpgen_engine.stages.stage_e.schemas import render_schema_files


def test_render_schema_files_returns_three(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Phase 2 emits exactly three files: inputs.ts, outputs.ts, routing.ts."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    assert len(files) == 3
    expected_paths = {
        "src/schemas/inputs.ts",
        "src/schemas/outputs.ts",
        "src/schemas/routing.ts",
    }
    actual_paths = {f.relative_path for f in files}
    assert actual_paths == expected_paths


def test_inputs_ts_uses_strict_modifier(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Every per-tool input schema applies Zod `.strict()`.

    `.strict()` corresponds to JSON Schema `additionalProperties: false`
    (Pass 3 contract — every inputSchema has `additionalProperties: false`).
    """
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    inputs = next(f for f in files if f.relative_path == "src/schemas/inputs.ts")
    # One `.strict()` per FinalTool (3 synthetic tools).
    occurrences = inputs.content.count(".strict()")
    assert occurrences == len(final_tools_synthetic), (
        f"expected {len(final_tools_synthetic)} `.strict()` modifiers, "
        f"got {occurrences} in:\n{inputs.content}"
    )


def test_outputs_ts_has_rich_schemas_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """outputs.ts exports the named `richSchemas` block."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    outputs = next(f for f in files if f.relative_path == "src/schemas/outputs.ts")
    assert "export const richSchemas" in outputs.content


def test_outputs_ts_has_default_export(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """outputs.ts emits a `export default` block (the conservative variant)."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    outputs = next(f for f in files if f.relative_path == "src/schemas/outputs.ts")
    assert "export default" in outputs.content


def test_routing_ts_has_one_entry_per_pass_1_rule(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """routing.ts has one routing entry per Pass 1 routing rule."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    routing = next(f for f in files if f.relative_path == "src/schemas/routing.ts")
    rule_count = len(pass_1_output_synthetic.routing.rules)
    # Each rule maps to a JSON-key line `"<universal_tool>:<target_endpoint>": {`
    # in the routing table — count exact matches.
    key_pattern = re.compile(r'"[a-z_]+:[A-Z]+ /[^"]+"\s*:\s*\{', re.MULTILINE)
    matches = key_pattern.findall(routing.content)
    assert len(matches) == rule_count, (
        f"expected {rule_count} routing entries, got {len(matches)} in:\n" f"{routing.content}"
    )


def test_routing_ts_method_path_present(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """routing.ts entries include `method` and `path` (and `params_mapping`)."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    routing = next(f for f in files if f.relative_path == "src/schemas/routing.ts")
    assert "method:" in routing.content
    assert "path:" in routing.content
    # GET method appears at least once for our synthetic GET endpoints.
    assert '"GET"' in routing.content


def test_render_inputs_hash_deterministic(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Two cold renders produce identical render_inputs_hash per file."""
    a = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    b = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    a_map = {f.relative_path: f.render_inputs_hash for f in a}
    b_map = {f.relative_path: f.render_inputs_hash for f in b}
    assert a_map == b_map
    for h in a_map.values():
        assert re.fullmatch(r"[a-f0-9]{64}", h), f"hash shape: {h!r}"


def test_no_jinja2_literals_in_output(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Rendered output never contains `{{` or `{%` (StrictUndefined catches typos)."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    for f in files:
        assert "{{" not in f.content, f"unsubstituted Jinja2 var in {f.relative_path}:\n{f.content}"
        assert (
            "{%" not in f.content
        ), f"unsubstituted Jinja2 block in {f.relative_path}:\n{f.content}"


def test_inputs_zod_object_shape_matches_pass3_input_schema(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Each tool's `query` property name appears in the rendered inputs.ts.

    We don't compile a full JSON-Schema → Zod compiler in Phase 2 (per plan
    behavior); we emit a wrapper-typed `z.object({...}).strict()` containing
    the property names from Pass 3's inputSchema.
    """
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    inputs = next(f for f in files if f.relative_path == "src/schemas/inputs.ts")
    # All synthetic tools have `query` as their input parameter.
    assert "query" in inputs.content


def test_routing_table_covers_all_pass_1_tools(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Every Pass 1 universal_tool name appears at least once in routing.ts."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    routing = next(f for f in files if f.relative_path == "src/schemas/routing.ts")
    for rule in pass_1_output_synthetic.routing.rules:
        # Each rule key is `<universal_tool>:<target_endpoint>` per the
        # routing-key emission convention; verify the universal_tool prefix.
        prefix = rule.universal_tool.value + ":"
        assert (
            prefix in routing.content
        ), f"missing routing entry prefix {prefix!r} in:\n{routing.content}"


def test_render_template_field_set(
    final_tools_synthetic: list[FinalTool],
    pass_1_output_synthetic: Pass1Output,
) -> None:
    """Each GeneratedFile carries the source template name in `render_template`."""
    files = render_schema_files(final_tools_synthetic, pass_1_output_synthetic)
    by_path = {f.relative_path: f for f in files}
    assert by_path["src/schemas/inputs.ts"].render_template == "inputs.ts.j2"
    assert by_path["src/schemas/outputs.ts"].render_template == "outputs.ts.j2"
    assert by_path["src/schemas/routing.ts"].render_template == "routing.ts.j2"
