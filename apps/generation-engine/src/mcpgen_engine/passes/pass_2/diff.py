"""Pass 2 — description hash + diff helpers (Pitfall #7 mitigation, D-14).

``description_hash(d)`` = sha256 over the rendered markdown (D-14 + research
Open Question #1: user-visible text drift is what Pitfall #7 cares about,
so hash the markdown not the structured JSON).

``diff_summary(old, new)`` returns counts for SSE event emission per D-14;
consumed by Plan 03-12 pipeline orchestrator.

References:
- 03-CONTEXT.md D-14
- 03-RESEARCH.md §"Open Questions" #1
- 03-PATTERNS.md ``passes/pass_2/diff.py`` row
"""

from __future__ import annotations

import hashlib

from mcpgen_ir.types import Description

from mcpgen_engine.passes.pass_2.validation import render_description_markdown


def description_hash(description: Description) -> str:
    """sha256 hex digest over the rendered markdown (D-14).

    Hashing the rendered markdown (rather than the structured Pydantic
    fields) is intentional — it's the user-visible string drift we care
    about for Pitfall #7. Renderer source: ``validation.py``.
    """
    markdown = render_description_markdown(description)
    return hashlib.sha256(markdown.encode("utf-8")).hexdigest()


def diff_summary(old: dict[str, str], new: dict[str, str]) -> dict[str, int]:
    """Compute ``{changed, unchanged, added, removed}`` counts from two
    ``{tool_name: description_hash}`` mappings.

    Used by Plan 03-12 pipeline orchestrator for the D-14 description-diff
    SSE event. Returns counts only — no spec text or hash payload — to
    keep the structured-log surface privacy-safe (CLAUDE.md privacy rule).
    """
    old_names = set(old)
    new_names = set(new)
    added = len(new_names - old_names)
    removed = len(old_names - new_names)
    common = old_names & new_names
    changed = sum(1 for n in common if old[n] != new[n])
    unchanged = len(common) - changed
    return {
        "changed": changed,
        "unchanged": unchanged,
        "added": added,
        "removed": removed,
    }
