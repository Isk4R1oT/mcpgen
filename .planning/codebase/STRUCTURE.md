# MCPGen Directory Structure & Key Locations

## Root Directory Organization

```
mcpgen/
├── backend/                    # Python FastAPI backend
├── frontend/                   # React + Vite + TypeScript frontend
├── tests/                      # pytest + deepeval test suite
├── docs/                       # Architecture & design documentation
├── supabase/                   # Supabase SQL migrations
├── .planning/                  # Planning and documentation
├── main.py                     # (Deprecated) FastAPI entry point
├── pyproject.toml              # Python dependencies & build config
├── docker-compose.yml          # Local development stack
├── Dockerfile                  # Backend production image
├── .env.example                # Environment variable template
└── README.md                   # Project overview
```

## Backend Structure (`/backend/`)

### Core Files
- **`main.py`** (27 lines)
  - FastAPI app initialization
  - CORS middleware configuration (localhost:5173, 3000)
  - Health endpoint
  - Router inclusion: `/api` prefix

- **`config.py`** (25 lines)
  - Pydantic Settings for environment variables
  - Supabase credentials, OpenRouter API key, Docker registry settings
  - Pattern: `BaseSettings` with `.env` file support

### API Routes (`/backend/api/`)
**Purpose**: REST endpoints for user interactions

| File | Size | Purpose |
|------|------|---------|
| `router.py` | 28 lines | Routes aggregator - includes all sub-routers |
| `specs.py` | 188 lines | Upload/parse API specs (YAML/JSON/PDF/Markdown) |
| `generation.py` | 28 lines | Trigger async pipeline |
| `jobs.py` | ~40 lines | Job status polling |
| `configurator.py` | ~150 lines | Chat-first config flow (replaces wizard) |
| `chat.py` | ~50 lines | Chat messaging endpoint |
| `artifacts.py` | ~80 lines | Download source code, Dockerfile |
| `sandbox.py` | ~200 lines | Test/run generated servers in isolation |
| `hosting.py` | ~180 lines | Docker registry integration, push commands |

**Entry Point**: All routers included in `router.py`, then `main.py` includes router at `/api`

### Pipeline Stages (`/backend/pipeline/`)
**Purpose**: Sequential processing stages

| File | Size | Purpose |
|------|------|---------|
| `orchestrator.py` | 99 lines | Coordinates 5 pipeline stages (parse→analyze→generate→validate→package) |
| `parser.py` | 180 lines | Extract endpoints from OpenAPI 2.0/3.x specs |
| `validator.py` | 220+ lines | 4-phase validation: syntax, imports, runtime, tool discovery |
| `packager.py` | ~80 lines | Docker build + source tarball creation |

**Execution Entry**: `/backend/api/generation.py` → `background_tasks.add_task(run_pipeline, job_id, settings)`

**Data Flow**:
```
1. PARSE: Normalize OpenAPI to ParsedSpec
2. ANALYZE: LLM analyzes endpoints → AnalysisResult
3. GENERATE: LLM generates FastMCP code → GeneratedServer
4. VALIDATE: Check syntax/imports/runtime → ValidationResult
5. PACKAGE: Docker build + archive (on-demand)
```

### AI Agents (`/backend/agents/`)
**Purpose**: LLM-powered semantic processing

| File | Size | Purpose |
|------|------|---------|
| `models.py` | 54 lines | Pydantic output models (ToolParameter, ToolDefinition, AnalysisResult, GeneratedServer, ChatSuggestion) |
| `analyzer_agent.py` | 91 lines | Semantic analysis: endpoint grouping, tool naming, auth recommendation |
| `generator_agent.py` | 139 lines | Code generation: FastMCP Python server with security rules |
| `extractor_agent.py` | ~60 lines | Convert unstructured text (PDF/Markdown) → endpoints |
| `configurator_agent.py` | ~140 lines | Interactive chat-based configuration |
| `chat_agent.py` | ~50 lines | Conversational assistant |
| `debugger_agent.py` | ~60 lines | Error analysis and fix suggestions |
| `tester_agent.py` | ~80 lines | Validate generated server execution |

**Pattern**: All agents use `PydanticAI` + `OpenRouterModel` + `Agent(result_type=<Pydantic model>)`

**Key Instruction Files**: Embedded in agent source, not separate templates

### Database & Storage (`/backend/db/`)
**Purpose**: Persistence and state management

| File | Size | Purpose |
|------|------|---------|
| `client.py` | ~30 lines | Supabase client initialization (lazy connection) |
| `models.py` | 122 lines | Pydantic models for DB rows (JobRow, ParsedSpecRow, GeneratedServerRow, ChatMessageRow) |
| `repositories.py` | ~150 lines | CRUD operations on database tables |
| `store.py` | 191 lines | **Unified job store**: in-memory cache + Supabase persistence dual-layer architecture |

**In-Memory Cache**: `_jobs_cache: dict[str, dict]` - fast access during request lifecycle

**Tables** (Supabase):
- `jobs` - Job records, status, metadata
- `parsed_specs` - Normalized API specs
- `generated_servers` - Generated source code, Dockerfile
- `chat_messages` - Chat conversation history

**Critical File**: `store.py` - Abstract single interface over dual storage (cache + DB)

### Services (`/backend/services/`)
**Purpose**: External system integrations

| File | Size | Purpose |
|------|------|---------|
| `docker_service.py` | 66 lines | Build Docker images via docker-py, optional registry push |
| `spec_fetcher.py` | ~250 lines | Fetch docs from URLs, auto-discover OpenAPI, extract PDF/Markdown text |
| `sandbox.py` | ~200 lines | Run generated servers in isolated environment, execute tool calls |

**Integration Points**:
- Docker Service: Used by `packager.py` during packaging stage
- Spec Fetcher: Used by `api/specs.py` for URL input handling
- Sandbox Service: Used by `api/sandbox.py` for testing before package

### Code Generation (`/backend/codegen/`)
**Purpose**: Reference materials for agent instructions

| File | Size | Purpose |
|------|------|---------|
| `fastmcp_docs.py` | ~250 lines | FastMCP v3.1 API reference embedded in agent instructions |

## Database Layer Structure (`/backend/db/`)

### Data Model

```
Job {
  id: UUID
  status: "pending" | "parsing" | "analyzing" | "generating" | "validating" | "packaging" | "completed" | "failed"
  input_type: "openapi_json" | "openapi_yaml" | "url" | "file_upload"
  input_ref: str (URL or internal reference)
  config: JobConfiguration (user selections)
  error_message: str | None
  docker_image_tag: str | None
  source_archive_path: str | None
  created_at: datetime
  updated_at: datetime
}

ParsedSpec {
  id: UUID
  job_id: UUID (FK)
  title: str
  base_url: str | None
  auth_schemes: list[dict]
  endpoints: list[dict] (raw endpoint data)
  raw_spec: dict (original OpenAPI document)
  created_at: datetime
}

GeneratedServer {
  id: UUID
  job_id: UUID (FK)
  server_code: str (server.py)
  requirements_txt: str
  dockerfile: str
  tool_manifest: list[dict] (metadata about generated tools)
  validation_result: dict (syntax_ok, imports_ok, runtime_ok, errors)
  created_at: datetime
}

ChatMessage {
  id: UUID
  job_id: UUID (FK)
  role: "user" | "assistant"
  content: str
  created_at: datetime
}
```

### Store Pattern

**Dual-Layer Architecture** (cache + persistence):
```python
# Primary: In-memory cache
_jobs_cache: dict[str, dict] = {}

# Secondary: Supabase (lazy connection)
sb = _get_supabase()  # Returns None if not configured

# Unified API:
def get_job(job_id: str) -> dict:
    # 1. Try cache
    # 2. Fallback to Supabase
    # 3. Cache result
    # 4. Raise 404 if not found

def create_job(...) -> str:
    # 1. Create in cache
    # 2. Persist to Supabase (if available)
    # 3. Return job_id

def update_job_status(...) -> None:
    # 1. Update cache
    # 2. Update Supabase (if available)
```

**Advantages**: Fast read/write during pipeline, persistent across restarts, works without Supabase

## Frontend Structure (`/frontend/src/`)

### Page Components (`/frontend/src/pages/`)
**Purpose**: Top-level route components

| File | Purpose |
|------|---------|
| `HomePage.tsx` | Landing/overview page |
| `ChatPage.tsx` | Main chat-first interface for configuration |
| `WizardPage.tsx` | Multi-step wizard (deprecated but maintained) |
| `ResultPage.tsx` | Generated code display + Docker commands |
| `SandboxPage.tsx` | Live testing environment |

### Wizard Components (`/frontend/src/components/wizard/`)
**Purpose**: Multi-step wizard steps (StepUpload → StepEndpoints → StepAuth → StepReview)

| File | Purpose |
|------|---------|
| `StepUpload.tsx` | File upload or URL input |
| `StepEndpoints.tsx` | Select endpoints to include |
| `StepAuth.tsx` | Configure authentication (none, API key, bearer, oauth2) |
| `StepProgress.tsx` | Show pipeline progress |
| `StepReview.tsx` | Final configuration review |

### Chat Component (`/frontend/src/components/chat/`)
| File | Purpose |
|------|---------|
| `ChatPanel.tsx` | Chat interface for interactive configuration |

### Common Components (`/frontend/src/components/common/`)
**Purpose**: Reusable UI elements

### API Client (`/frontend/src/api/`)
| File | Purpose |
|------|---------|
| `client.ts` | HTTP client wrapper for backend endpoints |

**Key Functions**:
- Upload spec file
- Fetch parsed endpoints
- Poll job status
- Submit configuration
- Download artifacts
- Test MCP server

### Type Definitions (`/frontend/src/types/`)
| File | Purpose |
|------|---------|
| `index.ts` | TypeScript interfaces matching backend models |

**Types**:
- EndpointSummary
- AuthConfig
- JobConfiguration
- JobStatus
- JobDetail
- ChatMessage
- ChatResponse
- DockerInfo
- CodeFile

### Styling
| File | Purpose |
|------|---------|
| `App.css` | Global styles |
| `index.css` | Reset/base styles |

### Entry Point
| File | Purpose |
|------|---------|
| `main.tsx` | Vite entry point |
| `App.tsx` | Root component with router |

## Test Structure (`/tests/`)

### Unit Tests

| File | Purpose |
|------|---------|
| `test_parser.py` | OpenAPI parsing (Swagger 2.0, OpenAPI 3.x) |
| `test_validator.py` | Syntax/import/runtime validation |
| `test_analyzer_agent.py` | Analyzer agent output validation |
| `test_generator_agent.py` | Generator agent code production |
| `test_extractor_agent.py` | LLM endpoint extraction |
| `test_chat_agent.py` | Chat agent conversation |
| `test_agent_models.py` | Pydantic model validation |
| `test_db_models.py` | Database model validation |
| `test_config.py` | Settings loading from env |
| `test_api_specs.py` | Spec upload/parse API |
| `test_api_jobs.py` | Job status API |
| `test_docker_service.py` | Docker build/push |
| `test_spec_fetcher.py` | URL fetching, content detection |

### Evaluation Tests (deepeval)

| File | Purpose |
|------|---------|
| `test_analyzer_eval.py` | Analyzer output quality |
| `test_generator_eval.py` | Generated code correctness |
| `test_extractor_eval.py` | Extraction accuracy |
| `test_full_eval.py` | End-to-end pipeline |
| `test_metrics.py` | LLM evaluation metrics |

### E2E Tests

| Directory | Purpose |
|-----------|---------|
| `tests/e2e/` | Full workflow tests with real APIs |

### Fixtures

| Directory | Purpose |
|-----------|---------|
| `tests/fixtures/` | Sample OpenAPI specs, test data |

### Configuration

| File | Purpose |
|------|---------|
| `conftest.py` | pytest fixtures, configuration |

## Configuration Files

| File | Purpose |
|------|---------|
| `.env.example` | Template for environment variables |
| `.env` | Actual env vars (git-ignored) |
| `pyproject.toml` | Python dependencies, build config, pytest settings |
| `docker-compose.yml` | Local dev stack (backend, frontend, Supabase) |
| `Dockerfile` | Production backend image |

## Documentation (`/docs/`)

| File | Purpose |
|------|---------|
| `architecture.md` | System design overview |
| `api.md` | API endpoint documentation |
| `pipeline.md` | Pipeline stages detail |
| `agents.md` | Agent system documentation |

## Key File Cross-References

### Job Lifecycle
1. **Frontend**: `ChatPage.tsx` or `WizardPage.tsx` → user action
2. **API**: `api/specs.py` (upload) → `api/configurator.py` (chat) → `api/generation.py` (start)
3. **Store**: `db/store.py` - job state management
4. **Pipeline**: `pipeline/orchestrator.py` - execution
5. **Agents**: `agents/*.py` - LLM processing
6. **Validator**: `pipeline/validator.py` - quality assurance
7. **Frontend**: `ResultPage.tsx` - result display

### Data Type Flow
```
OpenAPI YAML/JSON/URL/PDF/Markdown
    ↓ (parser + extractor agents)
ParsedSpec { endpoints: [...] }
    ↓ (store.create_job)
Job { status: "pending", endpoints, ... }
    ↓ (user config via chat/wizard)
Job { status: "configured", config: {...} }
    ↓ (pipeline.orchestrator)
AnalysisResult { tools: [...], auth_recommendation }
    ↓ (analyzer agent)
GeneratedServer { files: [...], requirements: [...] }
    ↓ (generator agent)
ValidationResult { syntax_ok, imports_ok, runtime_ok }
    ↓ (validator)
Job { status: "completed", docker_image_tag, source_archive_path }
```

### Critical Dependencies

**Within-Module**:
- `api/router.py` imports all sub-routers
- `api/*.py` import from `db/store.py`, `agents/*.py`, `services/*.py`
- `pipeline/orchestrator.py` imports all stages
- `agents/*.py` use Pydantic models from `agents/models.py`
- `db/store.py` imports from `agents/models.py`, `pipeline/parser.py`

**Intra-Layer Imports** (Pipeline):
- `orchestrator.py` → `parser.py`, `agents/analyzer_agent.py`, `agents/generator_agent.py`, `validator.py`
- `validator.py` → `agents/models.py`
- `packager.py` → `services/docker_service.py`

## Naming Conventions

### Python
- **Files**: `snake_case.py`
- **Classes**: `PascalCase` (Pydantic models, agents)
- **Functions**: `snake_case()`
- **Constants**: `UPPER_CASE`
- **Agent Instructions**: Embedded in source, typically ~2-5 KB strings

### TypeScript/React
- **Files**: `PascalCase.tsx` (components), `camelCase.ts` (utilities/API)
- **Component Props**: camelCase
- **Interfaces**: PascalCase
- **Functions**: camelCase()

### Database
- **Tables**: `snake_case` (plural: jobs, parsed_specs, generated_servers, chat_messages)
- **Columns**: `snake_case`
- **Foreign Keys**: `{table}_id` (e.g., job_id)

### API Routes
- **Endpoint Pattern**: `/api/{resource}/{id}/{action}`
  - `/api/specs/upload` - POST file
  - `/api/specs/{job_id}/endpoints` - GET list
  - `/api/jobs/{job_id}` - GET status
  - `/api/jobs/{job_id}/generate` - POST trigger
  - `/api/configure/{job_id}/chat` - POST message
  - `/api/artifacts/{job_id}/source` - GET download

## Environment Variables

**Supabase**:
- `SUPABASE_URL` - PostgreSQL + Storage URL
- `SUPABASE_KEY` - API key

**OpenRouter**:
- `OPENROUTER_API_KEY` - LLM API key
- `OPENROUTER_MODEL` - Model ID (e.g., "anthropic/claude-sonnet-4-5")

**Docker**:
- `DOCKER_REGISTRY` - Registry URL (e.g., "registry.example.com")
- `DOCKER_REGISTRY_PUSH_ENABLED` - Boolean flag

**App**:
- `APP_HOST` - Server host (default: 0.0.0.0)
- `APP_PORT` - Server port (default: 8000)

## Build & Deployment

### Backend
**Build**: `python -m pip install -e .` (editable install from pyproject.toml)
**Run**: `uvicorn backend.main:app --reload --port 8000`
**Docker**: `docker build -t mcpgen:latest .`

### Frontend
**Build**: `cd frontend && npm run build`
**Dev**: `cd frontend && npm run dev`
**Output**: `frontend/dist/` (static files for production)

### Full Stack
**Dev**: `docker-compose up` (backend + frontend + Supabase)

## Size Summary

| Component | Approx Lines | Role |
|-----------|--------------|------|
| Backend (all Python) | 2500+ | Core logic |
| Frontend (React) | 1500+ | UI |
| Tests | 3000+ | Quality assurance |
| Configuration | 200+ | Settings |
| **Total** | **7200+** | Full system |

## Key Metrics

- **Agents**: 6 specialized LLM processors
- **API Endpoints**: 20+ REST routes
- **Pipeline Stages**: 5 sequential phases
- **Database Tables**: 4 (jobs, parsed_specs, generated_servers, chat_messages)
- **Frontend Pages**: 5 (Home, Chat, Wizard, Result, Sandbox)
- **Test Coverage**: 30+ test modules with unit + integration + E2E + deepeval
