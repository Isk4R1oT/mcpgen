"""CTRL-08 / D-12 — PII deliberate-leak audit (CI security gate).

This module re-exercises the 6 canonical leak vectors against
`mcpgen_engine.observability.redact_before_send` framed as the security
boundary check. The full per-test coverage lives in
`tests/observability/test_sentry_redaction.py`; this module re-runs the
shared fixture so a future `pytest -m security` selector can run only the
security gate without the broader observability suite.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from mcpgen_engine.observability import redact_before_send

_REPO_ROOT = Path(__file__).resolve().parents[4]
_FIXTURE_PATH = _REPO_ROOT / "tests" / "fixtures" / "leak-vectors.json"


def _load_vectors() -> list[dict[str, object]]:
    raw = json.loads(_FIXTURE_PATH.read_text())
    vectors = raw["vectors"]
    assert isinstance(vectors, list)
    return vectors


@pytest.mark.parametrize(
    "vector",
    _load_vectors(),
    ids=lambda v: str(v["name"]) if isinstance(v, dict) else str(v),
)
def test_pii_leak_vector_redacted(vector: dict[str, object]) -> None:
    """For each canonical leak vector, the redactor's serialized output must
    NOT contain any `expected_no_match` string.
    """
    input_event = copy.deepcopy(vector["input_event"])
    assert isinstance(input_event, dict)
    expected_no_match = vector["expected_no_match"]
    assert isinstance(expected_no_match, list)

    out = redact_before_send(input_event, {})
    serialized = json.dumps(out)

    for leak in expected_no_match:
        assert isinstance(leak, str)
        assert leak not in serialized, (
            f"vector {vector['name']!r} — leaked string {leak!r} still present " f"in: {serialized}"
        )
