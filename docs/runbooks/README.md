# Runbooks

Operational procedures for MCPGen. Runbooks are step-by-step playbooks for
recurring operational tasks; each one cites the deciding rule (decision /
threat / pitfall) so the "why" is auditable.

## Index

| Runbook                                                  | Purpose                                                                                  | Trigger                                                |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [logto-pro-upgrade.md](./logto-pro-upgrade.md)           | T-1-06 mitigation: pre-buy Logto Pro tier at W7 to avoid MAU-cap lock at viral launch    | Calendar entry W7 (one week before public launch)     |
| [migration-conflicts.md](./migration-conflicts.md)       | T-1-04 mitigation: Drizzle migration filename collision (Pitfall #18)                    | When CI `drizzle-kit check` fails on a PR              |
| [friday-demo-cadence.md](./friday-demo-cadence.md)       | OPS-01: weekly demo discipline (anti-velocity-death-spiral)                              | Every Mon–Fri (recording) + Friday EOD (editing)       |
| [per-phase-fresh-session.md](./per-phase-fresh-session.md) | OPS-03: plan-file `MUST re-read before starting` header convention (anti-context-drift) | Plan authoring + plan review                           |

## Plan-file fresh-session header (OPS-03)

Every plan file (`.planning/phases/*/*-PLAN.md`) MUST include in its
`<context>` section a re-read header. Full convention in
[`per-phase-fresh-session.md`](./per-phase-fresh-session.md). Minimum form:

```markdown
# MUST re-read before starting (OPS-03)
@CLAUDE.md
@docs/mcpgen-architecture.md
@docs/<relevant-pass-or-stage>-design.md
```

This convention defends Pitfall #28 (context drift across fresh Claude
sessions). Each engine phase starts with a re-read so the agent has fresh
context every session, every time.

## Adding a new runbook

1. Create the file in this directory with a `T-*-* / OPS-* / Pitfall #*`
   header citing the rule(s) it operationalises.
2. Add a row to the index above with the trigger condition.
3. If the runbook is referenced from elsewhere (RULES.md, a plan, an
   architecture doc), add a back-reference there too — runbooks are
   discovered, not searched.
