---
name: check_proj_docs
description: Verify any claim, design decision, behavior question, or spec interpretation against MCPGen project documentation as the single source of truth. Use this BEFORE coding, BEFORE answering "is this a bug or by design?", and BEFORE proposing changes that touch product behavior. Project docs override any assumption.
---

# check_proj_docs

> Default first read for any non-trivial question. The project's `docs/` and
> `claude-design-reference/canon/` are the absolute source of truth. Code can
> drift; docs are locked.

## When to invoke

Use this skill the moment any of the following is true:

1. The user asks "is this a bug or by design?"
2. You're about to claim "this is the expected behavior" for a UI / flow / pass / stage
3. You're about to write code that changes a product surface (UI flow, error message, validation rule, default value, threshold)
4. You're answering an architecture / capability question
5. You're about to disagree with the user about how something should work
6. You're unsure which of two implementations is correct
7. The user explicitly invokes `/check_proj_docs` or asks to "check the docs"

If you don't know whether a behavior matches the spec, you don't know — go read.

## Document precedence (highest wins on conflict)

Per `CLAUDE.md` §0 + §12:

```
RULES.md
  > docs/mcpgen-model-and-provider-override.md   (LLM model decisions)
  > docs/mcpgen-git-workflow-rules.md            (git workflow)
  > docs/mcpgen-feature-flags-contract.md        (feature toggles)
  > docs/mcpgen-gsd-sprint-plan.md               (sequencing / phases)
  > docs/mcpgen-pass-{0,1,2,3,4,5}-design.md     (per-pass detail)
  > docs/mcpgen-stage-{e,f}-design.md            (per-stage detail)
  > docs/mcpgen-generation-engine-v2.md          (engine pipeline)
  > docs/mcpgen-architecture.md                  (system architecture)
  > docs/mcpgen-implementation-plan.md           (launch criteria, risks)
  > docs/mcpgen-ux-flow.md                       (UX copy + principles)
  > claude-design-reference/canon/               (LOCKED visual design + flow)
  > docs/decisions/<date>-<slug>.md              (decision logs)
  > .planning/                                   (active phase planning)
```

When two docs disagree, the higher one wins. Surface the conflict to the user
if it's load-bearing for the decision.

## Required reading on first invocation

These are always relevant context:

1. `RULES.md` — hard rules + scope boundaries
2. `CLAUDE.md` — project memory (this is checked into the repo and is part of the context already)
3. The specific doc(s) for the topic at hand (use the precedence list above)

## Procedure

For any question, do the following — in this order, fully:

### Step 1 — Map the question to doc categories

Identify which docs are authoritative for this question. Examples:

- "Should /auth show for no-auth specs?" → `mcpgen-ux-flow.md` + `claude-design-reference/canon/screen-auth.*` + `docs/decisions/*auth-mode-none*` + `mcpgen-pass-0-design.md` (auth subsystem)
- "What should the LLM model be?" → `mcpgen-model-and-provider-override.md` (overrides everything)
- "Is X in scope for MVP?" → `mcpgen-implementation-plan.md` + `RULES.md`
- "How should Pass 2 handle X?" → `mcpgen-pass-2-design.md`
- "Should we git push --force?" → `mcpgen-git-workflow-rules.md`

### Step 2 — Read the relevant docs

Read the docs FULLY for the relevant section. Don't grep for keywords and bail
out — read enough surrounding context to understand intent. The docs are
written as design contracts; partial reads miss invariants.

### Step 3 — Cross-check against canon

If the question touches UI / UX, also verify against
`claude-design-reference/canon/` (the locked design files). Canon is the
visual + flow source of truth. Code that diverges from canon is a bug,
not "the intended behavior".

### Step 4 — Cite specifics

When you answer, cite:
- Doc path
- Line numbers (or section heading)
- The exact rule / quote that applies

Format:
```
docs/mcpgen-pass-0-design.md §2.4 (line 187):
  "auth_modes=['none'] when every endpoint has empty security requirements"
```

### Step 5 — State the verdict

After citing, give a clear verdict:
- **MATCHES** — current behavior aligns with docs
- **VIOLATES** — current behavior contradicts docs (bug)
- **GAP** — docs don't cover this case (decision needed; flag to user, don't
  improvise without consent)
- **CONFLICT** — two docs disagree (cite both, apply precedence rule)

### Step 6 — Action

- If MATCHES — no change needed, move on
- If VIOLATES — propose fix, citing doc lines that justify it
- If GAP — STOP, ask the user. Don't guess on uncovered behavior
- If CONFLICT — apply precedence, note in your reply which doc you followed

## Anti-patterns (do NOT do)

1. Answering from memory / inference without opening the docs
2. Reading only one doc when two could disagree
3. Making up "intended behavior" because the code does X
4. Citing without line numbers (un-verifiable)
5. Treating decision logs as authoritative if they predate a higher-precedence doc
6. Skipping canon when the question touches UI

## Anti-pattern in practice

❌ Wrong:
> "I think the AUTH screen should appear for all auth modes — that's how the
> flow is set up."

✅ Right:
> "Per `claude-design-reference/canon/screen-auth.jsx` lines 3–33 the
> `AUTH_TYPES` registry only defines apikey/basic/oauth/hmac. There is NO
> 'none' entry. Per `docs/decisions/2026-05-03-auth-mode-none.md` lines
> 39–59, when `auth_modes=['none']` the spec is unauthenticated and the
> generated worker emits a no-op middleware. Together: the AUTH screen
> should be skipped entirely for unauth specs. Current code at
> `apps/web/src/app/generate/[jobId]/auth/page.tsx:56-90` falls back to
> 'apikey' instead — this is a VIOLATION of canon. Fix: redirect to
> `/[jobId]` (stream) when `auth_modes` is empty or contains only 'none'."

## Quick-reference: where to find what

| Question topic | Authoritative doc |
|---|---|
| LLM model / provider | `docs/mcpgen-model-and-provider-override.md` |
| Git workflow / commits / PRs | `docs/mcpgen-git-workflow-rules.md` |
| Feature flags / runtime toggles | `docs/mcpgen-feature-flags-contract.md` |
| Phase order / parallelization | `docs/mcpgen-gsd-sprint-plan.md` |
| Pass 0 (filter, naming, auth) | `docs/mcpgen-pass-0-design.md` |
| Pass 1 (Six-Tool Pattern) | `docs/mcpgen-pass-1-design.md` |
| Pass 2 (descriptions) | `docs/mcpgen-pass-2-design.md` |
| Pass 3 (parameters) | `docs/mcpgen-pass-3-design.md` |
| Pass 4 (annotations) | `docs/mcpgen-pass-4-design.md` |
| Pass 5 (response shaping) | `docs/mcpgen-pass-5-design.md` |
| Stage E (codegen) | `docs/mcpgen-stage-e-design.md` |
| Stage F (validation) | `docs/mcpgen-stage-f-design.md` |
| System architecture | `docs/mcpgen-architecture.md` |
| Pipeline overview | `docs/mcpgen-generation-engine-v2.md` |
| MVP scope / launch criteria | `docs/mcpgen-implementation-plan.md` |
| UX copy / principles | `docs/mcpgen-ux-flow.md` |
| UI visual / flow (LOCKED) | `claude-design-reference/canon/` |
| Specific decisions / rationale | `docs/decisions/*.md` |
| Active phase planning | `.planning/` |

## Output format

Always finish a `check_proj_docs` invocation with:

1. **Question recap** (1 line)
2. **Docs consulted** (bulleted list of paths)
3. **Citations** (path + line + quote)
4. **Verdict** (MATCHES / VIOLATES / GAP / CONFLICT)
5. **Recommended action** (1–3 lines)
