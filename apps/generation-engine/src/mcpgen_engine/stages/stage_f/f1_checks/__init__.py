"""F1 deterministic check modules.

Each sibling module owns ONE check (CONTEXT D-05). Plan 05-03 ships steps 1-8
(cheap deterministic checks); Plan 05-04 adds steps 9-11 (subprocess: gitleaks,
jsonschema lib, tsc).
"""

from __future__ import annotations
