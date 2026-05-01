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
        session_id: Generation id (value of ``langfuse.session.id``).
            Production callers MUST thread the real ``generation_id`` from
            the BFF (Phase 10 plan 10-03 closed all 11 placeholder sites).
            Direct test callers may pass any string sentinel.
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
        result = await agent.run(prompt, model_settings=model_settings)

        # POST-09.1 fix: stamp OpenTelemetry GenAI semantic-convention
        # attributes so Langfuse promotes this span to a GENERATION
        # observation and applies the registered qwen3-coder pricing
        # ($0.12/M input, $0.80/M output). Without these, every LLM call
        # surfaces as a generic SPAN with $0 cost. The values come straight
        # from `agent` config + the `AgentRunResult.usage()` method which
        # PydanticAI populates from the OpenRouter response usage block.
        try:
            model_name = getattr(getattr(agent, "model", None), "model_name", None)
            if model_name is None:
                model_name = getattr(agent, "model_name", None)
            if isinstance(model_name, str):
                active_span.set_attribute("gen_ai.system", "openrouter")
                active_span.set_attribute("gen_ai.request.model", model_name)
                active_span.set_attribute("gen_ai.response.model", model_name)
                # Langfuse-specific shorthand picked up alongside gen_ai.*.
                active_span.set_attribute("model", model_name)

            usage_fn = getattr(result, "usage", None)
            usage = usage_fn() if callable(usage_fn) else usage_fn
            if usage is not None:
                # PydanticAI Usage exposes .request_tokens / .response_tokens / .total_tokens.
                input_tokens = getattr(usage, "request_tokens", None) or getattr(
                    usage, "input_tokens", None
                )
                output_tokens = getattr(usage, "response_tokens", None) or getattr(
                    usage, "output_tokens", None
                )
                total_tokens = getattr(usage, "total_tokens", None)
                if isinstance(input_tokens, int):
                    active_span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
                    active_span.set_attribute("gen_ai.usage.prompt_tokens", input_tokens)
                if isinstance(output_tokens, int):
                    active_span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
                    active_span.set_attribute("gen_ai.usage.completion_tokens", output_tokens)
                if isinstance(total_tokens, int):
                    active_span.set_attribute("gen_ai.usage.total_tokens", total_tokens)
        except Exception as exc:
            logfire.warn("run_tracing.gen_ai_attrs_failed", error=str(exc))

        return result
