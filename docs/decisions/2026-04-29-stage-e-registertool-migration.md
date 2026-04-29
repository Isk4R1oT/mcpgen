# Stage E migrates from SDK v1 5-arg `server.tool()` to `McpServer.registerTool()` for outputSchema support

**Status:** Accepted — 2026-04-29

---

## Context

Gate 04-13 re-run #2 (2026-04-29 13:25) surfaced deviation **D-4** in
`.planning/phases/04-generation-engine-shape-codegen-pass-5-stage-e/04-PHASE-DEVIATIONS.md`:
every rendered `tool_*.ts.j2` template registered tools via the deprecated SDK
v1 5-arg overload `server.tool(name, description, schema, annotations, cb)`,
and `tools/list` responses showed `outputSchema: null` (or absent) for all
tools — confirmed in `04-13-INSPECTOR-EVIDENCE.md` re-run §R3 for both
2025-06-18 and 2024-11-05 protocol clients.

The root cause: the deprecated 5-arg `server.tool()` signature in MCP TS SDK
v1 has no parameter for `outputSchema`. Verified in
`node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts:117-146` —
the overloads accept at most `(name, description, schema, annotations, cb)` and
are explicitly marked `@deprecated`. `outputSchema` cannot be expressed in any
of these deprecated forms; it is silently ignored at construction time.

This affected all 9 per-tool Jinja2 templates (universal: search, fetch,
list_collections, list_objects, upsert, delete; non-universal: action, workflow,
specialized). The absence of `outputSchema` in `tools/list` violates Phase 4
success criteria SC #1 (all tools registered with SDK v1 `registerTool` form)
and SC #5 (all tools expose `outputSchema` from Pass 5 in `tools/list`).

Additionally, the plan's original claim that "SDK accepts JSON Schema via the
`AnySchema` overload" was incorrect. The SDK's `registerTool` config field
`outputSchema` is typed as `OutputArgs extends ZodRawShapeCompat | AnySchema`
where `AnySchema = z3.ZodTypeAny | z4.$ZodType` — a Zod type, not a plain
JSON Schema object. Passing a plain JS object literal fails both TypeScript
compilation (`tsc --noEmit`) and the SDK's runtime `getZodSchemaObject` guard
(which throws `"inputSchema must be a Zod schema or raw shape, received an
unrecognized object"`). The fix therefore required converting Pass 5's JSON
Schema dicts to inline Zod expressions at template render time.

---

## Decision

**Switch all 9 per-tool `tool_*.ts.j2` templates from the deprecated 5-arg
`server.tool()` overload to `McpServer.registerTool(name, config, cb)`.** The
`config` object carries `description`, `inputSchema`, `outputSchema`,
`annotations`, and (optionally) `title` and `_meta` as a single parameter.

To correctly pass the Pass 5 `outputSchema` (a Python `Dict[str, Any]` JSON
Schema) into `registerTool`'s `outputSchema` field (typed as Zod), add a
custom Jinja2 filter `json_schema_to_zod` to `template_loader.py`. The filter
converts JSON Schema dicts to inline TypeScript Zod expressions recursively:

- `{"type": "string"}` → `z.string()`
- `{"type": "number"}` / `{"type": "integer"}` → `z.number()`
- `{"type": "boolean"}` → `z.boolean()`
- `{"type": "array", "items": {...}}` → `z.array(<recursive>)`
- `{"type": "object", "properties": {...}}` → `z.object({...}).passthrough()`
- `{"type": "object"}` (no properties) → `z.record(z.string(), z.unknown())`
- anything else → `z.unknown()`

The `.passthrough()` call on object schemas ensures extra upstream fields do
not cause Zod validation failures in the MCP runtime when the upstream API
adds new response fields. Recursion is guarded at depth > 8 to prevent stack
overflow on pathological specs.

Templates use: `outputSchema: {{ tool.output_schema | json_schema_to_zod }},`

This is **not** a v1→v2 SDK migration. `McpServer.registerTool()` ships in SDK
v1 (1.6+) alongside the deprecated `tool()` overloads. The SDK version pin
(`^1.x`) is unchanged.

Amend `04-CONTEXT.md` line 592 (the "MCP TS SDK v1 vs v2" invariant block) to
clarify that the deprecated 5-arg form drops `outputSchema`, that
`registerTool` is the canonical v1 (1.6+) API for `outputSchema`-bearing tools,
and that the future v2 migration (package alias rename, Standard Schema) remains
a deliberate post-launch refactor PR.

---

## Consequences

**Positive:**

- `outputSchema` is present and non-null in every `tools/list` response for
  all rendered tool types (universal and non-universal).
- `tsc --noEmit` continues to pass with zero warnings on all 5 hand-tuned
  fixtures (Stripe, GitHub, Notion, Linear, Jira) — the Zod expressions
  satisfy the SDK's `ZodRawShapeCompat | AnySchema` type constraint.
- The SDK correctly serializes the Zod schema to JSON Schema in `tools/list`
  via `toJsonSchemaCompat(normalizeObjectSchema(tool.outputSchema))`.
- Phase 4 SC #1 and SC #5 are closed. D-4 is drained.

**Negative:**

- Bundle size increases by approximately 450 bytes uncompressed (~150 bytes
  gzipped) per server — 9 tool files, ~50 bytes per `registerTool` form vs
  5-arg `tool()` form. Well within Plan 04-11's bundle-size soft-pass gate
  (< 800 KB).
- `json_schema_to_zod` only handles the JSON Schema subset emitted by Pass 5;
  exotic constructs (`oneOf`, `anyOf`, `allOf`, `$ref`, `if/then/else`) fall
  back to `z.unknown()`. Pass 5 does not currently emit these — fallback is
  defensive only.

**Neutral:**

- The future v2 migration (package alias rename, Standard Schema) is unchanged.
  `registerTool` is the canonical API in both v1 (1.6+) and v2 — the migration
  path for v2 is the package rename and Standard Schema adoption, not the
  registration API itself.
- Per-tool `tools/list` property fidelity: Zod's `toJsonSchemaCompat` adds a
  `$schema` field and normalises type names, so the `tools/list` JSON Schema
  is not byte-identical to the Pass 5 output dict, but the property structure
  (names, types, required) is preserved end-to-end.

---

## References

- `.planning/phases/04-generation-engine-shape-codegen-pass-5-stage-e/04-PHASE-DEVIATIONS.md` §D-4
- `.planning/phases/04-generation-engine-shape-codegen-pass-5-stage-e/04-13-INSPECTOR-EVIDENCE.md` re-run §R3
- `packages/codegen-templates/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.d.ts:117-157` (deprecated overloads + `registerTool` signature)
- `packages/codegen-templates/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/zod-compat.d.ts` (`AnySchema = z3.ZodTypeAny | z4.$ZodType`)
- `.planning/phases/04-generation-engine-shape-codegen-pass-5-stage-e/04-15-PLAN.md` (plan that implements this decision)
- `apps/generation-engine/src/mcpgen_engine/stages/stage_e/template_loader.py` (`json_schema_to_zod` filter implementation)
