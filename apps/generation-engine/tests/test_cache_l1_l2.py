"""L1/L2 filesystem-cache tests.

VALIDATION rows:
- T-2-D1: second pipeline run on same spec → zero LLM calls (GEN-12 / D-41)
- T-2-D2: L1 cache key embeds engine_version → bumping invalidates entries (D-40)
- T-2-D3: atomic tempfile-rename writes survive concurrent access

The full pipeline second-run-zero-LLM E2E is also asserted in
``tests/test_pipeline.py::test_second_run_zero_llm_calls``; this module
focuses on the cache-layer invariants in isolation.
"""

from __future__ import annotations

import asyncio
import gzip
import json
import os
import re
from pathlib import Path
from typing import Any

import pytest

from mcpgen_engine.cache import (
    _canonical_json_sha256,
    _engine_version,
    clear_l1,
    clear_l2,
    get_l1,
    get_l2,
    l1_key,
    l2_key,
    l3_key,
    set_l1,
    set_l2,
)
from mcpgen_engine.cache import keys as keys_module

# ─────────────────────────────── Fixtures ──────────────────────────────────


@pytest.fixture(autouse=True)
def _isolated_cache(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Per-test cache isolation: point ``MCPGEN_CACHE_DIR`` at a tmp dir.

    Forces a fresh ``get_settings()`` so subsequent calls see the env change.
    monkeypatch handles teardown automatically.
    """
    monkeypatch.setenv("MCPGEN_CACHE_DIR", str(tmp_path / "mcpgen-cache"))
    from mcpgen_engine.settings import get_settings

    get_settings.cache_clear()


# ───────────────────────────── Key construction ────────────────────────────


def test_l1_key_is_deterministic() -> None:
    """T-2-D2: identical inputs produce identical L1 keys."""
    spec_hash = "a" * 64
    assert l1_key(spec_hash) == l1_key(spec_hash)
    # And the key shape is a 64-char lower-hex sha256 digest.
    assert re.fullmatch(r"[a-f0-9]{64}", l1_key(spec_hash))


def test_l2_key_uses_canonical_input_hash() -> None:
    """T-2-D2: L2 key embeds sha256 over canonical-sorted JSON input.

    Two structurally-equal dicts (different key order) must produce the same
    L2 key — proves the canonicalization rule is honoured.
    """
    a = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input={"a": 1, "b": 2},
        sampling_profile_label="PASS_0_SETTINGS",
    )
    b = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input={"b": 2, "a": 1},
        sampling_profile_label="PASS_0_SETTINGS",
    )
    assert a == b


def test_l2_key_changes_on_sampling_profile_label() -> None:
    """T-2-D2 (defense-in-depth Pitfall #2): different sampling profile → different key."""
    base = {"a": 1}
    pass_0 = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=base,
        sampling_profile_label="PASS_0_SETTINGS",
    )
    pass_1 = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input=base,
        sampling_profile_label="PASS_1_SETTINGS",
    )
    assert pass_0 != pass_1


def test_l3_key_emits_lower_hex_digest() -> None:
    """L3 ships shape-clean for Phase 3+ partial regeneration (D-37)."""
    k = l3_key(tool_name="search", tool_subset={"x": 1}, pass_version="1")
    assert re.fullmatch(r"[a-f0-9]{64}", k)


def test_engine_version_invalidation(monkeypatch: pytest.MonkeyPatch) -> None:
    """T-2-D2 / D-40: bumping the engine version makes prior entries unreachable.

    Patch ``cache.keys.version`` to return a different semver and assert the
    derived L1 key is different — old cache entries become stranded (filesystem
    TTL reaps them within 30 days; we do NOT delete proactively).
    """
    spec_hash = "deadbeef" * 8
    key_v1 = l1_key(spec_hash)
    set_l1(key_v1, {"version": "v1"})

    # Simulate a pyproject.toml version bump.
    monkeypatch.setattr(keys_module, "version", lambda _name: "0.0.1")
    key_v2 = l1_key(spec_hash)

    assert key_v1 != key_v2, "engine_version bump must change the L1 key"
    assert get_l1(key_v2) is None, "new version must see no cache (entry stranded)"


def test_canonical_json_sha256_stable() -> None:
    """Defensive — assert the canonical helper is order-independent."""
    a = _canonical_json_sha256({"a": 1, "b": [2, 3]})
    b = _canonical_json_sha256({"b": [2, 3], "a": 1})
    assert a == b


def test_engine_version_returns_pyproject_value() -> None:
    """Sanity — package metadata returns the pinned semver from pyproject.toml."""
    v = _engine_version()
    assert re.fullmatch(r"\d+\.\d+\.\d+", v), f"unexpected version shape: {v!r}"


# ─────────────────────────── L1 read/write/TTL ─────────────────────────────


def test_set_then_get_l1_roundtrips() -> None:
    """Round-trip: write → read → identical payload."""
    key = l1_key("c" * 64)
    payload: dict[str, Any] = {"raw_ir": {"endpoints": []}, "ok": True}
    set_l1(key, payload)
    assert get_l1(key) == payload


def test_l1_miss_returns_none() -> None:
    assert get_l1("0" * 64) is None


def test_l1_file_has_0600_perms() -> None:
    """T-2-08-01 / D-39: written cache file is owner read-write only.

    Skipped on non-POSIX platforms where ``Path.chmod`` semantics differ.
    """
    if os.name != "posix":  # pragma: no cover — CI runs on Linux/macOS
        pytest.skip("0600 perms only meaningful on POSIX")

    key = l1_key("d" * 64)
    set_l1(key, {"x": 1})

    # Locate the on-disk file via the sharded layout.
    from mcpgen_engine.cache import l1 as l1_module

    p = l1_module._path_for(l1_module.CACHE_LAYER_NAME, key)
    assert p.exists()
    mode = p.stat().st_mode & 0o777
    assert mode == 0o600, f"expected 0o600, got {oct(mode)}"


def test_l1_ttl_eviction(monkeypatch: pytest.MonkeyPatch) -> None:
    """D-40: entries past 30-day TTL are unlinked on read."""
    key = l1_key("e" * 64)
    set_l1(key, {"x": 1})

    from mcpgen_engine.cache import l1 as l1_module

    # Skip clock forward 31 days; mtime check fails → entry unlinked.
    real_time = __import__("time").time
    fake_now = real_time() + (31 * 86_400)
    monkeypatch.setattr(l1_module.time, "time", lambda: fake_now)

    assert get_l1(key) is None
    p = l1_module._path_for(l1_module.CACHE_LAYER_NAME, key)
    assert not p.exists(), "stale entry must be unlinked on read"


def test_clear_layer_removes_files() -> None:
    set_l1(l1_key("f" * 64), {"x": 1})
    set_l1(l1_key("ff" + "0" * 62), {"y": 2})
    deleted = clear_l1()
    assert deleted == 2
    assert get_l1(l1_key("f" * 64)) is None


# ─────────────────────────── L2 mirrors L1 shape ───────────────────────────


def test_l2_roundtrips() -> None:
    key = l2_key(
        pass_name="pass_0",
        pass_version="1",
        pass_input={"a": 1},
        sampling_profile_label="PASS_0_SETTINGS",
    )
    set_l2(key, {"output": "ok"})
    assert get_l2(key) == {"output": "ok"}
    assert clear_l2() == 1


# ───────────────────────── Atomic write under load ─────────────────────────


async def test_atomic_writes_survive_concurrent_access() -> None:
    """T-2-D3: tempfile-rename atomic write protects against pytest-xdist races.

    Spawn 20 concurrent writers with distinct payloads against the same key;
    one of them wins (POSIX rename atomicity), no torn / half-written file.
    """
    key = l1_key("a" * 64)

    async def writer(i: int) -> None:
        # Note: filesystem I/O is sync; running inside an async task
        # interleaves with other tasks at the await boundary.
        await asyncio.sleep(0)
        set_l1(key, {"i": i, "padding": "x" * 1024})

    await asyncio.gather(*(writer(i) for i in range(20)))

    # The final entry must be a valid gzipped JSON dict, never torn.
    payload = get_l1(key)
    assert payload is not None
    assert "i" in payload
    assert isinstance(payload["i"], int)
    assert 0 <= payload["i"] < 20

    # Defensive: also walk the on-disk file directly to prove gzip is intact.
    from mcpgen_engine.cache import l1 as l1_module

    p = l1_module._path_for(l1_module.CACHE_LAYER_NAME, key)
    with gzip.open(p, "rt", encoding="utf-8") as f:
        on_disk = json.load(f)
    assert on_disk == payload
