"""Spec format normalizer — converts Swagger 2.0 / Swagger 1.x / Postman 2.x
to OpenAPI 3.0 before Stage A's prance parser sees the input.

The detection runs in pure Python on the parsed dict; conversion shells out
to a Node helper at ``apps/generation-engine/spec-converter/convert.mjs``
which uses the well-maintained npm packages:

  * swagger2openapi (APIs.guru) — Swagger 2.0 → OpenAPI 3.0
  * api-spec-converter (LucyBot) — Swagger 1.0 / 1.2 → OpenAPI 3.0
  * postman-to-openapi (joolfe)  — Postman Collection v2.0 / v2.1 → OpenAPI 3.0

This sits BEFORE prance because prance's openapi-spec-validator backend rejects
anything that's not OpenAPI 3.x outright. By normalizing here we keep the rest
of Stage A (and the entire downstream pipeline) blissfully unaware of source
formats.

The Node helper directory is located via:
  1. ``MCPGEN_SPEC_CONVERTER_DIR`` env var (set in the runtime image), or
  2. walk-up from this source file to ``apps/generation-engine/spec-converter/``.
If neither resolves OR the ``node`` binary is missing, conversion calls raise
``StageAError("UNSUPPORTED_SPEC_FORMAT: ...")`` with an explicit message —
detection itself never raises (it just returns ``"unknown"``).

Format strings used downstream:
  * ``openapi-3.0``, ``openapi-3.1`` — pass through, no conversion needed
  * ``swagger-2.0``, ``swagger-1.x``, ``postman-2.x`` — converted to ``openapi-3.0``
  * ``unknown`` — bail out with UNSUPPORTED_SPEC_FORMAT

The original detected format is logged by Stage A so we keep observability
even though ``RawIR.spec_format`` (FROZEN per D-10) only carries the
post-conversion value.
"""

from __future__ import annotations

import asyncio
import os
import shutil
from pathlib import Path
from typing import Any, Final

import structlog

_log = structlog.get_logger(__name__)


# ---------- Path resolution -------------------------------------------------


def _resolve_converter_dir() -> Path | None:
    """Find the spec-converter helper directory (env var > walk-up)."""
    override = os.environ.get("MCPGEN_SPEC_CONVERTER_DIR")
    if override is not None and override.strip():
        candidate = Path(override).resolve()
        if (candidate / "convert.mjs").is_file():
            return candidate
        _log.warning(
            "spec_normalizer.override_dir_invalid",
            override=str(candidate),
            reason="convert.mjs missing",
        )

    # Walk-up: this file lives at
    # apps/generation-engine/src/mcpgen_engine/stages/spec_normalizer.py
    # → 5 levels up → apps/generation-engine/, then spec-converter/.
    here = Path(__file__).resolve()
    for ancestor in here.parents:
        candidate = ancestor / "spec-converter" / "convert.mjs"
        if candidate.is_file():
            return candidate.parent
        # Don't walk past the engine root if we hit a typical monorepo marker.
        if (ancestor / "pyproject.toml").is_file():
            break
    return None


_CONVERTER_DIR: Final[Path | None] = _resolve_converter_dir()
_CONVERSION_TIMEOUT_S: Final[float] = 60.0


# ---------- Format detection ------------------------------------------------


def detect_input_format(parsed: dict[str, Any]) -> str:
    """Identify the source spec format from a parsed JSON/YAML dict.

    Never raises — returns ``"unknown"`` for anything we can't recognize.
    Caller decides whether unknown is fatal (Stage A: yes, with
    UNSUPPORTED_SPEC_FORMAT).

    Detection order (most-specific markers first):
      1. ``openapi: "3.x"`` field        → openapi-3.0 / openapi-3.1
      2. ``swagger: "2.x"`` field        → swagger-2.0
      3. ``swaggerVersion: "1.x"`` field → swagger-1.x
      4. Postman ``info.schema`` URL     → postman-2.x
    """
    # OpenAPI 3.x — has top-level "openapi" string.
    openapi_version = parsed.get("openapi")
    if isinstance(openapi_version, str):
        if openapi_version.startswith("3.0"):
            return "openapi-3.0"
        if openapi_version.startswith("3.1"):
            return "openapi-3.1"
        # Other openapi values (2.x doesn't use this field; 4.x is the moonshot
        # spec — not standardized as of 2026-05). Treat as unknown.
        return "unknown"

    # Swagger 2.0 — has top-level "swagger" string ("2.0").
    swagger_field = parsed.get("swagger")
    if isinstance(swagger_field, str | int | float):
        v = str(swagger_field)
        if v.startswith("2."):
            return "swagger-2.0"
        if v.startswith("1."):
            # Some 1.2 specs use this field instead of swaggerVersion.
            return "swagger-1.x"
        return "unknown"

    # Swagger 1.0 / 1.2 — uses "swaggerVersion" instead of "swagger".
    swagger_v1 = parsed.get("swaggerVersion")
    if isinstance(swagger_v1, str) and swagger_v1.startswith("1."):
        return "swagger-1.x"

    # Postman Collection v2.0 / v2.1 — has info.schema pointing at the
    # Postman schema registry.
    info = parsed.get("info")
    if isinstance(info, dict):
        schema_url = info.get("schema")
        if isinstance(schema_url, str) and (
            "schema.getpostman.com/json/collection/v2" in schema_url
            or "schema.postman.com/json/collection/v2" in schema_url
        ):
            return "postman-2.x"
        # Some older Postman dumps put _postman_id at the root instead.
        if "_postman_id" in parsed and "item" in parsed:
            return "postman-2.x"

    # AsyncAPI / RAML / API Blueprint / GraphQL SDL etc. — not supported in v0.
    return "unknown"


def is_native_openapi_3x(format_id: str) -> bool:
    """True if Stage A can hand the spec straight to prance without conversion."""
    return format_id in ("openapi-3.0", "openapi-3.1")


def needs_conversion(format_id: str) -> bool:
    """True if we have a Node converter for this format."""
    return format_id in ("swagger-2.0", "swagger-1.x", "postman-2.x")


# ---------- Conversion -----------------------------------------------------


class SpecConversionError(Exception):
    """Raised when the Node converter fails. Caller maps to StageAError."""


async def convert_to_openapi_3(spec_text: str, source_format: str) -> str:
    """Convert ``spec_text`` to OpenAPI 3.0 JSON via the Node helper.

    ``source_format`` must be one of ``swagger-2.0``, ``swagger-1.x``,
    ``postman-2.x``. Returns OpenAPI 3.0 JSON as a string. Raises
    ``SpecConversionError`` on subprocess failure / timeout / missing helper.
    """
    if not needs_conversion(source_format):
        raise SpecConversionError(
            f"convert_to_openapi_3 called with non-convertible format: {source_format}"
        )
    if _CONVERTER_DIR is None:
        raise SpecConversionError(
            "spec-converter helper directory not found. Set MCPGEN_SPEC_CONVERTER_DIR "
            "or ensure apps/generation-engine/spec-converter/convert.mjs exists."
        )

    node_bin = shutil.which("node")
    if node_bin is None:
        raise SpecConversionError("node binary not found on PATH (required to run spec-converter)")

    convert_script = _CONVERTER_DIR / "convert.mjs"
    if not convert_script.is_file():
        raise SpecConversionError(f"convert.mjs not found at {convert_script}")

    proc = await asyncio.create_subprocess_exec(
        node_bin,
        str(convert_script),
        source_format,
        cwd=str(_CONVERTER_DIR),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=spec_text.encode("utf-8")),
            timeout=_CONVERSION_TIMEOUT_S,
        )
    except TimeoutError as e:
        proc.kill()
        await proc.wait()
        raise SpecConversionError(
            f"conversion timed out after {_CONVERSION_TIMEOUT_S}s ({source_format})"
        ) from e

    if proc.returncode != 0:
        err_text = stderr.decode("utf-8", errors="replace").strip()
        raise SpecConversionError(
            f"converter exit {proc.returncode} ({source_format}): {err_text or '<no stderr>'}"
        )

    out_text = stdout.decode("utf-8", errors="replace")
    if not out_text.strip():
        raise SpecConversionError(f"converter produced empty output ({source_format})")

    _log.info(
        "spec_normalizer.converted",
        source_format=source_format,
        in_bytes=len(spec_text.encode("utf-8")),
        out_bytes=len(out_text.encode("utf-8")),
    )
    return out_text
