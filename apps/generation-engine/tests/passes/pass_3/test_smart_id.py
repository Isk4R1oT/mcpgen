"""Pass 3 — smart_id.py D-20 pattern + description tests.

Verifies:

- ``slugify_spec_title(title)`` deterministically derives a 32-char-max
  spec slug from ``RawIR.info.title`` (lowercase + non-alphanum→dash +
  collapse repeats + trim).

- ``build_smart_id_pattern_for_param(smart_id, spec_slug)`` constructs the
  JSON Schema regex ``pattern`` per D-20 + Phase 2 D-31:
  ``^{spec_slug}:({types_alt}):({collections_alt}):[a-zA-Z0-9_-]+$``.
  Tenant prefix ``{tenant_short_id}-`` is NOT included at this layer
  (Phase 6 dispatch worker prepends at deploy time).

- ``build_smart_id_description(smart_id, spec_slug)`` emits the canonical
  D-20 description string (format + types/collections lists + plain-id
  fallback hint).

References:
- 03-CONTEXT.md D-20 (smart-ID pattern verbatim) + Phase 2 D-31 (format invariant)
- docs/mcpgen-pass-3-design.md §12
"""

from __future__ import annotations

import re

from mcpgen_ir.types import SmartId

from mcpgen_engine.passes.pass_3.smart_id import (
    build_smart_id_description,
    build_smart_id_pattern_for_param,
    slugify_spec_title,
)


def _smart_id(types: list[str], collections: list[str]) -> SmartId:
    """Construct a SmartId; ``format`` field is required by IR but unused here."""
    return SmartId(
        format="{spec_slug}:{type}:{collection}:{identifier}",
        types=types,
        collections=collections,
    )


# ─────────────────────────── slugify_spec_title ─────────────────────────────


def test_slugify_simple_title() -> None:
    assert slugify_spec_title("Stripe API") == "stripe-api"


def test_slugify_complex_title() -> None:
    assert slugify_spec_title("GitHub REST API v3") == "github-rest-api-v3"


def test_slugify_special_chars() -> None:
    assert slugify_spec_title("Notion API (Beta)") == "notion-api-beta"


def test_slugify_caps_at_32_chars() -> None:
    out = slugify_spec_title("X" * 100)
    assert len(out) <= 32
    assert out == "x" * 32


def test_slugify_empty_returns_spec() -> None:
    assert slugify_spec_title("") == "spec"


def test_slugify_only_special_returns_spec() -> None:
    assert slugify_spec_title("!!!") == "spec"


def test_slugify_collapses_consecutive_dashes() -> None:
    assert slugify_spec_title("a---b") == "a-b"


def test_slugify_strips_leading_trailing_dashes() -> None:
    assert slugify_spec_title("  Notion-API!  ") == "notion-api"


def test_slugify_pure_function() -> None:
    a = slugify_spec_title("Stripe API")
    b = slugify_spec_title("Stripe API")
    assert a == b


# ─────────────────────────── build_smart_id_pattern_for_param ──────────────


def test_build_smart_id_pattern_simple() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe-api")
    expected = rf"^{re.escape('stripe-api')}:(object):(Charge):[a-zA-Z0-9_-]+$"
    assert pattern == expected


def test_build_smart_id_pattern_multiple_types() -> None:
    smart_id = _smart_id(types=["object", "subscription"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    assert "(object|subscription)" in pattern


def test_build_smart_id_pattern_multiple_collections() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge", "Customer"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    assert "(Charge|Customer)" in pattern


def test_build_smart_id_pattern_escapes_special_chars_in_collection() -> None:
    smart_id = _smart_id(types=["object"], collections=["My-Collection"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    # re.escape on "My-Collection" produces "My\\-Collection" in the pattern.
    assert re.escape("My-Collection") in pattern


def test_build_smart_id_pattern_compiles_as_regex() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe-api")
    # Must compile without raising.
    re.compile(pattern)


def test_build_smart_id_pattern_matches_canonical_smart_id() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    assert re.match(pattern, "stripe:object:Charge:ch_test_123") is not None


def test_build_smart_id_pattern_rejects_wrong_spec_slug() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    assert re.match(pattern, "github:object:Charge:ch_test") is None


def test_build_smart_id_pattern_rejects_wrong_type() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    assert re.match(pattern, "stripe:subscription:Charge:ch_x") is None


def test_build_smart_id_pattern_rejects_empty_identifier() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    assert re.match(pattern, "stripe:object:Charge:") is None


def test_build_smart_id_pattern_no_tenant_prefix() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    pattern = build_smart_id_pattern_for_param(smart_id, "stripe")
    # D-20: tenant prefix is Phase 6's responsibility, NOT in this pattern.
    assert "tenant_short_id" not in pattern
    assert "tenant" not in pattern
    # Pattern starts at the spec_slug (no leading [a-z0-9-]+- prefix).
    assert pattern.startswith("^stripe:") or pattern.startswith(r"^stripe:")


def test_build_smart_id_pattern_no_llm_imports() -> None:
    # Sanity: importing this module did not pull in LLM agent code.
    import importlib

    smart_id_module = importlib.import_module("mcpgen_engine.passes.pass_3.smart_id")
    assert "make_agent" not in dir(smart_id_module)
    assert "Agent" not in dir(smart_id_module)


# ─────────────────────────── build_smart_id_description ────────────────────


def test_build_smart_id_description_includes_format_string() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    desc = build_smart_id_description(smart_id, "stripe-api")
    assert "stripe-api:{type}:{collection}:{identifier}" in desc


def test_build_smart_id_description_includes_types_list() -> None:
    smart_id = _smart_id(types=["object", "subscription"], collections=["Charge"])
    desc = build_smart_id_description(smart_id, "stripe-api")
    assert "object, subscription" in desc


def test_build_smart_id_description_includes_collections_list() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge", "Customer"])
    desc = build_smart_id_description(smart_id, "stripe-api")
    assert "Charge, Customer" in desc


def test_build_smart_id_description_includes_fallback_hint() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    desc = build_smart_id_description(smart_id, "stripe-api")
    # D-20 verbatim fallback hint.
    assert "If you only have a bare upstream ID" in desc


def test_build_smart_id_description_handles_empty_types() -> None:
    smart_id = _smart_id(types=[], collections=["Charge"])
    desc = build_smart_id_description(smart_id, "stripe-api")
    assert "any" in desc.lower()


def test_build_smart_id_description_pure_function() -> None:
    smart_id = _smart_id(types=["object"], collections=["Charge"])
    a = build_smart_id_description(smart_id, "stripe")
    b = build_smart_id_description(smart_id, "stripe")
    assert a == b
