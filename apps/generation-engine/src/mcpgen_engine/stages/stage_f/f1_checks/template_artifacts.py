"""F1 check #2 — Jinja2 template artifact leak detector.

Per CONTEXT D-05 step 2: walk every ``.ts`` file under the generated directory and
flag any ``{{`` or ``}}`` left over from Stage E template rendering. A leak means
``StrictUndefined`` failed to catch a missing context variable, OR a literal that
LOOKS like a Jinja delimiter slipped through (rare; the writer would still want to
see it).

Failure -> ``STAGE_E_TEMPLATE_LEAKED`` -> retry Stage E (CONTEXT D-06).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

# A single regex catches both opening and closing braces. The check is intentionally
# simple — Stage E's StrictUndefined catches the common case, so this is a defense in
# depth, not a parser.
_TEMPLATE_ARTIFACT_RE = re.compile(r"\{\{|\}\}")

# Cap reported offenders so a wide breakage does not flood the F1 report.
_MAX_OFFENDERS_REPORTED = 10


@dataclass(frozen=True)
class TemplateArtifactResult:
    """Outcome of the template-artifact F1 check."""

    passed: bool
    error: str | None
    offending_files: list[str] = field(default_factory=list)


def check_template_artifacts(generated_dir: Path) -> TemplateArtifactResult:
    """Scan ``generated_dir`` recursively for ``*.ts`` files containing Jinja2 artifacts.

    Returns up to :data:`_MAX_OFFENDERS_REPORTED` relative paths so the F1 outcome
    fits in the SSE payload without truncation.
    """
    offenders: list[str] = []
    for ts_file in sorted(generated_dir.rglob("*.ts")):
        try:
            text = ts_file.read_text(encoding="utf-8")
        except OSError:
            # Unreadable file is itself a Stage E bug; surface as an offender so the
            # retry orchestrator escalates rather than silently passing.
            offenders.append(str(ts_file.relative_to(generated_dir)))
            continue
        if _TEMPLATE_ARTIFACT_RE.search(text):
            offenders.append(str(ts_file.relative_to(generated_dir)))
    if offenders:
        return TemplateArtifactResult(
            passed=False,
            error="STAGE_E_TEMPLATE_LEAKED",
            offending_files=offenders[:_MAX_OFFENDERS_REPORTED],
        )
    return TemplateArtifactResult(passed=True, error=None, offending_files=[])
