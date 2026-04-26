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

# Install gitleaks (F1 dep - Phase 5).
RUN curl -L "https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz" \
        -o /tmp/gl.tgz \
    && tar -xzf /tmp/gl.tgz -C /usr/local/bin gitleaks \
    && rm /tmp/gl.tgz \
    && gitleaks version

WORKDIR /app

# Copy the Python workspace dep first so its layer can be cached separately.
COPY packages/ir /pkgs/ir

# App project files.
COPY apps/generation-engine/pyproject.toml apps/generation-engine/uv.lock ./
COPY apps/generation-engine/src ./src
COPY apps/generation-engine/tests ./tests

# Rewrite the workspace path source from `../../packages/ir` (host layout) to
# `/pkgs/ir` (image layout) before running uv sync. The image layout has the
# IR package in /pkgs/ir, NOT relative to /app.
RUN sed -i 's|path = "\.\./\.\./packages/ir"|path = "/pkgs/ir"|' pyproject.toml \
    && uv sync --frozen --no-dev


FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /usr/local/bin/gitleaks /usr/local/bin/gitleaks
COPY apps/generation-engine/src /app/src

WORKDIR /app
EXPOSE 8000

CMD ["uvicorn", "mcpgen_engine.main:app", "--host", "0.0.0.0", "--port", "8000"]
