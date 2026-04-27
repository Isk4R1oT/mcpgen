"""Smart-ID two-tenant non-overlap tests (Pitfall #1, D-31 / D-56).

VALIDATION rows: T-2-C5 — two synthetic tenants `acme-` + `widgets-` wrapping
the same `stripe-api` spec produce IDs that BOTH match the schema-level
deploy regex but are LITERALLY different.

Implementation hint (per 02-PATTERNS.md "Smart-ID non-overlap test" row):

    1. Construct two synthetic tenant prefixes: `acme-` and `widgets-`.
    2. For each tenant, prepend the prefix to the schema-level smart-id
       format `{spec_slug}:{type}:{collection}:{identifier}`.
    3. Compile a regex that matches IDs from BOTH tenants but is anchored
       per-tenant (so cross-tenant IDs DO NOT match each tenant's regex).
    4. Generate sample IDs per tenant via hand-rolled inputs.
    5. Assert no `acme-` ID matches the `widgets-` regex (and vice-versa).
"""

from __future__ import annotations

import re

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
    """Per-tenant deploy-time regex.

    Tenant prefix is LITERAL; slug + types + collections come from
    build_smart_id_regex (D-56).
    """
    type_alt = "|".join(re.escape(t) for t in types)
    coll_alt = "|".join(re.escape(c) for c in collections)
    pattern = (
        rf"^{re.escape(tenant_short_id)}-{re.escape(spec_slug)}:"
        rf"({type_alt}):({coll_alt}):[A-Za-z0-9_./-]+$"
    )
    return re.compile(pattern)


# ─────────────────────────── T-2-C5 ────────────────────────────────────────


def test_synthetic_two_tenants() -> None:
    """T-2-C5 / D-56 / Pitfall #1.

    Phase 2 emits the schema-level format `{spec_slug}:{type}:{collection}:
    {identifier}`. Phase 6 prepends `{tenant_short_id}-` literal at deploy.
    Two synthetic tenants `acme` and `widgets` wrapping the same `stripe-api`
    spec MUST produce IDs that BOTH match the deploy-time prefixed regex
    but are LITERALLY DIFFERENT.
    """
    spec_slug = "stripe-api"
    types = ["object", "collection"]
    collections = ["Charge", "Customer", "Subscription"]

    # Schema-level format from Phase 2 (no tenant prefix).
    fmt = build_smart_id_format(spec_slug)
    assert fmt == "stripe-api:{type}:{collection}:{identifier}"

    # Deploy-time tenant-prefixed regexes (Phase 6 will compute these).
    acme_regex = _tenant_prefixed_regex("acme", spec_slug, types, collections)
    widgets_regex = _tenant_prefixed_regex("widgets", spec_slug, types, collections)

    # Generate sample IDs per tenant.
    base_ids = [
        fmt.format(type="object", collection="Charge", identifier="ch_3O5jJ2"),
        fmt.format(type="object", collection="Customer", identifier="cus_NeZ"),
        fmt.format(type="object", collection="Subscription", identifier="sub_2"),
        fmt.format(type="collection", collection="Charge", identifier="all"),
    ]
    acme_ids = [f"acme-{base}" for base in base_ids]
    widgets_ids = [f"widgets-{base}" for base in base_ids]

    # Each acme ID matches acme regex; none matches widgets regex.
    for sid in acme_ids:
        assert acme_regex.fullmatch(sid), f"acme regex did not match: {sid}"
        assert not widgets_regex.fullmatch(sid), f"widgets regex matched acme ID: {sid}"

    # Each widgets ID matches widgets regex; none matches acme regex.
    for sid in widgets_ids:
        assert widgets_regex.fullmatch(sid), f"widgets regex did not match: {sid}"
        assert not acme_regex.fullmatch(sid), f"acme regex matched widgets ID: {sid}"

    # IDs are non-equal across tenants for the same spec_slug + type +
    # collection + identifier (proves non-overlap by literal prefix bytes).
    for acme_sid, widgets_sid in zip(acme_ids, widgets_ids, strict=True):
        assert acme_sid != widgets_sid


def test_schema_level_regex_matches_both_tenants() -> None:
    """The schema-level `build_smart_id_regex` (D-56) is the union regex.

    By design it tolerates an arbitrary `[a-z0-9-]+` tenant prefix, so it
    matches BOTH tenants' IDs. The tenant-prefixed regexes (Phase 6) are
    the ones that strictly partition the namespace.
    """
    spec_slug = "stripe-api"
    types = ["object", "collection"]
    collections = ["Charge", "Customer", "Subscription"]
    schema_regex = re.compile(build_smart_id_regex(spec_slug, types, collections))

    fmt = build_smart_id_format(spec_slug)
    base = fmt.format(type="object", collection="Charge", identifier="ch_3O5jJ2")

    assert schema_regex.fullmatch(f"acme-{base}")
    assert schema_regex.fullmatch(f"widgets-{base}")


def test_smart_id_regex_rejects_cross_spec_overlap() -> None:
    """A `stripe-api`-anchored regex must not match a `github-api` ID.

    Sanity check that the spec_slug is enforced inside the regex, not just
    the tenant prefix.
    """
    stripe_regex = re.compile(
        build_smart_id_regex("stripe-api", ["object"], ["Charge"]),
    )
    github_id = "acme-github-api:object:Charge:abc"
    assert stripe_regex.fullmatch(github_id) is None
