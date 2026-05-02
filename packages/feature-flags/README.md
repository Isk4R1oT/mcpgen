# MCPGen — Feature Flags

> Source of truth: [`docs/mcpgen-feature-flags-contract.md`](../../docs/mcpgen-feature-flags-contract.md)
>
> This package contains flag **definitions** consumed by Flipt v2. SDK
> integration code lives in `packages/runtime-sdk/src/flags/` (TS) and
> `apps/generation-engine/src/mcpgen_engine/flags.py` (Python).

## Layout

```
feature-flags/
├── default/                # local dev — Flipt picks this up via docker-compose
│   ├── features.yaml       # flag definitions
│   └── segments.yaml       # segment definitions (copied from _shared/)
├── staging/                # not used yet — Phase 10 staging environment
├── production/             # Phase 10 production environment
├── _shared/
│   └── segments.yaml       # canonical segments (mirrored into each env on update)
├── _manifest/
│   └── flags.yaml          # extended metadata (owner, category, removal date)
└── _archive/               # decommissioned flags (with post-rollout report)
```

## Quickstart

```bash
# 1. Start Flipt locally
docker compose up -d flipt

# 2. Open UI
open http://localhost:8090

# 3. Switch to "default" environment in the UI dropdown.
#    You should see the flags from default/features.yaml.

# 4. Edit a flag (e.g., toggle `ui_frontend_fixtures_mode_ops`):
#    - Either via the UI (Flipt commits the change to disk)
#    - Or by editing default/features.yaml directly + git commit
#    Flipt rebuilds state from disk every 10 seconds.
```

## Adding a flag

1. Pick a key per [contract §4.2](../../docs/mcpgen-feature-flags-contract.md):
   `{domain}_{thing}_{kill|rollout|exp|perm|ops}`
2. Add definition to `default/features.yaml` (and to staging/production when ready).
3. Add metadata to `_manifest/flags.yaml`. For `_rollout` / `_exp`, include
   `expected_removal_at` (90 days max for rollout, 60 days for exp).
4. Add eval call in code (TS or Python — see `packages/runtime-sdk/src/flags/`).
5. Self-review checklist per [contract §18](../../docs/mcpgen-feature-flags-contract.md).
6. Atomic commit: `feat(flags): add {flag_key}`.

## Removing a flag (`_rollout` / `_exp` cleanup)

Per [contract §5.3](../../docs/mcpgen-feature-flags-contract.md):

1. Verify rollout reached 100% and stable for 7+ days.
2. Open PR `chore(flags): remove {flag_key}`.
3. Delete from all `*/features.yaml`.
4. Delete from `_manifest/flags.yaml`.
5. Remove the eval call from code AND simplify the if-block.
6. Add a postmortem to `_archive/{year}/{flag_key}.md`.

## CI validation

`.github/workflows/feature-flags-validate.yml` runs on every PR touching
`packages/feature-flags/**`. Checks:

- Every flag in `*/features.yaml` has a matching entry in `_manifest/flags.yaml`.
- Every `_rollout` / `_exp` flag has `expected_removal_at` in the future.
- No orphan manifest entries (manifest references flag that doesn't exist).
- Naming convention (suffix matches category).

Run locally: `pnpm --filter @mcpgen/feature-flags validate`
