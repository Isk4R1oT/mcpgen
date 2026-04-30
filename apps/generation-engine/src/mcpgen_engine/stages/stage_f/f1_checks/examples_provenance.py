"""F1 check #8 — examples-provenance hallucination prevention.

Per CONTEXT D-05 step 8 + D-46 (Pitfall #10 mitigation): substring-match every
Pass2Output example against RawIR ``request_body.examples`` and
``responses[*].schema.examples`` (v1 contract per RESEARCH §8.2). Any example not
derivable from the spec -> ``EXAMPLES_HALLUCINATED`` -> retry Pass 2 (CONTEXT D-06).

v1 substring contract is intentionally loose: examples are JSON-canonicalised
(sorted keys, no whitespace) and tested as substrings of the concatenated spec
example corpus. This biases towards false-positives (spec examples that happen to
share a substring); the planner accepts that bias for Phase 5 and tightens to a
structural diff in v1.1 once tool-level examples ship (Pass 2 D-04 currently emits
``examples=null``).

Pass2Output shape variants accepted:

1. Phase 3 actual: ``Pass2Output.descriptions`` is ``Dict[tool_name -> Description]``
   where ``Description`` has no ``examples`` field today (v1.1 surface).
2. Plan-spec: ``pass_2_output["tools"][i]["description"]["examples"]`` (forward-
   compat with v1.1 once Examples ship).

The walker handles both — when no examples are present, the check returns
``passed=True`` (nothing to verify).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# Cap reported offenders so a wide breakage does not flood the F1 report.
_MAX_OFFENDERS_REPORTED: int = 10
# Truncate the offending example string in the report so SSE payloads stay small.
_OFFENDER_PREVIEW_CHARS: int = 200


@dataclass(frozen=True)
class ExamplesProvenanceResult:
    """Outcome of the examples-provenance F1 check."""

    passed: bool
    error: str | None
    offending_examples: list[tuple[str, str]] = field(default_factory=list)


def _canonicalise(value: Any) -> str:
    """JSON-canonicalise a value for substring matching (sorted keys, no whitespace)."""
    if isinstance(value, str):
        return value
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _collect_spec_examples(raw_ir: dict[str, Any]) -> str:
    """Build the concatenated spec-example corpus for substring matching.

    Walks every endpoint's ``request_body.examples`` plus every response schema's
    ``examples`` field. Returns a single newline-joined string; the substring
    test in :func:`check_examples_provenance` runs against this corpus once per
    Pass 2 example (cost is amortised by reuse of the corpus across all tools).
    """
    fragments: list[str] = []
    for endpoint in raw_ir.get("endpoints", []) or []:
        request_body = endpoint.get("request_body") or {}
        for example in request_body.get("examples") or []:
            fragments.append(_canonicalise(example))
        # Responses can be a dict-of-status or list — handle both defensively.
        responses = endpoint.get("responses") or {}
        if isinstance(responses, dict):
            iterator: list[Any] = list(responses.values())
        elif isinstance(responses, list):
            iterator = responses
        else:
            iterator = []
        for resp in iterator:
            if not isinstance(resp, dict):
                continue
            schema = resp.get("schema") or {}
            for example in schema.get("examples") or []:
                fragments.append(_canonicalise(example))
    return "\n".join(fragments)


def _iter_tool_examples(pass_2_output: dict[str, Any]) -> list[tuple[str, Any]]:
    """Yield ``(tool_name, example)`` pairs across both Pass2Output shapes.

    Returns a flat list rather than a generator so the caller can introspect the
    count without re-walking.
    """
    out: list[tuple[str, Any]] = []

    # Shape 1: ``pass_2_output["tools"][i]`` (plan-spec / v1.1 forward-compat).
    for tool in pass_2_output.get("tools", []) or []:
        if not isinstance(tool, dict):
            continue
        name = str(tool.get("name", "<unnamed>"))
        description = tool.get("description") or {}
        examples = description.get("examples") if isinstance(description, dict) else None
        for example in examples or []:
            out.append((name, example))

    # Shape 2: ``pass_2_output["descriptions"][tool_name]`` (Phase 3 actual).
    descriptions = pass_2_output.get("descriptions")
    if isinstance(descriptions, dict):
        for name, description in descriptions.items():
            if not isinstance(description, dict):
                continue
            examples = description.get("examples")
            for example in examples or []:
                out.append((str(name), example))

    return out


def check_examples_provenance(
    *,
    pass_2_output: dict[str, Any],
    raw_ir: dict[str, Any],
) -> ExamplesProvenanceResult:
    """Verify every Pass2 example is a substring of some RawIR spec example."""
    spec_corpus = _collect_spec_examples(raw_ir)
    offenders: list[tuple[str, str]] = []

    for tool_name, example in _iter_tool_examples(pass_2_output):
        canonical = _canonicalise(example)
        if canonical not in spec_corpus:
            offenders.append((tool_name, canonical[:_OFFENDER_PREVIEW_CHARS]))

    if offenders:
        return ExamplesProvenanceResult(
            passed=False,
            error="EXAMPLES_HALLUCINATED",
            offending_examples=offenders[:_MAX_OFFENDERS_REPORTED],
        )
    return ExamplesProvenanceResult(passed=True, error=None, offending_examples=[])
