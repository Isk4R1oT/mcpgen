# Per-Phase Fresh-Session Header Convention (OPS-03)

**Decision drivers:** OPS-03, RESEARCH §Pitfall #28 (context drift across
fresh Claude sessions), CLAUDE.md §12 ("Workflow для Claude").

## Why this exists

Each engine phase is large enough that a single Claude session frequently
exhausts context partway through execution, requiring a fresh-session
restart. Without a re-read header, the resumed session loses architectural
context and silently drifts (using stale Pass-1 logic, forgetting the
six-tool invariant, mis-naming tools, etc.).

The fresh-session header makes the re-read **mandatory and grep-verifiable**.

## The convention

Every plan file (`.planning/phases/*/*-PLAN.md`) MUST include the following
block in its `<context>` section, near the top — before per-plan-specific
context:

```markdown
# MUST re-read before starting (OPS-03)
@CLAUDE.md
@docs/mcpgen-architecture.md
@docs/<relevant-pass-or-stage>-design.md
```

The `@`-references are GSD's auto-include syntax: the executor agent reads
the file content as part of its initial context, every session, every time.

## Required entries (always)

- `@CLAUDE.md` — project navigation + conflict-resolution rules
- `@docs/mcpgen-architecture.md` — system layers + frozen tech stack

## Conditional entries (per phase area)

| Phase work area              | Add to header                                          |
| ---------------------------- | ------------------------------------------------------ |
| Engine Pass 0 (Inventory)    | `@docs/mcpgen-pass-0-design.md`                        |
| Engine Pass 1 (Six-Tool)     | `@docs/mcpgen-pass-1-design.md`                        |
| Engine Pass 2 (Description)  | `@docs/mcpgen-pass-2-design.md`                        |
| Engine Pass 3 (Parameters)   | `@docs/mcpgen-pass-3-design.md`                        |
| Engine Pass 4 (Annotations)  | `@docs/mcpgen-pass-4-design.md`                        |
| Engine Pass 5 (Response)     | `@docs/mcpgen-pass-5-design.md`                        |
| Stage E (Codegen)            | `@docs/mcpgen-stage-e-design.md`                       |
| Stage F (Validation)         | `@docs/mcpgen-stage-f-design.md`                       |
| LLM model decisions          | `@docs/mcpgen-model-and-provider-override.md`          |
| Git workflow / branching     | `@docs/mcpgen-git-workflow-rules.md`                   |
| Multi-terminal sequencing    | `@docs/mcpgen-gsd-sprint-plan.md`                      |
| UX copy / principles         | `@docs/mcpgen-ux-flow.md`                              |

## Why this works

- The `@`-include is read **every session** (not cached across sessions). A
  resumed agent sees the latest doc, not its training-data version.
- Plan-time review catches missing headers before execution starts (the
  `gsd-plan-checker` agent flags any plan that has new pass/stage references
  in its actions but no matching header entry).
- Authors who add a new design doc must update both the plan that consumes
  it AND the runbook table above — the table is the single source of
  truth for which doc is required for which work area.

## How violations are caught

- **Plan time:** `gsd-plan-checker` greps each plan's `<context>` block for
  `MUST re-read before starting` and rejects plans missing the header.
- **Review time:** PR review checklist includes "MUST re-read header
  present and matches phase area".
- **Execution time:** The executor agent's first action on a plan with the
  header is to log the @-included files; if any file path is broken, the
  log surfaces the missing reference immediately.

## Migration of existing plans

Plans 01-01 through 01-07 already include the header (`grep -l "MUST re-read"
.planning/phases/01-foundation/*-PLAN.md`). New plans MUST include it. A
PR that omits the header is a conventional review-blocker, not a CI-blocker
— the policy lives in code review, not a hook, because edge cases (e.g.,
research-only plans that don't execute code) reasonably skip it.
