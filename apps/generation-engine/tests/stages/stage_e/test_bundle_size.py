"""Stage E Phase 6 — bundle-size capture + gate tests.

Covers:

- ``capture_bundle_size_kb`` regex parsing on real wrangler stdout
- ``gate_bundle_size`` — < 800 pass / 800-950 warn / > 950 raise
- ``StageEBundleTooLargeError`` subclass shape (size_kb, suggested_splits)
- Bundle-size constants imported from ``packages/contracts/src/launch-criteria.ts``
- ``compute_top_level_path_prefixes`` non-empty when raw_ir has > 30 endpoints
"""

from __future__ import annotations

from pathlib import Path

import pytest
from mcpgen_ir.types import RawIR

from mcpgen_engine.stages.stage_e import StageEError
from mcpgen_engine.stages.stage_e.validate import (
    _BUNDLE_SIZE_RE,
    PASS_KB,
    WARN_KB,
    StageEBundleTooLargeError,
    compute_top_level_path_prefixes,
    gate_bundle_size,
)


def test_bundle_size_constants_match_launch_criteria_ts() -> None:
    """PASS_KB / WARN_KB in validate.py mirror packages/contracts/src/launch-criteria.ts.

    Phase 1 D-13 invariant: launch-criteria.ts is the source of truth; this
    test pins the Python-side mirror to the TS source via grep so a paired
    docs/decisions/ change is needed to bump.
    """
    # Resolve the launch-criteria.ts file from the repo root.
    here = Path(__file__).resolve()
    repo_root = here
    while repo_root != repo_root.parent and not (repo_root / "packages" / "contracts").exists():
        repo_root = repo_root.parent
    target = repo_root / "packages" / "contracts" / "src" / "launch-criteria.ts"
    assert target.exists(), f"launch-criteria.ts not found at {target}"
    text = target.read_text("utf-8")
    # Pinned constant lines (D-13 fixed-string assertion).
    assert "PASS_KB: 800" in text
    assert "WARN_KB: 950" in text
    # Python-side mirror MUST equal the TS values.
    assert PASS_KB == 800
    assert WARN_KB == 950


def test_bundle_size_regex_parses_real_wrangler_output() -> None:
    """`gzip:\\s*([\\d.]+)\\s*KiB` matches verified wrangler 4.85.0 stdout."""
    sample = "Total Upload: 0.17 KiB / gzip: 0.15 KiB"
    m = _BUNDLE_SIZE_RE.search(sample)
    assert m is not None
    assert float(m.group(1)) == pytest.approx(0.15)


def test_bundle_size_regex_parses_larger_value() -> None:
    """Regex handles realistic mid-range gzip sizes."""
    sample = "Total Upload: 1024.50 KiB / gzip: 825.75 KiB"
    m = _BUNDLE_SIZE_RE.search(sample)
    assert m is not None
    assert float(m.group(1)) == pytest.approx(825.75)


@pytest.mark.asyncio
async def test_gate_bundle_size_under_800_returns_no_warnings(
    synthetic_raw_ir_small: RawIR,
) -> None:
    """size < PASS_KB → (size, [])."""
    size, warnings = await gate_bundle_size(450.0, synthetic_raw_ir_small)
    assert size == 450.0
    assert warnings == []


@pytest.mark.asyncio
async def test_gate_bundle_size_in_warn_band_emits_warning(
    synthetic_raw_ir_small: RawIR,
) -> None:
    """PASS_KB <= size <= WARN_KB → returns (size, [warn-line])."""
    size, warnings = await gate_bundle_size(875.0, synthetic_raw_ir_small)
    assert size == 875.0
    assert len(warnings) == 1
    assert "approaches" in warnings[0]
    assert "875" in warnings[0]


@pytest.mark.asyncio
async def test_gate_bundle_size_at_pass_boundary_emits_warning(
    synthetic_raw_ir_small: RawIR,
) -> None:
    """size == PASS_KB (800) → enters warn band."""
    size, warnings = await gate_bundle_size(800.0, synthetic_raw_ir_small)
    assert size == 800.0
    assert len(warnings) == 1


@pytest.mark.asyncio
async def test_gate_bundle_size_at_warn_boundary_emits_warning(
    synthetic_raw_ir_small: RawIR,
) -> None:
    """size == WARN_KB (950) → still in warn band, NOT hard fail."""
    size, warnings = await gate_bundle_size(950.0, synthetic_raw_ir_small)
    assert size == 950.0
    assert len(warnings) == 1


@pytest.mark.asyncio
async def test_gate_bundle_size_over_950_raises_with_suggested_splits(
    synthetic_raw_ir_with_30_plus_endpoints: RawIR,
) -> None:
    """size > WARN_KB → StageEBundleTooLargeError with prefixes."""
    with pytest.raises(StageEBundleTooLargeError) as exc_info:
        await gate_bundle_size(1024.0, synthetic_raw_ir_with_30_plus_endpoints)
    err = exc_info.value
    assert err.size_kb == 1024.0
    # Phase 2 D-18 path-prefix clustering on > 30 endpoints/cluster
    assert err.suggested_splits  # non-empty
    assert any("/v1/charges" in p for p in err.suggested_splits)
    assert any("/v1/customers" in p for p in err.suggested_splits)
    # MULTI_SERVER_SPLIT_REQUIRED in user-facing message
    assert "MULTI_SERVER_SPLIT_REQUIRED" in str(err)


@pytest.mark.asyncio
async def test_gate_bundle_size_over_950_with_small_ir_empty_splits(
    synthetic_raw_ir_small: RawIR,
) -> None:
    """size > WARN_KB on small spec → suggested_splits empty (no clusters)."""
    with pytest.raises(StageEBundleTooLargeError) as exc_info:
        await gate_bundle_size(1024.0, synthetic_raw_ir_small)
    assert exc_info.value.suggested_splits == []


def test_compute_top_level_path_prefixes_non_empty_for_30_plus(
    synthetic_raw_ir_with_30_plus_endpoints: RawIR,
) -> None:
    """compute_top_level_path_prefixes finds clusters >= 30 endpoints."""
    prefixes = compute_top_level_path_prefixes(synthetic_raw_ir_with_30_plus_endpoints)
    assert prefixes  # non-empty
    # Sorted alphabetically per cluster_by_path_prefix contract
    assert prefixes == sorted(prefixes)


def test_compute_top_level_path_prefixes_empty_for_small_ir(
    synthetic_raw_ir_small: RawIR,
) -> None:
    """Small spec → empty prefix list."""
    assert compute_top_level_path_prefixes(synthetic_raw_ir_small) == []


def test_stage_e_bundle_too_large_error_is_stage_e_error_subclass() -> None:
    """StageEBundleTooLargeError extends StageEError."""
    err = StageEBundleTooLargeError(1100.0, ["/v1/foo"])
    assert isinstance(err, StageEError)
    assert err.size_kb == 1100.0
    assert err.suggested_splits == ["/v1/foo"]
    assert "STAGE_E_BUNDLE_TOO_LARGE" in str(err)
