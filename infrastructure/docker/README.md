# Local dev stack — `docker-compose.dev.yml`

One command spins up the full local environment so you don't run 4 terminals
by hand.

## TL;DR

```bash
# First time (or after pulling new deps): builds images + installs deps inside containers.
pnpm dev:docker:up
pnpm dev:docker:bootstrap-flags    # one-time: push features.yaml → Flipt

# Tail logs (Ctrl-C to detach without stopping the stack)
pnpm dev:docker:logs

# Shut down (preserves volumes — Flipt history, node_modules cache, .next cache)
pnpm dev:docker:down

# Wipe everything (drops Flipt history, forces fresh install on next up)
pnpm dev:docker:nuke
```

Once `up`, browse:

| URL                          | Service                           |
|------------------------------|-----------------------------------|
| http://localhost:3000        | web (Next.js 15, hot-reload)      |
| http://localhost:8787        | api  (Hono BFF on wrangler dev)   |
| http://localhost:8000        | engine (FastAPI / uvicorn)        |
| http://localhost:8090        | Flipt UI + REST API               |
| http://localhost:9001        | Flipt gRPC (server-side eval)     |

## Prerequisites

- Docker Desktop (Mac/Win) or Docker Engine + Compose v2 (Linux). Verify:
  ```bash
  docker compose version    # must report v2.x
  ```
- The standard secret files filled in (these are `.gitignore`d):
  - `apps/web/.env.local` — full env (Neon, Logto, Stripe, OpenRouter, Sentry, etc.)
  - `apps/api/.dev.vars`  — wrangler-shape subset (Logto + Database)
- Free ports: **3000, 8000, 8090, 8787, 9001**. Anything bound on the host on
  those ports will block the corresponding container — check with
  `lsof -i :3000 -i :8000 -i :8090 -i :8787 -i :9001`.

## What's inside

Five services on a private compose network. Cross-service URLs use docker
network names (`http://api:8787`, `http://engine:8000`, `http://flipt:8080`),
overridden via the `environment:` block in `docker-compose.dev.yml` so any
`localhost` references in `.env.local` / `.dev.vars` don't leak.

```
        ┌──────────────┐
        │   Flipt v2   │  :8090 (UI/REST), :9001 (gRPC)
        │   (in-mem)   │
        └──────┬───────┘
               │
        ┌──────┴───────┐
        │    engine    │  :8000 (FastAPI / uvicorn / Python 3.12)
        │   (Dockerfile)│
        └──────┬───────┘
               │
        ┌──────┴───────┐
        │     api      │  :8787 (Hono BFF / wrangler dev)
        │   (node:22)   │
        └──────┬───────┘
               │
        ┌──────┴───────┐
        │     web      │  :3000 (Next.js 15 dev server)
        │   (node:22)   │
        └──────────────┘
```

External services hit directly from the containers (NOT in compose):

- Neon Postgres — `DATABASE_URL` in `.dev.vars` / `.env.local`
- Logto Cloud — `LOGTO_*` in `.env.local`
- OpenRouter — `OPENROUTER_API_KEY` in `.env.local`
- Stripe (test mode) — `STRIPE_*` in `.env.local`
- Langfuse Cloud (LLM traces) — `LANGFUSE_*` in `.env.local`

## Hot-reload model

| Service | Source bind-mounted? | Reload mechanism                                    |
|---------|----------------------|-----------------------------------------------------|
| web     | yes (`.:/app`)       | Next.js fast-refresh on file save                   |
| api     | yes (`.:/app`)       | wrangler `dev --ip 0.0.0.0` watcher rebuild         |
| engine  | NO (image rebuild)   | `docker compose ... up --build engine` after edits  |
| flipt   | named volume only    | `pnpm dev:docker:bootstrap-flags` after YAML edits  |

If you're iterating heavily on Python (the engine), prefer the host workflow
for that one service:

```bash
# In one terminal — keep the rest of the stack running in docker:
pnpm dev:docker:up
docker compose -f docker-compose.dev.yml stop engine

# In another terminal — run engine on the host with hot-reload:
cd apps/generation-engine
uv run uvicorn mcpgen_engine.main:app --reload --host 0.0.0.0 --port 8000
```

The compose `api` and `web` will reach the host engine via
`host.docker.internal:8000` if you also override `ENGINE_ENDPOINT` in the
api service:

```bash
docker compose -f docker-compose.dev.yml \
  run --rm -e ENGINE_ENDPOINT=http://host.docker.internal:8000 api
```

## node_modules strategy

The compose file mounts the repo root at `/app` (so source edits hot-reload),
and overlays a **named volume** at `/app/node_modules` and
`/app/apps/web/.next` for the web service (and equivalents for api). That
keeps:

- Container-installed dependencies (Linux/musl native binaries) inside the
  container, instead of clobbering the host's macOS/glibc binaries.
- The `.next` build cache inside the volume, so a `down` + `up` doesn't
  re-build the Next.js dev manifest from scratch.

First `up` triggers `pnpm install --frozen-lockfile --prefer-offline` inside
each container, hydrating the named volume. Subsequent ups reuse it.

To force a fresh install (e.g. after editing `pnpm-lock.yaml`):

```bash
pnpm dev:docker:nuke           # drops volumes
pnpm dev:docker:up             # re-installs from lockfile
```

## Common operations

```bash
# Run a one-off command inside a service container
docker compose -f docker-compose.dev.yml exec web pnpm tsc --noEmit
docker compose -f docker-compose.dev.yml exec api  pnpm vitest run
docker compose -f docker-compose.dev.yml exec engine pytest -x

# Open a shell in a service
docker compose -f docker-compose.dev.yml exec web sh
docker compose -f docker-compose.dev.yml exec engine bash

# Restart one service (after env-var change in .env.local)
docker compose -f docker-compose.dev.yml restart web

# Tail just one service's logs
docker compose -f docker-compose.dev.yml logs -f engine

# Push features.yaml changes to Flipt (after editing
# packages/feature-flags/default/features.yaml)
pnpm dev:docker:bootstrap-flags
```

## Why this isn't the production setup

This compose file is **dev-only**. Production targets are:

- **web** → Vercel
- **api / dispatch** → Cloudflare Workers (`wrangler deploy`)
- **engine** → Fly Machines (`fly deploy`)
- **flipt** → managed Flipt Cloud or self-hosted on a small VPS
- **Postgres** → Neon (already cloud)

Reasons docker isn't the prod target:
- CF Workers' V8 isolate runtime can't run inside docker (it's a Cloudflare
  edge primitive, not a server).
- Fly's Machines are Firecracker microVMs — closer to docker but with first-class
  geo-routing, suspend-on-idle pricing, and integrated TLS. Re-using flyctl
  beats re-implementing those.
- Vercel's Next.js build pipeline does ISR / image optimization / edge
  middleware tied to its CDN; running the same app behind plain `next start`
  in docker loses Core Web Vitals targets we care about.

See `.planning/phase-rebuild/DEPLOY-AUTOMATION-RESEARCH.md` for the
production deploy plan.

## Troubleshooting

**`up` fails with `failed to read dockerfile`**: confirm you ran the command
from the repo root (where `docker-compose.dev.yml` lives), not from inside
an app directory.

**Port already allocated**: another process is bound on 3000/8000/8090/8787/9001.
Run `lsof -i :3000` (etc.) to find it. The previous `pnpm dev` host workflow
leaves processes behind on Ctrl-C sometimes — kill them before bringing the
stack up.

**`pnpm install` hangs or errors inside a container**: usually a stale
named-volume from a previous lockfile. `pnpm dev:docker:nuke` and re-up.

**Web shows blank page / 502**: check `pnpm dev:docker:logs web` —
typically a TS error during initial compile. Fix it; Next.js fast-refresh
will pick it up without restarting the container.

**Flipt UI is empty after `nuke`**: `nuke` wipes the `flipt_data` volume.
Re-run `pnpm dev:docker:bootstrap-flags` to push `features.yaml` back in.

**Engine times out or 502**: cold container start is ~30s on first up
because Python wheels compile during `uv sync`. Wait it out; subsequent
ups reuse the built layer in seconds.
