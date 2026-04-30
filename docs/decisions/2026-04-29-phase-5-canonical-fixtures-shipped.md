# 2026-04-29 — Phase 5 canonical fixtures shipped

**Decision:** Ship `packages/engine-fixtures/_canonical/{search,fetch}_signature.json` and
`mcp-schema.json` as immutable references for F1 `openai_compliance` (D-05 step 7) and
`json_schema` (D-05 step 10) checks.

**Why:** Pitfall #32 (ChatGPT Deep Research compliance regression) requires that
`search(query: string)` and `fetch(id: string)` shapes never drift — any future Pass 1
"improvement" that adds e.g. `limit: int` to `search` must hard-fail F1 with a clear error.
Pitfall #33 requires that the MCP 2025-06-18 schema bundle used by F1 stays pinned to a
known-good upstream commit so F1 results are reproducible across regenerations.

**Effect:**

1. F1 Wave 2 plans can `Path(__file__).parent / "_canonical/search_signature.json"` and load valid JSON.
2. F1 Wave 2 plans can subprocess `gitleaks detect --source ...` against the deterministic 8.30.1 binary.
3. All future changes to `packages/engine-fixtures/_canonical/*.{json,md}` require a paired
   `docs/decisions/<YYYY-MM-DD>-<slug>.md` entry per the new pre-commit hook
   `canonical-fixtures-paired-decision`.
4. MCP schema bundle is pinned to commit
   `6523895fcdc479b20911a9faaea32daa21c5cf1e` (blob SHA `775dc991791e6008f662544e70f76f9d47be32ac`).

**Threat model addressed:**

| Threat ID | Category | Mitigation |
|-----------|----------|------------|
| T-5-05 | Tampering (search/fetch sigs) | Pre-commit hook + F1 deep-equal at build time |
| T-5-06 | Tampering (MCP schema bundle) | Pinned commit + blob SHA in SOURCE.md; quarterly review ritual |
| T-5-07 | Spoofing (gitleaks binary) | Multi-stage `COPY --from=zricethezav/gitleaks:v8.30.1`; brew formula SHA verification on dev |

**Sources:**

- `.planning/phases/05-generation-engine-validation-stage-f/05-CONTEXT.md` D-05 step 7, D-05 step 10, D-48
- `.planning/phases/05-generation-engine-validation-stage-f/05-RESEARCH.md` §3.4, §3.5, §6.4
- `.planning/research/PITFALLS.md` #32, #33
- `packages/engine-fixtures/_canonical/SOURCE.md`
- `.pre-commit-hooks/canonical-fixtures-paired-decision.sh`

**Bumping policy from now on:** Adding/modifying any file under
`packages/engine-fixtures/_canonical/` requires a NEW `docs/decisions/<date>-<slug>.md` in the same
commit. The pre-commit hook will block commits that fail this rule.
