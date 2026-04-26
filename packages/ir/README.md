# @mcpgen/ir

Universal Intermediate Representation (IR) — the cross-language source of truth for every type that flows through the generation pipeline.

## Source of truth: TypeScript Zod (D-01)

`packages/ir/src/types.ts` is hand-authored. Every public Zod export there is **the canonical definition**. The Python Pydantic mirror in `packages/ir/python/types.py` is **generated** and **must not be hand-edited**.

## 4-step codegen pipeline (D-02)

```
src/types.ts (Zod 4)
   │
   │  pnpm --filter @mcpgen/ir codegen
   ▼
build/jsonschema/*.json       (z.toJSONSchema, draft-2020-12, one file per top-level export)
   │
   │  uvx datamodel-code-generator==0.26.4 --input-file-type jsonschema
   ▼
python/types.py               (Pydantic v2; committed verbatim)
   │
   │  pnpm --filter @mcpgen/ir codegen:check
   ▼
   exit 0 if up-to-date / non-zero if drift detected
```

## Required commands

```bash
# Regenerate the Python mirror after editing src/types.ts:
pnpm --filter @mcpgen/ir codegen

# Verify the committed mirror is fresh (run by CI on every PR + pre-commit hook):
pnpm --filter @mcpgen/ir codegen:check
```

The `codegen:check` step is enforced in three places:

1. **Local pre-commit** (`.pre-commit-hooks/...` via `ir-codegen-check` in `.pre-commit-config.yaml`)
2. **CI** (`.github/workflows/contract-codegen-check.yml`)
3. **Directly in this script** (`packages/ir/scripts/codegen.ts`)

## Workflow when editing IR types

1. Edit `packages/ir/src/types.ts` (e.g. add a field to `FinalTool`).
2. Run `pnpm --filter @mcpgen/ir codegen` — regenerates `python/types.py`.
3. Run `pnpm --filter @mcpgen/ir test --run` — round-trip tests.
4. Stage **both** `src/types.ts` and `python/types.py` in the same commit.
5. CI verifies via `codegen:check` that the mirror is fresh.

If you forget step 2, the pre-commit `ir-codegen-check` hook + the CI codegen check job will fail your PR with a clear "out of date" message.

## Dependencies

- **Runtime (TS):** `zod ^4.3.6` (Zod 4's native `z.toJSONSchema` is the codegen primitive).
- **Codegen tooling:** `datamodel-code-generator==0.26.4` via `uvx` (preferred — no install) or `pip install datamodel-code-generator==0.26.4` (CI uses this).
- **Python runtime:** `pydantic >=2,<3` (declared in `pyproject.toml`).

## Test gating

Codegen tests in `tests/codegen.test.ts` spawn `tsx scripts/codegen.ts`, which requires `datamodel-code-generator`. Gated behind `RUN_CODEGEN_TESTS=1` so a casual `pnpm test` doesn't fail when the Python tooling isn't installed. CI sets the env var.

## What lives here vs. `packages/contracts/`

| File                                | Purpose                                                                          |
| ----------------------------------- | -------------------------------------------------------------------------------- |
| `packages/ir/src/types.ts`          | Universal IR types (RawIR, FinalTool, all per-pass outputs, QualityReport)       |
| `packages/contracts/src/*.ts`       | API surfaces (Generation API + SSE, Usage Event, Launch Criteria, Idempotency)   |
| `packages/runtime-sdk/src/index.ts` | Tenant Worker SDK interface stub (Phase 1: signatures; Phase 6: implementations) |

If a new type crosses the TS↔Python boundary (i.e. the engine produces or consumes it), it belongs here. Otherwise it belongs in `packages/contracts/`.
