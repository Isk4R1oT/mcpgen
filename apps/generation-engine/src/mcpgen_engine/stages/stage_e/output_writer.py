"""Stage E — Atomic file writer + StageEManifest emitter.

``write_files_atomically`` writes every ``GeneratedFile`` to disk via
``tempfile.NamedTemporaryFile(delete=False, dir=output_dir) + os.replace`` so
partial-failure mid-write never leaves a half-written file under the output
directory (POSIX rename atomicity guarantee).

Returns a ``StageEManifest`` with placeholder ``bundle_size_kb=0`` and
``ts_compile_passed=False`` — Plan 04-11 ``validate.py`` fills both fields
after running ``tsc --noEmit`` + ``wrangler deploy --dry-run``.

Source: 04-CONTEXT.md D-19 (`output_writer.py` per-file sha256 + atomic
semantics) + D-34 (StageEManifest cache value).
"""

from __future__ import annotations

import hashlib
import os
import tempfile
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

# NOTE: datamodel-code-generator emits TWO Pydantic classes for the
# StageEManifest.files element type — `StageEFileEntry` (the named export from
# Zod) AND an inline-reference `File` class (auto-generated for the
# `StageEManifest.files: List[File]` reference). Both have identical structure
# (`extra='forbid'`, same fields). To satisfy Pydantic strict-mode validation
# we construct `StageEManifest` from a dict-of-dicts via `model_validate` —
# this avoids importing the synthetic `File` class (which is a codegen
# artifact, not part of the public IR contract).
from mcpgen_ir.types import StageEManifest

from mcpgen_engine.stages.stage_e import STAGE_E_VERSION, StageEError
from mcpgen_engine.stages.stage_e.scaffold import GeneratedFile

_BUFFER_SIZE: Final[int] = 64 * 1024


def _sha256_content(content: str) -> str:
    """Hex sha256 over the UTF-8 encoded file content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _write_atomic(target: Path, content: str) -> None:
    """Per-file atomic write: tempfile in target's parent dir, then os.replace.

    ``os.replace`` is atomic on POSIX when source and target sit on the same
    filesystem (we keep the tempfile in target's parent dir to guarantee
    that). On crash mid-write, the tempfile remains and the target is
    untouched.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(prefix=".stage_e_", dir=target.parent)
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            # Stream for large files (smoke test renders ~1KB files; ready
            # for Plan 04-08 runtime templates which can reach ~10KB).
            for offset in range(0, len(content), _BUFFER_SIZE):
                fh.write(content[offset : offset + _BUFFER_SIZE])
        os.replace(tmp_path, target)
    except OSError as exc:
        # Clean up the tempfile only if os.replace did NOT consume it
        # (replace is atomic — if it succeeded the tempfile no longer exists).
        if Path(tmp_path).exists():
            Path(tmp_path).unlink(missing_ok=True)
        raise StageEError(f"STAGE_E_OUTPUT_WRITE_FAILED: writing {target} failed: {exc}") from exc


def write_files_atomically(
    output_dir: Path,
    files: Sequence[GeneratedFile],
) -> StageEManifest:
    """Write every ``GeneratedFile`` atomically; emit a placeholder manifest.

    The returned ``StageEManifest`` carries:

    - ``files``: per-file ``StageEFileEntry`` with sha256 of content + the
      template that rendered it + the inputs-hash from ``scaffold.py``.
    - ``bundle_size_kb``: ``0`` placeholder — Plan 04-11 fills from
      ``wrangler deploy --dry-run`` output.
    - ``ts_compile_passed``: ``False`` placeholder — Plan 04-11 fills from
      ``tsc --noEmit`` exit code.
    - ``ts_compile_warning_count``: ``0`` placeholder — Plan 04-11 fills.
    - ``template_version``: ``STAGE_E_VERSION`` (currently ``"1"``).
    - ``generated_at``: UTC ISO-8601 of write time. The ONE manifest field
      allowed to differ between cold and warm runs (CONTEXT D-36).

    Raises ``StageEError`` (`STAGE_E_OUTPUT_WRITE_FAILED`) on any per-file
    write failure.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    file_entries: list[dict[str, str]] = []
    for generated in files:
        target = output_dir / generated.relative_path
        _write_atomic(target, generated.content)
        file_entries.append(
            {
                "relative_path": generated.relative_path,
                "sha256_content_hash": _sha256_content(generated.content),
                "render_template": generated.render_template,
                "render_inputs_hash": generated.render_inputs_hash,
            }
        )

    return StageEManifest.model_validate(
        {
            "files": file_entries,
            "bundle_size_kb": 0.0,
            "ts_compile_passed": False,
            "ts_compile_warning_count": 0,
            "template_version": STAGE_E_VERSION,
            "generated_at": datetime.now(tz=UTC).isoformat(),
        }
    )


__all__ = ["write_files_atomically"]
