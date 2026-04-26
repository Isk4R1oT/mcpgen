# `.pre-commit-hooks/`

Local repo-scoped pre-commit hooks (D-05 + D-08 + D-13 + CONTEXT specifics).

These bash scripts are wired in the project root `.pre-commit-config.yaml` under the
`repo: local` block. Each hook is **idempotent and read-only** (no git mutation) — it
reads the working tree / staged diff and exits 0 (pass) or non-zero (fail).

## Hooks

### `no-fourth-namespace.sh`

**Defends:** D-08 / Pitfall #11 / threat T-1-05 (CF dispatch namespace explosion → Cloudflare account suspension).

**Trigger:** any commit touching `infrastructure/cloudflare/**` (per `files: ^infrastructure/cloudflare/` in `.pre-commit-config.yaml`).

**Behaviour:** greps tracked files for `wrangler dispatch-namespace create <name>` invocations and fails the commit if (a) any name is not in the allow-list `{mcpgen-prod, mcpgen-staging, mcpgen-sandbox}` OR (b) total distinct names exceeds 3.

**Legitimate bypass:** **none**. The 3-namespace cap is an architectural invariant; tenancy is per-script, not per-namespace.

---

### `launch-criteria-paired-decision.sh`

**Defends:** D-13 / Pitfall #29 / threat T-1-03 (AI-fix-by-lowering-threshold — the most insidious failure mode for AI-agentic workflows).

**Trigger:** any commit that stages `packages/contracts/src/launch-criteria.ts`.

**Behaviour:** verifies the same commit also stages a `docs/decisions/<YYYY-MM-DD>-<slug>.md` file. If not, fails with instructions to create the decision log first.

**Legitimate bypass:** create `docs/decisions/<YYYY-MM-DD>-<slug>.md` explaining the threshold change in the same commit. CI then re-asserts that the new values still match `docs/mcpgen-implementation-plan.md` §11.7 — change the doc and the constants together.

---

### `check-ui-locked.sh`

**Defends:** CONTEXT specifics + FE-05 (UI locked after the `MCP-Gen.zip` unzip commit). Frontend phase (Phase 7) is wire-up ONLY.

**Trigger:** any commit touching `apps/web/src/styles/**` or `apps/web/src/components/ui/**`.

**Behaviour:** fails the commit unless the one-shot marker `apps/web/.unzip-commit-allowed` exists; if it does, the marker is deleted and the commit is allowed once.

**Legitimate bypass:** **none after Plan 01-05** (the unzip commit). Visual / layout / typography / copy changes are forbidden by `RULES.md`.

---

## CI defense-in-depth

`.github/workflows/main-ci.yml` includes a `pre-commit` job that runs `pre-commit run --all-files`
server-side on every PR, so a contributor that bypasses these hooks locally with `--no-verify`
(forbidden by `docs/mcpgen-git-workflow-rules.md`) is still caught at PR time before merge.

## Adding a new local hook

1. Drop a new bash script in this directory; make it executable (`chmod +x`).
2. Add a corresponding entry in `.pre-commit-config.yaml` under the `repo: local` block with `entry: bash .pre-commit-hooks/<script>.sh`, `language: system`, narrow `files:` regex, and `pass_filenames: false`.
3. Run `pre-commit run --all-files` to verify the new hook works on the existing tree.
4. Update this README with the hook's purpose, trigger, behaviour, and legitimate-bypass policy.
