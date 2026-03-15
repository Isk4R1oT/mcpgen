# mcpgen — Implementation Plan

## Milestones

### M1: Skeleton ✅
- [x] pyproject.toml, FastAPI app, docker-compose.yml, Dockerfile
- [x] Supabase tables (SQL migration)
- [x] Config (pydantic-settings), .env.example
- [x] DB models, Agent output models (AnalysisResult, GeneratedServer, ChatSuggestion)
- [x] 31 tests passing (config, db models, agent models, app health)
- [ ] POST /api/specs/upload → store file in Supabase Storage (moved to M2)
- [ ] Frontend: HomePage + StepUpload (moved to M6)

### M2: Parser ✅
- [x] OpenAPI JSON/YAML parsing (prance + openapi-spec-validator)
- [x] Parse OpenAPI 3.x and Swagger 2.0
- [x] POST /api/specs/upload, GET /api/specs/{job_id}/endpoints
- [x] 16 parser tests + 5 API tests, petstore.yaml fixture
- [ ] Frontend: StepEndpoints (moved to M6)

### M3: AI Analysis ✅
- [x] PydanticAI analyzer agent + OpenRouter (x-ai/grok-code-fast-1)
- [x] AnalysisResult structured output with snake_case tool names
- [x] POST /api/jobs/{job_id}/configure
- [x] GET /api/jobs/{job_id}, GET /api/jobs/{job_id}/status
- [x] DeepEval tests with real LLM calls (LLM-as-judge)
- [ ] Frontend: StepAuth + StepReview (moved to M6)

### M4: Code Generation ✅
- [x] PydanticAI generator agent → GeneratedServer
- [x] Validator: syntax check + import check
- [x] Retry on validation failure
- [x] Orchestrator: full pipeline parse → analyze → generate → validate
- [x] POST /api/jobs/{id}/generate (async background task)
- [x] 11 unit tests + 2 eval tests (real LLM)
- [ ] Frontend: StepProgress (moved to M6)

### M5: Packaging & Delivery ✅
- [x] Source archive (.tar.gz) with Dockerfile, README, .env.example
- [x] GET /api/jobs/{id}/artifacts/source (download .tar.gz)
- [x] GET /api/jobs/{id}/artifacts/code (preview)
- [x] GET /api/jobs/{id}/artifacts/docker-info (pull/run commands)
- [x] 15 packager tests
- [ ] Docker build via docker-py (deferred — users build from source)
- [ ] Supabase Storage integration (deferred — in-memory for MVP)
- [ ] Frontend: ResultPage (moved to M6)

### M6: Chat & Polish ✅
- [x] Chat agent (PydanticAI) + POST /api/jobs/{id}/chat
- [x] GET /api/jobs/{id}/chat/history
- [x] React frontend: HomePage, WizardPage (5 steps), ResultPage
- [x] ChatPanel — floating AI assistant during wizard
- [x] Dark minimalist UI with responsive design
- [x] 7 chat agent tests
- [ ] URL input parsing (moved to M7)

### M7: File Input Expansion
- [ ] PDF parsing (pdfplumber)
- [ ] Markdown file input
- [ ] LLM-assisted endpoint extraction from unstructured docs

## Current: M7 — File Input Expansion
