"""Pass 3 — standards.py D-21 standard parameter descriptions tests.

Verifies the hardcoded canonical descriptions for every (universal_tool,
param_name) pair in the universal-tool standard signatures from
``extract.py::_UNIVERSAL_MIN_SIG``:

- ``search.query`` and ``fetch.id`` are FROZEN per Pitfall #32 (OpenAI
  Deep Research compliance) — Phase 5 F1 hardcodes the regex check.

- ``list_collections`` (4 params) / ``list_objects`` (8 params) /
  ``upsert`` (4 params) / ``delete`` (5 params) per D-21 + Pass 3
  design Appendix A — limit / offset / cursor / sort_order names
  FROZEN across all servers (Pass 3 design §11.3).

References:
- 03-CONTEXT.md D-21 (standard sets verbatim)
- docs/mcpgen-pass-3-design.md Appendix A
"""

from __future__ import annotations

from mcpgen_engine.passes.pass_3.standards import (
    STANDARD_PARAMETER_DESCRIPTIONS,
    get_standard_description,
)

# ─────────────────────────── search / fetch (Pitfall #32 frozen) ──────────


def test_search_query_description_present() -> None:
    assert get_standard_description("search", "query") is not None


def test_search_query_description_includes_smart_id_format() -> None:
    desc = get_standard_description("search", "query")
    assert desc is not None
    assert "{spec_slug}:{type}:{collection}:{identifier}" in desc


def test_search_query_description_starts_with_search_query_string() -> None:
    desc = get_standard_description("search", "query")
    assert desc is not None
    # Pitfall #32: FROZEN text Phase 5 F1 will check.
    assert desc.startswith("Search query string.")


def test_fetch_id_description_present() -> None:
    assert get_standard_description("fetch", "id") is not None


def test_fetch_id_description_starts_with_smart_identifier() -> None:
    desc = get_standard_description("fetch", "id")
    assert desc is not None
    # Pitfall #32: FROZEN text Phase 5 F1 will check.
    assert desc.startswith("Smart identifier for the object to fetch")


def test_fetch_id_description_includes_smart_id_format() -> None:
    desc = get_standard_description("fetch", "id")
    assert desc is not None
    assert "{spec_slug}:{type}:{collection}:{identifier}" in desc


# ─────────────────────────── list_collections (4 params) ─────────────────


def test_list_collections_all_4_params_present() -> None:
    for param in ("pattern", "include_schema", "limit", "offset"):
        assert get_standard_description("list_collections", param) is not None


def test_list_collections_include_schema_default_false() -> None:
    desc = get_standard_description("list_collections", "include_schema")
    assert desc is not None
    assert "Default false" in desc


# ─────────────────────────── list_objects (8 params) ─────────────────────


def test_list_objects_all_8_params_present() -> None:
    for param in (
        "collection",
        "properties",
        "filter",
        "sort_by",
        "sort_order",
        "limit",
        "offset",
        "cursor",
    ):
        assert get_standard_description("list_objects", param) is not None


def test_list_objects_limit_mentions_default_25() -> None:
    desc = get_standard_description("list_objects", "limit")
    assert desc is not None
    assert "25" in desc


def test_list_objects_sort_order_mentions_desc_default() -> None:
    desc = get_standard_description("list_objects", "sort_order")
    assert desc is not None
    assert "'desc'" in desc


def test_list_objects_cursor_mentions_mutual_exclusion_with_offset() -> None:
    desc = get_standard_description("list_objects", "cursor")
    assert desc is not None
    assert "offset" in desc.lower()


# ─────────────────────────── upsert (4 params) ───────────────────────────


def test_upsert_all_4_params_present() -> None:
    for param in ("collection", "data", "id", "ids"):
        assert get_standard_description("upsert", param) is not None


def test_upsert_data_mentions_create_or_update() -> None:
    desc = get_standard_description("upsert", "data")
    assert desc is not None
    # Smart-routing semantics from Pass 1 design.
    assert "UPDATE" in desc or "update" in desc.lower()


# ─────────────────────────── delete (5 params) ───────────────────────────


def test_delete_all_5_params_present() -> None:
    for param in ("type", "id", "ids", "collection", "confirm"):
        assert get_standard_description("delete", param) is not None


def test_delete_confirm_mentions_default_false_and_safety() -> None:
    desc = get_standard_description("delete", "confirm")
    assert desc is not None
    assert "false" in desc.lower()
    assert "safety" in desc.lower()


def test_delete_type_enum_listed() -> None:
    desc = get_standard_description("delete", "type")
    assert desc is not None
    for value in ("object", "objects", "collection"):
        assert value in desc


# ─────────────────────────── lookup helper edge cases ────────────────────


def test_get_standard_description_unknown_tool_returns_none() -> None:
    assert get_standard_description("nonexistent", "x") is None


def test_get_standard_description_action_tool_returns_none() -> None:
    # Only universal tools have standards.
    assert get_standard_description("charges_capture", "amount") is None


def test_get_standard_description_unknown_param_for_known_tool_returns_none() -> None:
    # search has only "query" — adding extra params would violate Pitfall #32.
    assert get_standard_description("search", "limit") is None
    assert get_standard_description("fetch", "extra") is None


# ─────────────────────────── invariants ──────────────────────────────────


def test_total_standard_pairs_count() -> None:
    # search 1 + fetch 1 + list_collections 4 + list_objects 8 + upsert 4
    # + delete 5 = 23 (D-21 + Pass 3 design Appendix A).
    assert len(STANDARD_PARAMETER_DESCRIPTIONS) == 23


def test_all_standards_are_strings_with_min_length() -> None:
    # Canonical descriptions are substantive — never empty stubs.
    for key, desc in STANDARD_PARAMETER_DESCRIPTIONS.items():
        assert isinstance(desc, str), f"{key} is not a str"
        assert len(desc) > 50, f"{key} description too short ({len(desc)} chars)"


def test_no_action_tools_present() -> None:
    # Pitfall #32 invariant: search.query and fetch.id are the ONLY
    # entries for those two tools — never extended with extra params.
    search_keys = [k for k in STANDARD_PARAMETER_DESCRIPTIONS if k[0] == "search"]
    fetch_keys = [k for k in STANDARD_PARAMETER_DESCRIPTIONS if k[0] == "fetch"]
    assert search_keys == [("search", "query")]
    assert fetch_keys == [("fetch", "id")]


def test_get_standard_description_pure_function() -> None:
    a = get_standard_description("search", "query")
    b = get_standard_description("search", "query")
    assert a == b


def test_no_llm_imports() -> None:
    import importlib

    standards_module = importlib.import_module("mcpgen_engine.passes.pass_3.standards")
    assert "make_agent" not in dir(standards_module)
    assert "Agent" not in dir(standards_module)
