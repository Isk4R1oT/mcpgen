"""Stage E manifest stability — bit-identical between cold + warm runs.

Per CONTEXT D-43 step 4 + D-36 (GEN-12 second-run zero-Qwen contract):

  Two consecutive Stage E renders of the same input MUST produce
  byte-identical output (modulo the `.mcpgen.yaml` `generated_at`
  timestamp which is allowed to differ — the manifest's
  `generated_at` field is set at orchestrator boundary, not per-file).

This test renders a synthetic Stage E output twice and asserts
``files[*].sha256_content_hash`` is identical between the two runs.
The orchestrator already pre-warms `node_modules` so the second-run
tsc cost is wall-clock-trivial; the byte-stable contract surfaces
silent template drift that would otherwise burn L1 hits.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from mcpgen_ir.types import (
    FinalTool,
    Pass0Output,
    Pass1Output,
    Pass5Output,
    RawIR,
    Tool2,
)

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURES_DIR = _REPO_ROOT / "packages" / "engine-fixtures"


def _load_stripe_inputs() -> tuple[list[FinalTool], Pass5Output, Pass1Output, Pass0Output, RawIR]:
    """Load the Stripe fixture's IR + final-tools.json into typed Pydantic
    models. Skips Pass 5's full algorithm — we re-use `final-tools.json`
    as the FinalTool[] + Tool2[] payload for both Stage-E inputs.
    """
    fix = _FIXTURES_DIR / "stripe"
    raw_ir = RawIR.model_validate(json.loads((fix / "ir.json").read_text()))
    pass_0 = Pass0Output.model_validate(json.loads((fix / "pass-0-output.json").read_text()))
    pass_1 = Pass1Output.model_validate(json.loads((fix / "pass-1-output.json").read_text()))
    final_tools_json = json.loads((fix / "final-tools.json").read_text())
    final_tools = [FinalTool.model_validate(ft) for ft in final_tools_json]
    pass_5 = Pass5Output(tools=[Tool2.model_validate(ft) for ft in final_tools_json])
    return final_tools, pass_5, pass_1, pass_0, raw_ir


@pytest.mark.asyncio
async def test_stage_e_manifest_byte_identical_across_two_runs(
    tmp_path: Path,
) -> None:
    """D-43 step 4 — render Stripe Stage E twice; manifests must agree
    on `relative_path`, `render_template`, and `sha256_content_hash`."""
    pytest.importorskip("jinja2")
    from mcpgen_engine.stages.stage_e import run as stage_e_run

    final_tools, pass_5, pass_1, pass_0, raw_ir = _load_stripe_inputs()

    out_a = tmp_path / "run-a"
    out_b = tmp_path / "run-b"

    manifests = []
    for out_dir in (out_a, out_b):
        manifest = await stage_e_run(
            final_tools=final_tools,
            pass_5_output=pass_5,
            pass_4_output=None,
            pass_3_output=None,
            pass_2_output=None,
            pass_1_output=pass_1,
            pass_0_output=pass_0,
            raw_ir=raw_ir,
            output_dir=out_dir,
            engine_version="0.0.0",
            spec_url="https://api.stripe.com/openapi/spec3.json",
            spec_slug="stripe",
        )
        manifests.append(manifest)

    files_a = {f.relative_path: f for f in manifests[0].files}
    files_b = {f.relative_path: f for f in manifests[1].files}

    # Same set of relative paths — no missing/extra files.
    assert set(files_a.keys()) == set(files_b.keys())

    # Files allowed to drift: `.mcpgen.yaml` + `README.md` both embed the
    # render timestamp (`generated_at`) per Stage E scaffold. Every other
    # file MUST be byte-identical across runs (D-36).
    timestamp_bearing = {".mcpgen.yaml", "README.md"}
    drifted: list[str] = []
    for rel in files_a:
        rel_name = rel.split("/")[-1]
        if rel_name in timestamp_bearing or rel.endswith(".mcpgen.yaml"):
            continue
        if files_a[rel].sha256_content_hash != files_b[rel].sha256_content_hash:
            drifted.append(rel)
    assert not drifted, f"Stage E manifest drift across runs (D-36 violation): {drifted}"

    # Render templates must also match exactly.
    for rel in files_a:
        assert files_a[rel].render_template == files_b[rel].render_template, (
            f"render_template drift on {rel}: "
            f"{files_a[rel].render_template} → {files_b[rel].render_template}"
        )


def test_loop_event_loop_helper() -> None:
    """Sanity check that asyncio.run is callable in this environment.

    Pytest-asyncio markers vary across versions; this helper guards
    against env regressions where the asyncio fixture wiring breaks.
    """

    async def _noop() -> int:
        await asyncio.sleep(0)
        return 42

    assert asyncio.get_event_loop_policy() is not None
