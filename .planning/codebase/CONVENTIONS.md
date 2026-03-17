# Code Conventions

## Overview

mcpgen follows strict conventions for code style, error handling, and patterns derived from `backend/`, `tests/`, and project configuration. Python 3.12+, FastAPI backend, PydanticAI agents for LLM integration.

---

## Python Code Style

### Imports & Structure

- **All imports at top of file** — stdlib, third-party, local, in that order
- **Strict typing everywhere** — no `Any`, `Dict[str, Any]`, `unknown`
- Type hints on function signatures: parameters and return types mandatory
- Example from `/backend/agents/models.py`:
  ```python
  from pydantic import BaseModel, field_validator

  class ToolParameter(BaseModel):
      name: str
      type: str
      description: str
      required: bool
  ```

### Naming Conventions

**Python: `snake_case` for variables, functions, files**
- Tool names in MCP servers: `list_pets`, `get_pet_by_id`, `add_pet` (snake_case for LLM tokenization)
- Module files: `generator_agent.py`, `parser.py`
- Classes: PascalCase (`GeneratedServer`, `ToolDefinition`)
- Constants: `UPPERCASE` (e.g., `HTTP_METHODS`, `FASTMCP_REFERENCE`)

**Database/API responses**: snake_case fields (Pydantic models enforce this)

### Function Design

**Pure functions where possible**
- Return values only; never modify input parameters or global state
- Example from `/backend/pipeline/parser.py`:
  ```python
  def _extract_base_url(spec: dict) -> str | None:
      """Extract base URL from spec — no side effects."""
      servers = spec.get("servers", [])
      if servers:
          return servers[0].get("url")
      # ... extract Swagger 2.0 base URL ...
      return None
  ```

**No default parameter values**
- Make all parameters explicit; avoid `def func(x: int = 5):`
- Callers must pass arguments explicitly
- Exception: Pydantic `field(default=...)` for optional model fields

**No flag parameters**
- ❌ Bad: `def generate(analysis, format="code")`  (flag switches logic)
- ✅ Good: separate functions or `Literal["code" | "json"]` for strict typing

**Single responsibility**
- One function does one thing
- Related logic grouped in classes (connectors/interfaces only)

### Comments & Docstrings

- **English only**
- Docstrings belong in the function/class they describe, not separate files
- Example from `/backend/agents/generator_agent.py`:
  ```python
  def build_generation_prompt(
      analysis: AnalysisResult,
      auth_type: str,
      base_url: str,
  ) -> str:
      """Build the prompt for the generator agent."""
  ```

- Inline comments explain **why**, not what (code reads itself)
- Multi-line docstrings use """ """ standard format

### Code Organization

**Backend modules follow pipeline pattern:**
- `/backend/pipeline/` — data transformations (parser → analyzer → generator → validator → packager)
- `/backend/agents/` — PydanticAI agent definitions + prompt builders
- `/backend/eval/` — evaluation metrics and LLM judges
- `/backend/codegen/` — Jinja2 templates and generation templates
- `/backend/services/` — Docker, Storage, external integrations
- `/backend/db/` — Supabase models and repository layer
- `/backend/api/` — FastAPI routes

**Each module is self-contained** — imports follow hierarchy (pipeline → agents → models)

---

## Error Handling

### Explicit Error Raising

- **Always raise errors explicitly** — never silently ignore failures
- **Use specific error types** — standard Python exceptions or custom domain-specific ones
- Example from `/backend/pipeline/parser.py`:
  ```python
  def parse_openapi_from_file(file_path: Path) -> ParsedSpec:
      if not file_path.exists():
          raise FileNotFoundError(f"Spec file not found: {file_path}")
  ```

### Error Context

Error messages must include enough context to debug:
- **Request parameters** — what inputs caused the error?
- **Response body/status** — if API call failed, include HTTP status + response text
- **Root cause** — not a symptom, the actual problem

Example from `/backend/eval/metrics.py`:
```python
# Check validation errors with context
if not validation.runtime_ok:
    return MetricResult(
        name="Runtime & Tool Registration",
        dimension="MCP Protocol",
        score=0.0,
        passed=False,
        details=f"Errors: {validation.errors}",  # Include full error list
    )
```

### No Silent Fallbacks

- ❌ Bad: `try: x = parse(data) except: x = default_value`
- ✅ Good: raise the error or log with context + re-raise

External API calls:
- Retries with exponential backoff and warnings to stderr
- After retries exhausted: **raise the last error** (don't fallback)
- Include response body in error message (truncated if >500 chars)

### Pydantic Validation

Use `field_validator` for model-level constraints:
```python
class GeneratedServer(BaseModel):
    files: list[GeneratedFile]
    requirements: list[str]
    env_vars: list[str]
    startup_command: str

    @field_validator("files")
    @classmethod
    def files_not_empty(cls, v: list[GeneratedFile]) -> list[GeneratedFile]:
        if not v:
            raise ValueError("files must not be empty")
        return v
```

---

## Pydantic Models

### Structure

Models in `/backend/agents/models.py` are Pydantic `BaseModel` classes:
- All fields typed
- Use `| None` for optional (Python 3.10+ union syntax)
- Validators for constraints

Example:
```python
class ToolParameter(BaseModel):
    name: str
    type: str
    description: str
    required: bool

class ToolDefinition(BaseModel):
    tool_name: str
    description: str
    group: str
    http_method: str
    path: str
    parameters: list[ToolParameter]
    request_body_schema: dict | None
    response_description: str
```

### Usage in Agents

- **Output types** are Pydantic models — PydanticAI agents return validated instances
- Example from `/backend/agents/generator_agent.py`:
  ```python
  agent = Agent(
      model,
      output_type=GeneratedServer,  # Pydantic model
      instructions=GENERATOR_INSTRUCTIONS,
  )
  ```

### JSON Serialization

- Pydantic handles `.model_dump()` / `.model_dump_json()`
- Used for API responses and database storage

---

## Type Hints

### Strictness

- No `Any`, `Dict[str, Any]`, `Optional[T]` (use `T | None`)
- Literal types for constrained values:
  ```python
  http_method: Literal["GET", "POST", "PUT", "DELETE", "PATCH"]
  ```

### Collections

- Use built-in syntax: `list[T]`, `dict[K, V]`, `tuple[T, ...]`
- Not `List[T]`, `Dict[K, V]` from `typing`

### Type Aliases

Define complex types once:
```python
EndpointDict = dict[str, str | list[dict] | None]
```

---

## OOP & Functional Style

### Class Usage

**Classes are for connectors/interfaces ONLY:**
- `/backend/db/store.py` — database client wrapper (class)
- `/backend/services/` — Docker, storage clients (classes)
- `/backend/agents/models.py` — Pydantic data models (classes, but no methods)

**Functions for business logic:**
- Parser functions: `parse_openapi_from_file()`, `extract_endpoints_from_spec()`
- Builder functions: `build_analysis_prompt()`, `build_generation_prompt()`
- Validator functions: `validate_generated_code()`

### Composition Over Inheritance

- No deep inheritance hierarchies
- Pass dependencies as function arguments
- Example from `/backend/eval/metrics.py`:
  ```python
  def evaluate_generated_server(
      server: GeneratedServer,
      analysis: AnalysisResult,
      judge: OpenRouterJudge | None,  # Dependency passed in
  ) -> EvaluationReport:
      report = EvaluationReport()
      report.metrics.extend(run_automated_metrics(server, analysis))
      if judge is not None:
          report.metrics.extend(run_judge_metrics(server, analysis, judge))
      return report
  ```

---

## Configuration

### Settings Class

From `/backend/config.py`:
```python
class Settings(BaseSettings):
    # Required
    supabase_url: str
    supabase_key: str
    openrouter_api_key: str
    openrouter_model: str

    # Optional with defaults
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    docker_registry_push_enabled: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}
```

- Uses Pydantic `BaseSettings` for env var binding
- No hardcoded secrets
- `.env` file loaded automatically

---

## Tool Design for LLMs

### Tool Naming

- Snake_case: `list_pets`, `get_pet_by_id`, `add_pet`
- Descriptive: what the tool does, not generic names like `api_call`

### Tool Descriptions

From `/backend/agents/generator_agent.py` GENERATOR_INSTRUCTIONS:
- Start with "Use when:" to explain trigger condition
- Explain what data it returns
- Mention side effects (creates/deletes/modifies)
- 1-3 sentences, written for LLM audience
- Example: "Use when you need to retrieve a specific pet by its unique ID. Returns the pet object with all details."

### Parameter Design

From analyzer agent rules:
- Use specific types: `integer` for IDs, `boolean` for flags, not everything as `string`
- Include constraints in descriptions: "valid range", "enum: available|pending|sold"
- Required vs optional correct: IDs required, filters optional
- Parameter descriptions mention format expectations and constraints

### Auth Handling

- **Server-side only** — credentials from `os.environ`, never as tool parameters
- Tool descriptions note authentication requirement in server setup docs, not parameters
- Example from `/backend/eval/metrics.py`:
  ```python
  def check_auth_from_env(server: GeneratedServer) -> MetricResult:
      """D3.3: Auth credentials must come from os.environ, not tool parameters."""
      # Checks AST for functions with auth-related params — fails if found
  ```

---

## Code Quality Principles

### DRY (Don't Repeat Yourself)

- Extract common logic to functions
- Reuse Pydantic models instead of duplicating schema definitions
- Example: `ParsedEndpoint`, `ParsedSpec` used across parser, analyzer, validator

### KISS (Keep It Simple, Stupid)

- Obvious code over clever code
- Readable > compact
- Early returns to avoid nesting

### YAGNI (You Aren't Gonna Need It)

- Don't add features "just in case"
- Code is added when explicitly needed (via tasks/issues)

### Check If Logic Already Exists

- Before writing a new module/function, search existing code
- Avoid duplicating parse logic, validation, etc.

---

## File Paths & Imports

### Absolute Imports

```python
# ✅ Good
from backend.agents.generator_agent import create_generator_agent

# ❌ Bad
from .generator_agent import create_generator_agent  # Relative
```

### Module Structure

```
mcpgen/
├── backend/
│   ├── agents/
│   │   ├── __init__.py
│   │   ├── models.py                 # Pydantic data classes
│   │   ├── generator_agent.py        # Agent + prompt builder
│   │   ├── analyzer_agent.py
│   │   └── ... other agents
│   ├── pipeline/
│   │   ├── parser.py                 # Parse → normalize
│   │   ├── orchestrator.py           # Coordinate agents
│   │   ├── validator.py              # Syntax + import + runtime checks
│   │   └── packager.py               # Docker build
│   ├── eval/
│   │   ├── metrics.py                # Evaluation framework
│   │   ├── openrouter_judge.py       # LLM judge for deepeval
│   └── services/
│       └── ... connectors
├── tests/
│   ├── conftest.py                   # Global pytest fixtures
│   ├── test_*.py                     # Unit + integration tests
│   ├── fixtures/                     # Test data (petstore.yaml, etc.)
│   └── e2e/                          # End-to-end tests
```

---

## Ruff Linter Configuration

From `pyproject.toml`:
```toml
[tool.ruff]
target-version = "py312"
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]
```

- **E**: PEP 8 errors
- **F**: PyFlakes (undefined names, unused imports)
- **I**: isort (import sorting)
- **UP**: pyupgrade (modern Python syntax)
- **B**: flake8-bugbear (common bugs)
- **SIM**: flake8-simplify (code simplification)

Commands:
```bash
ruff check backend tests --fix  # Format + fix
ruff format backend tests       # Format only
```

---

## Summary Table

| Aspect | Convention |
|--------|-----------|
| Naming | `snake_case` (functions, vars, files); `PascalCase` (classes); `UPPERCASE` (constants) |
| Type Hints | Strict; no `Any`; use union `T \| None`; `Literal` for constrained values |
| Error Handling | Explicit raise; include context; no silent fallbacks |
| Functions | Pure (return only); no default params; single responsibility |
| Classes | Connectors/interfaces only; Pydantic for data models |
| Comments | English, **why** not **what**; docstrings in function/class |
| Imports | Top of file; absolute paths; stdlib → third-party → local |
| Tool Design (MCP) | Snake_case names; "Use when" descriptions; auth from `os.environ` |
| Configuration | Pydantic `BaseSettings`; env vars; no hardcoded secrets |
| Testing | pytest; fixtures in conftest; mocking for external APIs |

