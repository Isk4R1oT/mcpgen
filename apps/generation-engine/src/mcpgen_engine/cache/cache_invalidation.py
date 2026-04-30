"""Cascade L2 invalidation per CONTEXT D-26.

Strict downstream-only invalidation. Conservative — over-invalidates slightly
rather than under-invalidate and serve stale outputs (D-26 explicit choice).

D-26 invalidation rules
-----------------------

- ``pass_0`` retry  -> Pass 1, Pass 2, Pass 3, Pass 4, Pass 5, Stage E, Stage F1, Stage F2
- ``pass_1`` retry  -> Pass 2, Pass 3, Pass 4, Pass 5, Stage E, Stage F1, Stage F2
- ``pass_2`` retry  -> Pass 3, Pass 4, Pass 5, Stage E, Stage F1, Stage F2
- ``pass_3`` retry  -> Pass 4, Pass 5, Stage E, Stage F1, Stage F2
- ``pass_4`` retry  -> Pass 5, Stage E, Stage F1, Stage F2
- ``pass_5`` retry  -> Stage E, Stage F1, Stage F2
- ``stage_e`` retry -> Stage F1, Stage F2 (Pass outputs unchanged; just re-codegen)

The L1 spec-hash cache is **never** touched — only L2 pass-output entries are
invalidated. F1 has no L2 cache entry (D-32) but the rule still names
``stage_f1`` for symmetry; the prefix simply doesn't match anything.

Engine-version-aware prefix
---------------------------

L2 keys use the prefix ``l2:<engine_version>:<pass_name>:`` before sha256-hashing
(see ``cache/keys.py::l2_key``). We compose the same prefix here using the
installed engine semver so an engine version bump (D-40 invalidation lever)
doesn't accidentally re-invalidate keys for a stale version.
"""

from __future__ import annotations

from typing import Final, Protocol

from mcpgen_engine.cache.keys import _engine_version


class _SupportsInvalidateByPrefix(Protocol):
    """Structural type matching the L2 module API used by the orchestrator.

    A tiny protocol keeps the orchestrator independent of the concrete
    ``cache.l2`` module — tests can pass a mock implementing the same shape.
    """

    async def invalidate_by_prefix(self, prefix: str) -> int: ...


# D-26 verbatim downstream table. Keys missing entries (e.g., ``stage_f1``,
# ``stage_f2``) have no downstream — invalidate_cascade for those is a no-op.
PASS_DOWNSTREAM: Final[dict[str, list[str]]] = {
    "pass_0": [
        "pass_1",
        "pass_2",
        "pass_3",
        "pass_4",
        "pass_5",
        "stage_e",
        "stage_f1",
        "stage_f2",
    ],
    "pass_1": [
        "pass_2",
        "pass_3",
        "pass_4",
        "pass_5",
        "stage_e",
        "stage_f1",
        "stage_f2",
    ],
    "pass_2": [
        "pass_3",
        "pass_4",
        "pass_5",
        "stage_e",
        "stage_f1",
        "stage_f2",
    ],
    "pass_3": [
        "pass_4",
        "pass_5",
        "stage_e",
        "stage_f1",
        "stage_f2",
    ],
    "pass_4": [
        "pass_5",
        "stage_e",
        "stage_f1",
        "stage_f2",
    ],
    "pass_5": [
        "stage_e",
        "stage_f1",
        "stage_f2",
    ],
    "stage_e": [
        "stage_f1",
        "stage_f2",
    ],
}


async def invalidate_cascade(retry_target: str, l2: _SupportsInvalidateByPrefix) -> int:
    """Invalidate every L2 entry downstream of ``retry_target``.

    Args:
        retry_target: pass name to retry (``pass_0`` / ``pass_1`` / ... / ``stage_e``).
        l2: object exposing ``async invalidate_by_prefix(prefix) -> int``
            (the ``cache.l2`` module satisfies this protocol).

    Returns:
        Number of L2 entries removed across all downstream prefixes.
        ``0`` when ``retry_target`` has no downstream entry in the table
        (e.g., stage_f1 / stage_f2 / unknown name).
    """
    if retry_target not in PASS_DOWNSTREAM:
        return 0
    eng = _engine_version()
    total = 0
    for downstream in PASS_DOWNSTREAM[retry_target]:
        prefix = f"l2:{eng}:{downstream}:"
        total += await l2.invalidate_by_prefix(prefix)
    return total
