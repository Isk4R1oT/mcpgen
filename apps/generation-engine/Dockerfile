# MCPGen Generation Engine - Fly.io Machines image.
#
# Phase 1: builds and runs uv-managed FastAPI app. The `gitleaks` binary is
# baked in for the F1 stage in Phase 5.
#
# IMPORTANT: this Dockerfile expects to be built from the REPO ROOT
# (`/Users/igor/Projects/mcpgen`), not from `apps/generation-engine/`. The
# `mcpgen-ir` Python workspace dep at `packages/ir/` lives outside this app's
# directory; Docker COPY cannot reach above the build context, so the build
# command must set the context to the repo root:
#
#     docker build -f apps/generation-engine/Dockerfile -t mcpgen-engine .
#     flyctl deploy --dockerfile apps/generation-engine/Dockerfile \
#                   --build-context $PWD
#
# Phase 1 acceptance is just that the Dockerfile parses and the layer order
# is sane; the full cross-context build is verified in Phase 9.

FROM python:3.12-slim-bookworm AS builder

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    UV_LINK_MODE=copy \
    UV_COMPILE_BYTECODE=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Astral's Python project manager).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && cp /root/.local/bin/uv /usr/local/bin/uv \
    && uv --version

# Install Node.js + pnpm — Stage E (codegen) runs `tsc --noEmit` against
# the rendered TypeScript bundle and the engine helper
# `ensure_codegen_node_modules()` shells out to `pnpm install` to populate
# `packages/codegen-templates/node_modules`. Without these tools the
# pipeline crashes at Stage E with STAGE_E_FAILED and the L1 artifact
# cache never gets written, so BFF /jobs/:id returns
# `partial_result: null` even for fully-completed Pass 0-5 LLM stages.
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@10.30.2 --activate \
    && node --version && pnpm --version

WORKDIR /app

# Copy the Python workspace dep first so its layer can be cached separately.
COPY packages/ir /pkgs/ir

# App project files.
COPY apps/generation-engine/pyproject.toml apps/generation-engine/uv.lock ./
COPY apps/generation-engine/src ./src
COPY apps/generation-engine/tests ./tests

# Rewrite the workspace path source from `../../packages/ir` (host layout) to
# `/pkgs/ir` (image layout) before running uv sync. The image layout has the
# IR package in /pkgs/ir, NOT relative to /app. uv.lock encodes the same
# relative path twice (once as `path =`, once as `editable =`) so both
# pyproject.toml AND uv.lock must be rewritten or uv refuses to use the
# frozen lockfile ("cannot normalize a relative path beyond the base
# directory").
RUN sed -i 's|path = "\.\./\.\./packages/ir"|path = "/pkgs/ir"|' pyproject.toml \
    && sed -i 's|"\.\./\.\./packages/ir"|"/pkgs/ir"|g' uv.lock \
    && uv sync --frozen --no-dev

# Pre-warm packages/codegen-templates/node_modules in the BUILDER so the
# runtime stage doesn't have to run `pnpm install` on first generation.
# Bypass the workspace by stripping the workspace reference from the
# package.json and using a standalone install — codegen-templates' deps
# are all public registry packages (TS toolchain + CF types), so this is
# self-contained.
COPY packages/codegen-templates/package.json /tmp/codegen-templates/package.json
RUN cd /tmp/codegen-templates \
    && node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json')); delete p.private; fs.writeFileSync('package.json', JSON.stringify(p, null, 2));" \
    && pnpm install --no-lockfile --ignore-workspace --prefer-offline \
    && ls node_modules | head -5


FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

COPY --from=builder /opt/venv /opt/venv

# The mcpgen-ir package is installed editable into /opt/venv (it points to a
# .pth file referencing /pkgs/ir/src). Without copying /pkgs/ir into the
# runtime image, `import mcpgen_ir` raises ModuleNotFoundError at startup.
COPY --from=builder /pkgs/ir /pkgs/ir

# Install gitleaks 8.30.1 binary (F1 secret_scan dep — Phase 5 D-05 step 9).
# Multi-stage COPY from the official zricethezav/gitleaks image keeps a single source of truth
# for the pinned version. Bump in lock-step with packages/codegen-templates/package.json
# `engines.gitleaks` and the .pre-commit-config.yaml `gitleaks` repo rev.
COPY --from=zricethezav/gitleaks:v8.30.1 /usr/bin/gitleaks /usr/local/bin/gitleaks

COPY apps/generation-engine/src /app/src

# Stage E (codegen) and Stage F (validation) BOTH walk up from a source
# file looking for sibling `packages/...` directories. Mirror the host repo
# layout under /app so each walk-up succeeds:
#   /app/packages/codegen-templates/   ← Stage E (validate.py + template_loader)
#   /app/packages/engine-fixtures/     ← Stage F (f1_checks/openai_compliance)
# We also keep MCPGEN_TEMPLATES_DIR set so template_loader.py short-circuits
# the parents-walk in case the source layout shifts in a future refactor.
COPY packages/codegen-templates /app/packages/codegen-templates
COPY packages/engine-fixtures   /app/packages/engine-fixtures
ENV MCPGEN_TEMPLATES_DIR=/app/packages/codegen-templates/templates

# Carry over the pre-warmed node_modules from the builder stage so Stage E
# `tsc --noEmit` validation works without spawning pnpm at runtime.
COPY --from=builder /tmp/codegen-templates/node_modules /app/packages/codegen-templates/node_modules

# Install Node.js (no pnpm needed at runtime — node_modules is pre-warmed)
# so Stage E can run `npx tsc --noEmit` directly. Smaller install than the
# full builder toolchain.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && node --version

WORKDIR /app
EXPOSE 8000

CMD ["uvicorn", "mcpgen_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
