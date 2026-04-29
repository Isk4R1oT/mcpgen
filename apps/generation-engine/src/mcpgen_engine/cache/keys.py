"""Cache key construction (L1 spec-level, L2 pass-level, L3 tool-level).

Every key is a sha256 hex digest over a canonicalised string composed of:

- the namespace prefix (``l1`` / ``l2`` / ``l3``)
- the engine semver from ``pyproject.toml`` (D-40 — bumping the version makes
  prior cache entries unreachable)
- the layer-specific discriminators

Keys are deterministic: identical inputs always produce identical keys, so
``mypy --strict`` clean callers can rely on a key as a function-pure value.

References:
- 02-CONTEXT.md D-37 (3 cache layers) + D-40 (TTL + engine_version invalidation)
- 02-RESEARCH.md §"Pattern 6: Filesystem L1/L2 Cache with Atomic Writes"
- 02-PATTERNS.md `cache/keys.py` row
"""

from __future__ import annotations

import hashlib
import json
from importlib.metadata import version
from typing import Any


def _engine_version() -> str:
    """Read engine semver from installed-package metadata.

    ``pyproject.toml`` ``[project] version = "0.0.0"`` becomes the installed
    package version. Bumping the version invalidates ALL cache layers (D-40)
    by changing every key — old entries become unreachable rather than
    explicitly deleted (filesystem TTL reaps them within 30 days).
    """
    return version("mcpgen-generation-engine")


def _canonical_json_sha256(value: dict[str, Any]) -> str:
    """Deterministic sha256 over a dict, sorted-keys + compact-separators.

    The canonicalisation rule (``sort_keys=True, separators=(",", ":")``) is
    the determinism contract — any change to it would silently invalidate
    every cache entry produced by older code.
    """
    canonical = json.dumps(value, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def l1_key(spec_hash: str) -> str:
    """L1 cache key (D-37): full-pipeline output keyed by spec sha256.

    ``spec_hash`` is produced by ``stages.stage_a.run`` over the canonical
    resolved spec; the same spec text always produces the same hash.
    """
    raw = f"l1:{_engine_version()}:{spec_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def l2_key(
    *,
    pass_name: str,
    pass_version: str,
    pass_input: dict[str, Any],
    sampling_profile_label: str,
    prompt_version: str = "1",
    template_version: str = "1",
) -> str:
    """L2 cache key: per-pass / per-stage output.

    Composition (D-37 + Phase 3 D-35 + Phase 4 D-35):
    - ``pass_name`` — ``"pass_0"`` / ``"pass_1"`` / ``"pass_2"`` / ``"pass_3"`` /
      ``"pass_4"`` / ``"pass_5"`` / ``"stage_e"``.
    - ``pass_version`` — bumped manually when pass logic changes (start ``"1"``).
    - ``pass_input`` — canonical input dict (e.g., serialised RawIR for Pass 0).
    - ``sampling_profile_label`` — ``"PASS_0_SETTINGS"`` / ``"PASS_1_SETTINGS"`` / etc.;
      ANY change to extra_body provider routing pin invalidates entries
      (defense-in-depth against Pitfall #2 quantization drift).
    - ``prompt_version`` (Phase 3 D-35) — bumped manually whenever a prompt
      template in ``passes/<pass>/prompts.py`` changes. Default ``"1"`` keeps
      Pass 0/1 callers (Phase 2) backward-compatible — they don't pass the
      kwarg and continue to produce the same hash. Mitigates Pitfall #7
      (description drift between regenerations sharing the same spec hash).
    - ``template_version`` (Phase 4 D-35) — bumped manually whenever a Jinja2
      template in ``packages/codegen-templates/templates/`` changes. Default
      ``"1"`` keeps Pass 0..4 callers (Phase 2 + 3) backward-compatible — they
      don't pass the kwarg and continue to produce the same hash. Stage E
      callers pass ``STAGE_E_VERSION``; Pass 5 callers pass ``"1"`` (no Jinja2
      templates in Pass 5). Mitigates the Stage-E silent-template-drift case.
    - Model id is hardcoded ``qwen/qwen3-coder`` — single-source-of-truth lock.
    """
    input_hash = _canonical_json_sha256(pass_input)
    raw = (
        f"l2:{_engine_version()}:{pass_name}:{pass_version}:"
        f"qwen/qwen3-coder:{sampling_profile_label}:"
        f"{prompt_version}:{template_version}:{input_hash}"
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def l3_key(
    *,
    tool_name: str,
    tool_subset: dict[str, Any],
    pass_version: str,
) -> str:
    """L3 cache key: per-tool authored output.

    Phase 2 ships infra only; L3 is read/written by Phase 3+ partial
    regeneration. Key format mirrors L1/L2 to keep the sharded path layout
    uniform across layers.
    """
    subset_hash = _canonical_json_sha256(tool_subset)
    raw = f"l3:{_engine_version()}:{tool_name}:{pass_version}:{subset_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
