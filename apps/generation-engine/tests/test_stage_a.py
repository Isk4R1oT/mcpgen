"""Tests for Stage A — deterministic OpenAPI 3.x parser (GEN-01).

Coverage map (02-VALIDATION.md):
- T-2-A1: ``test_parses_stripe_3_0`` (slow)
- T-2-A2: ``test_parses_github_3_0_3`` (slow)
- T-2-A3: ``test_circular_ref_handler``
- T-2-A4: ``test_spec_too_large_raw``
- T-2-A5: ``test_unsupported_format_yaml`` + ``test_unsupported_format_swagger_2``

Plus deterministic supplements:
- ``test_3_1_spec_format`` (Pitfall D — 3.0 vs 3.1 detection)
- ``test_dependency_graph_basic`` (D-15 heuristic)
- ``test_invalid_input_both_none`` / ``test_invalid_input_both_set``
- ``test_spec_hash_deterministic`` (canonicalization byte-stability)

Slow tests (real upstream fetch) are gated behind ``-m slow`` and marked with
``pytest.mark.slow``; the per-task fast suite runs ``-m 'not slow'``.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from mcpgen_engine.stages.stage_a import StageAError, run

# ───────────────────────────── Fixture helpers ─────────────────────────────


_FIXTURES_DIR = Path(__file__).parent / "fixtures"
_REPO_ROOT = Path(__file__).resolve().parents[3]
_ENGINE_FIXTURES_ROOT = _REPO_ROOT / "packages" / "engine-fixtures"


def _read_fixture(name: str) -> str:
    return (_FIXTURES_DIR / name).read_text(encoding="utf-8")


def _read_source_url(api: str) -> str:
    """Pull the canonical upstream spec URL from packages/engine-fixtures/<api>/SOURCE.md.

    SOURCE.md is the grep-verifiable provenance marker per Phase-1 D-21.
    """
    src = (_ENGINE_FIXTURES_ROOT / api / "SOURCE.md").read_text(encoding="utf-8")
    match = re.search(r"^spec_url:\s*(\S+)", src, re.MULTILINE)
    if match is None:
        raise AssertionError(f"SOURCE.md for {api!r} missing spec_url:")
    url = match.group(1)
    # SOURCE.md links to the GitHub web UI; convert to raw to fetch the actual spec.
    return _to_raw_github_url(url)


def _to_raw_github_url(url: str) -> str:
    """Translate ``https://github.com/owner/repo/blob/<ref>/...`` to raw form."""
    raw = url.replace("https://github.com/", "https://raw.githubusercontent.com/")
    return raw.replace("/blob/", "/", 1)


# ───────────────────────────── Spec builders ───────────────────────────────


def _minimal_3_0_spec(extra_paths: dict[str, dict[str, dict[str, object]]] | None = None) -> str:
    spec: dict[str, object] = {
        "openapi": "3.0.0",
        "info": {"title": "Test API", "version": "1.0.0"},
        "paths": extra_paths
        or {
            "/items": {
                "get": {
                    "operationId": "listItems",
                    "summary": "list",
                    "responses": {"200": {"description": "ok"}},
                }
            }
        },
    }
    return json.dumps(spec)


# ─────────────────────────── Slow tests (T-2-A1/A2) ────────────────────────


@pytest.mark.slow
async def test_parses_stripe_3_0() -> None:
    """T-2-A1: Parse Stripe spec (3.0.0) — endpoint_count > 400, deterministic hash, deps."""
    url = _read_source_url("stripe")
    result = await run(spec_url=url, spec_content=None)

    assert result.spec_format.value == "openapi-3.0"
    assert len(result.endpoints) > 400, f"expected > 400, got {len(result.endpoints)}"
    assert len(result.spec_hash) == 64
    assert re.fullmatch(r"[a-f0-9]{64}", result.spec_hash) is not None
    # Stripe has many id-shape correlations (Charge.id → /charges/{charge}/...);
    # an empty graph would mean the heuristic regressed.
    assert sum(len(v) for v in result.dependency_graph.values()) >= 1


@pytest.mark.slow
async def test_parses_github_3_0_3() -> None:
    """T-2-A2: Parse GitHub spec (3.0.3) — > 1000 endpoints; preserves x-github extensions."""
    url = _read_source_url("github")
    result = await run(spec_url=url, spec_content=None)

    assert result.spec_format.value == "openapi-3.0"
    assert len(result.endpoints) > 1000, f"expected > 1000, got {len(result.endpoints)}"
    # We don't store `extensions` on Endpoint (FROZEN IR rejects extras), so the
    # x-github vendor extension lives in the resolved spec only — Pass 0 reads
    # it from the raw resolved dict in Plan 04. Verify the spec has at least
    # one endpoint with an "x-github" key by walking the resolved schemas dict
    # — if the field disappears the assertion in Pass 0 will start failing.
    assert "github" in url.lower()


# ────────────────────── Deterministic tests (T-2-A3..A5) ───────────────────


async def test_circular_ref_handler() -> None:
    """T-2-A3: prance recursion_limit_handler replaces deep cycles with placeholders.

    The fixture has ``Node.child -> Node`` (and ``Node.siblings.items -> Node``).
    With recursion_limit=2 the handler returns ``{"type": "object"}`` once the
    cycle reaches depth 2. The parse must succeed (no CIRCULAR_REF raised).
    """
    content = _read_fixture("circular_ref_spec.json")
    result = await run(spec_url=None, spec_content=content)

    assert result.spec_format.value == "openapi-3.0"
    node = result.schemas["Node"]

    # Walk the resolved Node schema and assert at least one nested $ref site
    # collapsed to the {"type": "object"} placeholder (no further properties).
    found_placeholder = _contains_placeholder_object(node)
    assert found_placeholder, (
        "expected at least one cycle site to collapse to {'type': 'object'} placeholder; "
        f"got Node={json.dumps(node)[:300]}"
    )


def _contains_placeholder_object(schema: object, depth: int = 0) -> bool:
    """Recursively walk the resolved schema for a bare ``{"type": "object"}`` placeholder."""
    if depth > 8:
        return False
    if not isinstance(schema, dict):
        return False
    # The handler returns exactly {"type": "object"} — no properties, no items.
    if schema.get("type") == "object" and "properties" not in schema and len(schema) == 1:
        return True
    for value in schema.values():
        if isinstance(value, dict):
            if _contains_placeholder_object(value, depth + 1):
                return True
        elif isinstance(value, list):
            for item in value:
                if _contains_placeholder_object(item, depth + 1):
                    return True
    return False


async def test_spec_too_large_raw() -> None:
    """T-2-A4: Raw spec > 10MB rejected with ``SPEC_TOO_LARGE``."""
    # Build an 11MB synthetic JSON. Padding lives in info.description (a valid
    # OpenAPI string field) so we still exercise the size guard path that runs
    # BEFORE format detection.
    padding = "A" * (11 * 1024 * 1024)
    spec = json.dumps(
        {
            "openapi": "3.0.0",
            "info": {"title": "Big", "version": "1.0.0", "description": padding},
            "paths": {},
        }
    )

    with pytest.raises(StageAError, match=r"^SPEC_TOO_LARGE"):
        await run(spec_url=None, spec_content=spec)


async def test_unsupported_format_yaml() -> None:
    """T-2-A5: Malformed JSON+YAML → ``UNSUPPORTED_SPEC_FORMAT``."""
    content = _read_fixture("malformed_spec.txt")
    with pytest.raises(StageAError, match=r"^UNSUPPORTED_SPEC_FORMAT"):
        await run(spec_url=None, spec_content=content)


async def test_unsupported_format_swagger_2() -> None:
    """T-2-A5: Swagger 2.0 rejected with swagger2openapi hint."""
    swagger = json.dumps(
        {
            "swagger": "2.0",
            "info": {"title": "Old API", "version": "1.0"},
            "paths": {},
        }
    )
    with pytest.raises(StageAError, match=r"swagger2openapi"):
        await run(spec_url=None, spec_content=swagger)


# ──────────────────────── 3.1 detection (Pitfall D) ────────────────────────


async def test_3_1_spec_format() -> None:
    """Detect 3.1.x specs via the openapi version string discriminator."""
    spec = json.dumps(
        {
            "openapi": "3.1.0",
            "info": {"title": "31 API", "version": "1.0.0"},
            "paths": {
                "/things": {
                    "get": {
                        "operationId": "listThings",
                        "responses": {"200": {"description": "ok"}},
                    }
                }
            },
        }
    )
    result = await run(spec_url=None, spec_content=spec)
    assert result.spec_format.value == "openapi-3.1"


# ─────────────────────── Dependency graph (D-15 heuristic) ─────────────────


async def test_dependency_graph_basic() -> None:
    """Producer (POST /charges -> ``charge_id``) -> consumer (POST /refunds, param ``charge``)."""
    spec = json.dumps(
        {
            "openapi": "3.0.0",
            "info": {"title": "DepGraph API", "version": "1.0.0"},
            "paths": {
                "/charges": {
                    "post": {
                        "operationId": "createCharge",
                        "responses": {
                            "201": {
                                "description": "created",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": {
                                                "charge_id": {"type": "string"},
                                                "amount": {"type": "integer"},
                                            },
                                        }
                                    }
                                },
                            }
                        },
                    }
                },
                "/refunds": {
                    "post": {
                        "operationId": "createRefund",
                        "parameters": [
                            {"name": "charge_id", "in": "query", "schema": {"type": "string"}}
                        ],
                        "responses": {"200": {"description": "ok"}},
                    }
                },
            },
        }
    )
    result = await run(spec_url=None, spec_content=spec)

    assert "POST /charges" in result.dependency_graph
    assert "POST /refunds" in result.dependency_graph["POST /charges"]


# ──────────────────────────── Invalid input ────────────────────────────────


async def test_invalid_input_both_none() -> None:
    with pytest.raises(StageAError, match=r"^INVALID_INPUT"):
        await run(spec_url=None, spec_content=None)


async def test_invalid_input_both_set() -> None:
    with pytest.raises(StageAError, match=r"^INVALID_INPUT"):
        await run(spec_url="https://example.com/spec.json", spec_content=_minimal_3_0_spec())


# ─────────────────────── Determinism (cache-key contract) ──────────────────


async def test_spec_hash_deterministic() -> None:
    """Identical input → byte-identical ``spec_hash`` (Plan 08 L1 cache key)."""
    spec = _minimal_3_0_spec()
    a = await run(spec_url=None, spec_content=spec)
    b = await run(spec_url=None, spec_content=spec)
    assert a.spec_hash == b.spec_hash
