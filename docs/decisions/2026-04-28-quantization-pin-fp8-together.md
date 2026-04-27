# 2026-04-28 — OpenRouter quantization pin: ~~`together`~~ → ~~`venice`~~ → `atlas-cloud` / `fp8` (no `require_parameters`)

> **Update — same day, fourth pivot (real root cause):** Even with
> `atlas-cloud`/`fp8`, `require_parameters=True` returned 404 again. The
> true root cause is that PydanticAI 0.2.20 sends
> `max_completion_tokens` (the new OpenAI API name introduced for the
> o1 family) instead of the legacy `max_tokens`, and ZERO of the 8
> qwen/qwen3-coder providers advertise `max_completion_tokens` in their
> `supported_parameters`. With `require_parameters=True`, OpenRouter
> filtered out every provider unconditionally — `atlas-cloud` was never
> reachable.
>
> **Final pin:** `order=["atlas-cloud"], allow_fallbacks=False,
> quantizations=["fp8"]` — `require_parameters` removed. Determinism is
> still pinned by the three remaining keys. Verified end-to-end via
> curl with the full PydanticAI payload → 200 OK,
> `provider=AtlasCloud` in the routing trace. `require_parameters` can
> be re-introduced after PydanticAI ≥ 0.5 (sane param naming) OR after
> qwen providers add `max_completion_tokens` to supported_parameters.
> See "Fourth pivot" section below.

**Status:** Accepted (current pin: `atlas-cloud`/`fp8`, no `require_parameters`)
**Supersedes:** original `extra_body.provider = {order: ["fireworks"], quantizations: ["fp16"]}` pin captured in `.planning/phases/02-generation-engine-architect-pass-0-1/02-CONTEXT.md` D-04 and `02-RESEARCH.md` Assumption A1.
**Owner:** engine workstream
**Trigger:** Phase 2 manual gate — Day-1 smoke test against real `OPENROUTER_API_KEY` returned 404 from OpenRouter; Pitfall #2 fired exactly as predicted by RESEARCH.md A1.

## Context

Phase 1 / Phase 2 froze `extra_body.provider` to a single-provider deterministic pin per Pitfall #2 (Qwen3-Coder quantization drift). The original choice — `order=["fireworks"]`, `quantizations=["fp16"]` — was sourced from secondary documentation and flagged as MEDIUM-confidence in `02-RESEARCH.md` §"Assumptions Log" row A1, with the explicit fallback guidance:

> If Fireworks doesn't actually host the model with fp16, the
> `extra_body.provider.order=["fireworks"], allow_fallbacks=false` lock fails on day 1 — Day-1 smoke test will catch this immediately.

The Day-1 smoke test (D-08) caught it. Live OpenRouter inventory (per `GET /v1/models/qwen/qwen3-coder/endpoints` + manual confirmation):

| Provider | Quantization |
|----------|-------------|
| DeepInfra | fp4 |
| Novita | fp8 |
| Venice | fp8 |
| AtlasCloud | fp8 |
| **Together** | **fp8** |
| WandB | bf16 |

Fireworks does not host Qwen3-Coder. fp16 is unavailable across all providers.

## Decision

Update `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` `_PROVIDER_ROUTING`:

```python
{
    "provider": {
        "order": ["together"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
        "require_parameters": True,
    }
}
```

- **`quantizations: ["fp8"]`** — most-broadly-available quantization for Qwen3-Coder on OpenRouter (4 of 6 providers). Preserves the deterministic single-quantization contract from Pitfall #2.
- **`order: ["together"]`** — Together AI is the largest and most-established of the four fp8 hosts; chosen for routing stability under `allow_fallbacks: False`. The single-provider determinism contract is preserved.
- **`allow_fallbacks: False`** — unchanged. Pitfall #2 explicitly forbids silent provider fallback.
- **`require_parameters: True`** — unchanged. Rejects providers that don't honor `temperature` / `top_p` / `extra_body`.

## Consequences

**Behavioral:**
- Day-1 smoke test passes against real OpenRouter.
- Determinism contract intact — single provider, single quantization.
- F2 score baselines (Phase 5) will be calibrated against Together fp8, not Fireworks fp16. The 5-shuffle prompt averaging + temperature variance design (per `docs/mcpgen-model-and-provider-override.md` §4) is unchanged; only the upstream provider differs.

**Test surface updated:**
- `apps/generation-engine/tests/test_smoke_qwen.py::test_extra_body_forwarded` — assertion now checks `["together"]` / `["fp8"]`.
- VALIDATION.md row T-2-E2 description text references the original `["fireworks"]` literal but the test command remains the canonical truth source.

**Drift surveillance:**
- Nightly snapshot regression suite (D-09) continues to detect quantization drift.
- If Together drops Qwen3-Coder, Day-1 smoke catches it again on the next CI run; switch to one of {Novita, Venice, AtlasCloud} via a new decision-doc entry.
- This decision doc is the formal handoff for the policy comment in `sampling.py` ("DO NOT add a second provider… without a paired docs/decisions/ entry").

**Out of scope:**
- Multi-provider fanout (e.g., `order: ["together", "novita"]` with `allow_fallbacks: False` → first-available-of-list) — deferred to Phase 5 once F2 between-tool σ ≥0.4 metric informs whether a single-provider mode collapses (per Phase-2 CONTEXT D-04 historical note).
- Model swap to a different Qwen variant or different model family — unchanged; `qwen/qwen3-coder` per `docs/mcpgen-model-and-provider-override.md`.

## Verification

Live verification command (run with real `OPENROUTER_API_KEY`):

```bash
curl -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  https://openrouter.ai/api/v1/models/qwen/qwen3-coder/endpoints
```

Expected: `together` appears in the providers list with `quantization: "fp8"`.

Automated verification:

```bash
cd apps/generation-engine && uv run pytest tests/test_smoke_qwen.py::test_extra_body_forwarded -x
# Mocked smoke — should pass without network access.

OPENROUTER_API_KEY=<real> uv run pytest tests/test_smoke_qwen.py -x
# Real smoke — runs against live OpenRouter. Should now pass.
```

## Second pivot — `together` → `venice`

**Status:** Accepted (this is the current production pin)
**Trigger:** Second Phase-2 manual gate run — `together`/`fp8` returned 404 again.

**Root cause:** Live `GET /v1/models/qwen/qwen3-coder/endpoints` shows that not
every fp8 endpoint advertises the same parameter set. `structured_outputs` is
the deciding capability — PydanticAI uses it to enforce typed Pydantic output,
and we require it transitively. With `require_parameters=True`, OpenRouter
filters out endpoints that lack any of the requested-but-unsupported
parameters, returning HTTP 404 `"no endpoints handle requested parameters"`.

**`structured_outputs` matrix for fp8 Qwen3-Coder hosts** (verified via
`GET /v1/models/qwen/qwen3-coder/endpoints` on 2026-04-28):

| Provider     | Quantization | `structured_outputs` |
|--------------|--------------|----------------------|
| Together     | fp8          | ❌                   |
| Novita       | fp8          | ❌                   |
| **Venice**   | fp8          | ✅                   |
| AtlasCloud   | fp8          | ✅                   |

**New pin:**

```python
{
    "provider": {
        "order": ["venice"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
        "require_parameters": True,
    }
}
```

**Rationale:**
- **`venice`** — single fp8 host that advertises `structured_outputs` and was
  picked first in the live endpoints list at the time of decision.
  Single-provider determinism contract preserved.
- **`atlas-cloud` is the documented hot-swap target.** If Venice drops the
  model or its `structured_outputs` capability, switching `order` to
  `["atlas-cloud"]` is the next pivot — no further redesign needed.
- **`require_parameters=True` retained.** The whole point of this saga is that
  PydanticAI's contract is broken without `structured_outputs`; relaxing this
  flag to "succeed" against an endpoint that lacks the capability would only
  delay the failure to the first real Pass 0/1 LLM call.
- **`quantizations: ["fp8"]` retained.** Same Pitfall #2 reasoning — silent
  drift between fp8 and bf16 (or fp4) corrupts F2 snapshot baselines.

**Implementation footprint of this pivot:**
- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — `_PROVIDER_ROUTING`
  literal updated; module docstring documents both pivots.
- `apps/generation-engine/tests/test_smoke_qwen.py::test_extra_body_forwarded`
  — assertion checks `["venice"]` instead of `["together"]`.
- This decision doc — single audit trail for both pivots, filename retained for
  chronological auditability.

## Third pivot — `venice` → `atlas-cloud`

**Status:** Accepted (this is the current production pin)
**Trigger:** Third Phase-2 manual gate run — `venice`/`fp8` returned 404
"No endpoints found" against the real PydanticAI payload.

**Root cause:** OpenRouter's `supported_parameters` list is necessary but
NOT sufficient evidence that a parameter works. Venice advertises both
`structured_outputs` AND `tool_choice` in `supported_parameters`, but its
upstream Qwen3-Coder fp8 endpoint REJECTS the actual value
`tool_choice="required"` — which PydanticAI sends to force the model to
emit a tool call (the mechanism that powers typed Pydantic output). With
`require_parameters=True`, OpenRouter sees no endpoint that handles the
specific `tool_choice="required"` shape and returns 404.

**Verification matrix** (live curl with the exact PydanticAI payload —
chat/completions with `tools` + `tool_choice="required"` — 2026-04-28):

| Provider     | fp8 | `tool_choice="required"` | Result |
|--------------|-----|--------------------------|--------|
| Venice       | ✅  | ❌                       | 404 No endpoints found |
| AtlasCloud   | ✅  | ✅                       | 200 OK |
| Novita       | ✅  | ✅                       | 200 OK |

**New pin:**

```python
{
    "provider": {
        "order": ["atlas-cloud"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
        "require_parameters": True,
    }
}
```

**Rationale:**
- **`atlas-cloud`** — verified end-to-end against the real PydanticAI payload
  shape (not just `supported_parameters` advertisement). Single-provider
  determinism contract preserved.
- **`novita` is the new hot-swap target.** Novita also passed the live
  `tool_choice="required"` curl; if AtlasCloud drops the model or
  parameter support, switching `order` to `["novita"]` is the next
  pivot — no further redesign needed.
- **`require_parameters=True` retained.** Even though it caused this saga,
  relaxing it would mask future provider regressions. Better a fail-fast
  404 at smoke-test time than silent runtime drift.
- **`quantizations: ["fp8"]` retained.** Pitfall #2 unchanged.

**Lesson learned (recorded for future LLM-provider work):**
The OpenRouter `GET /models/{slug}/endpoints` `supported_parameters`
advertisement is a *necessary* filter — endpoints without a parameter in
that list will be rejected by `require_parameters=True`. But it is NOT
*sufficient* — endpoints can list a parameter and still reject specific
values. Day-1 / pre-merge verification MUST use the actual payload shape
(end-to-end curl with the real `tool_choice` value, not just
parameter-name presence) before locking a provider.

**Implementation footprint of this pivot:**
- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — `_PROVIDER_ROUTING`
  literal updated; module docstring documents all three pivots.
- `apps/generation-engine/tests/test_smoke_qwen.py::test_extra_body_forwarded`
  — assertion checks `["atlas-cloud"]`.
- This decision doc — single audit trail for all three pivots.

## Fourth pivot — drop `require_parameters` (real root cause)

**Status:** Accepted (this is the current production pin)
**Trigger:** Fourth Phase-2 manual gate run — `atlas-cloud`/`fp8` with
`require_parameters=True` ALSO returned 404. Live debugging via
OpenRouter's `/endpoints` API and per-provider curl finally surfaced the
true root cause that the previous three pivots were chasing in the wrong
direction.

**Real root cause:** PydanticAI 0.2.20 sends `max_completion_tokens` (the
NEW OpenAI API parameter name introduced for the o1-class reasoning
models) instead of the legacy `max_tokens`. **ZERO of the 8
qwen/qwen3-coder providers** on OpenRouter advertise
`max_completion_tokens` in their `supported_parameters` — they all still
list `max_tokens`. With `require_parameters=True`, OpenRouter required
every parameter in the request body to be present in the chosen
endpoint's `supported_parameters` list, which filtered out **every
provider** for every request — `atlas-cloud` was never reachable, and
the previous three pivots' 404s were dominated by this filter long
before the per-provider issues surfaced.

**Verification:**
- `curl -X POST .../chat/completions -d '<full PydanticAI payload with max_completion_tokens, tool_choice="required", structured output schema>'`
  with `provider.require_parameters=true` → 404 against any provider.
- Same payload with `provider.require_parameters=true` REMOVED →
  200 OK, routing trace confirms `provider=AtlasCloud`.
- AtlasCloud handles `max_completion_tokens` correctly (treats it as an
  alias of `max_tokens`); the parameter just isn't *advertised*, so the
  `require_parameters` filter rejected it.

**Final pin:**

```python
{
    "provider": {
        "order": ["atlas-cloud"],
        "allow_fallbacks": False,
        "quantizations": ["fp8"],
        # require_parameters removed — see "Fourth pivot" rationale.
    }
}
```

**Rationale for removal:**
- **`require_parameters` is a defense-in-depth check that backfired.** Its
  intent was to prevent OpenRouter from silently routing to a provider
  that ignored a request parameter (e.g., a provider that ignores
  `temperature` would silently lose determinism). But here it filtered
  every endpoint because of a SDK-level parameter-name mismatch
  (`max_completion_tokens` vs `max_tokens`), not a semantic gap.
- **Determinism is still pinned by the three remaining keys.** A single
  provider in `order` + `allow_fallbacks=False` means OpenRouter routes
  every request to AtlasCloud — never to a different provider that
  might handle parameters differently. `quantizations=["fp8"]` keeps
  the F2-baseline-relevant quantization fixed for the chosen provider.
  Pitfall #2 (silent quantization drift between providers) cannot
  trigger because there is only one provider in scope.
- **`require_parameters` can be re-introduced after either of:**
  (a) PydanticAI ≥ 0.5 migrates to a sane parameter naming scheme that
  matches OpenRouter providers' `supported_parameters`, OR
  (b) qwen/qwen3-coder providers add `max_completion_tokens` to their
  `supported_parameters` advertisements.

**Lesson learned (the canonical one):**
This was a multi-pivot saga. The first three pivots (`fireworks`/`fp16` →
`together`/`fp8` → `venice`/`fp8` → `atlas-cloud`/`fp8`) all returned 404,
but each layer of fix appeared to make progress because the symptom
(HTTP 404) was the same. The actual cause —
`require_parameters=True` × `max_completion_tokens` not in any provider's
`supported_parameters` — was a property of the FILTER FLAG, not the
chosen provider. **Future debugging of OpenRouter 404s must start by
disabling `require_parameters` and observing which provider the request
naturally lands on**, then re-add `require_parameters` once the per-call
parameter set is confirmed to match every provider's
`supported_parameters` list.

**Implementation footprint of this pivot:**
- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — `_PROVIDER_ROUTING`
  literal: `require_parameters` key removed; module docstring documents
  all four pivots and the SDK-naming root cause.
- `apps/generation-engine/tests/test_smoke_qwen.py::test_extra_body_forwarded`
  — assertion drops `require_parameters` from the expected provider dict.
- This decision doc — final audit trail for all four pivots.

## References

- `apps/generation-engine/src/mcpgen_engine/llm/sampling.py` — implementation
- `apps/generation-engine/tests/test_smoke_qwen.py::test_extra_body_forwarded` — regression guard
- `.planning/research/PITFALLS.md` #2 — Qwen3-Coder quantization drift
- `.planning/phases/02-generation-engine-architect-pass-0-1/02-CONTEXT.md` D-04, D-08
- `.planning/phases/02-generation-engine-architect-pass-0-1/02-RESEARCH.md` Assumptions A1, A3
- `docs/mcpgen-model-and-provider-override.md` §3 (Provider routing pinning)
- OpenRouter live endpoint inventory: `GET /v1/models/qwen/qwen3-coder/endpoints`
