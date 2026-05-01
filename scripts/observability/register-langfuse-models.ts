// scripts/observability/register-langfuse-models.ts
//
// Register custom model pricing in Langfuse so OTel-instrumented LLM spans
// from the generation engine (PydanticAI/Logfire) get accurate cost numbers.
//
// Why we need this: by default Langfuse only knows pricing for OpenAI /
// Anthropic / Google models. We use OpenRouter-hosted Qwen3-Coder for every
// LLM pass (Pass 0/1/2/3/4/5 + F2 smell scan). Without explicit registration
// every span shows $0 and the dashboard cost rollups are useless.
//
// Pricing source: OpenRouter listing for qwen/qwen3-coder-next (released
// 2026-02-04) — $0.12/M input, $0.80/M output. The same pricing also applies
// to the older qwen/qwen3-coder (single regex pattern covers both).
//
// Idempotent: lists existing models matching the modelName first; only
// POSTs when missing. Safe to run repeatedly (CI bootstrap, dev setup).
//
// Usage:
//   pnpm langfuse:register-models
//   # or directly:
//   tsx scripts/observability/register-langfuse-models.ts
//
// Requires env vars (read from process.env — load via .env.local first):
//   LANGFUSE_HOST           e.g. http://localhost:3001
//   LANGFUSE_PUBLIC_KEY     pk-lf-...
//   LANGFUSE_SECRET_KEY     sk-lf-...

interface ModelDefinition {
  modelName: string;
  matchPattern: string;
  startDate: string | null;
  unit: 'TOKENS' | 'CHARACTERS' | 'MILLISECONDS' | 'SECONDS' | 'IMAGES';
  inputPrice: number;
  outputPrice: number;
  totalPrice: number | null;
  tokenizerId: string | null;
  tokenizerConfig: Record<string, unknown> | null;
}

const QWEN3_CODER: ModelDefinition = {
  modelName: 'qwen-qwen3-coder',
  // Regex must match every variant we use through OpenRouter — `qwen/qwen3-coder`
  // (pinned in apps/generation-engine/src/mcpgen_engine/settings.py:27) and the
  // newer `qwen/qwen3-coder-next` (released 2026-02-04, same pricing).
  matchPattern: '(?i)^qwen/qwen3-coder(-next)?$',
  // Pricing valid from the qwen3-coder-next release date. Older qwen3-coder
  // launches earlier but used the same $0.12/$0.80 schedule, so applying this
  // rule retroactively is correct.
  startDate: null,
  unit: 'TOKENS',
  inputPrice: 0.12 / 1_000_000, // $0.12 per million input tokens
  outputPrice: 0.8 / 1_000_000, // $0.80 per million output tokens
  totalPrice: null,
  // Tokenizer left null because our spans already record `usage.input_tokens` /
  // `usage.output_tokens` directly from OpenRouter response usage. Langfuse
  // multiplies recorded token counts by inputPrice/outputPrice without re-tokenizing.
  tokenizerId: null,
  tokenizerConfig: null,
};

const MODELS: ReadonlyArray<ModelDefinition> = [QWEN3_CODER];

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.length === 0) {
    throw new Error(`missing required env var: ${key}`);
  }
  return value;
}

function basicAuthHeader(publicKey: string, secretKey: string): string {
  const token = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
  return `Basic ${token}`;
}

async function createModel(args: {
  host: string;
  auth: string;
  model: ModelDefinition;
}): Promise<'created' | 'already_exists'> {
  // Idempotency strategy: POST first, treat the Langfuse 400 "already exists"
  // response as success. Listing the full model catalog to pre-check is
  // unreliable — the API returns the built-in 100+ Langfuse-managed models
  // first across many pages, and our custom row may not appear within any
  // single-page response. POST + catch is both simpler and authoritative.
  const url = new URL('/api/public/models', args.host);
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: args.auth,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args.model),
  });
  if (res.ok) return 'created';
  const body = await res.text();
  if (res.status === 400 && body.includes('already exists')) {
    return 'already_exists';
  }
  throw new Error(
    `langfuse create model failed: HTTP ${res.status} ${res.statusText} — ${body}`,
  );
}

async function main(): Promise<void> {
  const host = requireEnv('LANGFUSE_HOST');
  const publicKey = requireEnv('LANGFUSE_PUBLIC_KEY');
  const secretKey = requireEnv('LANGFUSE_SECRET_KEY');
  const auth = basicAuthHeader(publicKey, secretKey);

  for (const model of MODELS) {
    const result = await createModel({ host, auth, model });
    const inputPerMillion = model.inputPrice * 1_000_000;
    const outputPerMillion = model.outputPrice * 1_000_000;
    const tag = result === 'created' ? '[create]' : '[skip]';
    console.log(
      `${tag} ${model.modelName} — pattern ${model.matchPattern}, ` +
        `$${inputPerMillion.toFixed(2)}/M input, $${outputPerMillion.toFixed(2)}/M output`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
