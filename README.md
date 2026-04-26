# MCPGen

> From any API to production-ready MCP in 60 seconds — token-optimized by default.

MCPGen is a generator of production-ready [Model Context Protocol](https://modelcontextprotocol.io/) servers from any API spec (OpenAPI / GraphQL / Postman). It applies the full set of Anthropic best practices (Six-Tool Pattern, paper-rubric description components, MCP tool annotations, response shaping) and validates each generated server with a real agent before deploy.

## Status

**Phase 1 — Foundation (in progress).** This is an empty-but-deployable monorepo skeleton. Apps and packages are added in subsequent plans (01-02 through 01-08). See `.planning/ROADMAP.md` for the full phase plan.

## Quickstart

```sh
pnpm install
pnpm -r build
pnpm -r test
```

Requires Node.js 22+ and pnpm 10+. See `.nvmrc` and `package.json` `engines`.

## Documentation

The single source of truth for this project lives in `docs/`. The two operational entry points are:

- [`CLAUDE.md`](CLAUDE.md) — operational map across all `docs/`, primary entry point for AI agents and humans alike.
- [`RULES.md`](RULES.md) — hard non-negotiable rules (product / engine / architecture / security / operating / scope).

Detail-design docs live in `docs/`:

- `docs/mcpgen-architecture.md` — system-level architecture
- `docs/mcpgen-generation-engine-v2.md` — engine pipeline
- `docs/mcpgen-pass-{0,1,2,3,4,5}-design.md` — six pass-level detail designs
- `docs/mcpgen-stage-{e,f}-design.md` — codegen + validation detail designs
- `docs/mcpgen-model-and-provider-override.md` — single-model override (`qwen/qwen3-coder` via OpenRouter)
- `docs/mcpgen-git-workflow-rules.md` — branching, commits, PRs, recovery
- `docs/mcpgen-gsd-sprint-plan.md` — 10-phase parallel multi-terminal execution plan

The locked design lives in `claude-design-ui/` — visual / layout / typography / copy must NOT be modified.

## Repository Layout

```
mcpgen/
├── apps/                    # (added by Plans 01-05, 01-06)
├── packages/                # (added by Plans 01-03, 01-04)
│   └── shared-config/       # ESLint / Prettier / tsconfig / vitest presets
├── infrastructure/          # (added by Plan 01-04)
├── docs/                    # source of truth
├── claude-design-ui/        # locked frontend design (DO NOT modify)
└── .planning/               # GSD planning artifacts
```

## License

TBD.
