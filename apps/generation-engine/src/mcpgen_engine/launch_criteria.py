"""Python-side mirror of ``packages/contracts/src/launch-criteria.ts`` (Phase 1 D-13).

Single source of truth for runtime-side launch / publishability gates. The TS file is
the authoritative spec; this module mirrors the values verbatim so Python callers can
import a single dotted name without re-walking the repo on every check.

Three-layer drift defense (T-1-03 / Phase 1 D-13 / Pitfall #29 "AI-fix-by-lowering-
threshold"):

1. Pre-commit hook ``.pre-commit-hooks/launch-criteria-paired-decision.sh`` blocks
   modifications to ``packages/contracts/src/launch-criteria.ts`` without a paired
   ``docs/decisions/<YYYY-MM-DD>-<slug>.md`` entry.
2. CI job ``launch-criteria-assertion`` (``.github/workflows/main-ci.yml``) uses
   ``grep -qF`` (fixed-string) to assert each constant matches the TS source.
3. The unit test ``tests/test_launch_criteria_mirror.py`` (Phase 5 Plan 05-03) pins
   each value here to a substring read from the TS source; bumping one value without
   bumping both raises a hard failure.

Phase 4 ``stages/stage_e/validate.py`` defines its own ``PASS_KB`` / ``WARN_KB``
``Final[int]`` constants for backward compatibility; new Python callers (Phase 5 F1
``f1_checks/bundle_size.py``) import this dict instead. Plan 05-03 + later waves use
the dict-of-dicts shape so the import path matches the TS shape character-for-character
(``LAUNCH_CRITERIA["BUNDLE_SIZE"]["FAIL_KB_EXCLUSIVE"]`` here ==
``LAUNCH_CRITERIA.BUNDLE_SIZE.FAIL_KB_EXCLUSIVE`` in TS).
"""

from __future__ import annotations

from typing import Final

# Mirror of packages/contracts/src/launch-criteria.ts. DO NOT change values without
# the paired-decision dance. The launch-criteria-paired-decision.sh hook + CI gate
# enforce this on the TS side; this module's existence is the Python-side mirror.
LAUNCH_CRITERIA: Final[dict[str, object]] = {
    "F2_SMELL_MIN": 4.0,
    "F3_AGENT_PASS_RATE_MIN": 0.7,
    "BUNDLE_SIZE": {
        "PASS_KB": 800,
        "WARN_KB": 950,
        "FAIL_KB_EXCLUSIVE": 950,
    },
    "COVERAGE_PCT_MIN": 100,
}
