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
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Astral's Python project manager).
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && cp /root/.local/bin/uv /usr/local/bin/uv \
    && uv --version

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

# Stage E (codegen) renders Jinja2 templates that live in
# `packages/codegen-templates/templates/`. The host code resolves that path
# via `Path(__file__).resolve().parents[6]` which works when the source tree
# is /Users/igor/Projects/mcpgen/apps/generation-engine/src/...; under /app
# the parents-walk overshoots root and raises IndexError. We copy the
# templates into the image and pin them via MCPGEN_TEMPLATES_DIR so
# template_loader.py uses the env-override branch.
COPY packages/codegen-templates /pkgs/codegen-templates
ENV MCPGEN_TEMPLATES_DIR=/pkgs/codegen-templates/templates

# Stage F (validation, F1 openai_compliance check) walks up from the
# source file looking for `packages/engine-fixtures/_canonical/`. Mirror the
# repo layout under /app so the walk-up finds the fixtures at /app/packages/...
COPY packages/engine-fixtures /app/packages/engine-fixtures

WORKDIR /app
EXPOSE 8000

CMD ["uvicorn", "mcpgen_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
