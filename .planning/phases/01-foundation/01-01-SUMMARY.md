---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [pnpm, turborepo, typescript, eslint, prettier, vitest, monorepo, foundation]

# Dependency graph
requires: []
provides:
  - "pnpm 10 workspace root with apps/* and packages/* globs"
  - "Turborepo 2 task graph (build/test/typecheck/lint/codegen) with caching"
  - "Strict TypeScript 6 base config (tsconfig.base.json) — extended by every downstream package"
  - "@mcpgen/shared-config package: ESLint flat config, Prettier, tsconfig shim, Vitest base"
  - "Repo-root tooling files: .gitignore, .nvmrc, .node-version, .prettierrc, .prettierignore"
affects:
  - "01-02 (pre-commit + CI): consumes turbo task graph and ESLint config"
  - "01-03 (frozen contracts): consumes shared-config tsconfig + ESLint"
  - "01-04 (DB schema): consumes pnpm workspace resolution"
  - "01-05 (apps scaffolds): every app extends shared-config tsconfig + ESLint + Prettier + Vitest"
  - "01-06 (engine FastAPI): consumes pnpm workspace + turbo run codegen task"
  - "All later phases: every TS file is governed by the strict TS6 base + ESLint global rules"

tech-stack:
  added:
    - "pnpm@10.30.2 (packageManager pin)"
    - "turbo@^2.9.6 (task graph + caching)"
    - "typescript@^6.0.3 (strict mode: noUncheckedIndexedAccess, exactOptionalPropertyTypes)"
    - "eslint@^10.2.1 (flat config)"
    - "@typescript-eslint/{parser,eslint-plugin}@^8.0.0"
    - "eslint-plugin-security@^3.0.1"
    - "eslint-config-prettier@^9.1.0"
    - "prettier@^3.3.3"
    - "vitest@^1.6.0 + @vitest/coverage-v8@^1.6.0"
    - "tsx@^4.19.2 (TS runner for build scripts)"
    - "@types/node@^22.10.5"
  patterns:
    - "Workspace package naming: @mcpgen/<name> for all internal packages"
    - "Sub-path exports for shared config: /eslint, /prettier, /tsconfig, /vitest"
    - "Two tsconfig files per package: tsconfig.base.json (export shim) + tsconfig.json (runtime entry)"
    - "Strict TS6 base extended via {\"extends\": \"@mcpgen/shared-config/tsconfig\"}"
    - "ESLint rule baseline: no-explicit-any=error, explicit-function-return-type=error, ClassDeclaration=warn (functional preference)"
    - "Prettier: singleQuote, trailingComma=all, printWidth=100, tabWidth=2, arrowParens=always, endOfLine=lf"

key-files:
  created:
    - "package.json (28 lines) — root pnpm workspace, packageManager pin, turbo scripts"
    - "pnpm-workspace.yaml (3 lines) — apps/* and packages/* globs"
    - "turbo.json (28 lines) — task graph for build/test/typecheck/lint/codegen with caching"
    - "tsconfig.base.json (20 lines) — strict TS6 base"
    - ".gitignore (46 lines) — Node + Python + build artifacts; packages/ir/python/ explicitly NOT ignored"
    - ".nvmrc (1 line) + .node-version (1 line) — pin Node 22"
    - ".prettierrc (7 lines) — minimal root config"
    - ".prettierignore (27 lines) — exclude pre-existing out-of-scope files + auto-generated"
    - "README.md (55 lines) — tagline, status, quickstart, doc pointers"
    - "packages/shared-config/package.json (30 lines)"
    - "packages/shared-config/eslint.config.mjs (56 lines) — flat config with CLAUDE.md rules"
    - "packages/shared-config/prettier.config.mjs (13 lines)"
    - "packages/shared-config/vitest.config.base.ts (21 lines)"
    - "packages/shared-config/tsconfig.base.json (3 lines) — export shim"
    - "packages/shared-config/tsconfig.json (4 lines) — runtime entry for tsc --noEmit"
    - "packages/shared-config/index.ts (12 lines) — type-only entry"
    - "packages/shared-config/README.md (61 lines) — sub-path consumption examples"
    - "pnpm-lock.yaml (auto-generated, 2500+ lines)"
  modified: []

key-decisions:
  - "Used pnpm@10.30.2 verbatim from RESEARCH.md Standard Stack (current latest pnpm 10.x)"
  - "Used turbo@^2.9.6 verbatim from RESEARCH.md (current latest 2.9.6 confirmed via npm view)"
  - "Used typescript@^6.0.3 verbatim from RESEARCH.md (current latest TS 6.0.3 confirmed via npm view)"
  - "Used vitest@^1.6.0 per PLAN.md (Vitest 4.x is available but PLAN explicitly pins 1.6.0)"
  - "Added two tsconfig files in shared-config: tsconfig.base.json (export shim used by consumers via @mcpgen/shared-config/tsconfig) and tsconfig.json (runtime entry consumed by tsc --noEmit). The plan only specified tsconfig.base.json but tsc needs a config file when invoked directly."

patterns-established:
  - "File naming: lowercase + dashes for files; PascalCase for Zod schemas / TS types (per PATTERNS.md)"
  - "Contract location: All cross-app types live in packages/contracts/src/ (this plan only sets up the workspace; first contracts land in 01-03)"
  - "Strict TypeScript baseline: every package's tsconfig MUST extend @mcpgen/shared-config/tsconfig OR ../../tsconfig.base.json"
  - "ESLint baseline: every package's eslint.config.mjs MUST spread @mcpgen/shared-config/eslint as the first config layer"
  - "Prettier baseline: every package re-exports @mcpgen/shared-config/prettier — no per-package overrides"
  - "Workspace script convention: every package MUST define build/test/typecheck/lint scripts (no-op echo is acceptable for config-only packages) so pnpm -r resolves them"
  - "Conventional Commits per CLAUDE.md / git-workflow-rules: type(scope): subject — atomic, ≤72 chars subject"

requirements-completed:
  - FND-01
  - OPS-02
  - OPS-03

# Metrics
duration: ~10min
completed: 2026-04-26
---

# Phase 1 Plan 01: Monorepo Skeleton Summary

**Empty-but-buildable monorepo root with pnpm 10 workspaces, Turborepo 2 task graph, strict TypeScript 6, and the @mcpgen/shared-config package that every downstream package will extend.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-26T12:01Z (approximate — agent spawn time)
- **Completed:** 2026-04-26T12:12Z
- **Tasks:** 3 / 3
- **Files created:** 18 (10 at root, 8 in packages/shared-config) + auto-generated pnpm-lock.yaml
- **Files modified:** 0 (greenfield)

## Accomplishments

- Established the monorepo's tooling foundation: pnpm 10 + Turborepo 2 + strict TypeScript 6 + ESLint 10 flat config + Prettier + Vitest. Every downstream plan and every later phase imports from `@mcpgen/shared-config` for tsconfig/eslint/prettier defaults.
- Proved the empty workspace is buildable: `pnpm install --frozen-lockfile && pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r lint && pnpm prettier --check .` all exit 0 from a fresh state.
- Pinned versions per RESEARCH.md "Standard Stack" (turbo 2.9.6, typescript 6.0.3, eslint 10.2.1, vitest 1.6.0) — all confirmed as current `latest` via `npm view`.
- ESLint flat config enforces CLAUDE.md global rules from day 1: `no-explicit-any` = error, `explicit-function-return-type` = error, `no-restricted-syntax` warning on `ClassDeclaration` (favoring functional code), `eslint-plugin-security` rules wired.

## Task Commits

Each task was committed atomically per Conventional Commits + git-workflow-rules:

1. **Task 1: Initialize pnpm workspace + Turborepo + root tsconfig** — `a29ce95` (chore)
2. **Task 2: Create packages/shared-config package** — `1ee5392` (feat)
3. **Task 3: Run pnpm install + verify Turborepo task graph** — `64d01ae` (chore)

**Plan metadata commit:** Created at the end of this plan with SUMMARY.md + STATE.md + ROADMAP.md updates.

## Files Created

### Root tooling

- `package.json` (28 lines) — root manifest. `packageManager: "pnpm@10.30.2"` pin, `engines: { node: ">=22.0.0", pnpm: ">=10.0.0" }`, scripts wired to turbo (`build`, `test`, `typecheck`, `lint`, `format`, `clean`, `prepare`).
- `pnpm-workspace.yaml` (3 lines) — `packages: ['apps/*', 'packages/*']`.
- `turbo.json` (28 lines) — Turborepo v2 task graph with `dependsOn: ['^build']` topological build, codegen + codegen:check tasks for the IR codegen pipeline (Plan 01-03), `inputs` set on `test` to scope cache invalidation.
- `tsconfig.base.json` (20 lines) — strict TS6 base: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitAny`, `noUnusedLocals/Parameters`, ES2023 target, ESNext module, Bundler resolution.
- `.gitignore` (46 lines) — Node + Python + Cloudflare (`.wrangler/`) + env + OS artifacts. Note: `packages/ir/python/` is explicitly NOT ignored — Pydantic codegen output is committed per D-02.
- `.nvmrc` + `.node-version` (1 line each) — `22` for fnm/nvm/Volta compatibility.
- `.prettierrc` (7 lines) — minimal root config (Plan 02 will swap for `@mcpgen/shared-config/prettier` re-export).
- `.prettierignore` (27 lines) — exclude pre-existing out-of-scope files (docs/, CLAUDE.md, RULES.md, claude-design-ui/, .planning/) and auto-generated artifacts (pnpm-lock.yaml).
- `README.md` (55 lines) — tagline ("From any API to production-ready MCP in 60 seconds — token-optimized by default."), Phase 1 status, quickstart, pointers to CLAUDE.md / RULES.md / docs/.

### packages/shared-config/

- `package.json` (30 lines) — `@mcpgen/shared-config@0.0.0`, `private: true`, `type: "module"`, four sub-path exports (`./eslint`, `./prettier`, `./tsconfig`, `./vitest`), all required dev deps.
- `eslint.config.mjs` (56 lines) — Flat ESLint 10 config. CLAUDE.md global rules enforced as ESLint rules: `@typescript-eslint/no-explicit-any: error`, `@typescript-eslint/no-unsafe-assignment: error`, `@typescript-eslint/explicit-function-return-type: error` with `allowExpressions`, `no-restricted-syntax` warning on `ClassDeclaration` ("Prefer functional code; use classes only for external system connectors"), `eslint-plugin-security` rules (`detect-eval-with-expression: error`, others as warn). `eslint-config-prettier` last to disable stylistic conflicts.
- `prettier.config.mjs` (13 lines) — single-quote / trailingComma=all / printWidth=100 / tabWidth=2 / arrowParens=always / endOfLine=lf.
- `vitest.config.base.ts` (21 lines) — node env, v8 coverage with text + lcov reporters, conventional `src/**/*.test.ts` and `tests/**/*.test.ts` includes. Consumers extend via `mergeConfig(base, defineConfig({ ... }))`.
- `tsconfig.base.json` (3 lines) — Export shim that just `extends: "../../tsconfig.base.json"`. This is what consumers reference via `@mcpgen/shared-config/tsconfig`.
- `tsconfig.json` (4 lines) — Runtime entry for `tsc --noEmit -p tsconfig.json` (the typecheck script). Extends the local `tsconfig.base.json` and includes only the type-only files.
- `index.ts` (12 lines) — Type-only entry point with `export {};` so `import '@mcpgen/shared-config'` resolves cleanly without a side effect.
- `README.md` (61 lines) — Documents all four sub-paths with copy-pasteable consumption examples for ESLint, Prettier, TypeScript, and Vitest.

### Auto-generated

- `pnpm-lock.yaml` (~2500 lines) — committed; required by `--frozen-lockfile` in CI per `RESEARCH.md` §"Installation".

## Decisions Made

- **Two tsconfigs in shared-config (Rule 3 minor adjustment):** PLAN.md only mentioned `packages/shared-config/tsconfig.base.json` as the export shim. To make `tsc --noEmit` actually executable in the typecheck script, I added `packages/shared-config/tsconfig.json` (runtime entry) that extends the export shim. This is the convention every downstream package will follow. Without it, the typecheck script would have no config to consume.
- **build/lint no-op scripts in shared-config (Rule 3 blocking-issue fix):** PLAN.md verify uses `pnpm -r build` and `pnpm -r lint`. pnpm 10's recursive runner errors with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` if no package in the workspace has the script. Added `"build": "echo ..."` and `"lint": "echo ..."` no-op scripts to the only existing package so all four `pnpm -r <task>` calls exit 0. Subsequent plans add real apps/packages with real build/lint scripts; the no-ops disappear naturally.
- **`.prettierignore` for out-of-scope files (Rule 3 blocking-issue fix):** PLAN.md verify uses `pnpm prettier --check .`. Without an ignore list, Prettier flags 42 pre-existing files in `docs/`, `CLAUDE.md`, `RULES.md`, `.planning/`, and the auto-generated `pnpm-lock.yaml`. None of these are in this plan's scope per CLAUDE.md ("Read existing code... Keep changes minimal and related to the current request. Do not revert unrelated changes."). Added `.prettierignore` excluding all of them. Prettier check now exits 0.
- **Versions confirmed via `npm view dist-tags`:** turbo `latest=2.9.6`, typescript `latest=6.0.3`, eslint `latest=10.2.1` — all match RESEARCH.md "Standard Stack" pins exactly. Vitest `latest` is now 4.1.5 but PLAN.md explicitly specifies `^1.6.0` so I followed the plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsc --noEmit` needs a runnable tsconfig**

- **Found during:** Task 2 (creating shared-config typecheck script)
- **Issue:** PLAN.md prescribed only `packages/shared-config/tsconfig.base.json` (which is just `{ "extends": "../../tsconfig.base.json" }` — an export shim, not a runtime config). The typecheck script `tsc --noEmit` needs an actual tsconfig to consume.
- **Fix:** Added `packages/shared-config/tsconfig.json` (4 lines) with `"extends": "./tsconfig.base.json"` and a minimal `include` for the package's TS files. Updated the typecheck script to `tsc --noEmit -p tsconfig.json`. This becomes the convention for every downstream package: `*.base.json` is the exportable shim; `*.json` is the runtime entry.
- **Files modified:** `packages/shared-config/tsconfig.json` (new), `packages/shared-config/package.json` (script path).
- **Verification:** `pnpm -r typecheck` exits 0.
- **Committed in:** `1ee5392` (Task 2 commit).

**2. [Rule 3 - Blocking] `pnpm -r build`/`pnpm -r lint` error on missing scripts**

- **Found during:** Task 3 (running first verification)
- **Issue:** pnpm 10's recursive runner exits with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` if NO package in the workspace defines the script. Since `shared-config` had only `test` and `typecheck`, `pnpm -r build` and `pnpm -r lint` both errored — failing PLAN.md's verbatim verify command.
- **Fix:** Added no-op `build` and `lint` scripts (`echo "no <task> step in shared-config (config-only package)"`) to `packages/shared-config/package.json`. They are explicitly self-documenting placeholders that disappear naturally as soon as a downstream package defines a real build or lint script.
- **Files modified:** `packages/shared-config/package.json`.
- **Verification:** `pnpm -r build`, `pnpm -r lint` both exit 0.
- **Committed in:** `64d01ae` (Task 3 commit).

**3. [Rule 3 - Blocking] Prettier check fails on 42 pre-existing files**

- **Found during:** Task 3 (running `pnpm prettier --check .`)
- **Issue:** Without an ignore list, Prettier checks every file in the repo and flags 42 pre-existing files: docs/* (curated source-of-truth markdown), CLAUDE.md, RULES.md, claude-design-ui/ (LOCKED visual design — touching it violates CLAUDE.md / RULES.md), .planning/* (GSD-generated planning artifacts), and pnpm-lock.yaml (auto-generated). Per CLAUDE.md scope rules: "Keep changes minimal and related to the current request. Do not revert unrelated changes."
- **Fix:** Created `.prettierignore` (27 lines) excluding (a) auto-generated artifacts (`node_modules`, `dist`, `.turbo`, `.next`, `coverage`, `pnpm-lock.yaml`, `*.tsbuildinfo`); (b) the locked design directory (`claude-design-ui/`); (c) source-of-truth docs (`docs/`, `CLAUDE.md`, `RULES.md`); (d) GSD planning artifacts (`.planning/`); (e) Python sources (`**/*.py` — handled by ruff in apps/generation-engine).
- **Files modified:** `.prettierignore` (new).
- **Verification:** `pnpm prettier --check .` now reports "All matched files use Prettier code style!" and exits 0. Files I did create that Prettier flagged (`packages/shared-config/README.md`, `pnpm-workspace.yaml`) were `--write` reformatted in the same task.
- **Committed in:** `64d01ae` (Task 3 commit).

## Pinned Versions

Root devDependencies (per `RESEARCH.md` §"Standard Stack" and confirmed via `npm view`):

| Package                            | Pinned    | Latest available (2026-04-26) |
| ---------------------------------- | --------- | ----------------------------- |
| `turbo`                            | `^2.9.6`  | 2.9.6                         |
| `typescript`                       | `^6.0.3`  | 6.0.3                         |
| `prettier`                         | `^3.3.3`  | 3.8.3                         |
| `eslint`                           | `^10.2.1` | 10.2.1                        |
| `vitest`                           | `^1.6.0`  | 4.1.5 *(intentionally pinned to 1.x per PLAN)* |
| `@vitest/coverage-v8`              | `^1.6.0`  | 4.1.5 *(matched to vitest)*  |
| `tsx`                              | `^4.19.2` | 4.21.0                        |
| `@types/node`                      | `^22.10.5`| 25.6.0 *(matched to engines.node 22)* |

Plus `@typescript-eslint/{parser,eslint-plugin}@^8.0.0`, `eslint-plugin-security@^3.0.1`, `eslint-config-prettier@^9.1.0` in `packages/shared-config/`.

## Verification Confirmation

All 4 turbo tasks (build / typecheck / test / lint) execute cleanly across the empty workspace:

```
$ pnpm install --frozen-lockfile     # exits 0 (lockfile up to date)
$ pnpm -r build                      # exits 0 (shared-config no-op)
$ pnpm -r typecheck                  # exits 0 (tsc --noEmit on type-only entry)
$ pnpm -r test                       # exits 0 (shared-config no-op)
$ pnpm -r lint                       # exits 0 (shared-config no-op)
$ pnpm prettier --check .            # exits 0 ("All matched files use Prettier code style!")
$ pnpm exec turbo --version          # 2.9.6
$ node --version                     # v25.2.1 (>= engines.node 22)
$ pnpm --version                     # 10.30.2
```

## Pointer for Downstream Plans

`packages/shared-config/` is the canonical config source for every downstream package. Subsequent plans MUST consume it via the documented sub-paths (`@mcpgen/shared-config/{eslint,prettier,tsconfig,vitest}`) rather than re-defining their own ESLint flat configs or tsconfig bases. This is enforced by convention in Plan 01-02's pre-commit hook and by code review.

## Self-Check: PASSED

**Files claimed created — all exist:**

- ✓ `package.json`
- ✓ `pnpm-workspace.yaml`
- ✓ `turbo.json`
- ✓ `tsconfig.base.json`
- ✓ `.gitignore`
- ✓ `.nvmrc`
- ✓ `.node-version`
- ✓ `.prettierrc`
- ✓ `.prettierignore`
- ✓ `README.md`
- ✓ `pnpm-lock.yaml`
- ✓ `packages/shared-config/package.json`
- ✓ `packages/shared-config/eslint.config.mjs`
- ✓ `packages/shared-config/prettier.config.mjs`
- ✓ `packages/shared-config/vitest.config.base.ts`
- ✓ `packages/shared-config/tsconfig.base.json`
- ✓ `packages/shared-config/tsconfig.json`
- ✓ `packages/shared-config/index.ts`
- ✓ `packages/shared-config/README.md`

**Commits claimed — all present in git log:**

- ✓ `a29ce95` chore(01-01): scaffold monorepo root with pnpm workspaces and Turborepo
- ✓ `1ee5392` feat(01-01): add @mcpgen/shared-config package with ESLint/Prettier/tsconfig/Vitest presets
- ✓ `64d01ae` chore(01-01): bootstrap pnpm install and verify Turborepo task graph
