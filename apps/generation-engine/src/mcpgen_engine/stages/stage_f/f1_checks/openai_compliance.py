"""F1 check #7 — OpenAI Deep Research compliance fixture diff.

Per CONTEXT D-05 step 7 + D-48 (Pitfall #32 mitigation): deep-equal compare the
generated ``search`` and ``fetch`` tool ``inputSchema`` against the canonical
fixtures hand-authored under ``packages/engine-fixtures/_canonical/``
(``search_signature.json`` + ``fetch_signature.json``, Phase 5 Plan 05-02).

Diff semantics (per Phase 5 Plan 05-02 SOURCE.md): per-property ``description``
fields are stripped before compare so spec-derived descriptions on ``query`` /
``id`` are allowed; structural drift (extra params, type changes, removal of
``additionalProperties: false``) is forbidden.

Failure error code maps to a specific upstream pass per CONTEXT D-06:

- ``OPENAI_COMPLIANCE_DRIFT_SEARCH``       -> retry Pass 1 (extra params).
- ``OPENAI_COMPLIANCE_DRIFT_FETCH``        -> retry Pass 1.
- ``OPENAI_COMPLIANCE_DRIFT_PARAM_RENAME`` -> retry Pass 3 (parameter rename).
"""

from __future__ import annotations

import copy
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# The canonical fixtures live under the monorepo's ``packages/engine-fixtures/``
# directory. We resolve the repo root by walking up from this file until we find
# the ``packages/engine-fixtures/_canonical`` marker. This keeps the resolver
# robust against editable installs / different worktree depths and avoids a
# hard-coded ``parent.parent.parent.parent`` chain that breaks under wheel
# installs.
_CANONICAL_DIRNAME: tuple[str, ...] = ("packages", "engine-fixtures", "_canonical")


def _find_canonical_dir() -> Path:
    """Walk up from this file looking for the ``packages/engine-fixtures/_canonical`` dir."""
    here = Path(__file__).resolve()
    for ancestor in (here, *here.parents):
        candidate = ancestor.joinpath(*_CANONICAL_DIRNAME)
        if candidate.is_dir():
            return candidate
    # Last-ditch fallback: cwd walk (covers ``uv run`` invocations from any depth).
    cwd = Path.cwd().resolve()
    for ancestor in (cwd, *cwd.parents):
        candidate = ancestor.joinpath(*_CANONICAL_DIRNAME)
        if candidate.is_dir():
            return candidate
    raise FileNotFoundError(
        f"Canonical fixture directory {'/'.join(_CANONICAL_DIRNAME)} not found "
        f"walking up from {here} or {cwd}. The Phase 5 Plan 05-02 fixtures must "
        f"exist for the F1 openai_compliance check to function."
    )


_CANONICAL_DIR: Path = _find_canonical_dir()


@dataclass(frozen=True)
class OpenAiComplianceResult:
    """Outcome of the OpenAI compliance F1 check."""

    passed: bool
    error: str | None
    diff: str


def _load_canonical(name: str) -> dict[str, Any]:
    """Load a canonical fixture (``search`` or ``fetch``) by tool name."""
    path = _CANONICAL_DIR / f"{name}_signature.json"
    with path.open(encoding="utf-8") as fh:
        loaded = json.load(fh)
    if not isinstance(loaded, dict):
        raise TypeError(f"Canonical fixture {path} is not a JSON object")
    return loaded


def _strip_property_descriptions(schema: dict[str, Any]) -> dict[str, Any]:
    """Return a deep copy of ``schema`` with per-property metadata removed.

    Per Plan 05-02 SOURCE.md diff semantics: structural drift (extra params,
    type changes, removal of ``additionalProperties: false``) is forbidden,
    but per-property *metadata* — descriptions, examples, format hints,
    string-length bounds, default values — is allowed because Pass 3
    enriches every parameter with this content from the spec. Strip the
    metadata fields before deep-equal so the comparison only sees the
    structural shape (type / required / additionalProperties / property
    name set).

    POST-09.1 fix: ``examples`` was missing from the strip list, causing
    Pass 3-enriched ``search.query`` (which carries an `examples: [...]`
    array) to drift against the bare ``{"type": "string"}`` canonical
    fixture and trigger ``OPENAI_COMPLIANCE_DRIFT_SEARCH`` on every clean
    generation.
    """
    cleaned = copy.deepcopy(schema)
    properties = cleaned.get("properties")
    if isinstance(properties, dict):
        for prop in properties.values():
            if not isinstance(prop, dict):
                continue
            for meta_key in (
                "description",
                "examples",
                "example",
                "default",
                "format",
                "pattern",
                "minLength",
                "maxLength",
                "minimum",
                "maximum",
                "title",
            ):
                prop.pop(meta_key, None)
    # Tool-level description is irrelevant to OpenAI compliance — strip it too if
    # ever present at the inputSchema root (the canonical fixture has none).
    cleaned.pop("description", None)
    return cleaned


def _structural_diff(
    canonical: dict[str, Any], actual: dict[str, Any]
) -> tuple[list[str], list[str], list[str]]:
    """Return (missing_props, extra_props, renamed_props) for human-readable diff.

    Renames are detected as the intersection of (extra_props that share a SUFFIX
    with a canonical prop). Heuristic, but adequate for ``id`` -> ``object_id``.
    """
    canonical_props = set(canonical.get("properties", {}).keys())
    actual_props = set(actual.get("properties", {}).keys())
    missing = sorted(canonical_props - actual_props)
    extra = sorted(actual_props - canonical_props)
    renamed: list[str] = []
    for cp in list(missing):
        for ap in list(extra):
            # Either side ends with the other (`id` <-> `object_id`); avoid
            # false-positives on short tokens like ``id`` matching anything.
            if cp == ap:
                continue
            if (cp.endswith(f"_{ap}") or ap.endswith(f"_{cp}")) and len(cp) >= 2 and len(ap) >= 2:
                renamed.append(f"{cp} -> {ap}")
    return missing, extra, renamed


def check_openai_compliance(
    final_tools: list[dict[str, Any]],
) -> OpenAiComplianceResult:
    """Deep-equal compare ``search`` / ``fetch`` against canonical signatures."""
    by_name = {tool.get("name"): tool for tool in final_tools}

    for tool_name, drift_code in (
        ("search", "OPENAI_COMPLIANCE_DRIFT_SEARCH"),
        ("fetch", "OPENAI_COMPLIANCE_DRIFT_FETCH"),
    ):
        if tool_name not in by_name:
            # Action-only API (e.g. Twilio without a search tool). Skip — the plan's
            # behaviour test #4 expects ``passed=True`` in this case.
            continue
        canonical = _load_canonical(tool_name)
        actual_input = by_name[tool_name].get("inputSchema") or {}
        if not isinstance(actual_input, dict):
            return OpenAiComplianceResult(
                passed=False,
                error=drift_code,
                diff=f"{tool_name}: inputSchema is not a JSON object",
            )

        canonical_clean = _strip_property_descriptions(canonical)
        actual_clean = _strip_property_descriptions(actual_input)

        if actual_clean == canonical_clean:
            continue

        missing, extra, renamed = _structural_diff(canonical_clean, actual_clean)
        if renamed:
            return OpenAiComplianceResult(
                passed=False,
                error="OPENAI_COMPLIANCE_DRIFT_PARAM_RENAME",
                diff=f"{tool_name}: parameter rename detected: {renamed}",
            )
        diff_summary = (
            f"{tool_name}: missing={missing}, extra={extra}, "
            f"required_actual={actual_clean.get('required')}, "
            f"required_canonical={canonical_clean.get('required')}, "
            f"additionalProperties_actual={actual_clean.get('additionalProperties')}, "
            f"additionalProperties_canonical={canonical_clean.get('additionalProperties')}"
        )
        return OpenAiComplianceResult(passed=False, error=drift_code, diff=diff_summary)

    return OpenAiComplianceResult(passed=True, error=None, diff="")
