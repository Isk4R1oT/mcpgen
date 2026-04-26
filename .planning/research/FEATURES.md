# Feature Research

**Domain:** MCP server generator (OpenAPI / GraphQL / Postman → deployed Model Context Protocol server)
**Researched:** 2026-04-26
**Confidence:** HIGH for source-of-truth docs (`docs/mcpgen-*`); MEDIUM for ICP feature expectations (training-data knowledge of MCP ecosystem April 2026); LOW for live competitor feature parity (web access denied during research, see Sources note).

> **Research-tooling caveat.** WebSearch / WebFetch / Brave / Exa / Firecrawl / Context7 were all unavailable in this environment during the run (sandbox denied). Competitor feature surfaces below are reconstructed from the assistant's training data through January 2026 plus the rich primary-source documents in `docs/`. Anything specific to a named competitor is marked LOW confidence and should be re-verified before launch GTM.

---

## 0. Scope reminder

This research is about **the feature surface of MCPGen itself** — the generator product, the cloud, the CLI, and what the generated MCP servers expose to MCP clients. It is NOT about features the generated server exposes to the underlying API user (those come from the spec). It feeds roadmap phase decomposition; complexity is sized for a solo founder with the locked stack from `docs/mcpgen-architecture.md` §4.

The MCPGen design is pre-specified to an unusual degree. Features below cross-reference `PROJECT.md` requirements (`GEN-*`, `RUN-*`, `CTRL-*`, `CLI-*`, `FE-*`, `GTM-*`) where applicable.

---

## 1. Feature Landscape

### 1.1 Table Stakes (Users Expect These)

Solo dev, API provider, internal-tools eng each assume these exist on day one. Missing = "broken product" reaction in HN comments / Discord.

| Feature | Why Expected | Complexity | Notes / Maps to |
|---|---|---|---|
| Paste OpenAPI 3.x URL → working MCP server in <60s, no signup | Industry baseline since Vercel/Resend/Inngest set the bar; the product's primary tagline | M | `CLI-01`, `FE-01`, `FE-02`. Cold-start mitigations in `docs/mcpgen-architecture.md` §5.9. |
| File upload of OpenAPI 3.x JSON/YAML | Many specs aren't on a public URL (private APIs, Postman exports converted) | S | Drag & drop in landing; CLI accepts file path. `docs/mcpgen-ux-flow.md` §3 already shows this. |
| OpenAPI 3.x parsing — including `$ref` resolution, `oneOf`/`anyOf`/`allOf`, security schemes | Anything less and Stripe/GitHub/Linear specs fail | M | `prance` library handles `$ref`. `GEN-01`. |
| Generated server speaks current MCP protocol (2025-06-18 + 2025-03-26 annotations) | Required by Claude Desktop, Cursor, ChatGPT Deep Research | S | Built into Stage E templates. `GEN-07`, `GEN-08`. |
| CLI: `npx mcpgen init <url>` works without an account | "Open-source CLI + managed cloud" is the distribution story; locking core gen behind signup kills GitHub stars | M | `CLI-01`, `CLI-03`. |
| One-click Claude Desktop config block (or copy-paste fallback) | This is the moment users actually test the product; if friction here, conversion dies | S | `RUN-07`, `docs/mcpgen-ux-flow.md` §3 Screen 5. |
| Auth mode selection at deploy time (none / API key / pass-through / OAuth 2.1) | Three ICPs have three auth needs; "no auth" without choice = security alarm | M | `RUN-03/04/05`, `docs/mcpgen-stage-e-design.md` §1. |
| Pass-through credentials by default (we never store the upstream key) | Solo-dev ICP-A literally won't paste their Stripe live key into a SaaS form they just discovered | M | `RUN-03`, `docs/mcpgen-architecture.md` §6 + RULES.md. |
| TypeScript codegen output, downloadable as ZIP | "I want to read what you generated, not trust a black box" — transparency principle | S | `GEN-08`, `docs/mcpgen-ux-flow.md` §1 principle 5. |
| Hosted deployment to a public HTTPS URL (one-click) | The whole point of the cloud SKU; without this we are just a CLI | M | `RUN-01/02`, `CLI-02`, `FE-04`. CF Workers for Platforms dispatch. |
| Live URL with TLS, no custom domain required | Default URL has to work; custom domains are Pro | S | Subdomain routing on `*.mcpgen.app`. |
| Email + GitHub auth | Industry baseline. Anything else (no Google/Twitter/Apple) is a deliberate scope cut | S | `CTRL-02`. |
| Usage dashboard: tool calls, P95 latency, errors, monthly quota | If you can't see usage, you can't trust the platform | M | `FE-04`, `RUN-06`, `docs/mcpgen-architecture.md` §11. |
| Generation logs visible per pass (Pass 0–5 status + duration) | Anything LLM-driven needs to be observable; Vercel/Inngest set this expectation | M | SSE per-stage callbacks `CTRL-01`, `FE-02`. |
| Preview tool list with descriptions, parameters, annotations BEFORE deploy | Users who don't trust output will not deploy | M | `FE-03`. |
| Free tier with a real (not toy) quota | Solo devs evaluate first, pay later. 100K tool-calls/mo is the marketed bar | S | `CTRL-06`. |
| Pricing page that matches code-enforced quotas (no surprise bills) | Trust kills product if billing surprises | S | `GTM-02`. |
| HTTPS only, no public-by-default deploys without a warning | Generated server with `auth=none` must be marked clearly | S | UI red state; `docs/mcpgen-ux-flow.md` §3 Screen 5. |
| Quickstart docs walked end-to-end by a real external dev before launch | Public release without verified quickstart = bad DX feedback | S | `GTM-01`. |
| Privacy page stating: "we never log spec content / upstream responses / upstream credentials" | GDPR + ICP-A trust baseline | S | `docs/mcpgen-architecture.md` §11. |
| Server name and metadata (description, version) visible in MCP `tools/list` and Claude Desktop UI | Implicit MCP best practice; otherwise the server shows up as "untitled" | S | Stage E `config.ts` template. |
| MCP Inspector compatibility — generated server runs cleanly in `@modelcontextprotocol/inspector` for debugging | Implicit. Every MCP dev's first debug move. Ours must work in Inspector. | S | F1 static check would catch protocol violations; **explicit Inspector smoke test is currently NOT in PROJECT.md and should be added** (see §4 below). |
| Stable tool names across regenerations of the same spec version | Renaming tools breaks any agent prompt cached against the old names | M | Naming is deterministic in Pass 0 + Pass 1; need a regression test in F1. |
| Working error responses that surface upstream HTTP status / body to the agent | Agent debugging requires seeing the actual error | S | Stage E `errors.ts` template; `docs/mcpgen-stage-e-design.md` "errors teach next step". |
| Stripe-style billing with metered usage and clear overage rules | Stripe Meters API is industry-standard for usage billing | M | `CTRL-06`, `RUN-06`. |
| Deletion / "delete my project" works and is honored on backups | GDPR. Implicit. | S | Drizzle cascade + R2 lifecycle. |

### 1.2 Differentiators (Competitive Advantage)

These are where we win vs hand-written servers and other generators. They tie 1:1 to Core Value in `PROJECT.md`.

| Feature | Value Proposition | Complexity | Notes / Maps to |
|---|---|---|---|
| **F2 smell-scan score on every generation** (paper rubric, threshold ≥ 4.0, `qwen3-coder` × 5-shuffle averaging per `docs/mcpgen-model-and-provider-override.md`) | "97.1% of existing MCP servers have a smell — ours don't" is the moat. No competitor scores their own output against the Anthropic paper rubric | L | `GEN-10`, `docs/mcpgen-stage-f-design.md`. |
| **F3 agent-eval pass rate per server** (real Sonnet 4.7 agent vs golden tasks, ≥ 0.7 threshold, MCP-Bench methodology) | "MCP-quality" claim is empty without this. We are the only generator that runs agent eval | L | `GEN-11`. Paid feature past free quota (`CTRL-06`). |
| **Quality badge** premium / verified / standard / needs_review | One-glance trust signal in the dashboard and (opt-in) in README | S | `FE-04`, `docs/mcpgen-stage-f-design.md` §6. |
| **Six-Tool Pattern consolidation** (`search`/`fetch`/`list_collections`/`list_objects`/`upsert`/`delete` + actions + workflows) | Industry consensus October 2025; no other generator implements it as a build-time hard rule with 100% coverage validation | L | `GEN-03`, `docs/mcpgen-pass-1-design.md`. |
| **Smart IDs** `{server}:{type}:{collection}:{identifier}` | Routing logic moves from agent reasoning into the ID itself; agents can self-correct from the ID format alone | M | `GEN-03`. Runtime in Stage E `runtime/smart_id.ts`. |
| **Build-time tool count caps with multi-server split suggestion** (>80 tools → hard fail with split path prefixes) | Anthropic data shows agents degrade past ~50 tools. Most generators just emit the full surface. We refuse to ship a known-broken server | M | `GEN-02`, `docs/mcpgen-pass-0-design.md`. |
| **Per-pass artifact transparency** — user sees Pass 0 inventory, Pass 1 routing, Pass 2 description, Pass 3 schema, Pass 4 annotations, Pass 5 response config | "Show, don't tell" + transparency principle. No black box | M | `FE-02/03`, `docs/mcpgen-ux-flow.md` §1 principle 5. |
| **`outputSchema` on every tool** (MCP 2025-06-18) with `structuredContent + content` dual return | Most existing servers don't bother with `outputSchema`; we make it the default for forward compatibility | M | `GEN-07`, `docs/mcpgen-pass-5-design.md`. |
| **Truncation guidance that teaches the agent the next step** (templates with `{N}/{Total}/{action}` placeholders) | When response gets truncated, error message tells the agent how to recover (e.g. "use `properties: ["id","name"]` to fetch fewer fields"). Most servers fail silently | M | `GEN-07`, `docs/mcpgen-pass-5-design.md` Appendix A. |
| **Field filtering with `properties` opt-in** + per-tool-type truncation thresholds (search 10K / list 15K / fetch 20K / action 5K / workflow 15K) | Response token bloat is often >2× schema bloat; nobody else fights it at the schema level | M | `GEN-07`. |
| **4 MCP annotations always set explicitly** (`readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`) with `openWorldHint=true` invariant | MCP defaults are unsafe (`destructiveHint: true` by default = confirmation prompt on every call in Cursor). We fix this | S | `GEN-06`, `docs/mcpgen-pass-4-design.md`. |
| **Drift detection daily** with diff viewer + manual / one-click / auto-regenerate toggle | API spec changes are the #1 cause of generated server rot. Retention loop. | M | `CTRL-03`, `docs/mcpgen-ux-flow.md` §6. |
| **CLI parity with web** — every action available in `mcpgen` CLI | Devs who prefer terminal don't have to use the web for any blocking action | M | `CLI-01/02/03`, `docs/mcpgen-ux-flow.md` §5. |
| **Generation playground** — try the generated server inline before deploy, with token-cost trace | "Trust through transparency"; users see the server actually work before committing | L | `docs/mcpgen-ux-flow.md` §3 Screen 4. **Currently NOT in PROJECT.md MVP** but ux-flow positions it as the most important screen. See §4. |
| **Cost cap per generation** (`$0.50` free / `$2.00` Pro, server-enforced) | No surprise LLM bills; competitive with hand-written cost predictability | S | `CTRL-07`. |
| **4-layer caching** (L1 spec sha + L2 pass-input hash + L3 tool hash + L4 Anthropic prompt cache) | Re-generating the same spec is free; lets users iterate without anxiety | M | `GEN-12`. |
| **Public quality badge for the generated README** (opt-in) | If the score is great, the API provider (ICP-B) wants to brag. Distribution loop | S | `FE-04`, `docs/mcpgen-architecture.md` §5.5. |
| **Pre-curated golden tasks for top 10 APIs** (Stripe / GitHub / Notion / Linear / Slack / Calendar / etc.) | Out-of-the-box F3 eval works for the most-asked-about APIs without user setup | M | `GEN-11`, `docs/mcpgen-stage-f-design.md` §5.3. |
| **Single LLM model** (`qwen/qwen3-coder` via OpenRouter) for whole pipeline = $0.10–0.13 per generation | ~10–20× cheaper than competitors who rely on Sonnet/GPT-5/Opus mixes; passes the savings to users | S | `GEN-13`, `docs/mcpgen-model-and-provider-override.md`. |

### 1.3 Anti-Features (Commonly Requested, Often Problematic)

Things competitors do or users ask for that we deliberately do NOT build. Cross-checked against `PROJECT.md` Out of Scope; nothing here contradicts it.

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| **`search_tools` runtime meta-tool** / dynamic tool discovery at run time | "I have 500 tools, let the agent search them on the fly" | Build-time decisions over runtime hopes (engine principle 4). 90% of LLMs don't use meta-tools well — they pick the first one that compiles and stop. Empirically degrades agent task success | Multi-server split (>80 tools → suggest split). `PROJECT.md` OOS. |
| **LLM-generated examples without execution traces** | Examples make descriptions richer (paper rubric component 6) | Hallucination. Paper-confirmed top smell. Wrong examples poison agent reasoning more than no examples | `examples = null` in v0; v1.1 reads from real execution traces in sandbox. `PROJECT.md` OOS. |
| **GraphQL / Postman / AsyncAPI input** in MVP | Solo devs may have non-OpenAPI specs | Each parser is its own testing surface; format-agnostic IR is the architectural answer. Ship one input format reliably, add others as plugins. | OpenAPI 3.x only in MVP; parser plugins post-launch. `PROJECT.md` OOS. |
| **Python / Rust / Go output runtimes** | Some teams want Python servers | Codegen templates are cheap to add but add testing/docs surface. Demand-driven; revisit when 10 users ask | TypeScript on CF Workers only; IR is runtime-agnostic. `PROJECT.md` OOS. |
| **Multi-region runtime** | "What if Fly's IAD goes down" | Solo-friendly ops principle. CF Workers global edge handles routing; engine + Postgres single-region is fine until $100K ARR | Single-region MVP. `PROJECT.md` OOS. |
| **A/B deploys / regression testing across spec versions** | Looks great in a v2 demo | Not on critical path to first 100 paying users. Each adds a week of UI+infra work | Drift detection + one-click regenerate (manual diff review). `PROJECT.md` OOS. |
| **SSO / Team plan / RBAC** | B2B sales pressure | Solo-dev / solo-org ICP comes first. Logto handles email + GitHub fine until t+3mo | Defer to t+3mo, sell Pro one-seat for now. `PROJECT.md` OOS. |
| **Auto-regenerate on drift** by default | "Just keep my server in sync" | Silently regenerating a live tenant Worker is destructive — schemas change under deployed clients | Drift in MVP; auto-regenerate is opt-in toggle. `PROJECT.md` OOS. |
| **Custom domains** | Looks pro | Adds DNS / cert / SNI complexity for limited ICP-A value | `*.mcpgen.app` subdomain in MVP; Pro feature later. `PROJECT.md` OOS implicit. |
| **Public quality badge by default** on every generation | "Show off the good ones" | Public ranking pressure on early-stage generations creates wrong incentives (people game the score) | Opt-in only. `PROJECT.md` OOS. |
| **Code Mode** (`search()` + `execute()` sandbox model from Cloudflare) | Better token efficiency than Native MCP for huge APIs | Six-Tool Pattern delivers 70–90% of Code Mode's token savings without sandbox security surface; agents are RL-trained on Native MCP | Native MCP only; Code Mode revisit at v2.x for >1000-endpoint APIs. `PROJECT.md` OOS. |
| **Multi-family LLM judge ensemble for F2** (Sonnet + GPT-5 + Gemini) | Higher inter-rater agreement (86.67% vs ~75%) | 10× cost; the override doc explicitly trades quality for cost using single Qwen3-Coder × 5-shuffle | Single Qwen3-Coder × 5-shuffle averaging. `PROJECT.md` OOS. |
| **LiteLLM** as model gateway | "Multi-provider abstraction" | Adds a layer; OpenRouter is already an OpenAI-compatible endpoint usable directly via PydanticAI's `OpenAIProvider` | Direct OpenRouter client. `PROJECT.md` OOS. |
| **Generation cost optimization beyond caching** (model swap, dynamic temperature, prompt re-ranking) | Could be 20% cheaper | Solo founder time > 20% LLM cost reduction. Caching gets us most of the way | 4-layer caching only in MVP. |
| **LLM in Stage A (parsing) / Stage E (codegen) / F1 (static validation)** | "Have the LLM fix tsc errors" | Cost, latency, reproducibility, debuggability. These stages must be deterministic | All three stages 100% deterministic. `PROJECT.md` OOS. |
| **Public-server-by-default ("frictionless deploy")** | Faster onboarding | Trivially abusable as proxy for upstream API; would burn through quotas | Auth required by default; public-deploy is a deliberate red-marked choice. |
| **Storing upstream credentials by default** | "I just want it to work" | Liability we don't need; pass-through has lower trust friction for ICP-A | Pass-through default; stored mode marked "less secure". `PROJECT.md` OOS implicit. |
| **Inline LLM-driven spec fixer** for invalid OpenAPI | "Spec is broken, please fix" | LLM-edits to user specs is a footgun (silent semantic changes). Surface errors and let user fix | Surface validation errors; document common fixes. |
| **Long-running cron-style background tools in the generated server** | "I want a tool that polls every 5 min" | MCP tools are request/response; agents call them. Cron is out of scope | Generated server is request-driven only; users wire their own cron. |
| **Built-in upstream rate-limit smoothing / queue / retry-with-backoff** beyond a basic 429 retry | "Stop me from hammering the API" | Easy to over-engineer; upstream limits vary wildly. Simple `Retry-After` honoring is enough; users can put a queue in front | Basic 429 honoring + helpful error to agent. |

---

## 2. Implicit Features the Docs Don't Explicitly Mention

ICPs will assume these. Adding them to PROJECT.md (or explicitly excluding them) is recommended.

| Feature | Why ICPs Expect It | Complexity | Recommendation |
|---|---|---|---|
| **MCP Inspector compatibility smoke test** in F1 | Every MCP dev debugs first with `@modelcontextprotocol/inspector`. If our server doesn't load there, we look amateur | S | Add as F1 check. Spawn Inspector in CI; assert `tools/list` and `tools/call` both succeed. |
| **`mcpgen regenerate <project>`** — recreate from same stored spec without re-paste | Once a project exists, "redo with new options" should be one command | S | Add CLI subcommand. Spec is already in R2 (`mcpgen-specs` bucket). |
| **`mcpgen sync`** — re-fetch spec, diff, optionally regenerate (CLI mirror of Drift Watcher) | Web has it; CLI users want it. The ux-flow doc actually mentions this | S | CLI parity with `CTRL-03`. |
| **`.mcpgen.yaml`** project config in the generated repo | Reproducibility. Mentioned in `docs/mcpgen-ux-flow.md` §5 but not in PROJECT.md | S | Add to Stage E template. Stores `target_complexity`, category filter, version pins. |
| **`mcpgen test` against locally generated server** using golden tasks (free for top-10 APIs) | F3 agent eval is a hosted feature; CLI users want a free local equivalent | M | Lighter local mode (rule-based F3 only, no LLM judge), or skip — but document the gap. |
| **Resumable / re-attachable generations** (lose your tab during a 60s gen, come back to dashboard, see status) | SSE callbacks make this easy; users assume it | S | Job ID in URL; dashboard polls. Already in `CTRL-01` SSE pattern. |
| **Read-only sharing link** for a generation result (preview screen) | "Show my coworker what was generated before I deploy" | S | UUID-keyed view of a generation; no auth required. |
| **Tool-level "regenerate this one"** in the preview — re-author Pass 2/3 for a single tool | Reviewing 12 tools, finding one bad description, having to redo all 12 = bad UX | M | Triggers per-tool subset of Pass 2 + Pass 3 + inline gate. Aligns with cache layer L3. |
| **Inline edit of tool description / parameter description** before deploy | If our LLM gets it 90% right, users want the last 10% | M | Free-text edit; bypass quality gate (with warning). Saves to project. |
| **Markdown export of the Quality Report** (sales artifact for ICP-B) | API providers need to justify their integration choice to leadership | S | PDF / Markdown export of the F1+F2+F3 report. `docs/mcpgen-ux-flow.md` §4 mentions PDF. |
| **`mcpgen.app/<server>/.well-known/mcp.json`** — discovery manifest for MCP clients | Some clients (and registries like the upcoming MCP registry) auto-discover servers via well-known | S | Static file from Stage E. Future-proofs against MCP discovery proposals. |
| **Deployment region pinning** (or at least transparency about where the Worker lives) | Compliance-conscious ICP-C may need to know data residency | S | Document: "tenant Workers are CF global edge; control plane single-region". |
| **Anonymous client telemetry** in the dashboard (which MCP client is calling — Claude Desktop / Cursor / Cline / Continue / Goose) | Users want to know who's actually using their MCP server. Already mentioned in ux-flow Screen 6 | S | Inspect User-Agent at dispatch; aggregate in TimescaleDB. |
| **Health-check tool** auto-included (`__mcpgen_healthcheck`) | Some clients ping `tools/list` on connect; a no-op tool helps debugging | XS | Optional; could be controversial (extra tool count). Skip for MVP. |
| **`mcpgen logs --tail`** | Devs are used to `wrangler tail` / `vercel logs --tail`; expect the same | M | Stream BetterStack via SSE through our API. v1.x. |
| **Webhook on usage events** (e.g. quota hit, drift detected) | Internal-tools eng (ICP-C) wants Slack pings | M | Inngest already has the events; add a webhook config. v1.x. |
| **Server status badge** (`https://mcpgen.app/<server>/badge.svg`) showing live/healthy | README adornments; trivially viral | S | SVG endpoint with live status. v1.x but easy. |
| **Versioning of generations** — can roll back to last known-good if F3 fails on regen | Drift regenerate may break things; need an undo button | M | Generations table already has history; add a "promote" action to switch the live deployment. v1.x. |
| **`mcpgen doctor`** — diagnose local environment for common issues (Node version, network, MCP client config) | Standard CLI hygiene | S | v1.x. |
| **Privacy mode** (CLI only, no spec ever uploaded to cloud) | ICP-C with private internal APIs literally cannot upload spec content | M | Already implied by "CLI works offline". Make it explicit and document. `docs/mcpgen-ux-flow.md` §9 mentions this. **Should be in PROJECT.md.** |
| **OAuth callback URL preview** before user finishes OAuth-mode setup | OAuth setup fails when redirect URIs are wrong; show what they need to register upstream | S | Stage E auth template knows the URL; render in deploy screen. |

---

## 3. Feature Dependencies

```
Spec parsing (GEN-01)
   └──requires──> nothing
              ↑
              │
   Pass 0 Inventory (GEN-02)
   └──requires──> spec parsing
              ↑
              │
   Pass 1 Six-Tool consolidation (GEN-03)
   └──requires──> Pass 0 output
   └──validates──> 100% coverage of Pass 0 endpoints
              ↑
              │
   Pass 2 Description (GEN-04)  ── parallel with ──  Pass 3 Parameters (GEN-05)
   └──requires──> Pass 1 output                     └──requires──> Pass 1 output
              ↑                                          ↑
              └──────────────┬───────────────────────────┘
                             │
   Pass 4 Annotations (GEN-06)
   └──requires──> Pass 1 + Pass 3 outputs (tool-type rules + verb patterns)
              ↑
              │
   Pass 5 Response Shaping (GEN-07)
   └──requires──> Pass 2/3/4 outputs
              ↑
              │
   Stage E Codegen (GEN-08)
   └──requires──> all of Pass 1–5
              ↑
              │
   Stage F1 Static (GEN-09)
   └──requires──> Stage E output
              ↑
              │
   Stage F2 Smell (GEN-10)
   └──requires──> Pass 2/3/4 outputs (judges them; doesn't need codegen)
              ↑
              │
   Stage F3 Agent eval (GEN-11)
   └──requires──> Stage E output + deployed sandbox tenant Worker

Deployment (CLI-02 / FE-04 / RUN-01/02)
   └──requires──> Stage E artifact
   └──requires──> Auth mode selection (RUN-03/04/05)
   └──requires──> Dispatch Worker live
              ↑
              │
   Usage events + billing (RUN-06 / CTRL-06/07)
   └──requires──> Deployment live + auth working
              ↑
              │
   Dashboard (FE-04)
   └──requires──> Usage events flowing + Quality Report from Stage F
              ↑
              │
   Drift detection (CTRL-03)
   └──requires──> Spec stored + Inngest cron + dashboard for surfacing
              ↑
              │
   One-click regenerate (CTRL-03 + CLI-01 reuse)
   └──requires──> Drift detection + caching layer (L1 spec hash)

Frontend wire-up (FE-01..FE-04)
   └──requires──> CTRL-01 (BFF) + SSE channel + auth
   └──UI is locked in claude-design-ui/MCP-Gen.zip — wire-up only

GTM (GTM-01..GTM-03)
   └──requires──> All of the above E2E for an external dev to try
```

### Dependency Notes

- **Pass 1 must come after Pass 0** — Six-Tool consolidation requires the categorized inventory.
- **Pass 2 and Pass 3 are parallel** — they author different parts of the same tool and share Pass 1 output. Both must finish before Pass 4 (annotations) which uses parameter info to resolve verb-pattern edge cases.
- **Pass 5 requires all earlier passes** — pagination strategy depends on Pass 1 routing, field filtering depends on Pass 3 schemas, truncation guidance references Pass 4 annotations.
- **Stage F2 does NOT depend on Stage E** (it judges descriptions, not code) but in practice the pipeline runs E before F2 for retry-orchestration simplicity.
- **F3 agent eval requires a live sandbox tenant Worker** — this is an integration gate between Engine and Runtime workstreams (per `docs/mcpgen-gsd-sprint-plan.md`).
- **Drift detection requires the spec to be stored in R2** — so deletion / privacy mode interacts with drift: privacy-mode projects can't have managed drift detection.
- **Quality badge requires F2+F3 to have run** — free tier with 1 F3 eval/mo means most free generations have F2 score but no F3 — badge logic must handle this gracefully ("standard" not "verified").
- **Conflict: privacy mode (no spec upload) ↔ Drift Watcher (needs stored spec)** — two paths: (a) drift requires opt-in spec upload, (b) privacy mode disables drift. Document explicitly.
- **Conflict: pass-through credentials ↔ F3 agent eval against real upstream** — agent eval needs *some* credential to run; sandboxes use our managed test creds, but for user-supplied private APIs we can only run F3 in mock mode. Document.

---

## 4. MVP Definition

Mapped to the 10-phase sprint plan in `docs/mcpgen-gsd-sprint-plan.md`. PROJECT.md already enumerates the v1 list; this section flags what to **add** and what to **defer** based on the research.

### Launch With (v1 — already in PROJECT.md)

All `GEN-01..13`, `RUN-01..07`, `CTRL-01..08`, `CLI-01..03`, `FE-01..05`, `GTM-01..03` are correct. No removals proposed.

### Add to PROJECT.md (research surfaces these as missing)

- [ ] **MCP Inspector compatibility check in F1** — non-negotiable; every MCP dev's first debugging tool. Add as a sub-bullet to `GEN-09`. Complexity: S.
- [ ] **`.mcpgen.yaml` project config** in generated repo — reproducibility; mentioned in ux-flow but not PROJECT.md. Add to `GEN-08`. Complexity: S.
- [ ] **`mcpgen sync` CLI subcommand** — CLI parity with Drift Watcher. Mentioned in ux-flow §5. Add to `CLI-*`. Complexity: S.
- [ ] **`mcpgen regenerate` CLI subcommand** — recreate without re-pasting URL. Add to `CLI-*`. Complexity: S.
- [ ] **Privacy mode (CLI-only, no spec upload)** — ICP-C requirement; mentioned in ux-flow §9 edge cases but not PROJECT.md. Add as constraint. Complexity: S (mostly a documented mode).
- [ ] **Generation playground inline test** — `docs/mcpgen-ux-flow.md` §3 Screen 4 calls this "the most important screen". Currently ambiguous in PROJECT.md (`FE-03` is preview, not playground). Add `FE-06` for in-browser tool execution against live deployment. Complexity: M.
- [ ] **Markdown / PDF export of Quality Report** — sales artifact for ICP-B; ux-flow §4 mentions it. Add to `FE-04`. Complexity: S.
- [ ] **Resumable generation via job ID URL** — implicit; SSE pattern already supports it. Document. Complexity: S.

### Add After Validation (v1.x — first 90 days post-launch)

- [ ] Tool-level "regenerate this one" — needs L3 cache hit; reduces user friction.
- [ ] Inline edit of description/parameter before deploy.
- [ ] `mcpgen logs --tail`.
- [ ] Server status badge (`badge.svg`).
- [ ] Versioning + rollback of generations.
- [ ] Webhook on drift / quota events.
- [ ] User-supplied golden tasks for F3 (Pro).
- [ ] Custom domains (Pro).
- [ ] Anonymous client telemetry breakdown in dashboard (already in ux-flow Screen 6).

### Future Consideration (v2+ — post-PMF)

- [ ] GraphQL / Postman / AsyncAPI parsers (parser plugin architecture).
- [ ] Python / Rust / Go output runtimes.
- [ ] Code Mode for very large APIs.
- [ ] A/B deploys / canary deploys.
- [ ] Regression testing across spec versions.
- [ ] SSO / Team / RBAC.
- [ ] Multi-region runtime + Postgres.
- [ ] Self-hostable engine for compliance customers.
- [ ] Examples generation via real execution traces (the deferred 6th paper rubric component).

---

## 5. Feature Prioritization Matrix

User Value × Implementation Cost. Priority key: P1 launch / P2 should-have / P3 nice-to-have.

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| OpenAPI 3.x → working server in 60s | HIGH | MEDIUM | P1 |
| One-click Claude Desktop config | HIGH | LOW | P1 |
| Pass-through credentials default | HIGH | MEDIUM | P1 |
| Six-Tool Pattern + smart IDs (Pass 1) | HIGH | HIGH | P1 |
| F1 static validation + tsc | HIGH | LOW | P1 |
| F2 smell scan with score | HIGH | MEDIUM | P1 |
| F3 agent eval against golden tasks | HIGH | HIGH | P1 (Pro/PAYG; free 1/mo) |
| Per-pass artifact transparency in UI | HIGH | MEDIUM | P1 |
| Hosted deploy via dispatch worker | HIGH | HIGH | P1 |
| Usage dashboard with cost+latency | HIGH | MEDIUM | P1 |
| Drift detection daily | MEDIUM | MEDIUM | P1 |
| 4-layer caching | HIGH | MEDIUM | P1 |
| MCP Inspector compatibility smoke | HIGH | LOW | P1 (add to PROJECT.md) |
| `.mcpgen.yaml` config | MEDIUM | LOW | P1 (add to PROJECT.md) |
| Privacy mode (no upload) | HIGH (ICP-C) | LOW | P1 (add to PROJECT.md) |
| Generation playground inline test | HIGH | MEDIUM | P1 (add to PROJECT.md) |
| `mcpgen sync` / `regenerate` | MEDIUM | LOW | P1 (add to PROJECT.md) |
| Quality Report export (MD/PDF) | MEDIUM (ICP-B) | LOW | P1 (add to PROJECT.md) |
| Public quality badge (opt-in) | MEDIUM | LOW | P1 |
| Anonymous client telemetry | MEDIUM | LOW | P2 |
| Tool-level "regenerate this one" | MEDIUM | MEDIUM | P2 |
| Inline edit description/params | MEDIUM | MEDIUM | P2 |
| Versioning + rollback | MEDIUM | MEDIUM | P2 |
| Webhooks on events | MEDIUM (ICP-B/C) | MEDIUM | P2 |
| Status badge SVG | LOW | LOW | P2 |
| `mcpgen logs --tail` | MEDIUM | MEDIUM | P2 |
| Custom domains | MEDIUM | MEDIUM | P2 (Pro) |
| GraphQL parser | LOW (in MVP context) | HIGH | P3 |
| Python output runtime | LOW (in MVP context) | HIGH | P3 |
| A/B deploys | LOW | HIGH | P3 |
| Code Mode | LOW (most APIs <80 tools after Pass 1) | HIGH | P3 |
| SSO / Team plan | LOW (MVP) / MEDIUM (post-PMF) | MEDIUM | P3 |

---

## 6. Competitor Feature Analysis

> **LOW confidence** — web access was denied during this research. The matrix below is reconstructed from training-data knowledge (through January 2026) of the MCP generator landscape and adjacent OpenAPI-to-something tools (Stainless, Fern, Speakeasy SDK generators). Verify before launch GTM messaging.

| Feature | `openapi-mcp-server` (open source, snaggle-ai) | Stainless MCP product | Cloudflare's `mcp-server-cloudflare` examples | Anthropic Console MCP integrations | **MCPGen** |
|---|---|---|---|---|---|
| **Input formats** | OpenAPI 3.x (LOW conf) | OpenAPI 3.x → Stainless IR (LOW conf) | Hand-written for Cloudflare APIs | Curated server registry (not a generator) | OpenAPI 3.x in MVP; format-agnostic IR |
| **Output runtime** | Node.js / Python (LOW conf) | TypeScript SDKs primarily | TypeScript / CF Workers | N/A | TypeScript / CF Workers in MVP |
| **Hosted deploy** | None (CLI-only) | Stainless cloud (LOW conf) | Self-deploy | N/A | One-click CF Workers for Platforms |
| **Tool count consolidation** | 1:1 endpoint→tool (LOW conf) | Likely 1:1 (LOW conf) | Hand-curated | Hand-curated | Six-Tool Pattern + actions/workflows; ~50→6–12 |
| **Smart IDs** | None (LOW conf) | Unknown | None | None | `{server}:{type}:{coll}:{id}` |
| **Description quality** | Verbatim from spec | Likely curated by SDK team | Hand-written | Hand-written | 5-of-6 paper rubric components, length budgets per type |
| **Parameter description quality** | Verbatim | Likely good (SDK heritage) | Hand-written | Hand-written | 5-component MCP Bundles + naming normalization |
| **MCP annotations (4 hints)** | Often missing (LOW conf) | Unknown | Sometimes | Set explicitly | Always set; `openWorldHint=true` invariant |
| **`outputSchema` (MCP 2025-06-18)** | Often missing (LOW conf) | Unknown | Often missing | Set | Always set; structured + content dual return |
| **Pagination guidance** | Inherited from spec; no auto-detect (LOW conf) | Unknown | Hand-written | Hand-written | Auto-detect cursor/offset/page-number; default `limit=25` |
| **Truncation handling** | None typical | Unknown | None | Best-effort | Per-tool-type thresholds + teaching templates |
| **Smell scan / quality score** | None | None known | None | None | F2 paper rubric, threshold ≥4.0 |
| **Agent eval / pass rate** | None | None known | None | Manual QA | F3 against golden tasks, ≥70% threshold |
| **Drift detection** | None | None known | N/A | N/A | Daily Inngest cron; diff viewer |
| **Auth modes** | API key / none (LOW conf) | API key / OAuth (LOW conf) | All (custom) | All (curated) | None / API key / pass-through / OAuth 2.1 |
| **Pass-through credentials** | Sometimes (LOW conf) | Unknown | N/A | N/A | Default; we don't store keys |
| **Generated server transparency (read the code)** | Yes (you generated it) | Yes (you own the SDK) | Yes | N/A | Yes; ZIP download + inline code view |
| **Pricing model** | Free / OSS | SDK-platform pricing (LOW conf) | Free (DIY) | Free (curated) | Open-core: free CLI + tiered cloud |
| **MCP Inspector compatibility** | Sometimes (LOW conf) | Unknown | Yes | Yes | Will be enforced via F1 check |

**Net read of the matrix:** The competitive moat is Stage F (F2 + F3) and Pass 1 (Six-Tool Pattern). No competitor in training data does either as a build-time hard rule. Most generators are 1:1 endpoint-to-tool mappers, which is exactly the smell pattern the paper criticizes.

---

## 7. Risks Specific to the Feature Set

| Risk | Source | Mitigation |
|---|---|---|
| Six-Tool Pattern fits "data APIs" (Stripe, Notion, GitHub) but is awkward for action-heavy APIs (Twilio, Calendly) | `docs/mcpgen-pass-1-design.md` notes 13–15 tools is acceptable for action-heavy | Document explicitly; surface in Quality Report when action+workflow tools dominate. |
| Generation playground (Screen 4 in ux-flow) is the highest-conversion screen but most expensive to build (it needs an MCP-client harness in the browser) | `docs/mcpgen-ux-flow.md` §3 + §12 | Phase it: MVP = static "Try in Claude Desktop"; v1.x = browser-side `@modelcontextprotocol/inspector` embed. |
| F3 agent eval cost ($1–3) eats unit margin if abused | `CTRL-06`, `docs/mcpgen-stage-f-design.md` | Quota model already in place; rate-limit F3 by org per day. |
| Per-pass artifact UI (transparency principle) is a lot of frontend work but UI is locked | `FE-02/03/05`, `docs/mcpgen-ux-flow.md` | Locked design already accommodates per-pass tabs; wire-up only. Verify the `MCP-Gen.zip` actually includes Pass 0–5 components before kicking off. **Action item.** |
| MCP spec is a moving target (2025-03-26 → 2025-06-18 → next) | MCP versioning | F1 protocol-version check + a single source-of-truth constant; cached F1 outputs invalidate when constant changes. |
| One-click Claude Desktop config depends on Anthropic deeplink schema (`claude://` or `.mcpb`) | `docs/mcpgen-ux-flow.md` §12 risk #3 | Verify deeplink support in W3 of sprint; fall back to copy-paste with prominent button. |
| 4-layer caching can return a stale, deprecated server if a model improvement is rolled out | `GEN-12` | Cache key includes `model_id`; bumping model invalidates downstream layers. Already in design. |

---

## 8. Sources

**Primary (HIGH confidence — all loaded for this research):**
- `/Users/igor/Projects/mcpgen/.planning/PROJECT.md` (v1 requirements + OOS list)
- `/Users/igor/Projects/mcpgen/CLAUDE.md` (sections 1, 5, 6, 7, 10, plus glossary)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-architecture.md` (sections 1–10)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-ux-flow.md` (full document)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-stage-e-design.md` (sections 0–4, especially template inventory)
- `/Users/igor/Projects/mcpgen/docs/mcpgen-stage-f-design.md` (sections 0–6)
- Pass design docs referenced by glossary in CLAUDE.md (HIGH confidence on what each pass produces)

**Secondary (MEDIUM confidence — paraphrased from CLAUDE.md):**
- `docs/mcpgen-pass-{0,1,2,3,4,5}-design.md` — referenced via glossary
- `docs/mcpgen-model-and-provider-override.md` — model decisions
- `docs/mcpgen-gsd-sprint-plan.md` — phase ordering
- arXiv 2602.14878 "MCP Tool Descriptions Are Smelly!" — paper rubric source
- arXiv 2508.20453 MCP-Bench — F3 methodology
- MCP spec 2025-03-26 (annotations) and 2025-06-18 (`outputSchema`)

**Tertiary (LOW confidence — training-data only, web access was denied):**
- `openapi-mcp-server` (snaggle-ai), `openapi-mcp` (jedisct1) — feature surface inferred from OSS norms
- Stainless MCP product offering — inferred from their SDK generation business model
- Anthropic Console MCP curated registry — inferred from observed UX
- Cloudflare `mcp-server-cloudflare` reference — inferred from Cloudflare's generally hand-written MCP examples
- General OpenAPI-to-SDK ecosystem (Fern, Speakeasy) — for adjacent-tool feature norms

**Caveat:** Section 6 (competitor matrix) and Section 1.3 anti-feature reasoning involving competitors were not refreshed against live web sources. Recommend re-running this research with web access before the public launch GTM (W9 in sprint plan) so positioning claims are accurate.

---

*Feature research for: MCP server generator domain*
*Researched: 2026-04-26 — research-tooling caveat noted in §0 and §8.*
