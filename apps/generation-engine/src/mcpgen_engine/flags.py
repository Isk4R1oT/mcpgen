"""Flipt v2 client singleton for the generation engine.

Per docs/mcpgen-feature-flags-contract.md §3.4 — the engine evaluates flags
client-side via the FFI-based Python SDK. State is refreshed every 30s in
the background.

Failure mode: if Flipt is unreachable, ``error_strategy='fallback'`` returns
the last-known-good state. On cold start with no cache, ``evaluate_*`` helpers
return the ``default_value`` arg so the engine stays usable.

Generated tenant Workers do NOT use this module — they're immutable per
generation (contract §3.6).
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

import structlog

logger = structlog.get_logger(__name__)


@lru_cache(maxsize=1)
def get_flipt() -> Any:
    """Returns a process-wide singleton Flipt client.

    Reads ``FLIPT_URL`` (default ``http://localhost:8090``) and
    ``FLIPT_CLIENT_TOKEN`` (optional in dev). The Python SDK v0.19 does NOT
    yet support the v2 ``environment`` parameter; we work around this by
    using the default environment in Flipt server and passing namespace via
    the constructor (which the v2 server interprets as namespace within the
    default env).
    """
    from flipt_client import (  # type: ignore[import-not-found]
        ClientOptions,
        FliptEvaluationClient,
    )

    url = os.environ.get("FLIPT_URL", "http://localhost:8090")
    client_token = os.environ.get("FLIPT_CLIENT_TOKEN")

    opts_kwargs: dict[str, Any] = {
        "url": url,
        "update_interval": 30,
        "error_strategy": "fallback",
    }
    if client_token is not None:
        opts_kwargs["authentication"] = {"client_token": client_token}

    opts = ClientOptions(**opts_kwargs)
    return FliptEvaluationClient(namespace="default", opts=opts)


def evaluate_boolean_with_default(
    flag_key: str,
    entity_id: str,
    context: dict[str, str],
    default_value: bool,
) -> bool:
    """Safe boolean eval. Catches any SDK error and returns ``default_value``.

    Use in critical paths where a Flipt outage must not break the request.
    Per contract §7.3, choose ``default_value`` to be the safe behaviour for
    your category (kill→True, rollout→False, perm→False, ops→env-specific).
    """
    try:
        client = get_flipt()
        result = client.evaluate_boolean(
            flag_key=flag_key,
            entity_id=entity_id,
            context=context,
        )
        return bool(result.enabled)
    except Exception as exc:
        logger.warning(
            "flipt_eval_error",
            flag_key=flag_key,
            entity_id=entity_id,
            error=str(exc),
            fallback=default_value,
        )
        return default_value


def evaluate_variant_with_default(
    flag_key: str,
    entity_id: str,
    context: dict[str, str],
    default_value: str,
) -> str:
    """Safe variant eval. Catches any SDK error and returns ``default_value``."""
    try:
        client = get_flipt()
        result = client.evaluate_variant(
            flag_key=flag_key,
            entity_id=entity_id,
            context=context,
        )
        variant_key = getattr(result, "variant_key", None)
    except Exception as exc:
        logger.warning(
            "flipt_eval_error",
            flag_key=flag_key,
            entity_id=entity_id,
            error=str(exc),
            fallback=default_value,
        )
        return default_value
    else:
        if isinstance(variant_key, str) and variant_key:
            return variant_key
        return default_value


def service_entity_id(service_name: str) -> str:
    """Stable entityId for engine-internal calls without a user context.

    Per contract §7.1 — never use empty entity_id (breaks sticky bucketing).
    """
    return f"service:{service_name}"
