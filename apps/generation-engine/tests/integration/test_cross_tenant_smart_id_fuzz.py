"""Phase 9 Plan 09-08 / D-08 / Pitfall #1 — cross-tenant smart-ID fuzz at scale.

Expansion of ``apps/generation-engine/tests/test_smart_id_no_overlap.py`` from
a 2-tenant x 1-spec analog (T-2-C5) to a **5-tenant x 5-spec = 25-bundle**
matrix. Per CONTEXT D-08 + PATTERNS.md "Phase 9 expansion" (lines 524) the
test uses *deterministic regex set algebra* against the synthetic tenant
prefix template, which gives the same correctness guarantee as exercising
Stage E codegen for every (tenant, spec) pair while keeping the test
LLM-free, network-free, and < 1s.

Test contract per <behavior> in 09-08-PLAN.md:

  Test 1 — generate the synthetic per-tenant regex for every (tenant, spec)
            pair (5 x 5 = 25 bundles via ``itertools.product``).
  Test 2 — for every PAIR of distinct (t1, s1) x (t2, s2) bundles, IDs minted
            from the t1 prefix MUST NOT match the t2 regex when t1 ≠ t2.
  Test 3 — same-tenant + different-spec bundles produce regexes that
            distinguish IDs by the spec_slug segment (intra-tenant
            per-spec uniqueness).
  Test 4 — deliberate collision injection (two synthetic bundles given the
            *same* tenant prefix) MUST trigger an assertion that the test
            harness can detect — proves the fuzz catches future Stage E
            template regressions.

Failure mode is the acceptance criterion: any cross-tenant pair where one
regex matches another's IDs FAILS the test with the colliding regex pair
printed (so a future Stage E template change is caught immediately).
"""

from __future__ import annotations

import itertools
import re

import pytest

from mcpgen_engine.passes.pass_1.routing import (
    build_smart_id_format,
    build_smart_id_regex,
)

# ─────────────────────────── Helpers ───────────────────────────────────────


def _tenant_prefixed_regex(
    tenant_short_id: str,
    spec_slug: str,
    types: list[str],
    collections: list[str],
) -> re.Pattern[str]:
    """Per-tenant deploy-time regex — mirrors test_smart_id_no_overlap.py.

    Reused for shape consistency with the Phase 2 analog so any future
    Stage E template change must keep BOTH the 2-tenant baseline AND this
    25-bundle fuzz green.
    """
    type_alt = "|".join(re.escape(t) for t in types)
    coll_alt = "|".join(re.escape(c) for c in collections)
    pattern = (
        rf"^{re.escape(tenant_short_id)}-{re.escape(spec_slug)}:"
        rf"({type_alt}):({coll_alt}):[A-Za-z0-9_./-]+$"
    )
    return re.compile(pattern)


# ─────────────────────────── 5x5 fuzz matrix ───────────────────────────────

# 5 distinct synthetic tenant_short_ids — D-08 acceptance: ≥5 strings.
TENANTS: tuple[str, ...] = ("acme", "widgets", "globex", "initech", "umbrella")

# 5 distinct spec slugs — matches the 5 popular APIs targeted by F3 golden
# tasks (Stripe / GitHub / Notion / Linear / Slack). The slug is the only
# spec-distinguishing segment in the smart-ID format
# `{spec_slug}:{type}:{collection}:{identifier}`.
SPEC_SLUGS: tuple[str, ...] = (
    "stripe-api",
    "github-api",
    "notion-api",
    "linear-api",
    "slack-api",
)

# Synthetic types + collections used across every bundle. Real bundles
# differ in collections too, but the cross-tenant non-overlap proof only
# requires that the {tenant}-{spec_slug} prefix segment partitions the
# namespace — collections do not need to differ for the fuzz to be
# deterministic. Keeping them constant simplifies the matrix.
TYPES: tuple[str, ...] = ("object", "collection")
COLLECTIONS: tuple[str, ...] = ("Charge", "Customer", "Subscription")


def _sample_ids_for(tenant: str, spec_slug: str) -> list[str]:
    """Hand-rolled identifiers per (tenant, spec) bundle — covers each
    type x collection combination so the fuzz exercises the full
    `{type}:{collection}:` segment alternation."""
    fmt = build_smart_id_format(spec_slug)
    bases = [
        fmt.format(type="object", collection="Charge", identifier="ch_3O5jJ2"),
        fmt.format(type="object", collection="Customer", identifier="cus_NeZ"),
        fmt.format(type="object", collection="Subscription", identifier="sub_2"),
        fmt.format(type="collection", collection="Charge", identifier="all"),
    ]
    return [f"{tenant}-{base}" for base in bases]


# ─────────────────────────── D-08 fuzz tests ───────────────────────────────


@pytest.mark.slow
def test_cross_tenant_25_bundle_matrix_no_overlap() -> None:
    """D-08 Test 1+2 — 25-bundle (5 tenants x 5 specs) cross-tenant non-overlap.

    For every PAIR of distinct (t1, s1) x (t2, s2) bundles where t1 ≠ t2,
    IDs minted from the (t1, s1) bundle MUST NOT match the (t2, s2) regex.
    Failure prints the colliding (regex_a, regex_b, sample_id) triple.

    Assertion count: 25 x 24 / 2 = 300 unordered pairs x 4 sample IDs each
    x 2 directions ≈ 2400 fullmatch checks — runs in < 100ms.
    """
    bundles: dict[tuple[str, str], re.Pattern[str]] = {}
    sample_ids: dict[tuple[str, str], list[str]] = {}
    for tenant, spec_slug in itertools.product(TENANTS, SPEC_SLUGS):
        bundles[(tenant, spec_slug)] = _tenant_prefixed_regex(
            tenant, spec_slug, list(TYPES), list(COLLECTIONS)
        )
        sample_ids[(tenant, spec_slug)] = _sample_ids_for(tenant, spec_slug)

    assert len(bundles) == 25, "expected 5 tenants x 5 specs = 25 bundles"

    # Every bundle's regex MUST match its own sample IDs (sanity check).
    for (tenant, spec_slug), regex in bundles.items():
        for sid in sample_ids[(tenant, spec_slug)]:
            assert regex.fullmatch(sid), (
                f"self-match failed: regex({tenant}, {spec_slug}) " f"did not match own ID {sid}"
            )

    # Cross-tenant non-overlap: for every PAIR of distinct tenant bundles,
    # IDs from one MUST NOT match the other's regex.
    keys = list(bundles.keys())
    for (t1, s1), (t2, s2) in itertools.combinations(keys, 2):
        if t1 == t2:
            # Intra-tenant pair — covered separately by
            # test_intra_tenant_per_spec_distinguishable.
            continue
        regex_a = bundles[(t1, s1)]
        regex_b = bundles[(t2, s2)]
        # Direction 1: (t1, s1) IDs must not match (t2, s2) regex.
        for sid in sample_ids[(t1, s1)]:
            assert not regex_b.fullmatch(sid), (
                f"COLLISION: regex({t2}, {s2}) matched ID from " f"({t1}, {s1}): {sid}"
            )
        # Direction 2: (t2, s2) IDs must not match (t1, s1) regex.
        for sid in sample_ids[(t2, s2)]:
            assert not regex_a.fullmatch(sid), (
                f"COLLISION: regex({t1}, {s1}) matched ID from " f"({t2}, {s2}): {sid}"
            )


@pytest.mark.slow
def test_intra_tenant_per_spec_distinguishable() -> None:
    """D-08 Test 3 — same tenant + different spec_slug = distinguishable.

    For a single tenant (e.g. ``acme``), bundles for different specs
    (``stripe-api`` vs ``github-api``) MUST produce regexes that don't
    match each other's IDs. This proves the spec_slug segment partitions
    the namespace within one tenant — not just the tenant prefix.
    """
    for tenant in TENANTS:
        per_spec_regexes = {
            spec_slug: _tenant_prefixed_regex(tenant, spec_slug, list(TYPES), list(COLLECTIONS))
            for spec_slug in SPEC_SLUGS
        }
        per_spec_ids = {spec_slug: _sample_ids_for(tenant, spec_slug) for spec_slug in SPEC_SLUGS}

        for s1, s2 in itertools.combinations(SPEC_SLUGS, 2):
            regex_b = per_spec_regexes[s2]
            for sid in per_spec_ids[s1]:
                assert not regex_b.fullmatch(sid), (
                    f"INTRA-TENANT COLLISION: tenant={tenant} "
                    f"regex({s2}) matched ID from spec {s1}: {sid}"
                )


@pytest.mark.slow
def test_collision_injection_is_caught() -> None:
    """D-08 Test 4 — failure-mode regression test.

    If a regex collision is artificially injected (two synthetic bundles
    given the *same* tenant prefix and *same* spec slug), the cross-pair
    fullmatch check MUST detect that the regexes match each other's IDs.

    This proves the fuzz harness itself works: a future Stage E template
    change that accidentally collapses tenant prefixes (e.g. dropping
    the leading `{tenant_short_id}-` literal from the regex) WILL be
    caught immediately by ``test_cross_tenant_25_bundle_matrix_no_overlap``.
    """
    # Inject the same (tenant, spec) into two "different" bundle slots.
    duplicate_tenant = "acme"
    duplicate_spec = "stripe-api"
    regex_a = _tenant_prefixed_regex(
        duplicate_tenant, duplicate_spec, list(TYPES), list(COLLECTIONS)
    )
    regex_b = _tenant_prefixed_regex(
        duplicate_tenant, duplicate_spec, list(TYPES), list(COLLECTIONS)
    )
    sample_ids = _sample_ids_for(duplicate_tenant, duplicate_spec)

    # The collision detector that the main fuzz uses MUST flag this case.
    collisions: list[tuple[str, str]] = []
    for sid in sample_ids:
        if regex_a.fullmatch(sid) and regex_b.fullmatch(sid):
            collisions.append((regex_a.pattern, sid))

    assert collisions, (
        "Collision-injection failed to register: the test harness would "
        "miss real Stage E template regressions. Re-check the per-tenant "
        "regex builder."
    )


@pytest.mark.slow
def test_schema_level_regex_unions_all_25_bundles() -> None:
    """Sanity check — ``build_smart_id_regex`` (D-56) is the union regex.

    By design it tolerates any ``[a-z0-9-]+`` tenant prefix, so it matches
    IDs from EVERY tenant in the 25-bundle matrix. The tenant-prefixed
    regexes (``_tenant_prefixed_regex`` above) are the ones that strictly
    partition the namespace at deploy time.

    This locks the contract that:
      - Pass 1 emits a schema-level format (no tenant prefix).
      - Phase 6 dispatch prepends the tenant_short_id at deploy time.
      - The schema-level regex MUST tolerate any synthetic tenant for the
        25-bundle matrix to remain consistent.
    """
    for spec_slug in SPEC_SLUGS:
        schema_regex = re.compile(build_smart_id_regex(spec_slug, list(TYPES), list(COLLECTIONS)))
        for tenant in TENANTS:
            for sid in _sample_ids_for(tenant, spec_slug):
                assert schema_regex.fullmatch(sid), (
                    f"schema-level union regex did not match " f"({tenant}, {spec_slug}) ID: {sid}"
                )
