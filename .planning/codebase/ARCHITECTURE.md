# MCPGen Architecture

## Overview

**mcpgen** is a full-stack AI system that generates production-ready MCP (Model Context Protocol) servers from API documentation. It combines OpenAPI/Swagger parsing, semantic analysis via LLMs, code generation, validation, and Docker packaging into a unified pipeline.

## System Architecture Layers

### 1. Frontend Layer (React + Vite + TypeScript)
**Location**: `/frontend/src/`

**Purpose**: Web UI for users to upload API specs, configure generation, and download artifacts.

**Key Components**:
- **Pages**:
  - `ChatPage.tsx` - Main chat-first interface for interactive configuration
  - `WizardPage.tsx` - Multi-step wizard (upload → endpoints → auth → review)
  - `ResultPage.tsx` - Display generated code, Docker commands
  - `SandboxPage.tsx` - Live testing environment for generated servers

- **Wizard Steps** (`components/wizard/`):
  - `StepUpload.tsx` - File upload / URL input
  - `StepEndpoints.tsx` - Select which endpoints to include
  - `StepAuth.tsx` - Configure authentication strategy
  - `StepProgress.tsx` - Show pipeline progress
  - `StepReview.tsx` - Final configuration review

- **Chat** (`components/chat/`):
  - `ChatPanel.tsx` - Chat interface for conversation-based config

- **API Client** (`api/client.ts`):
  - HTTP client wrapper for backend endpoints
  - Handles job polling, file uploads, artifact downloads

- **Type Definitions** (`types/index.ts`):
  - TypeScript interfaces matching backend models
  - EndpointSummary, JobConfiguration, AuthConfig, etc.

### 2. API Layer (FastAPI)
**Location**: `/backend/api/`

**Purpose**: REST endpoints for spec upload, configuration, job polling, and artifact delivery.

**Router Structure** (`router.py`):
- `/api/health` - Health check
- `/api/specs/*` - Upload, parse, fetch endpoints
- `/api/jobs/*` - Job status, configuration
- `/api/generation/*` - Trigger pipeline
- `/api/artifacts/*` - Download generated code/Docker
- `/api/chat/*` - Chat for configuration
- `/api/configurator/*` - Chat-first flow
- `/api/sandbox/*` - Test generated servers
- `/api/hosting/*` - Docker registry integration

**Key Endpoints**:
- `POST /specs/upload` - Upload YAML/JSON/PDF/Markdown spec
- `POST /specs/from-url` - Fetch spec from URL (auto-discover Swagger UI)
- `GET /specs/{job_id}/endpoints` - List parsed endpoints
- `POST /jobs/{job_id}/generate` - Start async generation pipeline
- `GET /jobs/{job_id}` - Poll job status
- `POST /configure/{job_id}/chat` - Chat-based configuration
- `GET /artifacts/{job_id}/source` - Download source tarball
- `GET /artifacts/{job_id}/docker-info` - Get Docker pull/run commands

**Module Files**:
- `specs.py` - OpenAPI/URL/file parsing endpoints
- `generation.py` - Pipeline trigger (runs in background)
- `configurator.py` - Chat-first configuration flow
- `chat.py` - Chat messaging endpoint
- `jobs.py` - Job status polling
- `artifacts.py` - Source/Dockerfile download
- `sandbox.py` - Test generated servers
- `hosting.py` - Docker registry integration

### 3. Pipeline Layer (Sequential Processing)
**Location**: `/backend/pipeline/`

**Purpose**: Core business logic - parse → analyze → generate → validate → package.

**Execution Flow** (`orchestrator.py`):
```
Input Spec → Parser → Analyzer Agent → Generator Agent → Validator → (Packager on demand)
```

**Stages**:

1. **PARSE** (`parser.py`)
   - Input: YAML/JSON OpenAPI, URL, PDF, Markdown
   - Output: `ParsedSpec` (normalized structure)
   - Handles OpenAPI 3.x and Swagger 2.0
   - Extracts: endpoints, auth schemes, base URL
   - Converts raw endpoint dicts to structured objects

2. **ANALYZE** (`agent` layer - `analyzer_agent.py`)
   - Input: `ParsedEndpoint` list + auth schemes
   - Output: `AnalysisResult` (Pydantic model)
   - LLM analyzes endpoints semantically
   - Generates MCP tool definitions (name, description, parameters)
   - Recommends auth strategy
   - Flags deprecated endpoints

3. **GENERATE** (`agent` layer - `generator_agent.py`)
   - Input: `AnalysisResult` + auth strategy + base URL
   - Output: `GeneratedServer` (Pydantic model)
   - LLM generates FastMCP server Python code
   - Produces: server.py, requirements, env vars, startup command
   - Includes security rules, error handling, type hints

4. **VALIDATE** (`validator.py`)
   - Four-phase validation:
     - Phase 1: Syntax check (compile() each .py)
     - Phase 2: Import check (verify modules exist)
     - Phase 3: Runtime check (load server, list tools via fastmcp CLI)
   - Returns: `ValidationResult` (errors, tools_discovered)
   - Retry: On failure, re-run generator with error feedback

5. **PACKAGE** (on-demand, `packager.py`)
   - Docker build via docker-py
   - Creates tarball of source files
   - Stores in Supabase Storage or local disk

**Key Models**:
- `ParsedSpec` - Normalized OpenAPI structure
- `ParsedEndpoint` - Single endpoint with full metadata
- `AnalysisResult` - LLM semantic analysis output
- `GeneratedServer` - Generated code files + requirements

### 4. Agent Layer (PydanticAI)
**Location**: `/backend/agents/`

**Purpose**: LLM-powered semantic analysis and code generation.

**Agents**:
1. **Analyzer Agent** (`analyzer_agent.py`)
   - Semantic API analysis for tool optimization
   - Instructs LLM on tool naming (snake_case), descriptions ("Use when..." pattern)
   - Groups endpoints by tag
   - Recommends auth strategy

2. **Generator Agent** (`generator_agent.py`)
   - Produces FastMCP Python server code
   - Instructs on FastMCP v3.1 API, async/await, error handling
   - Security constraints (input validation, DELETE confirmation, sanitized errors)
   - Includes fastmcp.docs reference in instructions

3. **Extractor Agent** (`extractor_agent.py`)
   - Converts unstructured text (PDF, Markdown) → structured endpoints
   - Used when user provides non-OpenAPI documentation

4. **Configurator Agent** (`configurator_agent.py`)
   - Chat-based interactive configuration
   - Suggests endpoints, auth strategies
   - Detects when user is ready to generate

5. **Chat Agent** (`chat_agent.py`)
   - Conversational assistant during generation
   - Provides tips, answers questions

6. **Debugger Agent** (`debugger_agent.py`)
   - Analyzes validation errors
   - Suggests fixes

7. **Tester Agent** (`tester_agent.py`)
   - Tests generated MCP servers
   - Validates tool execution

**Model Definitions** (`models.py`):
- `ToolParameter(name, type, description, required)`
- `ToolDefinition(tool_name, description, group, http_method, path, parameters, request_body_schema, response_description)`
- `AnalysisResult(server_name, server_description, tools, auth_recommendation, notes)`
- `GeneratedFile(filename, content, description)`
- `GeneratedServer(files, requirements, env_vars, startup_command)`
- `ChatSuggestion(message, config_updates, endpoint_suggestions)`

**Provider**: OpenRouter (configurable model via environment variable)

### 5. Database & Storage Layer
**Location**: `/backend/db/`

**Purpose**: Persistence and state management.

**Architecture**: Hybrid approach
- **Primary**: In-memory cache (fast job state during request lifecycle)
- **Secondary**: Supabase PostgreSQL (persistence across restarts)
- **Fallback**: Works without Supabase for development/testing

**Store** (`store.py`):
- Unified API abstracting cache + Supabase
- Lazy Supabase connection (None if not configured)
- Functions:
  - `create_job()` - Create job in cache + DB
  - `get_job()` - Cache → Supabase fallback
  - `update_job_status()` - Update cache + DB
  - `save_job_config()` - Save user configuration
  - `save_analysis()` - Save LLM analysis
  - `save_generated_server()` - Save generated code
  - `save_chat_message()` - Persist chat history
  - `get_chat_history()` - Retrieve conversation

**Models** (`models.py`):
- Database row models (Pydantic validators):
  - `JobRow` - Job record with status, input metadata
  - `ParsedSpecRow` - Parsed spec storage
  - `GeneratedServerRow` - Generated code storage
  - `ChatMessageRow` - Chat message record
  - `EndpointSummary` - Endpoint summary for UI
  - `JobConfiguration` - User-selected configuration
  - `AuthConfig` - Authentication settings

**Tables** (Supabase):
- `jobs` - Job records, status tracking
- `parsed_specs` - Normalized API specs
- `generated_servers` - Generated source code
- `chat_messages` - Chat history

### 6. Service Layer (External Integrations)
**Location**: `/backend/services/`

**Purpose**: Specialized domain logic for external systems.

**Services**:

1. **Docker Service** (`docker_service.py`)
   - Build Docker images from generated code
   - Push to registry (optional)
   - Uses docker-py for programmatic image building

2. **Spec Fetcher** (`spec_fetcher.py`)
   - Fetch documentation from URLs
   - Auto-discover OpenAPI specs in Swagger UI
   - Extract text from PDF (pdfplumber)
   - Extract text from Markdown
   - Detect content type (JSON/YAML/HTML)
   - Returns parsed spec or text for LLM extraction

3. **Sandbox Service** (`sandbox.py`)
   - Run generated MCP servers in controlled environment
   - Execute tool calls and capture output
   - Test server health before packaging

### 7. Configuration & Utilities
**Location**: `/backend/config.py`

**Purpose**: Settings management via environment variables.

**Settings**:
- Supabase credentials (URL, API key)
- OpenRouter API key + model name
- Docker registry + push flag
- App host/port

**Pattern**: Pydantic BaseSettings with `.env` file support

### 8. Code Generation Templates
**Location**: `/backend/codegen/`

**Purpose**: FastMCP server code generation reference.

**Files**:
- `fastmcp_docs.py` - FastMCP v3.1 API reference embedded in agent instructions

## Data Flow

### Complete Request-to-Result Flow

```
User Upload/URL
   ↓
API: POST /specs/upload or /from-url
   ↓
Parser (spec.py) → extract endpoints
   ↓
Store.create_job() → in-memory + Supabase
   ↓
Return job_id to frontend
   ↓
Frontend: GET /specs/{job_id}/endpoints
   ↓
Store.get_job() → return endpoint list
   ↓
Frontend: POST /configure/{job_id}/chat (or wizard steps)
   ↓
Store.save_job_config() → user selections
   ↓
Frontend: POST /jobs/{job_id}/generate
   ↓
API: Add run_pipeline() to background tasks
   ↓
Pipeline Stages:
   1. Update status → "parsing"
   2. Analyzer Agent (LLM) → AnalysisResult
      Store.save_analysis()
   3. Update status → "analyzing"
   4. Generator Agent (LLM) → GeneratedServer
   5. Update status → "generating"
   6. Validator → ValidationResult
   7. Update status → "validating"
   8. On error: Retry generator with feedback
   9. Store.save_generated_server()
   10. Update status → "completed"
   ↓
Frontend: Poll GET /jobs/{job_id}
   ↓
Display results: Code view, Docker commands
   ↓
User: GET /artifacts/{job_id}/source (download .tar.gz)
   ↓
Return source archive
```

## Abstraction Layers

### 1. Specification Normalization
- **Input Format Diversity**: OpenAPI JSON/YAML, Swagger 2.0, URLs, PDFs, Markdown
- **Output Format Uniformity**: ParsedSpec (normalized internal model)
- **Boundary**: `/pipeline/parser.py` + `/agents/extractor_agent.py` + `/services/spec_fetcher.py`

### 2. LLM Agent Abstraction
- **Provider**: OpenRouter (pluggable model)
- **Output Validation**: Pydantic models enforce structure
- **Boundary**: `/agents/*.py` use consistent Agent + instructions pattern

### 3. Job State Management
- **Dual Storage**: In-memory (fast) + Supabase (persistent)
- **Single Interface**: Store functions abstract both
- **Boundary**: `/db/store.py` provides unified API

### 4. Pipeline Orchestration
- **Decoupled Stages**: Each stage reads input, produces validated output
- **Status Tracking**: Job status updated after each stage
- **Error Recovery**: Validator feedback triggers retry
- **Boundary**: `/pipeline/orchestrator.py` coordinates stages

### 5. Code Generation
- **Template Logic**: Embedded in agent instructions (not separate template files)
- **Output Validation**: Four-phase validation before delivery
- **Boundary**: `/agents/generator_agent.py` + `/pipeline/validator.py`

## Key Design Patterns

### 1. PydanticAI Agents
- Structured output via `result_type` parameter
- LLM instructions embed domain knowledge
- OpenRouter provider for pluggable models

### 2. Async-First Backend
- FastAPI with async/await
- Background tasks for long-running pipeline
- httpx for async HTTP in agents

### 3. Progressive Enhancement
- Works without Supabase (in-memory only)
- Optional Docker registry push
- Fallback text extraction for non-OpenAPI docs

### 4. Validation-Driven Architecture
- Syntax + import + runtime validation phases
- Errors trigger retry with feedback
- Tools discovered at validation time

### 5. Type Safety
- Pydantic models throughout
- Type hints on all functions
- No `Any` / `Dict[str, Any]` (per CLAUDE.md)

## Critical Interfaces

### 1. Job Lifecycle
```python
# Job state machine
"pending" → "parsing" → "analyzing" → "generating"
→ "validating" → "completed" | "failed"

# Alternate path with config
"pending" → "configured" → ... (same pipeline)
```

### 2. Endpoint Selection & Auth Configuration
```python
# User configuration (POST /configure/{job_id}/chat)
config = {
    "selected_endpoints": ["get_/pets", "post_/pets"],
    "auth_strategy": {
        "type": "api_key",
        "header_name": "Authorization",
        "env_var_name": "API_KEY"
    },
    "server_name": "petstore_mcp"
}
# Triggers: Store.save_job_config() → status="configured"
```

### 3. Generated Server Structure
```python
GeneratedServer(
    files=[
        GeneratedFile("server.py", "<code>", "Main MCP server"),
        GeneratedFile("helpers.py", "<code>", "Utility functions"),
    ],
    requirements=["fastmcp==3.1.0", "httpx>=0.25.0"],
    env_vars=["API_KEY", "BASE_URL"],
    startup_command="python server.py"
)
```

## Error Handling Strategy

1. **Pipeline Errors**: Caught in orchestrator, job status → "failed" + error message
2. **Validation Errors**: Trigger automatic retry with feedback
3. **LLM Output Errors**: Validator detects syntax/import issues, retries
4. **External Errors**: Spec fetch failures, Docker build errors → HTTP 400/500
5. **Database Errors**: Logged but don't crash pipeline (in-memory fallback)

## Security Considerations

1. **Auth Credentials**: Stored in env vars only, never exposed in generated code templates
2. **Input Validation**: Endpoint IDs, auth types validated at configuration time
3. **Generated Code Security**: Agent instructions enforce:
   - DELETE tools require confirmation
   - HTTP timeouts (30s)
   - Sanitized error messages
   - Input validation (Field patterns, bounds)
4. **API Access**: No authentication required (MVP - added later)

## Performance Considerations

1. **Caching**: In-memory job cache reduces DB queries during pipeline
2. **Async Pipeline**: Background tasks don't block API responses
3. **Lazy Supabase**: Connection only established if configured
4. **Streaming**: Frontend polls job status (no WebSocket yet)
5. **Code Validation**: Parallel checks where possible (syntax, imports independently)

## Testing Strategy

**Test Structure** (`/tests/`):
- Unit tests per module (test_*.py)
- Integration tests for pipeline (test_full_eval.py)
- E2E tests for full workflows (tests/e2e/)
- AI agent evaluation (deepeval framework)

**Coverage**:
- Parser: OpenAPI 2.0/3.x handling
- Agents: Output structure validation (Pydantic)
- Validator: Syntax/import/runtime phases
- API endpoints: Job creation, status polling
- Services: URL fetching, PDF extraction

## Deployment Architecture

- **Backend**: Docker container (Python 3.12 + FastAPI)
- **Frontend**: Static files (React build)
- **Database**: Supabase PostgreSQL
- **Docker Build**: docker-py on backend (can build container inside container)
- **Registry**: Optional push to configured registry
- **Orchestration**: docker-compose for local, K8s-ready for production

## Extension Points

1. **New Input Formats**: Add parsers in `services/spec_fetcher.py` + agents
2. **New Agent Types**: Create agent in `/agents/` following PydanticAI pattern
3. **New LLM Providers**: Replace OpenRouter with other pydantic-ai provider
4. **Custom Auth Strategies**: Extend agent instructions in `generator_agent.py`
5. **Code Generation Patterns**: Modify agent instructions (no separate template engine)
6. **New Deployment Targets**: Add service in `/services/` for Docker, K8s, etc.
