# @mcpgen/engine-fixtures

Five hand-crafted Pass-5 fixture sets (Stripe, GitHub, Notion, Linear, Slack)
covering FND-07 / D-07 / Pitfall #24.

## Why this exists

Frontend (Phase 7), runtime (Phase 6), and ops (Phase 8) workstreams need
realistic `RawIR` + `FinalTool[]` + `QualityReport` JSON to wire against
**before the Generation Engine produces real output** (Pitfall #24 — engine
slip cannot block parallel workstreams).

## Tool-type-mix coverage

| API    | Universal | Action | Workflow | Total | Notes                                |
| ------ | --------- | ------ | -------- | ----- | ------------------------------------ |
| stripe | 6         | 3      | 0        | 9     | Action-rich data API                 |
| github | 6         | 3      | 1        | 10    | Action + workflow                    |
| notion | 6         | 0      | 0        | 6     | Pure data API (Six-Tool only)        |
| linear | 6         | 3      | 0        | 9     | Action-heavy                         |
| slack  | 6         | 3      | 1        | 10    | Action-rich + workflow               |

## How to use

```typescript
import { stripe, github, notion, linear, slack, ALL_FIXTURES } from '@mcpgen/engine-fixtures';

console.log(stripe.finalTools.length); // 9
console.log(stripe.qualityReport.quality_badge); // "verified"

for (const [name, fx] of Object.entries(ALL_FIXTURES)) {
  console.log(name, fx.finalTools.map((t) => t.name));
}
```

## DO NOT regenerate via LLM

These fixtures were **hand-tuned by reading each upstream API's spec** (per
CONTEXT specifics + planner-revision iteration 1). Each `<api>/SOURCE.md`
documents `spec_url:` + `source_section:` markers — these are
grep-verifiable provenance tokens that distinguish hand-crafted fixtures
from LLM-hallucinated ones.

If you change a fixture, update the corresponding `SOURCE.md` and re-run
`pnpm --filter @mcpgen/engine-fixtures test` to keep the shape contract green.

## Shape contract

Every fixture validates against the frozen Zod schemas in `@mcpgen/ir`:

- `ir.json`           → `RawIR`
- `final-tools.json`  → `z.array(FinalTool)` (6–15 tools, all 6 universal names present)
- `quality-report.json` → `QualityReport` with `f2_smell.overall_average ≥ 4.0`
  and `f3_agent_eval.pass_rate ≥ 0.7` (matching `LAUNCH_CRITERIA`)

## Related

- `docs/mcpgen-pass-1-design.md` — Six-Tool Pattern + smart IDs
- `docs/mcpgen-pass-5-design.md` — `FinalTool` output shape
- `docs/mcpgen-stage-f-design.md` — `QualityReport` + quality badges
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-07 fixture spec
- `.planning/phases/01-foundation/01-RESEARCH.md` — Pitfall #24 rationale
