# mcpgen

MCP server generator from API documentation. Users provide API docs (OpenAPI/Swagger, URL, PDF/MD files), AI agent analyzes endpoints and generates a production-ready Python MCP server packaged as a Docker image.

## Stack

- **Backend**: Python 3.12+, FastAPI, uvicorn
- **AI Agent**: PydanticAI with OpenRouter (dev: DeepSeek V3.2, prod: Claude Sonnet 4.6)
- **MCP Framework**: FastMCP v3.1 (Streamable HTTP transport)
- **Database**: Supabase (PostgreSQL + Storage)
- **Frontend**: React + Vite + TypeScript
- **Docker**: docker-py for programmatic image builds
- **Parsing**: prance, openapi-pydantic, pdfplumber, trafilatura
- **AI Testing**: deepeval (LLM-as-judge)

## Architecture

```
Input (OpenAPI/URL/file)
  → Parser (normalize to internal model)
  → Analyzer Agent (PydanticAI: semantic analysis, LLM-optimized tool descriptions)
  → Generator Agent (PydanticAI: produces FastMCP Python code)
  → Validator (syntax + import + mock test, retry once on failure)
  → Packager (Dockerfile + tar.gz + docker build + push)
Output (Docker image + source download)
```

Full architecture docs: `docs/` folder

## Commands

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Tests
python -m pytest -v

# AI evaluation tests
python -m pytest tests/test_*_agent.py -v

# Full stack
docker-compose up
```

## Development Workflow

### TDD (mandatory)
Every new module follows test-driven development:
1. Write tests first (`tests/test_<module>.py`)
2. Run tests — verify they fail
3. Implement code
4. Run tests — verify they pass
Use `/tdd` skill for guidance.

### Commits
Each logical unit of work gets a commit using conventional format.
Use `/commit-feature` skill.

### Library Usage
ALWAYS check Context7 documentation before using any external library.
Use `/check-lib-docs` skill.

### Documentation
Keep `docs/` folder updated after each feature.
Use `/update-docs` skill.

### AI Testing
Use deepeval with LLM-as-judge for PydanticAI agent output evaluation.
Tests must verify structured output validity and content quality.

## Skills (slash commands)

| Command | Purpose |
|---------|---------|
| `/tdd` | Test-driven development workflow |
| `/check-lib-docs` | Check library docs via Context7 before coding |
| `/commit-feature` | Create well-structured git commit |
| `/update-docs` | Update architecture documentation |

## Code Conventions

- Python: strict typing everywhere, no `Any`/`Dict[str, Any]`, functional style
- All functions pure where possible — only modify return values
- snake_case for Python, camelCase for TypeScript/React
- Comments and docstrings in English
- Error messages include context: request params, response body, status codes
- No default parameter values — make all parameters explicit
- No fallbacks unless explicitly requested

## Project Structure

```
mcpgen/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── config.py            # pydantic-settings
│   ├── api/                 # FastAPI routes
│   ├── pipeline/            # Parse → Analyze → Generate → Validate → Package
│   ├── agents/              # PydanticAI agents + Pydantic output models
│   ├── codegen/             # Jinja2 templates, auth snippets, Dockerfile template
│   ├── db/                  # Supabase client, models, repositories
│   └── services/            # Docker, storage, spec fetcher services
├── frontend/src/
│   ├── pages/               # HomePage, WizardPage, ResultPage
│   ├── components/          # wizard/, chat/, common/
│   ├── hooks/               # useJob, useChat
│   └── api/                 # Backend API client
├── docs/                    # Architecture documentation (self-reference)
└── tests/                   # pytest + deepeval
```

## Key Design Decisions

1. **Code-gen, not runtime**: AI generates Python source code, not runtime wrappers
2. **Streamable HTTP**: SSE is deprecated in MCP spec (2025-03-26)
3. **Structured outputs**: PydanticAI `result_type` ensures validated Pydantic models
4. **Tool descriptions for LLMs**: "Use when:" pattern, snake_case names
5. **Auth via env vars**: Generated MCP servers never expose credentials through LLM
6. **No auth in MVP**: Open access, authentication added later

## Environment Variables

```
SUPABASE_URL=
SUPABASE_KEY=
OPENROUTER_API_KEY=
OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
DOCKER_REGISTRY=
DOCKER_REGISTRY_PUSH_ENABLED=false
```
