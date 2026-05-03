---
name: deploy-local
description: Bring up the full MCPGen local stack (web + api + engine + Flipt) via docker-compose for end-to-end testing. Use when the user wants to "deploy locally", "run the stack", "test locally", or asks how to start everything for testing. NOT for production — that's /deploy-dev (CF Workers + Fly + Vercel preview) or /deploy-prod (production).
---

# /deploy-local — bring up the full local stack for testing

This is the **local-only** deploy. It uses `docker-compose.dev.yml` to spin
up four services on the user's machine, talking to cloud Logto, Neon,
OpenRouter, and Stripe (test mode) over the public internet. No Cloudflare,
no Fly, no Vercel involved. Use this for end-to-end manual smoke testing.

The companion skills `/deploy-dev` (preview environments via CF Workers +
Fly Machines + Vercel preview) and `/deploy-prod` (production) are NOT yet
implemented. If the user asks about those, point them to
`.planning/phase-rebuild/DEPLOY-AUTOMATION-RESEARCH.md` for the planned
roadmap, then proceed with `/deploy-local` if they want to test locally.

## Inputs

- No args expected. If the user passes any sub-flag (e.g. `--rebuild`,
  `--logs`, `--down`, `--nuke`), interpret it per the operations table
  below.

## Pre-flight checklist (run silently first; report only blockers)

Before starting docker, verify each of the following. If any fails, STOP
and tell the user exactly which one and how to fix it. Do NOT auto-fix
secrets or tear down their existing work without permission.

1. **Docker Desktop / Engine running.**
   ```bash
   docker compose version
   ```
   If this fails, instruct: "Start Docker Desktop and re-run /deploy-local."

2. **Required secret files present.**
   - `apps/web/.env.local` — must exist and contain `LOGTO_*`, `DATABASE_URL`,
     `OPENROUTER_API_KEY`, `STRIPE_*` keys at minimum.
   - `apps/api/.dev.vars` — must exist and contain
     `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` plus the
     same `LOGTO_*` keys.

   Quick check:
   ```bash
   test -f apps/web/.env.local && test -f apps/api/.dev.vars && echo "ok" || echo "missing"
   ```

   If missing, instruct the user to copy the template:
   `cp apps/web/.env.example apps/web/.env.local` and fill in the values
   (Logto Cloud dashboard, Neon dashboard, OpenRouter dashboard, Stripe
   dashboard). Do NOT proceed.

3. **Required ports free** (3000, 8000, 8090, 8787, 9001).
   ```bash
   lsof -nP -i :3000 -i :8000 -i :8090 -i :8787 -i :9001 2>&1 | grep LISTEN
   ```
   If anything is bound (most commonly `next dev`, `wrangler dev`, or
   `uvicorn` from a previous host-mode session), ask the user before
   killing them. If they confirm, kill by PID. Common offenders:
   - `next dev` — usually safe to kill (unsaved component state lost)
   - `wrangler dev` / `workerd` — safe to kill
   - `uvicorn mcpgen_engine` — safe to kill
   - **NOT** safe to kill: any `OrbStack` or `Docker` daemon process —
     those are the docker engine itself.

4. **Existing `mcpgen-flipt` container** (legacy from the old
   `docker-compose.yml` flipt-only stack).
   ```bash
   docker ps -a --filter name=mcpgen-flipt --format '{{.Names}} {{.State}}'
   ```
   If it shows "running" with the OLD flipt-only setup, stop and remove it
   so the new compose can claim the name:
   ```bash
   docker stop mcpgen-flipt && docker rm mcpgen-flipt
   ```
   Flipt YAML history persists in the named volume (`mcpgen_flipt_data`),
   so flag definitions survive.

## Default operation: bring up the stack

```bash
cd /Users/igor/Projects/mcpgen
pnpm dev:docker:up
```

This is `docker compose -f docker-compose.dev.yml up -d --build`. First run
takes 3–6 minutes (image build + `pnpm install --frozen-lockfile` inside the
web/api containers + `uv sync` for the engine). Subsequent runs are ~30s.

After `up` returns, poll for readiness — the containers are "Started" but
not actually serving until the inner dev servers boot:

```bash
# Wait until web responds (means pnpm install + next dev finished)
until curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null | grep -qE "^[2-3]"; do
  sleep 5
done
```

Use the `Bash` tool with `run_in_background: true` for the wait loop so the
user isn't blocked. Then health-check all four endpoints:

```bash
curl -s -o /dev/null -w "web    :3000  %{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "api    :8787  %{http_code}\n" http://localhost:8787/api/v1/health
curl -s -o /dev/null -w "engine :8000  %{http_code}\n" http://localhost:8000/health
curl -s -o /dev/null -w "flipt  :8090  %{http_code}\n" http://localhost:8090/health
```

All four should return `2xx`. Report the table to the user.

## First-time-only: bootstrap Flipt flags

If `mcpgen_flipt_data` volume is brand new (first ever `up` or after a
`/nuke`), the Flipt namespace is empty and every flag evaluation returns
the default value, which usually means "feature OFF." Push the YAML:

```bash
pnpm dev:docker:bootstrap-flags
```

Detect this by checking whether at least one expected flag exists:

```bash
curl -s -X POST http://localhost:8090/evaluate/v1/boolean \
  -H 'Content-Type: application/json' \
  -d '{"namespaceKey":"default","flagKey":"ui_auth_password_perm","entityId":"anonymous"}' \
  | grep -q '"enabled"' && echo "flags ok" || echo "needs bootstrap"
```

If "needs bootstrap", run `pnpm dev:docker:bootstrap-flags` and re-verify.

## Sub-operations

Map the user's wording to the right pnpm script:

| User intent                        | Command                            |
|------------------------------------|------------------------------------|
| "start", "up", "deploy"            | `pnpm dev:docker:up`               |
| "stop", "down", "shutdown"         | `pnpm dev:docker:down`             |
| "wipe", "reset", "nuke", "clean"   | `pnpm dev:docker:nuke` (CONFIRM!)  |
| "logs", "tail", "watch"            | `pnpm dev:docker:logs`             |
| "status", "ps", "what's running"   | `pnpm dev:docker:ps`               |
| "rebuild after dep change"         | `pnpm dev:docker:up` (--build is implicit) |
| "push flag changes"                | `pnpm dev:docker:bootstrap-flags`  |

`nuke` drops all named volumes, including Flipt's `mcpgen_flipt_data` (flag
history) and the cached `node_modules` / `.next` volumes. Before running
nuke, ask the user explicitly: "This wipes Flipt flag history and forces
fresh `pnpm install` on next up (~5 min). Confirm?"

## Smoke test (after `up` is healthy)

If the user wants verification beyond health-checks, walk this script:

```bash
# 1. Landing reachable
curl -s http://localhost:3000/ | grep -oE 'production MCP|make it' | head -2

# 2. Auth screen reachable (canon embedded — NOT Logto Hosted UI)
curl -s http://localhost:3000/sign-in | grep -oE 'welcome back|create account' | head -2

# 3. Settings auth-gated (should 307 → /sign-in)
curl -s -o /dev/null -w "settings -> %{http_code}\n" http://localhost:3000/settings

# 4. BFF anon health (no auth required)
curl -s http://localhost:8787/api/v1/health 2>/dev/null | head -3

# 5. Engine ping
curl -s http://localhost:8000/health
```

If any step fails, tail the relevant container log:
```bash
docker compose -f docker-compose.dev.yml logs --tail=50 web    # or: api / engine / flipt
```

## When things go wrong

The most common failures and their fixes (try in this order):

1. **`up` exits immediately with "port already in use"** — pre-flight check 3
   missed something. Re-run `lsof -nP -i :3000 -i :8000 -i :8090 -i :8787 -i :9001`,
   kill the offender, retry.

2. **Web is up but shows blank page / 502** — TS error during initial
   compile. `docker compose -f docker-compose.dev.yml logs --tail=100 web`
   to see the trace, fix the source (live-mounted, no rebuild needed),
   wait for fast-refresh.

3. **`pnpm install` hangs > 5 min on first up** — slow network downloading
   from npm registry. If it's been > 8 min, `pnpm dev:docker:nuke` and
   retry. The `pnpm-store` named volume caches packages so subsequent ups
   are fast.

4. **Engine returns 502** — `uv sync` is still compiling Python wheels in
   the engine image build. First build takes ~3 min. `docker compose -f
   docker-compose.dev.yml logs engine` to confirm it's progressing.

5. **Auth flows to Logto fail** — `LOGTO_M2M_APP_ID` / `LOGTO_M2M_APP_SECRET`
   not set in `apps/web/.env.local`. Embedded sign-in works without M2M
   creds for the SDK side, but the BFF account profile endpoints
   (`PATCH /api/v1/account/profile`) require M2M. Direct the user to
   their Logto Cloud dashboard → Applications → create M2M app → copy
   secrets to `.env.local`.

6. **Flag evaluation returns defaults instead of YAML values** — Flipt
   wasn't bootstrapped. Run `pnpm dev:docker:bootstrap-flags`.

## Hot-reload behavior to know

| Service | What edits trigger reload?                           |
|---------|------------------------------------------------------|
| web     | Any TS/TSX/CSS edit in `apps/web/src/`              |
| api     | Any TS edit in `apps/api/src/`                      |
| engine  | NOTHING — image rebuild needed (`up --build engine`)|
| flipt   | Edit `packages/feature-flags/default/features.yaml` then `pnpm dev:docker:bootstrap-flags` |

For tight Python iteration on the engine, recommend the user stop the
engine container and run uvicorn on the host in `--reload` mode:

```bash
docker compose -f docker-compose.dev.yml stop engine
cd apps/generation-engine
uv run uvicorn mcpgen_engine.main:app --reload --host 0.0.0.0 --port 8000
```

The dockerized api/web will hit it via `host.docker.internal:8000` only if
you also override the api container's `ENGINE_ENDPOINT` env at startup —
in practice this is rare enough that the simpler "rebuild engine image"
loop is fine for most edits.

## What this skill explicitly does NOT do

- Does not deploy to Vercel, CF Workers, or Fly. That's `/deploy-dev` and
  `/deploy-prod` (not yet implemented).
- Does not run database migrations (Drizzle). Migrations apply on
  production deploy via the GitHub Actions workflow planned for Phase 10.
  For local dev, schema changes are applied by the developer manually:
  `cd infrastructure/neon && pnpm drizzle-kit push:pg`.
- Does not seed Stripe products / webhook endpoints. That's a one-time
  founder action — not stack-startup state.
- Does not register Inngest functions with Inngest Cloud. Inngest in dev
  mode auto-discovers via the local Inngest dev server (`pnpm
  --filter @mcpgen/api dev:inngest`); production registration is a
  Phase-10 deploy step.

## Source of truth

- `docker-compose.dev.yml` at repo root
- `infrastructure/docker/Dockerfile.node-dev` — node base image
- `apps/generation-engine/Dockerfile` — engine image (also used for Fly)
- `infrastructure/docker/README.md` — operator-facing detailed docs
- `package.json` — `dev:docker:*` script set
- Roadmap to `/deploy-dev` + `/deploy-prod`:
  `.planning/phase-rebuild/DEPLOY-AUTOMATION-RESEARCH.md`
