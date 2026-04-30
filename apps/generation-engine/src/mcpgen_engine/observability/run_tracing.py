"""Plan 09-05 Task 2 / D-06: ``run_with_tracing`` wrapper for ``agent.run``.

Wraps every ``await agent.run(prompt, model_settings=...)`` call site in the
engine with a Logfire span carrying ``langfuse.session.id`` and ``langfuse.tags``
attributes. Centralises the per-call-site instrumentation at one site instead
of editing 11 places.

Why a wrapper instead of PydanticAI's ``metadata=`` kwarg
---------------------------------------------------------
The Wave 0 spike (``tests/observability/test_run_tracing_spike.py``) verified:

1. PydanticAI's ``metadata`` kwarg is NOT auto-prefixed into the
   ``langfuse.*`` namespace. Langfuse Cloud's OTel ingest looks specifically
   for ``langfuse.session.id`` per
   https://langfuse.com/integrations/native/opentelemetry — a raw
   ``session_id`` attribute is dropped.
2. Pitfall #1 (RESEARCH): Logfire's default scrubber replaces any string
   matching ``/session/`` with ``[Scrubbed due to 'session']``. The wrapper
   alone is therefore not sufficient — the companion
   :mod:`mcpgen_engine.observability.scrubbing` module installs a
   ``scrubbing.callback`` that whitelists ``langfuse.session.id``.

Both files ship together; either alone produces a silent failure.
"""

from __future__ import annotations

from typing import Any

import logfire
from pydantic_ai import Agent
from pydantic_ai.agent import AgentRunResult


async def run_with_tracing(
    agent: Agent[Any, Any],
    prompt: str,
    *,
    session_id: str,
    stage: str,
    model_settings: Any,
) -> AgentRunResult[Any]:
    """Wrap ``agent.run`` with Langfuse-namespaced span attributes.

    Opens a ``logfire.span("agent.run")`` carrying:

    - ``langfuse.session.id`` — the generation_id; Langfuse Cloud groups
      every span sharing this attribute into a single session view.
    - ``langfuse.tags`` — pass/stage label (``pass-0`` / ``pass-2`` /
      ``stage-f-2`` / etc.) for filtering in the Langfuse UI.

    The dotted attribute names cannot be passed as Python kwargs to
    :func:`logfire.span` — we use :meth:`set_attribute` on the active span
    inside the context manager instead.

    Returns whatever ``agent.run(...)`` returns (an
    :class:`pydantic_ai.agent.AgentRunResult`); callers continue to read
    ``.output`` exactly as before.

    Args:
        agent: A PydanticAI agent (typically built via
            :func:`mcpgen_engine.llm.agent_factory.make_agent`).
        prompt: The user prompt forwarded verbatim to ``agent.run``.
        session_id: Generation id (value of ``langfuse.session.id``). Pass
            ``"unknown"`` only as a placeholder for call sites where the
            generation_id is not yet threaded — track those with a
            ``# TODO(09-05)`` comment for follow-up.
        stage: Pass / stage label, e.g. ``"pass-2"``, ``"stage-f-2"``. Becomes
            the sole entry of ``langfuse.tags``.
        model_settings: Forwarded to ``agent.run`` unchanged. Type is the
            PydanticAI ``ModelSettings`` (TypedDict) but typed as ``Any``
            here to avoid leaking pydantic-ai internals into call-site
            signatures.
    """
    span_ctx = logfire.span("agent.run")
    with span_ctx as active_span:
        active_span.set_attribute("langfuse.session.id", session_id)
        active_span.set_attribute("langfuse.tags", [stage])
        return await agent.run(prompt, model_settings=model_settings)
