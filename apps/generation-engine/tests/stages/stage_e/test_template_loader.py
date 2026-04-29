"""Stage E template_loader tests — Jinja2 ENVIRONMENT singleton + StrictUndefined."""

from __future__ import annotations

import pytest
from jinja2 import Environment, FileSystemLoader, StrictUndefined, UndefinedError

from mcpgen_engine.stages.stage_e.template_loader import ENVIRONMENT


def test_environment_is_singleton() -> None:
    """Re-importing the module returns the same Environment object identity."""
    from mcpgen_engine.stages.stage_e.template_loader import (
        ENVIRONMENT as second_import,
    )

    assert ENVIRONMENT is second_import


def test_environment_has_strict_undefined() -> None:
    """StrictUndefined is configured so missing render vars raise immediately."""
    assert ENVIRONMENT.undefined is StrictUndefined


def test_environment_autoescape_disabled() -> None:
    """autoescape=False — templates emit TS/TOML/JSON source code, not HTML."""
    # Jinja2 stores autoescape as a callable or bool; for a literal `False`
    # constructor arg the attribute is the bool `False`.
    assert ENVIRONMENT.autoescape is False


def test_environment_uses_filesystem_loader() -> None:
    """FileSystemLoader is configured (not PackageLoader / DictLoader)."""
    assert isinstance(ENVIRONMENT.loader, FileSystemLoader)


def test_environment_loader_path_resolves_to_codegen_templates() -> None:
    """The loader path lands at packages/codegen-templates/templates/."""
    loader = ENVIRONMENT.loader
    assert isinstance(loader, FileSystemLoader)
    # FileSystemLoader.searchpath is a list[str]; assert at least one entry
    # ends with the expected suffix.
    suffixes = [path.replace("\\", "/").rstrip("/") for path in loader.searchpath]
    assert any(
        s.endswith("packages/codegen-templates/templates") for s in suffixes
    ), f"loader search path did not include the templates dir: {suffixes}"


def test_environment_keep_trailing_newline_enabled() -> None:
    """Determinism: trailing newline preserved so file sha256 is stable."""
    assert ENVIRONMENT.keep_trailing_newline is True


def test_environment_trim_blocks_enabled() -> None:
    """Whitespace control — block-level newlines stripped (rendering hygiene)."""
    assert ENVIRONMENT.trim_blocks is True
    assert ENVIRONMENT.lstrip_blocks is True


def test_strict_undefined_raises_on_missing_var() -> None:
    """Smoke test: a template referencing a missing var fails at render time."""
    template = ENVIRONMENT.from_string("hello {{ missing_var }}")
    with pytest.raises(UndefinedError):
        template.render({})


def test_loader_can_locate_real_templates() -> None:
    """All 9 scaffold templates (Plan 04-06 Task 2) resolve via the loader."""
    expected = (
        "package.json.j2",
        "wrangler.toml.j2",
        "tsconfig.json.j2",
        "README.md.j2",
        "mcpgen.yaml.j2",
        "gitignore.j2",
        "index.ts.j2",
        "server.ts.j2",
        "config.ts.j2",
    )
    for name in expected:
        # `get_template` raises TemplateNotFound if missing; success means the
        # FileSystemLoader resolves the path correctly.
        tmpl = ENVIRONMENT.get_template(name)
        assert tmpl.name == name


def test_environment_type_is_jinja2_environment() -> None:
    """Sanity: ENVIRONMENT is a Jinja2 Environment instance, not a wrapper."""
    assert isinstance(ENVIRONMENT, Environment)
