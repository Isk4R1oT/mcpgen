# 2026-05-04 — Switch to qwen3-coder-next + Ionstream/AtlasCloud for prefix caching

## Decision

- **Model**: `qwen/qwen3-coder` → `qwen/qwen3-coder-next`
- **Provider order**: `["atlas-cloud"]` (allow_fallbacks=False) →
  `["ionstream", "atlas-cloud"]` (allow_fallbacks=True)
- **Quantization**: still `["fp8"]`
- **Cache observability**: `usage.include=true` already shipped 2026-05-04

## Why

Both prior decision pins (atlas-cloud / fp8) and the qwen3-coder model
itself yielded `cached_tokens=0` on every repeat call — neither
AtlasCloud-for-qwen3-coder nor any other endpoint at fp8 advertised
`input_cache_read` pricing. Without prefix caching the warmup
infrastructure shipped earlier today was a no-op for cache hits.

Verified empirically against OpenRouter:

```
GET /api/v1/models/qwen/qwen3-coder-next/endpoints
  Parasail   bf16  cache_read=$0.07/M   ← no fp8, skipped
  Ionstream  fp8   cache_read=$0.09/M   ← chosen primary
  AtlasCloud fp8   cache_read=$0.18/M   ← chosen fallback
  Novita     fp8   cache_read=None      ← skipped (no cache)
  Phala      ?     cache_read=None      ← skipped
  Together   ?     cache_read=None      ← skipped
```

Live test with a 1815-token system prompt:

```
call-1  Ionstream  cached=0/4015        cold
call-2  Ionstream  cached=0/4015        building
call-3  Ionstream  cached=0/4015        building
call-4  Ionstream  cached=3968/4015     98.8% HIT  ← cache warmed
```

Cache materialization is best-effort (~3 calls / 15s on Ionstream
empirically), matching the OpenRouter docs note for DeepSeek-class
providers. Within a single user generation (Pass 0–5 + retries =
~30 LLM calls in 100s) sticky routing keeps subsequent passes on the
same warm node and yields hits.

## Trade-offs accepted

1. **Different model.** `qwen3-coder-next` is the smaller (80B / 3B
   active) coder-tuned successor to `qwen3-coder` (480B / 35B active).
   Quality on dense API-spec compression tasks may differ slightly;
   the F2 judge + golden-task eval covers regression detection.
2. **AtlasCloud at fp8 fallback costs more** ($0.18/M cache_read vs
   $0.09/M Ionstream) — only matters when Ionstream is degraded;
   prefer staying available over saving the difference.
3. **Cache TTL is short** (~5 min on most providers, possibly less on
   Ionstream). Engine warmup loop fires every 240 s; on idle the
   cache may evict between cycles. The ~$0.05/h idle cost of
   keep-warm is well worth the latency reduction on every generation.
4. **No Parasail** despite cheapest cache_read — they only host
   qwen3-coder-next at bf16, which our fp8 quantization pin filters
   out. Re-evaluate the bf16 vs fp8 trade-off if Ionstream becomes
   unreliable.

## Migration history (running tally per llm/sampling.py)

5. 2026-04-28 atlas-cloud / fp8 / no `require_parameters` — verified
   working for the PydanticAI request shape. cached_tokens=0 across
   all calls — provider does not cache for `qwen/qwen3-coder`.
6. **2026-05-04** ionstream / atlas-cloud / fp8 / qwen3-coder-NEXT —
   both cache-supporting, both fp8, both fallback-eligible.
