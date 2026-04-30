#!/usr/bin/env bash
# CTRL-08 / D-05 — sourcemaps upload orchestrator.
#
# Skip-when-no-token preserves D-01 local-mode invariant:
#   when SENTRY_AUTH_TOKEN is empty or unset the script exits 0 immediately,
#   so `pnpm sourcemaps:upload` is safe to invoke from a developer machine
#   without a Sentry token (T-9-sourcemaps-02 mitigation).
#
# Phase 9 wires the command + skip path. Phase 10 CI provisions the token.
#
# References:
#   - .planning/phases/09-observability-polish/09-CONTEXT.md §D-05
#   - .planning/phases/09-observability-polish/09-07-PLAN.md
#   - apps/web/next.config.js (apps/web auto-uploads via @sentry/nextjs)
#   - apps/api/wrangler.toml ; apps/dispatch/wrangler.toml (upload_source_maps=true)
#
# Behaviour:
#   SENTRY_AUTH_TOKEN unset/empty       → exit 0, print skip message
#   SENTRY_AUTH_TOKEN set, DRY_RUN=1    → print per-app announcements, do NOT call sentry-cli
#   SENTRY_AUTH_TOKEN set, DRY_RUN!=1   → invoke `npx @sentry/cli sourcemaps upload` per app
#                                          (skips per-app block if its dist/ dir is missing)
#
# Env contract:
#   SENTRY_AUTH_TOKEN     — provisioned by CI in Phase 10. NEVER add to .env.local.
#   SENTRY_RELEASE        — optional override; defaults to `git rev-parse --short HEAD`
#   SOURCEMAPS_DRY_RUN    — when "1", skip the actual sentry-cli invocation (test mode)

set -euo pipefail

if [[ -z "${SENTRY_AUTH_TOKEN:-}" ]]; then
  echo "[sourcemaps] SENTRY_AUTH_TOKEN not set — skipping upload (local mode per D-01)"
  exit 0
fi

VERSION="${SENTRY_RELEASE:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
DRY_RUN="${SOURCEMAPS_DRY_RUN:-0}"

echo "[sourcemaps] release=${VERSION} dry_run=${DRY_RUN}"

# ─── apps/api (CF Workers via wrangler) ───────────────────────────────────────
echo "[sourcemaps] uploading apps/api"
if [[ "${DRY_RUN}" != "1" ]]; then
  if [[ -d "apps/api/dist" ]]; then
    (cd apps/api && npx @sentry/cli sourcemaps upload --release "${VERSION}" dist/)
  else
    echo "[sourcemaps] apps/api skipped (no dist/ — run \`pnpm --filter @mcpgen/api build\` first)"
  fi
fi

# ─── apps/dispatch (CF Workers via wrangler) ──────────────────────────────────
echo "[sourcemaps] uploading apps/dispatch"
if [[ "${DRY_RUN}" != "1" ]]; then
  if [[ -d "apps/dispatch/dist" ]]; then
    (cd apps/dispatch && npx @sentry/cli sourcemaps upload --release "${VERSION}" dist/)
  else
    echo "[sourcemaps] apps/dispatch skipped (no dist/ — run \`pnpm --filter @mcpgen/dispatch build\` first)"
  fi
fi

# ─── apps/web (Next.js — auto-upload) ─────────────────────────────────────────
echo "[sourcemaps] apps/web auto-uploads via @sentry/nextjs withSentryConfig — no manual step"

# ─── apps/generation-engine (Python — Phase 10 only) ──────────────────────────
echo "[sourcemaps] apps/generation-engine: Python source maps deferred to Phase 10 (local Python runs from source — no PyInstaller bundle yet)"

echo "[sourcemaps] done"
