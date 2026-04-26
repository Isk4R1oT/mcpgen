# Git Workflow Rules

> **Назначение:** standardized rules для работы с git в этом репозитории.
> Optimized для AI-agentic development (Claude Code в основном), но универсальны.
> **Не привязаны** к конкретным фичам или планам — применимы независимо от стадии проекта.
> **Last updated:** 2026-04-26.

---

## 0. Философия

Этот repo разрабатывается через **AI agents под supervision senior'а**. Все git rules ниже — гибрид:

- **Industry best practices** (Conventional Commits, atomic commits, trunk-based)
- **AI-agentic optimizations** (CLAUDE.md, slash commands, hooks, worktrees)
- **Senior-supervised AI workflow** (review gates, plan mode, deterministic settings)

**Главный принцип:** git history должен быть читаемым через 6 месяцев человеком, который не помнит, что тогда происходило. Это значит — atomic commits, conventional messages, descriptive PRs, no force-push to main.

**Второй принцип:** AI agents должны иметь deterministic, machine-readable правила. Не "be reasonable" — а конкретные patterns в `CLAUDE.md`, `settings.json`, `.claude/commands/`, hooks.

---

## 1. Branching strategy

### 1.1 Main branch — `main`

**Sacred branch.** Always deployable. Always green CI.

Rules:
- **Direct push на `main` запрещён** (включая senior'у) — только через PR с passing CI
- Force-push на `main` **никогда** (`git push --force` blocked branch protection)
- Все merges в `main` — **squash merge** (clean linear history)
- Branch protection: minimum 1 review approval (если работаешь solo — self-review approval через delay/sleep), CI must pass

### 1.2 Feature branches

**Short-lived** — typical lifetime 1-3 days, max 1 week. Long branches = merge hell.

**Naming convention** (enforced):

```
{type}/{short-description-kebab-case}

Examples:
  feature/six-tool-pattern-pass
  fix/auth-middleware-token-refresh
  refactor/extract-pagination-runtime
  docs/update-pass-2-rationale
  chore/upgrade-typescript-5
  experiment/code-mode-poc
```

**Allowed types:**
- `feature/` — new functionality
- `fix/` — bug fix
- `refactor/` — code restructure без изменения behavior
- `docs/` — documentation changes only
- `chore/` — dependencies, configs, tooling
- `test/` — test additions or restructuring
- `experiment/` — exploratory, may не merge

**Forbidden patterns:**
- `wip/...` — use draft PR instead
- `claude/...` или `ai/...` — work itself isn't AI-specific, content is what matters
- `temp/...`, `test123/...` — non-descriptive
- Branch names с пробелами или special chars кроме `-` and `/`

### 1.3 Branch lifecycle

```
1. Create from latest main:
   git checkout main && git pull
   git checkout -b feature/my-thing

2. Work, commit atomically (см. § 2)

3. Keep branch updated regularly:
   git fetch origin
   git rebase origin/main   # preferred over merge для feature branches

4. Push:
   git push -u origin HEAD

5. Open PR (см. § 3)

6. After merge:
   git checkout main && git pull
   git branch -d feature/my-thing   # local
   # remote auto-deleted by GitHub setting
```

### 1.4 No long-lived branches

Запрещены: `develop`, `staging`, `release/*` long-lived. Trunk-based development:
- `main` always deployable
- Feature flags для in-progress work, не branches
- Releases — теги на `main` (`v1.2.3`)

---

## 2. Commits

### 2.1 Conventional Commits (mandatory)

Every commit message follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/).

**Format:**
```
<type>(<optional-scope>): <subject>

<optional body>

<optional footer>
```

**Allowed types:**

| Type | When to use | Triggers in semver |
|---|---|---|
| `feat` | New user-facing feature | minor bump |
| `fix` | Bug fix | patch bump |
| `docs` | Documentation only | no bump |
| `style` | Formatting, whitespace, no logic change | no bump |
| `refactor` | Code restructure без behavior change | no bump |
| `perf` | Performance improvement | patch bump |
| `test` | Adding/fixing tests | no bump |
| `build` | Build system, dependencies | no bump |
| `ci` | CI/CD config | no bump |
| `chore` | Tooling, configs (non-build) | no bump |
| `revert` | Reverts previous commit | depends |

**Breaking changes:** add `!` after type/scope OR `BREAKING CHANGE:` footer:
```
feat(api)!: rename `query` parameter to `search_query`

BREAKING CHANGE: All clients calling /search must update parameter name.
```

### 2.2 Subject line rules

- **Imperative mood:** "add feature" not "added feature" or "adds feature"
- **No period** at end
- **≤ 72 characters** total (entire line, including type prefix)
- **Lowercase first letter** after `:` (except proper nouns)
- **Specific:** `fix: resolve race condition in auth middleware` not `fix: bug`

### 2.3 Body rules (when needed)

- Wrap at 72 chars
- Separated from subject by **blank line**
- Explain **what** and **why**, not **how** (code shows how)
- Use bullet points для multiple aspects

**Example good body:**
```
refactor(generation): extract pagination logic to runtime module

Pagination handling was duplicated across list_objects, search, and
list_collections handlers. Extracted to runtime/pagination.ts.

- Reduces handler code by ~30%
- Makes adding new pagination strategies (cursor, offset, page) easier
- Required by upcoming MCP 2025-06-18 cursor support
```

### 2.4 Atomic commits — CRITICAL rule

**Each commit is one logical change.** No mixing concerns.

**Bad (rejected):**
```
fix: resolve auth bug and add new endpoint and refactor utils
```

**Good (3 separate commits):**
```
fix(auth): resolve token refresh race condition
feat(api): add /v1/charges/refund endpoint
refactor(utils): extract date formatting to common module
```

**Rule of thumb:** if commit message contains "and" — split it. If you'd want to revert one part но not other — split it.

**Tooling support:**
```bash
git add -p   # interactive staging — pick hunks per commit
```

### 2.5 What NOT to commit

Hard-blocked via `.gitignore` + pre-commit hooks:
- Secrets, API keys, tokens (gitleaks scan)
- `.env` files (`.env.example` only)
- `node_modules/`, `__pycache__/`, build artifacts
- Personal IDE configs (`.vscode/settings.json` user-specific)
- Large binaries (use Git LFS если нужно)
- AI conversation logs, transcripts

Soft-blocked (warning, can override):
- Files > 500KB
- Files containing TODO/FIXME без linked issue

### 2.6 Commit attribution для AI-generated code

**Settings.json controls** (deterministic, not in CLAUDE.md):

```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  }
}
```

**Decision:** Empty attribution. Reasoning:
- This is your repo, you supervise всё
- AI-generated content quality validated by your review
- Attribution adds noise в `git log`, не приносит value
- If нужно tracking какие commits были AI-assisted — use git trailers selectively, not blanket attribution

**Override per-commit когда полезно:**
```bash
git commit -m "feat(complex): implement Six-Tool consolidation algorithm" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
```
Use this rarely, для commits где AI did substantial autonomous work и future-you might want to know context.

### 2.7 Amending and rewriting

**Allowed на feature branches:**
- `git commit --amend` — fix last commit message or add forgotten file
- `git rebase -i` — squash, reword, reorder before PR
- Force-push to feature branch (`git push --force-with-lease`, never `--force`)

**Forbidden на main или shared branches:**
- Any history rewrite
- Force-push (any flavor)
- Amend after push если кто-то уже pulled

---

## 3. Pull Requests

### 3.1 PR title — same rules as commit subject

Conventional Commits format. На squash merge title becomes commit message в `main`.

```
feat(generation): add Pass 4 annotations inference
fix(auth): handle expired OAuth tokens correctly
docs(architecture): clarify Stage F retry orchestration
```

### 3.2 PR description — required sections

Use template (see § 7.2 для full template):

```markdown
## What

One paragraph: what this PR does.

## Why

Context: why это нужно. Link to issue если применимо.

## How

Brief description of approach. Trade-offs considered.

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual test steps documented (if not automated)

## Screenshots / Examples (if applicable)

Code samples, before/after, screenshots.

## Checklist

- [ ] Conventional Commits format в commits
- [ ] Atomic commits (each commit = one logical change)
- [ ] CI passing
- [ ] Documentation updated
- [ ] No new lint warnings
- [ ] No secrets committed
```

### 3.3 PR size

- **Target:** < 400 lines changed
- **Max comfortable:** < 1000 lines
- **Hard limit:** 2000 lines (anything bigger requires explicit justification в description)

Why: research shows reviewer effectiveness drops sharply > 400 lines. Big PRs miss bugs.

If PR grows too big — split into stacked PRs:
```
PR 1: refactor groundwork (mergeable independently)
PR 2: add new functionality (depends on PR 1)
PR 3: documentation (depends on PR 2)
```

### 3.4 Draft PRs

Use draft PR для:
- Work-in-progress, want CI feedback
- Получить early review on approach
- Show progress на long-running work

**Draft signals:** "not ready for merge", reviewers can comment but don't approve.

Convert to ready-for-review only когда:
- All checklist items done
- CI green
- Self-reviewed (см. § 3.6)

### 3.5 Merge strategy — squash only

```
Allowed:    Squash and merge
Forbidden:  Merge commit
Forbidden:  Rebase and merge
```

Why squash:
- Linear history на main
- One commit per feature/fix — easy to revert
- Branch noise (WIP, fixup) cleaned up automatically
- Conventional Commits на main всегда clean

PR title becomes commit message. Edit before merge to be perfect.

### 3.6 Self-review (before requesting human review)

**Mandatory step:** open the PR's "Files changed" tab, review every diff line as if you didn't write it.

Look for:
- Typos, dead code
- Console.log, debug statements
- Hardcoded values that should be configurable
- Missing error handling
- Unclear variable names

This catches 50% of issues before reviewer's time wasted.

**For AI-agentic work:** this is особенно critical. AI generates plausible-looking code that may have subtle issues. Self-review is your quality gate.

### 3.7 Review process

**Solo developer (typical для этого репо):**
1. Open draft PR
2. Wait для CI (~5 min)
3. Self-review thoroughly (§ 3.6)
4. Convert to ready
5. Если significant work (> 200 lines, complex logic): use second AI agent для review (§ 6.3)
6. Address feedback
7. Squash-merge

**With reviewers:**
1-3. Same as above
4. Request review from specific person
5. Address feedback (push fixup commits, не amend pushed commits)
6. Re-request review
7. After approval + CI green: squash-merge

### 3.8 Addressing review feedback

- **One commit per fix** during review (not amended) — easier для reviewer to verify changes
- After approval, before merge: optionally `git rebase -i` to squash fixup commits
- **Never** force-push to PR after review approval без re-requesting review

---

## 4. Tags and releases

### 4.1 Semantic versioning

`MAJOR.MINOR.PATCH` per [semver.org](https://semver.org):
- **MAJOR** — breaking changes (`feat!:` или `BREAKING CHANGE:`)
- **MINOR** — new features (`feat:`)
- **PATCH** — bug fixes (`fix:`, `perf:`)

### 4.2 Release tags

- Annotated tags only: `git tag -a v1.2.3 -m "..."`
- Format: `v{major}.{minor}.{patch}`
- Pre-releases: `v1.2.3-beta.1`, `v1.2.3-rc.1`
- Tag только после merge to `main` + CI green

### 4.3 Release notes

Auto-generated from Conventional Commits messages между tags.

Tooling options:
- **Release Drafter** (GitHub Action)
- **release-please** (Google's tool)
- **standard-version** или **semantic-release** для Node.js

Release notes structure:
```markdown
## What's Changed

### Features
- feat(generation): add Pass 5 response shaping (#42)

### Bug Fixes
- fix(auth): handle expired OAuth tokens (#45)

### Documentation
- docs(architecture): clarify Stage F retry orchestration (#48)

**Full Changelog:** v1.2.2...v1.2.3
```

---

## 5. AI-agentic specifics (Claude Code)

### 5.1 CLAUDE.md — project memory

**The single most important file** для AI workflow.

Located: repo root + optional sub-directory `CLAUDE.md` для context-specific rules.

**Structure (recommended):**

```markdown
# Project: <name>

## Stack
- Frontend: ...
- Backend: ...
- Deployment: ...

## Repository structure
- /src — main source
- /tests — test files
- /docs — design docs

## Commands
- Dev: `npm run dev`
- Test: `npm test`
- Lint: `npm run lint`
- Type-check: `npm run typecheck`

## Coding conventions
- TypeScript strict mode
- Functional style preferred
- ...

## Git conventions
- See git-workflow-rules.md (this file)

## Things to NEVER do
- Don't commit secrets
- Don't push directly to main
- Don't disable type checking
- ...

## Things to ALWAYS do
- Run tests before commit
- Run lint before commit
- Use Conventional Commits format
- Self-review before requesting review
```

**Updates rule:** CLAUDE.md изменяется только в dedicated `chore(claude-md):` commits, never mixed with feature work.

### 5.2 settings.json — harness-enforced behavior

Lives at `.claude/settings.json`. Deterministic behavior, не "Claude please remember to...".

**What goes here (vs CLAUDE.md):**

| Type of rule | Where |
|---|---|
| "Always do X" / "Never do Y" | settings.json (если supported) |
| Project context (stack, structure) | CLAUDE.md |
| Coding style preferences | CLAUDE.md |
| Permissions (tools allowed) | settings.json |
| Attribution config | settings.json |

**Recommended baseline:**

```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  },
  "permissions": {
    "allow": ["Read", "Write", "Bash(npm test)", "Bash(git status)", "Bash(git diff)"],
    "deny": ["Bash(rm -rf*)", "Bash(git push --force*)", "Bash(git push origin main)"]
  },
  "model": "claude-opus-4-7"
}
```

**Why deny rules:** prevent AI agent от dangerous operations regardless of any prompt injection or context confusion.

### 5.3 .claude/commands/ — slash commands

Reusable workflows. **Rule:** if you do something more than once a day → turn into slash command.

Standard commands recommended для каждого репо:

```
.claude/commands/
├── commit.md           # /commit — analyze changes, create atomic commits
├── pr.md               # /pr — open PR with full template
├── review.md           # /review — self-review checklist
├── test.md             # /test — run tests, fix failures
├── plan.md             # /plan — switch to plan mode для complex task
├── ship.md             # /ship — commit + PR + merge orchestration
└── debug.md            # /debug — systematic debug flow
```

**Example `/commit.md`:**

```markdown
Analyze current uncommitted changes. Group into atomic commits where each commit = one logical change.

For each commit:
1. Stage relevant files (`git add -p` if hunks needed)
2. Write Conventional Commits message:
   - type(scope): subject (≤ 72 chars, imperative, no period)
   - blank line
   - body explaining what and why (if non-trivial)
3. Show me commit message before running `git commit`
4. After confirmation, commit

Rules:
- Never mix concerns in one commit
- If "and" appears in subject — split commit
- Run tests before commit if test files changed
- Never use `git commit --no-verify` (bypasses hooks)
```

### 5.4 .claude/rules/ — granular rules

For specific domain rules referenced in CLAUDE.md:

```
.claude/rules/
├── git-workflow.md     # ← this file or reference to it
├── code-style.md       # language-specific style rules
├── testing.md          # testing patterns
├── architecture.md     # architectural constraints
└── security.md         # security checklist
```

CLAUDE.md references: `## Git workflow → see .claude/rules/git-workflow.md`

### 5.5 Git worktrees для parallel agent sessions

When multiple agents работают одновременно, **never share working directory**. Use git worktrees.

```bash
# Create isolated worktree для new task
git worktree add ../mcpgen-feature-x feature/x

# Agent works в ../mcpgen-feature-x/
cd ../mcpgen-feature-x
claude

# Cleanup when done
cd ../mcpgen-main
git worktree remove ../mcpgen-feature-x
```

Claude Code natively supports: `claude --worktree` или ask "work in a worktree".

**Add to .gitignore:**
```
.claude/worktrees/
```

### 5.6 Subagents для review

**Test-time compute pattern** (separate context windows для better results):

When work is significant — use Claude как separate reviewer:

```
Main agent: implements feature
Review agent: separate session, given diff + spec, reviews critically
```

Or better — use built-in subagent:
```
"Use a code-review subagent to grill my changes before I open the PR"
```

This catches issues main agent missed (similar to how senior + junior pair-coding works, even с same model).

### 5.7 Plan Mode для complex tasks

For multi-file, multi-step work:

```bash
claude --permission-mode plan
```

Plan mode = read-only exploration. Agent analyzes codebase, asks clarifying questions, drafts plan **without making changes**.

After plan approved → exit plan mode, execute.

**When to use:**
- Significant refactor (> 5 files)
- New feature touching multiple modules
- Bug fix where root cause unclear
- Migration или breaking change

**When NOT to use:**
- Single-file edits
- Trivial changes
- Already have clear spec

### 5.8 "Challenge Claude" pattern

Before merging significant work:

```
"Knowing everything you know now, scrap this and implement the elegant 
solution if there's a better one"
```

Or:

```
"Grill me on these changes. Find every potential bug. Don't approve until 
you've stress-tested the logic."
```

Useful especially для AI-generated code — counters AI's tendency to confirm rather than challenge.

---

## 6. Hooks and automation

### 6.1 Pre-commit hooks (mandatory)

Use [pre-commit](https://pre-commit.com) framework. `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-json
      - id: check-merge-conflict
      - id: check-added-large-files
        args: ['--maxkb=500']
      - id: detect-private-key
  
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks  # secret scanning
  
  - repo: local
    hooks:
      - id: lint
        name: Lint
        entry: npm run lint  # adjust для своего stack
        language: system
        pass_filenames: false
      
      - id: typecheck
        name: Type check
        entry: npm run typecheck
        language: system
        pass_filenames: false
```

**Setup once:**
```bash
pip install pre-commit
pre-commit install
pre-commit install --hook-type commit-msg  # для commit message validation
```

### 6.2 Commit message hook

Validate Conventional Commits format. `.pre-commit-config.yaml` addition:

```yaml
  - repo: https://github.com/compilerla/conventional-pre-commit
    rev: v3.0.0
    hooks:
      - id: conventional-pre-commit
        stages: [commit-msg]
        args: ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert']
```

### 6.3 NEVER use `--no-verify`

```bash
# FORBIDDEN
git commit --no-verify -m "..."
git push --no-verify
```

Bypassing hooks defeats their purpose. If hooks blocking legitimate work — **fix the hook**, not bypass it.

Add to `.claude/settings.json` deny list:
```json
"deny": ["Bash(git commit*--no-verify*)", "Bash(git push*--no-verify*)"]
```

### 6.4 CI/CD baseline

Every push to PR triggers:

1. **Lint** — code style consistency
2. **Type check** — type safety
3. **Tests** — unit + integration
4. **Build** — verify deployable
5. **Secret scan** — backup for pre-commit (catches push-time leaks)

PR cannot merge if any fail. Branch protection enforces.

Optional but recommended:
- **Coverage check** — minimum threshold (don't lower over time)
- **Dependency vulnerability scan** — `npm audit`, `pip-audit`
- **Performance regression check** — для performance-critical paths
- **Bundle size check** — для frontend

### 6.5 Auto-merge bots (optional)

For repetitive PRs (Dependabot updates, doc fixes), use auto-merge after CI green.

NOT for:
- Feature PRs
- Anything touching core logic
- AI-generated code (always require explicit human merge)

---

## 7. Templates

### 7.1 Commit message template

`.gitmessage`:

```
# <type>(<scope>): <subject>          (≤ 72 chars, imperative, no period)
#
# <body — what and why, wrap at 72>
#
# <footer — issue refs, breaking changes, co-authors>
#
# Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
# Add ! after type (or 'BREAKING CHANGE:' footer) for breaking changes
```

Configure git to use:
```bash
git config commit.template .gitmessage
```

### 7.2 PR template

`.github/pull_request_template.md`:

```markdown
## What

<!-- One paragraph: what does this PR do? -->

## Why

<!-- Context: why is this needed? Link to issue. -->

Closes #

## How

<!-- Brief description of approach. Trade-offs considered. -->

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests pass
- [ ] Manual test steps:
  1. ...
  2. ...

## Screenshots / Examples

<!-- If UI change или new behavior, show before/after -->

## Checklist

- [ ] Conventional Commits format в commit messages
- [ ] Atomic commits (each commit = one logical change)
- [ ] Self-reviewed in "Files changed" tab
- [ ] CI passing
- [ ] Documentation updated (если applicable)
- [ ] No new lint warnings
- [ ] No secrets committed
- [ ] Breaking changes documented (если applicable)

## Reviewer notes

<!-- Anything specific to look at? Areas of uncertainty? -->
```

### 7.3 Issue templates

`.github/ISSUE_TEMPLATE/bug.md`:

```markdown
## Bug description
<!-- What happened? What did you expect? -->

## Reproduction
1. ...
2. ...

## Environment
- OS: 
- Version: 

## Logs / Screenshots
```

`.github/ISSUE_TEMPLATE/feature.md`:

```markdown
## Problem
<!-- What problem does this solve? -->

## Proposed solution
<!-- How could we solve it? -->

## Alternatives considered

## Additional context
```

---

## 8. .gitignore essentials

Baseline `.gitignore`:

```gitignore
# Dependencies
node_modules/
__pycache__/
*.pyc
venv/
.venv/

# Build artifacts
dist/
build/
*.egg-info/
.next/
.nuxt/

# IDE/editor
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json.example
.idea/
*.swp
*.swo
.DS_Store

# Logs
*.log
logs/

# Env / secrets
.env
.env.local
.env.*.local
*.pem
*.key

# Claude Code
.claude/worktrees/
.claude/sessions/
.claude/.cache/

# Test/coverage
coverage/
.nyc_output/
.pytest_cache/

# OS
Thumbs.db
.DS_Store
```

**Project-specific additions** идут в commit `chore: add X to gitignore` separately.

---

## 9. Forbidden operations (hard rules)

These trigger immediate concern — agent or human must NEVER do без explicit approval:

| Operation | Why forbidden |
|---|---|
| `git push --force` (any branch) | Use `--force-with-lease` |
| `git push --force-with-lease origin main` | Main branch immutable history |
| `git push origin main` direct | Always через PR |
| `git commit --no-verify` | Bypasses safety hooks |
| `git push --no-verify` | Same |
| Deleting tags | Tags are immutable historical refs |
| `git filter-branch` или history rewrite на shared branches | Catastrophic for collaborators |
| `rm -rf .git/` | Obvious |
| Committing secrets, even briefly | Stays in history forever, must rotate keys |
| Committing `node_modules/` или другой build output | Pollutes history, slows operations |
| `--allow-empty` commits | No legitimate use case in normal workflow |

**Embedded в `.claude/settings.json` deny list** для AI safety:
```json
"deny": [
  "Bash(git push*--force*)",
  "Bash(git push origin main*)",
  "Bash(git commit*--no-verify*)",
  "Bash(git push*--no-verify*)",
  "Bash(rm -rf .git*)",
  "Bash(git filter-branch*)",
  "Bash(git tag -d*)",
  "Bash(git push*--delete*tag*)"
]
```

---

## 10. Recovery operations

When things go wrong, these are safe recovery patterns. Memorize them:

### 10.1 Undo

```bash
# Undo last commit, KEEP changes (in working dir)
git reset --soft HEAD~1

# Undo last commit, KEEP changes (staged)
git reset HEAD~1

# Undo last commit, DISCARD changes (DESTRUCTIVE)
git reset --hard HEAD~1

# Undo specific commit (creates new "undo" commit, safe для shared branches)
git revert <commit-hash>

# Fix last commit message
git commit --amend -m "new message"

# Add forgotten file to last commit
git add forgotten-file
git commit --amend --no-edit
```

### 10.2 Recover lost commits

```bash
# See all recent HEAD positions (lifesaver)
git reflog

# Recover commit shown в reflog
git checkout <sha-from-reflog>
git checkout -b recovered-work
```

### 10.3 Stash (temporary save)

```bash
# Save uncommitted changes
git stash push -m "WIP description"

# List stashes
git stash list

# Apply latest stash
git stash pop

# Apply specific stash
git stash apply stash@{2}

# Drop stash without applying
git stash drop stash@{2}
```

### 10.4 Recover from bad rebase/merge

```bash
# If rebase went wrong — abort
git rebase --abort

# If merge went wrong — abort
git merge --abort

# After completed bad operation — use reflog
git reflog
git reset --hard HEAD@{5}   # to specific reflog entry
```

---

## 11. AI-specific gotchas

Patterns observed в AI-agentic development that need explicit guardrails:

### 11.1 Plausible-but-wrong code

AI sometimes generates code that **compiles, looks reasonable, but is subtly broken**. Examples:
- Off-by-one errors in pagination
- Wrong async/await placement
- Implicit type coercion bugs

**Mitigation:**
- Self-review every diff line (§ 3.6)
- Tests must cover edge cases, не только happy path
- For critical paths: second AI agent reviews independently (§ 5.6)

### 11.2 Phantom file references

AI references files that don't exist or imports that aren't installed.

**Mitigation:**
- TypeScript strict mode catches import errors
- Pre-commit hook runs typecheck
- CI runs full build

### 11.3 Outdated patterns

AI training data has cutoff. New library versions may have different APIs.

**Mitigation:**
- Pin dependency versions explicitly
- When AI suggests pattern — verify against current docs если doubt
- CLAUDE.md should specify "use X version of Y library"

### 11.4 Context drift in long sessions

Long sessions cause AI to forget earlier decisions.

**Mitigation:**
- Periodically `/clear` или start fresh session для new tasks
- Keep CLAUDE.md updated с decisions taken
- For multi-day work — start each day re-reading CLAUDE.md + recent commits

### 11.5 Confident commits to wrong branch

AI may commit to `main` if checked out там, ignoring rule.

**Mitigation:**
- Branch protection on `main` — server-side enforcement
- `.claude/settings.json` deny list (§ 9)
- Pre-commit hook checks current branch isn't protected

### 11.6 Over-engineering simple tasks

AI sometimes implements 5-step solution to 1-step problem.

**Mitigation:**
- Plan Mode для complex tasks (forces explicit plan)
- "Challenge Claude" pattern (§ 5.8) — ask if simpler solution exists
- Code review specifically для over-engineering

---

## 12. Practical command reference

Most commonly needed commands в этом workflow:

### Daily

```bash
# Start of day
git checkout main && git pull
git checkout -b feature/today-task

# During work
git status                    # what's changed
git diff                      # unstaged diff
git diff --staged             # staged diff
git add -p                    # interactive staging (prefer over `git add .`)
git commit                    # opens editor with template

# Stay synced with main (frequently!)
git fetch origin
git rebase origin/main        # while on feature branch

# Push
git push -u origin HEAD       # first push на новой branch
git push                      # subsequent pushes
git push --force-with-lease   # после rebase (NEVER --force)

# Open PR
gh pr create
gh pr view --web              # open PR in browser

# After merge
git checkout main && git pull
git branch -d feature/today-task
```

### Investigation

```bash
git log --oneline -20         # recent commits, brief
git log --graph --oneline --all  # visual branch graph
git log -p <file>             # full diff history of file
git blame <file>              # who changed each line and when
git show <commit>             # full commit details
git diff main...HEAD          # what's in current branch vs main
```

### CI / branch info

```bash
gh run list                   # recent CI runs
gh run watch                  # watch current run
gh pr status                  # status of all your PRs
gh pr checks                  # CI status of current PR
git branch --merged main      # branches merged to main (safe to delete)
```

---

## 13. Quick decision matrix

| Situation | Action |
|---|---|
| Need to start new work | New branch from main |
| Made changes, want to commit | `/commit` slash command (or manual) |
| Branch behind main | `git fetch && git rebase origin/main` |
| Wrong commit message | `git commit --amend` (если not pushed) или fixup commit (если pushed) |
| Want to ditch all uncommitted changes | `git reset --hard HEAD` (DESTRUCTIVE — last warning) |
| Accidentally committed secret | Rotate secret immediately, then `git filter-repo` or BFG (with team coordination) |
| Need to revert merged PR | `git revert <merge-commit>` then PR |
| CI failed | Check logs, fix locally, push fix commit (don't amend pushed commits) |
| PR has merge conflict | Rebase locally: `git rebase origin/main`, resolve, force-push-with-lease |
| Lost commit | `git reflog` — almost always recoverable |
| Want to try risky operation | Create backup branch first: `git branch backup-before-experiment` |

---

## 14. Sources

Industry references this document is built on:

1. **Conventional Commits 1.0.0** — https://www.conventionalcommits.org
2. **Semantic Versioning 2.0.0** — https://semver.org
3. **Trunk-Based Development** — https://trunkbaseddevelopment.com
4. **GitHub Flow** — https://docs.github.com/en/get-started/quickstart/github-flow
5. **pre-commit framework** — https://pre-commit.com
6. **Claude Code Common Workflows** — https://docs.claude.com/en/docs/claude-code/common-workflows
7. **awattar/claude-code-best-practices** — slash commands и agents patterns
8. **shanraisshan/claude-code-best-practice** — AI-agentic engineering practices
9. **netresearch/git-workflow-skill** — git skill for Claude Code

---

## 15. TL;DR — golden rules

If you remember nothing else, remember these 10:

1. **Main branch is sacred.** PR + CI green only. Never force-push.
2. **Atomic commits.** One logical change per commit. Если "and" — split.
3. **Conventional Commits.** `type(scope): subject` format всегда.
4. **Short-lived branches.** 1-3 days. Long branches = merge hell.
5. **Squash merge.** Linear history. PR title becomes commit message.
6. **Self-review before requesting review.** Especially для AI-generated code.
7. **Pre-commit hooks mandatory.** Never `--no-verify`.
8. **CLAUDE.md + settings.json + .claude/commands/** — invest in these.
9. **Plan mode для complex tasks.** Don't let AI start coding без plan.
10. **`git reflog` is your safety net.** Almost any mistake recoverable.

---

*This document is the law for this repo. AI agents must follow. Humans must follow. Updates only через `chore(git-rules):` PR с justification.*
