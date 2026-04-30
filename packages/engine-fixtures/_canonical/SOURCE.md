# Canonical Reference Fixtures (Phase 5 Stage F)

These three files are IMMUTABLE without a paired `docs/decisions/<YYYY-MM-DD>-<slug>.md` entry. The
pre-commit hook `.pre-commit-hooks/canonical-fixtures-paired-decision.sh` enforces this.

## search_signature.json + fetch_signature.json

**Purpose:** Pitfall #32 — ChatGPT Deep Research compliance regression prevention.

The OpenAI Deep Research integration requires `search(query: string)` and `fetch(id: string)` to
have EXACT signatures (no extra params). Any drift = silent failure. F1 `openai_compliance`
check (D-05 step 7) deep-equals these against `FinalTool[search].inputSchema` /
`FinalTool[fetch].inputSchema`. Drift → retry Pass 1 OR Pass 3.

**Source of truth:** OpenAI ChatGPT Deep Research integration spec (immutable canonical reference).
The shape is hand-authored from the public OpenAI Deep Research integration requirements: a single
required string parameter, no `description` field, no extra properties.

**Bumping policy:** Forbidden without paired `docs/decisions/<YYYY-MM-DD>-openai-compliance-update.md`.

**Diff semantics:** F1 performs deep-equal byte-for-byte against the tool's `inputSchema` after
stripping per-property `description` fields (so spec-derived descriptions on `query` / `id` are
allowed; structural drift — extra params, type changes, removal of `additionalProperties: false` —
is forbidden). Implementation lives in `apps/generation-engine/src/mcpgen_engine/stages/stage_f/f1_checks/openai_compliance.py` (Wave 2).

## mcp-schema.json

**Purpose:** Pinned MCP 2025-06-18 JSON Schema bundle for F1 `json_schema` check (D-05 step 10).

**Upstream source:** https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.json
(NB: the original `modelcontextprotocol/specification` repo was renamed to
`modelcontextprotocol/modelcontextprotocol`; both URLs redirect to the same content.)

**Pinned at commit SHA:** `6523895fcdc479b20911a9faaea32daa21c5cf1e`

**Schema blob SHA:** `775dc991791e6008f662544e70f76f9d47be32ac` (108236 bytes)

**Fetched on:** 2026-04-29.

**Schema dialect:** `http://json-schema.org/draft-07/schema#` (verbatim from upstream — F1 uses
`jsonschema.Draft7Validator` for this bundle; per-tool `inputSchema` / `outputSchema` may declare
their own dialect via `$schema`).

**Bumping policy:** Quarterly manual review. Re-fetch from upstream at `main` HEAD; diff against
current; bump only with paired `docs/decisions/<YYYY-MM-DD>-mcp-schema-update.md` justifying the
change. Update the commit SHA + blob SHA + fetched-on date in this file as part of the same commit.

**Reproducible fetch command:**

```bash
curl -fsSL \
  "https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/6523895fcdc479b20911a9faaea32daa21c5cf1e/schema/2025-06-18/schema.json" \
  -o packages/engine-fixtures/_canonical/mcp-schema.json
```

## Threat model

Tampering with these files silently breaks Pitfall-#32 / Pitfall-#33 mitigation. Pre-commit hook is
the first line of defense; F1 deep-equal check is the runtime enforcement.

| Threat ID | Component | Mitigation |
|-----------|-----------|------------|
| T-5-05 (Tampering) | search/fetch signatures | Pre-commit hook + F1 deep-equal at build time |
| T-5-06 (Tampering) | MCP schema bundle | Pinned commit + blob SHA above; quarterly review ritual |

## Cross-references

- `.planning/phases/05-generation-engine-validation-stage-f/05-CONTEXT.md` D-05 step 7, D-05 step 10, D-48
- `.planning/research/PITFALLS.md` #32, #33
- `.pre-commit-hooks/canonical-fixtures-paired-decision.sh`
