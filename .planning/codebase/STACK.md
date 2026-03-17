# Technology Stack

## Runtime & Languages

- **Python 3.12+** - Backend runtime
- **Node.js/TypeScript** - Frontend (inferred from package.json type: module)

## Backend Framework & HTTP

| Component | Version | Purpose |
|-----------|---------|---------|
| **FastAPI** | >=0.115 | REST API framework (`backend/main.py`) |
| **uvicorn** | >=0.34 | ASGI server (`backend/main.py`) |
| **httpx** | >=0.28 | Async HTTP client for fetching specs (`backend/services/spec_fetcher.py`) |
| **python-multipart** | >=0.0.18 | Form data parsing in FastAPI routes |

## AI & LLM Integration

| Component | Version | Purpose |
|-----------|---------|---------|
| **PydanticAI** | >=0.0.49 | Agentic AI framework with structured outputs (agents: analyzer, generator, chat, configurator, debugger, extractor, tester) |
| **OpenRouter** | (via PydanticAI) | LLM API provider - integrates Anthropic Claude, DeepSeek, Grok models |
| **deepeval** | >=2.0 | LLM-as-judge evaluation framework (optional dependencies) |

## Database & Storage

| Component | Version | Purpose |
|-----------|---------|---------|
| **Supabase** | >=2.13 | PostgreSQL database + object storage (`backend/db/client.py`) |
| **pydantic-settings** | >=2.7 | Environment variable management (`backend/config.py`) |

## MCP (Model Context Protocol)

| Component | Version | Purpose |
|-----------|---------|---------|
| **FastMCP** | >=3.1 | MCP server framework for Python (embedded in generated servers) |

## API & Spec Parsing

| Component | Version | Purpose |
|-----------|---------|---------|
| **prance** | >=23.6 | OpenAPI spec processing and validation |
| **openapi-spec-validator** | >=0.7 | OpenAPI/Swagger spec validation |
| **openapi-pydantic** | >=0.4 | Pydantic models for OpenAPI specs |
| **pdfplumber** | >=0.11 | PDF text extraction (`backend/services/spec_fetcher.py`) |
| **trafilatura** | >=2.0 | Web content extraction from HTML docs (`backend/services/spec_fetcher.py`) |
| **PyYAML** | (implicit in prance) | YAML parsing for spec formats (`backend/services/spec_fetcher.py`) |

## Code Generation & Templating

| Component | Version | Purpose |
|-----------|---------|---------|
| **Jinja2** | >=3.1 | Template engine for code generation (`backend/pipeline/packager.py`, `backend/codegen/`) |

## Docker & Containerization

| Component | Version | Purpose |
|-----------|---------|---------|
| **docker-py** | >=7.1 | Programmatic Docker image build/push (`backend/services/docker_service.py`) |
| **Docker** | (external) | Container runtime - mounted at `/var/run/docker.sock` in docker-compose |

## Frontend (React)

| Component | Version | Purpose |
|-----------|---------|---------|
| **React** | ^19.2.4 | UI framework |
| **React DOM** | ^19.2.4 | React rendering for web |
| **React Router** | ^7.13.1 | Client-side routing (pages: HomePage, WizardPage, ResultPage) |
| **TypeScript** | ~5.9.3 | Type safety (strict mode implied by config) |
| **Vite** | ^8.0.0 | Build tool & dev server |
| **ESLint** | ^9.39.4 | Code linting |

## Testing & Quality Assurance

| Component | Version | Purpose |
|-----------|---------|---------|
| **pytest** | >=8.0 | Test framework (optional dependencies) |
| **pytest-asyncio** | >=0.24 | Async test support (optional dependencies) |
| **ruff** | >=0.8 | Python linter & formatter (optional dependencies) |

## Configuration Files

- **pyproject.toml** - Python project metadata, dependencies, tool configs
  - `backend/` directory contains all backend code
  - `tests/` directory for pytest tests
  - Ruff configured with Python 3.12 target, 100 char line length, rules: E, F, I, UP, B, SIM

- **frontend/package.json** - Node.js dependencies and scripts
  - Build command: `tsc -b && vite build`
  - Dev command: `vite` (runs on default Vite port, proxied via docker-compose to port 3000)

- **docker-compose.yml** - Multi-container orchestration
  - Backend service: Python 3.12 runtime, uvicorn, hot-reload from `./backend`
  - Frontend service: Node.js build & nginx serving on port 3000
  - Health check: HTTP request to `/health` endpoint every 10 seconds
  - Docker socket mounted from host for docker-py builds

- **.env.example** - Required environment variables
  - SUPABASE_URL, SUPABASE_KEY (database)
  - OPENROUTER_API_KEY, OPENROUTER_MODEL (AI)
  - DOCKER_REGISTRY, DOCKER_REGISTRY_PUSH_ENABLED (artifact push)

## Architecture Integration Points

1. **Request Flow**: Frontend → FastAPI → Agent Pipeline → Supabase
2. **Parsing**: URL fetcher (httpx/trafilatura) → OpenAPI validator (prance) → Parser
3. **AI Generation**: PydanticAI agents leverage OpenRouter for multiple LLM models
4. **Code Gen**: Jinja2 templates → Docker image via docker-py build
5. **Storage**: Supabase PostgreSQL for job state, object storage for artifacts

## Key Versions (Pinned or Constrained)

| Library | Constraint | Notes |
|---------|-----------|-------|
| Python | >=3.12 | Modern async/typing features required |
| Pydantic | >=2.10 | V2 API with validator hooks |
| FastAPI | >=0.115 | Recent async updates |
| TypeScript | ~5.9.3 | Pinned minor version for stability |
| Vite | ^8.0.0 | Major version 8+ for React 19 support |
