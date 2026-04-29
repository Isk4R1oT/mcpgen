"""Stage E test fixtures (synthetic minimal IR + render contexts)."""

from __future__ import annotations

import textwrap
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from mcpgen_ir.types import FinalTool, Pass0Output, Pass1Output, Pass5Output, RawIR


def _synth_pass_0() -> Pass0Output:
    """Minimal Pass0Output with one tool plan + Bearer auth requirement."""
    return Pass0Output.model_validate(
        {
            "tool_plans": [
                {
                    "name": "search",
                    "category": "search",
                    "source_endpoints": ["GET /v1/charges"],
                    "rationale": "Universal search across charges.",
                }
            ],
            "dropped_endpoints": [],
            "composite_candidates": [],
            "auth_requirements": {
                "GET /v1/charges": [
                    {
                        "scheme": "http_bearer",
                        "recommended_mode": "passthrough",
                        "notes": None,
                    }
                ]
            },
            "target_complexity": "standard",
            "prompt_injection_warnings": [],
        }
    )


def _synth_pass_1() -> Pass1Output:
    """Minimal Pass1Output: one universal `search` tool."""
    return Pass1Output.model_validate(
        {
            "tools": [
                {
                    "name": "search",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges"],
                }
            ],
            "routing": {
                "smart_id": {
                    "format": "{server}:{type}:{collection}:{identifier}",
                    "types": ["object"],
                    "collections": ["Charge"],
                },
                "rules": [
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/charges",
                        "params_mapping": {"query": "query"},
                    }
                ],
            },
            "workflows": [],
            "coverage_pct": 100.0,
            "coverage_proof": [
                {
                    "endpoint_id": "GET /v1/charges",
                    "mapped_to_universal_tool": "search",
                    "sample_invocation": {
                        "url": "https://api.stripe.com/v1/charges",
                        "method": "GET",
                        "params": {},
                    },
                }
            ],
        }
    )


def _synth_raw_ir() -> RawIR:
    """Minimal RawIR — one GET endpoint, sha256-shaped spec_hash."""
    return RawIR.model_validate(
        {
            "spec_format": "openapi-3.0",
            "spec_hash": "a" * 64,
            "endpoints": [
                {
                    "method": "GET",
                    "path": "/v1/charges",
                    "operation_id": "ListCharges",
                    "summary": "List charges",
                    "description": None,
                    "parameters": [],
                    "request_body": None,
                    "responses": {"200": {"description": "OK"}},
                    "tags": [],
                    "deprecated": False,
                }
            ],
            "schemas": {},
            "security_schemes": {},
            "dependency_graph": {},
        }
    )


def _pipeline_versions() -> dict[str, str]:
    """All seven required pipeline-version keys (CONTEXT D-29)."""
    return {
        "pass_0": "1",
        "pass_1": "1",
        "pass_2": "1",
        "pass_3": "1",
        "pass_4": "1",
        "pass_5": "1",
        "stage_e": "1",
    }


@pytest.fixture
def synthetic_render_context_stripe() -> dict[str, Any]:
    """Render kwargs for `render_scaffold_files` — Stripe-flavoured."""
    return {
        "spec_slug": "stripe",
        "auth_mode": "passthrough",
        "pass_0_output": _synth_pass_0(),
        "pass_1_output": _synth_pass_1(),
        "raw_ir": _synth_raw_ir(),
        "pipeline_versions": _pipeline_versions(),
        "engine_version": "0.1.0",
        "spec_url": "https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json",
        "spec_hash": "a" * 64,
        "generated_at": "2026-04-28T19:30:00Z",
        "upstream_base_url": "https://api.stripe.com",
        "tool_count": 1,
    }


@pytest.fixture
def synthetic_render_context_oauth() -> dict[str, Any]:
    """Render kwargs for `render_scaffold_files` — OAuth flow auth_mode."""
    return {
        "spec_slug": "github",
        "auth_mode": "oauth",
        "pass_0_output": _synth_pass_0(),
        "pass_1_output": _synth_pass_1(),
        "raw_ir": _synth_raw_ir(),
        "pipeline_versions": _pipeline_versions(),
        "engine_version": "0.1.0",
        "spec_url": "https://raw.githubusercontent.com/github/openapi.json",
        "spec_hash": "b" * 64,
        "generated_at": "2026-04-28T19:31:00Z",
        "upstream_base_url": "https://api.github.com",
        "tool_count": 1,
    }


@pytest.fixture
def temp_output_dir(tmp_path: Path) -> Path:
    """Per-test output dir for `write_files_atomically`."""
    out = tmp_path / "stage-e-out"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _final_tool_dict(
    name: str,
    output_schema: dict[str, Any],
    source_endpoints: list[str],
) -> dict[str, Any]:
    """Build a synthetic FinalTool payload with stable description/inputSchema.

    Used by Stage E Phase 2 schemas tests; only `name`, `outputSchema`, and
    `source_endpoints` vary across test inputs — every other field is fixed to
    a known-valid shape so the tests stay focused on the schemas/ output.
    """
    return {
        "name": name,
        "type": "universal",
        "description": {
            "purpose": "Synthetic tool used for Stage E Phase 2 schemas tests only.",
            "when_to_use": ["When you are testing Stage E schemas/ rendering."],
            "limitations": ["Synthetic; never used at runtime."],
            "parameter_overview": (
                "Single `query` string parameter — the synthetic-tool fixture "
                "exercises only the schemas pipeline, not real upstream calls."
            ),
        },
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Synthetic input parameter.",
                },
            },
            "required": ["query"],
            "additionalProperties": False,
        },
        "outputSchema": output_schema,
        "annotations": {
            "readOnlyHint": True,
            "destructiveHint": False,
            "idempotentHint": True,
            "openWorldHint": True,
        },
        "response_config": {
            "pagination": None,
            "field_filtering": None,
            "truncation": {
                "threshold_tokens": 10000,
                "guidance_template": "Synthetic guidance template.",
            },
            "has_response_format_param": False,
        },
        "source_endpoints": source_endpoints,
    }


@pytest.fixture
def final_tools_synthetic() -> list[FinalTool]:
    """Three FinalTools exercising Pitfall #33-relevant output-schema shapes.

    - Tool 1 (`fetch_with_datetime`): output schema with `format: "date-time"`
      and `format: "uri"` — exercises the conservative-format strip.
    - Tool 2 (`search_with_email`): output schema with `format: "email"` and
      `format: "uuid"` — exercises additional Zod 4 format strings.
    - Tool 3 (`list_collections`): output schema with NO `format` strings —
      conservative variant should be byte-identical to the rich variant for
      this tool.
    """
    payloads = [
        _final_tool_dict(
            name="fetch_with_datetime",
            output_schema={
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "created_at": {"type": "string", "format": "date-time"},
                    "homepage_url": {"type": "string", "format": "uri"},
                    "amount_cents": {"type": "integer"},
                },
                "required": ["id", "created_at"],
            },
            source_endpoints=["GET /v1/charges/{id}"],
        ),
        _final_tool_dict(
            name="search_with_email",
            output_schema={
                "type": "object",
                "properties": {
                    "results": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "tenant_id": {
                                    "type": "string",
                                    "format": "uuid",
                                },
                                "contact_email": {
                                    "type": "string",
                                    "format": "email",
                                },
                                "callback_url": {
                                    "type": "string",
                                    "format": "url",
                                },
                            },
                        },
                    },
                },
                "required": ["results"],
            },
            source_endpoints=["GET /v1/customers"],
        ),
        _final_tool_dict(
            name="list_collections",
            output_schema={
                "type": "object",
                "properties": {
                    "collections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "count_estimate": {"type": "integer"},
                            },
                        },
                    },
                },
                "required": ["collections"],
            },
            source_endpoints=["GET /v1/customers", "GET /v1/charges"],
        ),
    ]
    return [FinalTool.model_validate(p) for p in payloads]


@pytest.fixture
def pass_1_output_synthetic() -> Pass1Output:
    """Pass1Output covering the three synthetic FinalTools' source endpoints.

    Provides routing.rules entries so `routing.ts.j2` can emit one routing
    table entry per (tool, source endpoint) pair.
    """
    return Pass1Output.model_validate(
        {
            "tools": [
                {
                    "name": "fetch_with_datetime",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges/{id}"],
                },
                {
                    "name": "search_with_email",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/customers"],
                },
                {
                    "name": "list_collections",
                    "type": "universal",
                    "source_endpoints": [
                        "GET /v1/customers",
                        "GET /v1/charges",
                    ],
                },
            ],
            "routing": {
                "smart_id": {
                    "format": "stripe:{type}:{collection}:{identifier}",
                    "types": ["object", "collection"],
                    "collections": ["Charge", "Customer"],
                },
                "rules": [
                    {
                        "universal_tool": "fetch",
                        "target_endpoint": "GET /v1/charges/{id}",
                        "params_mapping": {"id": "id"},
                    },
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/customers",
                        "params_mapping": {"query": "query"},
                    },
                    {
                        "universal_tool": "list_collections",
                        "target_endpoint": "GET /v1/customers",
                        "params_mapping": {},
                    },
                    {
                        "universal_tool": "list_collections",
                        "target_endpoint": "GET /v1/charges",
                        "params_mapping": {},
                    },
                ],
            },
            "workflows": [],
            "coverage_pct": 100.0,
            "coverage_proof": [
                {
                    "endpoint_id": "GET /v1/charges/{id}",
                    "mapped_to_universal_tool": "fetch",
                    "sample_invocation": {
                        "url": "https://api.stripe.com/v1/charges/ch_test",
                        "method": "GET",
                        "params": {},
                    },
                },
            ],
        }
    )


def _synth_pass_5() -> Pass5Output:
    """Minimal Pass5Output — no tools, flags carry pagination strategy.

    Plan 04-08 runtime.py only reads ``pass_5_output.flags`` —
    `Pass5Output.tools` is unused for runtime/ rendering. The 5 mechanisms
    the runtime helpers implement (pagination, truncation, field filtering,
    capability gate, error templates) are universal across servers; per-tool
    customisation lands at Plan 04-10 (tool handlers).
    """
    return Pass5Output.model_validate(
        {
            "tools": [],
            "flags": {"server_pagination_strategy": "cursor"},
        }
    )


@pytest.fixture
def synthetic_pass_5_output() -> Pass5Output:
    """Real Pass5Output with `flags.server_pagination_strategy = "cursor"`."""
    return _synth_pass_5()


@pytest.fixture
def pass_0_with_auth_headers() -> SimpleNamespace:
    """Duck-typed Pass0-like object with spec-declared auth headers.

    Plan 04-08 ``_extract_spec_auth_headers`` reads ``pass_0_output
    .auth_requirements.values()`` then iterates each ``AuthRequirement``,
    pulling ``header_name`` via ``getattr(req, "header_name", None)``.

    The current ``packages/ir/python/types.py`` ``AuthRequirement1`` model
    is ``extra="forbid"`` and does NOT carry ``header_name`` — the field is
    a forward-looking IR extension (Phase 7+ when securitySchemes wiring
    surfaces the actual header names). So tests pass a duck-typed
    ``SimpleNamespace`` to exercise the extraction logic.

    Two endpoints, three custom headers (one duplicated lowercased),
    so the dedup + sort guarantees in ``_extract_spec_auth_headers`` are
    covered.
    """
    return SimpleNamespace(
        auth_requirements={
            "GET /v1/charges": [
                SimpleNamespace(
                    scheme="apiKey",
                    recommended_mode="passthrough",
                    notes=None,
                    header_name="X-API-Key",
                ),
            ],
            "POST /v1/charges": [
                SimpleNamespace(
                    scheme="apiKey",
                    recommended_mode="passthrough",
                    notes=None,
                    header_name="X-Stripe-Account",
                ),
                SimpleNamespace(
                    scheme="apiKey",
                    recommended_mode="passthrough",
                    notes=None,
                    header_name="x-api-key",  # dedup target — same as "X-API-Key" lowercased
                ),
            ],
        },
    )


@pytest.fixture
def pass_0_no_auth_headers() -> Pass0Output:
    """Real Pass0Output (no header_name field per current IR shape).

    ``_extract_spec_auth_headers`` returns ``[]`` for this fixture — the
    runtime helper still emits the hardcoded REDACT_HEADERS triple
    (authorization / x-upstream-auth / cookie / set-cookie).
    """
    return _synth_pass_0()


# ─────── Plan 04-10 — per-tool-type FinalTool fixtures ───────
#
# These fixtures cover all 9 tool-type / universal-tool combinations dispatched
# by ``stages/stage_e/tools.py::_TEMPLATE_BY_TOOL_TYPE``. Each fixture is a
# standalone, valid ``FinalTool`` so the orchestrator can render every
# template against a known-good payload.


def _make_handler_final_tool(
    name: str,
    tool_type: str,
    source_endpoints: list[str],
    annotations: dict[str, Any],
) -> dict[str, Any]:
    """Build a synthetic FinalTool payload for handler-template rendering.

    All required fields filled with stable, schema-valid values; only
    ``name`` / ``type`` / ``source_endpoints`` / ``annotations`` vary.
    """
    return {
        "name": name,
        "type": tool_type,
        "description": {
            "purpose": (
                f"Synthetic {name} tool used for Stage E Phase 5 handler "
                "template tests; never executed at runtime."
            ),
            "when_to_use": [f"When the test suite renders the {name} handler."],
            "limitations": ["Synthetic; never used at runtime."],
            "parameter_overview": (
                f"Synthetic parameter overview for the {name} handler test "
                "fixture — not consumed by upstream API calls."
            ),
        },
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Synthetic input."},
            },
            "required": ["query"],
            "additionalProperties": False,
        },
        "outputSchema": {
            "type": "object",
            "properties": {"id": {"type": "string"}},
            "required": ["id"],
        },
        "annotations": annotations,
        "response_config": {
            "pagination": None,
            "field_filtering": None,
            "truncation": {
                "threshold_tokens": 10000,
                "guidance_template": "Synthetic guidance.",
            },
            "has_response_format_param": False,
        },
        "source_endpoints": source_endpoints,
    }


_READ_ANNOTATIONS: dict[str, Any] = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": True,
}
_WRITE_ANNOTATIONS: dict[str, Any] = {
    "readOnlyHint": False,
    "destructiveHint": False,
    "idempotentHint": False,
    "openWorldHint": True,
}
_DELETE_ANNOTATIONS: dict[str, Any] = {
    "readOnlyHint": False,
    "destructiveHint": True,
    "idempotentHint": True,
    "openWorldHint": True,
}


@pytest.fixture
def final_tool_search() -> FinalTool:
    """Universal `search` tool (no pagination hints per Pitfall #5)."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="search",
            tool_type="universal",
            source_endpoints=["GET /v1/charges"],
            annotations=_READ_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_fetch() -> FinalTool:
    """Universal `fetch` tool — uses parseSmartId + routing-table lookup."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="fetch",
            tool_type="universal",
            source_endpoints=["GET /v1/charges/{id}"],
            annotations=_READ_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_list_collections() -> FinalTool:
    """Universal `list_collections` tool."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="list_collections",
            tool_type="universal",
            source_endpoints=["GET /v1/customers", "GET /v1/charges"],
            annotations=_READ_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_list_objects() -> FinalTool:
    """Universal `list_objects` tool — pagination hints ALLOWED here."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="list_objects",
            tool_type="universal",
            source_endpoints=["GET /v1/customers"],
            annotations=_READ_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_upsert() -> FinalTool:
    """Universal `upsert` tool — smart routing single vs batch."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="upsert",
            tool_type="universal",
            source_endpoints=["POST /v1/customers"],
            annotations=_WRITE_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_delete() -> FinalTool:
    """Universal `delete` tool — REQUIRES `confirm: true`."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="delete",
            tool_type="universal",
            source_endpoints=["DELETE /v1/customers/{id}"],
            annotations=_DELETE_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_action() -> FinalTool:
    """Action tool — per-tool instantiation."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="charges_capture",
            tool_type="action",
            source_endpoints=["POST /v1/charges/{id}/capture"],
            annotations=_WRITE_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_workflow() -> FinalTool:
    """Workflow tool — sequential step execution + conservative aggregation."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="schedule_event",
            tool_type="workflow",
            source_endpoints=[
                "GET /v1/calendar/availability",
                "POST /v1/calendar/events",
            ],
            annotations=_WRITE_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tool_specialized() -> FinalTool:
    """Specialized tool — minimal scaffold."""
    return FinalTool.model_validate(
        _make_handler_final_tool(
            name="audit_log_query",
            tool_type="specialized",
            source_endpoints=["GET /v1/audit_logs"],
            annotations=_READ_ANNOTATIONS,
        )
    )


@pytest.fixture
def final_tools_all_types(
    final_tool_search: FinalTool,
    final_tool_fetch: FinalTool,
    final_tool_list_collections: FinalTool,
    final_tool_list_objects: FinalTool,
    final_tool_upsert: FinalTool,
    final_tool_delete: FinalTool,
    final_tool_action: FinalTool,
    final_tool_workflow: FinalTool,
    final_tool_specialized: FinalTool,
) -> list[FinalTool]:
    """All 9 tool-type / universal-tool combinations in dispatch-table order."""
    return [
        final_tool_search,
        final_tool_fetch,
        final_tool_list_collections,
        final_tool_list_objects,
        final_tool_upsert,
        final_tool_delete,
        final_tool_action,
        final_tool_workflow,
        final_tool_specialized,
    ]


@pytest.fixture
def pass_1_output_handlers() -> Pass1Output:
    """Pass1Output covering every per-tool-type handler test fixture.

    Routing rules cover all source endpoints used by the handler fixtures so
    `tools.py` orchestrator can resolve routing-table lookups consistently
    in tests that hash the render context.
    """
    return Pass1Output.model_validate(
        {
            "tools": [
                {"name": "search", "type": "universal", "source_endpoints": ["GET /v1/charges"]},
                {
                    "name": "fetch",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges/{id}"],
                },
                {
                    "name": "list_collections",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/customers", "GET /v1/charges"],
                },
                {
                    "name": "list_objects",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/customers"],
                },
                {"name": "upsert", "type": "universal", "source_endpoints": ["POST /v1/customers"]},
                {
                    "name": "delete",
                    "type": "universal",
                    "source_endpoints": ["DELETE /v1/customers/{id}"],
                },
                {
                    "name": "charges_capture",
                    "type": "action",
                    "source_endpoints": ["POST /v1/charges/{id}/capture"],
                },
                {
                    "name": "schedule_event",
                    "type": "workflow",
                    "source_endpoints": [
                        "GET /v1/calendar/availability",
                        "POST /v1/calendar/events",
                    ],
                },
                {
                    "name": "audit_log_query",
                    "type": "specialized",
                    "source_endpoints": ["GET /v1/audit_logs"],
                },
            ],
            "routing": {
                "smart_id": {
                    "format": "stripe:{type}:{collection}:{identifier}",
                    "types": ["object", "collection"],
                    "collections": ["Charge", "Customer"],
                },
                "rules": [
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/charges",
                        "params_mapping": {"query": "query"},
                    },
                    {
                        "universal_tool": "fetch",
                        "target_endpoint": "GET /v1/charges/{id}",
                        "params_mapping": {"id": "id"},
                    },
                    {
                        "universal_tool": "list_collections",
                        "target_endpoint": "GET /v1/customers",
                        "params_mapping": {},
                    },
                    {
                        "universal_tool": "list_objects",
                        "target_endpoint": "GET /v1/customers",
                        "params_mapping": {},
                    },
                    {
                        "universal_tool": "upsert",
                        "target_endpoint": "POST /v1/customers",
                        "params_mapping": {},
                    },
                    {
                        "universal_tool": "delete",
                        "target_endpoint": "DELETE /v1/customers/{id}",
                        "params_mapping": {"id": "id"},
                    },
                ],
            },
            "workflows": [
                {
                    "name": "schedule_event",
                    "steps": [
                        {
                            "endpoint": "GET /v1/calendar/availability",
                            "description": "Find an open slot.",
                        },
                        {
                            "endpoint": "POST /v1/calendar/events",
                            "description": "Create the event.",
                        },
                    ],
                    "partial_failure_strategy": "report",
                },
            ],
            "coverage_pct": 100.0,
            "coverage_proof": [
                {
                    "endpoint_id": "GET /v1/charges/{id}",
                    "mapped_to_universal_tool": "fetch",
                    "sample_invocation": {
                        "url": "https://api.stripe.com/v1/charges/ch_test",
                        "method": "GET",
                        "params": {},
                    },
                },
            ],
        }
    )


# ────────────────────────── Plan 04-11 — validate.py + e2e fixtures ──────────────────────────


_VALID_TSCONFIG: str = textwrap.dedent(
    """\
    {
      "compilerOptions": {
        "target": "ES2022",
        "module": "ES2022",
        "moduleResolution": "bundler",
        "strict": true,
        "noEmit": true,
        "skipLibCheck": true,
        "esModuleInterop": true
      },
      "include": ["src/**/*"]
    }
    """
)


@pytest.fixture
def synthetic_valid_ts_dir(tmp_path: Path) -> Path:
    """tmp_path-rooted dir with a tsconfig.json + one valid TS file."""
    out = tmp_path / "valid_ts"
    out.mkdir()
    (out / "tsconfig.json").write_text(_VALID_TSCONFIG, encoding="utf-8")
    src = out / "src"
    src.mkdir()
    (src / "main.ts").write_text(
        textwrap.dedent(
            """\
            const greeting: string = "hello";
            export function greet(name: string): string {
              return greeting + " " + name;
            }
            """
        ),
        encoding="utf-8",
    )
    return out


@pytest.fixture
def synthetic_invalid_ts_dir(tmp_path: Path) -> Path:
    """tmp_path-rooted dir with TS that fails type checking."""
    out = tmp_path / "invalid_ts"
    out.mkdir()
    (out / "tsconfig.json").write_text(_VALID_TSCONFIG, encoding="utf-8")
    src = out / "src"
    src.mkdir()
    (src / "main.ts").write_text(
        textwrap.dedent(
            """\
            const x: string = 42;
            const y: number = "not a number";
            export const z = x.nonexistentMember();
            """
        ),
        encoding="utf-8",
    )
    return out


@pytest.fixture
def synthetic_warning_only_ts_dir(tmp_path: Path) -> Path:
    """tmp_path-rooted dir with valid TS that compiles cleanly.

    For the warning-count test we assert ``run_tsc_no_emit`` returns the
    integer warning count (0 here) without raising — this exercises the
    success branch where returncode == 0 and no errors are present.
    """
    out = tmp_path / "warning_ts"
    out.mkdir()
    (out / "tsconfig.json").write_text(_VALID_TSCONFIG, encoding="utf-8")
    src = out / "src"
    src.mkdir()
    (src / "main.ts").write_text(
        textwrap.dedent(
            """\
            export function add(a: number, b: number): number {
              return a + b;
            }
            """
        ),
        encoding="utf-8",
    )
    return out


def _synth_endpoint(method: str, path: str) -> dict[str, Any]:
    return {
        "method": method,
        "path": path,
        "operation_id": f"{method}{path.replace('/', '_').replace('{', '').replace('}', '')}",
        "summary": f"{method} {path}",
        "description": None,
        "parameters": [],
        "request_body": None,
        "responses": {"200": {"description": "OK"}},
        "tags": [],
        "deprecated": False,
    }


@pytest.fixture
def synthetic_raw_ir_with_30_plus_endpoints() -> RawIR:
    """RawIR with > 30 endpoints across 2 path-prefix clusters.

    Used by the bundle-size gate test to verify
    ``compute_top_level_path_prefixes`` produces non-empty suggestions when
    the spec is large enough to cluster (Phase 2 D-18 minimum 30/cluster).
    """
    endpoints: list[dict[str, Any]] = []
    for i in range(32):
        endpoints.append(_synth_endpoint("GET", f"/v1/customers/{i}"))
    for i in range(32):
        endpoints.append(_synth_endpoint("GET", f"/v1/charges/{i}"))
    return RawIR.model_validate(
        {
            "spec_format": "openapi-3.0",
            "spec_hash": "c" * 64,
            "endpoints": endpoints,
            "schemas": {},
            "security_schemes": {},
            "dependency_graph": {},
        }
    )


@pytest.fixture
def synthetic_raw_ir_small() -> RawIR:
    """Small RawIR (< 30 endpoints, no clusters) for hard-fail empty-splits."""
    endpoints = [_synth_endpoint("GET", f"/v1/foo/{i}") for i in range(5)]
    return RawIR.model_validate(
        {
            "spec_format": "openapi-3.0",
            "spec_hash": "d" * 64,
            "endpoints": endpoints,
            "schemas": {},
            "security_schemes": {},
            "dependency_graph": {},
        }
    )


def _e2e_pass_2(name: str) -> dict[str, Any]:
    return {
        "purpose": f"Synthetic {name} description for Stage E e2e test only.",
        "when_to_use": [f"When the test calls {name}."],
        "limitations": ["Synthetic; never used at runtime."],
        "parameter_overview": (
            "Synthetic parameter overview describing the input fields used "
            "by the Stage E e2e test fixture; never consumed at runtime."
        ),
    }


def _e2e_input_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "Query."}},
        "required": ["query"],
        "additionalProperties": False,
    }


def _e2e_output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {"id": {"type": "string"}},
        "required": ["id"],
    }


def _e2e_annotations() -> dict[str, Any]:
    return {
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    }


def _e2e_response_config() -> dict[str, Any]:
    return {
        "pagination": None,
        "field_filtering": None,
        "truncation": {
            "threshold_tokens": 10000,
            "guidance_template": "Synthetic guidance template.",
        },
        "has_response_format_param": False,
    }


def _e2e_final_tool(name: str, source_endpoint: str) -> dict[str, Any]:
    return {
        "name": name,
        "type": "universal",
        "description": _e2e_pass_2(name),
        "inputSchema": _e2e_input_schema(),
        "outputSchema": _e2e_output_schema(),
        "annotations": _e2e_annotations(),
        "response_config": _e2e_response_config(),
        "source_endpoints": [source_endpoint],
    }


@pytest.fixture
def e2e_final_tools_minimal() -> list[FinalTool]:
    """Three FinalTools (search/fetch/list_objects) for Stage E run() e2e."""
    return [
        FinalTool.model_validate(_e2e_final_tool("search", "GET /v1/charges")),
        FinalTool.model_validate(_e2e_final_tool("fetch", "GET /v1/charges/{id}")),
        FinalTool.model_validate(_e2e_final_tool("list_objects", "GET /v1/charges")),
    ]


@pytest.fixture
def e2e_pass_1_output() -> Pass1Output:
    """Pass1Output covering the minimal e2e FinalTools."""
    return Pass1Output.model_validate(
        {
            "tools": [
                {"name": "search", "type": "universal", "source_endpoints": ["GET /v1/charges"]},
                {
                    "name": "fetch",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges/{id}"],
                },
                {
                    "name": "list_objects",
                    "type": "universal",
                    "source_endpoints": ["GET /v1/charges"],
                },
            ],
            "routing": {
                "smart_id": {
                    "format": "stripe:{type}:{collection}:{identifier}",
                    "types": ["object"],
                    "collections": ["Charge"],
                },
                "rules": [
                    {
                        "universal_tool": "search",
                        "target_endpoint": "GET /v1/charges",
                        "params_mapping": {"query": "query"},
                    },
                    {
                        "universal_tool": "fetch",
                        "target_endpoint": "GET /v1/charges/{id}",
                        "params_mapping": {"id": "id"},
                    },
                    {
                        "universal_tool": "list_objects",
                        "target_endpoint": "GET /v1/charges",
                        "params_mapping": {},
                    },
                ],
            },
            "workflows": [],
            "coverage_pct": 100.0,
            "coverage_proof": [
                {
                    "endpoint_id": "GET /v1/charges",
                    "mapped_to_universal_tool": "search",
                    "sample_invocation": {
                        "url": "https://api.stripe.com/v1/charges",
                        "method": "GET",
                        "params": {},
                    },
                },
            ],
        }
    )


@pytest.fixture
def e2e_pass_0_output() -> Pass0Output:
    """Minimal Pass0Output for the e2e fixture (passthrough auth mode)."""
    return _synth_pass_0()


@pytest.fixture
def e2e_raw_ir() -> RawIR:
    """Minimal RawIR for the e2e fixture."""
    return _synth_raw_ir()


@pytest.fixture
def e2e_pass_5_output() -> Pass5Output:
    """Pass5Output with cursor-style pagination flag for e2e runtime/."""
    return _synth_pass_5()
