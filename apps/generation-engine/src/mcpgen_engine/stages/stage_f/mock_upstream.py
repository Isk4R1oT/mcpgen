"""Spec-derived mock upstream response synthesizer (CONTEXT D-22, RESEARCH §5.8).

Hand-rolled (~80 LoC) recursive walker over JSON Schema. NO third-party libs
(WireMock / mountebank / hypothesis-jsonschema / polyfactory rejected per
RESEARCH §5.8). Deterministic seed per task ID -> reproducible mock responses
across F3 retries.

Used for non-top-10 APIs that lack a real sandbox per CONTEXT D-22. Limitations
disclaimed in ``QualityReport.warnings`` ("Validated against mocked upstream --
production behavior may vary."). Phase 9 onboards more APIs to real sandbox if
ICP traction warrants.

Threat model T-5-32 (Information Disclosure): values are sandboxed -- no
real PII, no production credentials, no upstream calls. The synthesizer never
echoes input; it walks the schema only.
"""

from __future__ import annotations

import random
from typing import Any


def synthesize(schema: dict[str, Any], seed: int) -> Any:
    """Walk a JSON Schema, return a synthesized example value.

    Args:
        schema: a JSON Schema (Draft 2020-12 subset). ``type`` drives the
            dispatch; ``examples`` short-circuits as preferred output;
            ``enum`` constrains string output; ``format`` triggers the
            three known fixtures (date-time / uri / email).
        seed: deterministic random seed -- same seed -> same output. Per-key
            and per-index sub-seeds are derived via ``hash((seed, k))``
            so nested objects/arrays still vary across keys but stay
            reproducible across runs.

    Returns:
        Any -- the synthesized JSON-serializable value. ``None`` when the
        schema lacks ``type`` or specifies an unhandled type.
    """
    # S311: deterministic test-data synthesis -- not cryptographic.
    rng = random.Random(seed)  # noqa: S311
    examples = schema.get("examples")
    if examples:
        return rng.choice(examples)
    t = schema.get("type")

    if t == "object":
        out: dict[str, Any] = {}
        properties: dict[str, Any] = schema.get("properties") or {}
        for k, v in properties.items():
            key_seed = hash((seed, k)) & 0xFFFFFFFF
            out[k] = synthesize(v, seed=key_seed)
        return out

    if t == "array":
        item_schema: dict[str, Any] = schema.get("items") or {}
        count = rng.randint(1, 5)
        return [synthesize(item_schema, seed=hash((seed, i)) & 0xFFFFFFFF) for i in range(count)]

    if t == "string":
        if "enum" in schema:
            return rng.choice(schema["enum"])
        fmt = schema.get("format")
        if fmt == "date-time":
            return "2026-04-29T12:00:00Z"
        if fmt == "uri":
            return "https://example.com/test"
        if fmt == "email":
            return "test@example.com"
        return f"mock_{rng.randint(0, 99)}"

    if t == "integer":
        lo = int(schema.get("minimum") or 0)
        hi = int(schema.get("maximum") or 1000)
        if lo > hi:
            lo, hi = hi, lo
        return rng.randint(lo, hi)

    if t == "number":
        return round(rng.uniform(0, 1000), 2)

    if t == "boolean":
        return rng.choice([True, False])

    # null / unspecified: return None.
    return None
