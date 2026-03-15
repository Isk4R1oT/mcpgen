# mcpgen — Implementation Plan

## Milestones

### M1: Skeleton
- [ ] pyproject.toml, FastAPI app, Vite React app, docker-compose.yml
- [ ] Supabase tables (SQL migration)
- [ ] Config (pydantic-settings), .env.example
- [ ] POST /api/specs/upload → store file in Supabase Storage
- [ ] Frontend: HomePage + StepUpload

### M2: Parser
- [ ] OpenAPI JSON/YAML parsing (prance + openapi-pydantic)
- [ ] GET /api/specs/{job_id}/endpoints
- [ ] Frontend: StepEndpoints with endpoint table
- [ ] Test with petstore.yaml fixture

### M3: AI Analysis
- [ ] PydanticAI analyzer agent + OpenRouter
- [ ] AnalysisResult structured output
- [ ] POST /api/jobs/{job_id}/configure
- [ ] Frontend: StepAuth + StepReview

### M4: Code Generation
- [ ] PydanticAI generator agent → GeneratedServer
- [ ] Jinja2 templates for server.py scaffolding
- [ ] Validator: syntax + import + mock test
- [ ] Retry on validation failure
- [ ] Frontend: StepProgress with polling

### M5: Packaging & Delivery
- [ ] Source archive (.tar.gz) → Supabase Storage
- [ ] Docker build via docker-py
- [ ] GET /api/jobs/{id}/artifacts/source (download)
- [ ] Frontend: ResultPage

### M6: Chat & Polish
- [ ] Chat agent + POST /api/jobs/{id}/chat
- [ ] Frontend: ChatPanel
- [ ] URL input parsing (trafilatura)
- [ ] Error handling, loading states

### M7: File Input Expansion
- [ ] PDF parsing (pdfplumber)
- [ ] Markdown file input
- [ ] LLM-assisted endpoint extraction from unstructured docs

## Current: M1 — Skeleton
