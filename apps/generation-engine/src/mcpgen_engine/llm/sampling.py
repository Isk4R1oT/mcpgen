"""Per-pass ModelSettings constants for Pass 0 + Pass 1 LLM calls.

Provider routing is pinned via `extra_body` per D-04 (OpenRouter AtlasCloud
fp8 single provider, no fallback). Sampling profiles per D-06.

Pitfall #2 mitigation: any future pydantic-ai bump that drops `extra_body`
forwarding is caught by `tests/test_smoke_qwen.py::test_extra_body_forwarded`.

DO NOT add a second provider, allow_fallbacks=True, or different
quantizations without a paired docs/decisions/ entry — the determinism
contract depends on these values.

History (all four pivots in `docs/decisions/2026-04-28-quantization-pin-fp8-together.md`):
1. Original `fireworks`/`fp16` + `require_parameters=True` → 404 — no
   provider hosts Qwen3-Coder at fp16 (Fireworks doesn't host the model
   at all).
2. `together`/`fp8` + `require_parameters=True` → 404 — Together's fp8
   endpoint lacks `structured_outputs`.
3. `venice`/`fp8` + `require_parameters=True` → 404 — Venice advertises
   `tool_choice` but rejects `tool_choice="required"`.
4. `atlas-cloud`/`fp8` + `require_parameters=True` → still 404 — true
   root cause: PydanticAI 0.2.20 sends `max_completion_tokens` (the new
   OpenAI API name introduced for o1-class models), and ZERO of the 8
   qwen/qwen3-coder providers advertise `max_completion_tokens` in their
   `supported_parameters`. With `require_parameters=True`, OpenRouter
   filters out every provider.
5. Final pin: `atlas-cloud`/`fp8` WITHOUT `require_parameters`. Verified
   end-to-end via curl with the exact PydanticAI payload — AtlasCloud
   responds 200 OK and the routing trace confirms `provider=AtlasCloud`.
   Determinism is still preserved by `order` + `allow_fallbacks=False` +
   `quantizations` — `require_parameters` was a defense-in-depth check
   that backfired; it can be re-introduced after PydanticAI ≥ 0.5
   migrates to a sane parameter naming scheme OR after qwen/qwen3-coder
   providers add `max_completion_tokens` to their supported_parameters.
   Novita is the documented hot-swap target if AtlasCloud drops the model.
"""

from __future__ import annotations

from pydantic_ai.settings import ModelSettings

# D-04: Provider routing pinned. Single provider, no fallback.
# Pitfall #2 — fp8 quantization pin prevents drift.
# AtlasCloud fp8 is the verified-working host for the actual PydanticAI
# request shape (chat/completions + tool_choice="required" + structured
# outputs + max_completion_tokens) — verified via end-to-end curl 2026-04-28.
#
# `require_parameters: True` REMOVED because PydanticAI 0.2.20 sends
# `max_completion_tokens` and no qwen/qwen3-coder provider advertises that
# parameter, which made the flag filter every provider. Determinism is
# preserved by `order` + `allow_fallbacks=False` + `quantizations`.
# See decision doc dated 2026-04-28.
_PROVIDER_ROUTING: dict[str, dict[str, object]] = {
    "provider": {
        "order": ["atlas-cloud"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
    }
}

# D-06: Pass 0 LLM stage — classification-grade, deterministic.
PASS_0_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.0,
    top_p=0.9,
    max_tokens=4096,
    extra_body=_PROVIDER_ROUTING,
)

# D-06: Pass 1 schema synthesis — mild creativity OK for schema generation.
PASS_1_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.2,
    top_p=0.9,
    max_tokens=8192,
    extra_body=_PROVIDER_ROUTING,
)

# D-02: Pass 2 description authoring — creative, mild temperature.
PASS_2_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.3,
    top_p=0.9,
    max_tokens=2048,
    extra_body=_PROVIDER_ROUTING,
)

# D-02: Pass 3 per-parameter enrichment — slight creativity for descriptions.
PASS_3_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.2,
    top_p=0.9,
    max_tokens=1024,
    extra_body=_PROVIDER_ROUTING,
)

# D-02: Pass 4 selective annotation judgment — classification-grade, deterministic.
PASS_4_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.0,
    top_p=0.9,
    max_tokens=512,
    extra_body=_PROVIDER_ROUTING,
)

# D-02: Pass 5 field-importance ranking — classification-grade with tiny
# creative window for guidance text.
PASS_5_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.1,
    top_p=0.9,
    max_tokens=1024,
    extra_body=_PROVIDER_ROUTING,
)

# D-02: Inline quality gate (Pass 2 + Pass 3) — judge mode, classification-grade.
INLINE_GATE_SETTINGS: ModelSettings = ModelSettings(
    temperature=0.0,
    top_p=0.9,
    max_tokens=512,
    extra_body=_PROVIDER_ROUTING,
)
