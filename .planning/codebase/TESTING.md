# Testing Patterns & Framework

## Overview

mcpgen uses **pytest** as the test framework with **deepeval** for LLM-as-judge evaluation. Tests are organized into unit, integration, eval, and e2e categories. Configuration in `pyproject.toml`.

---

## Pytest Configuration

From `pyproject.toml`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
pythonpath = ["."]
```

- **testpaths**: discover tests in `/tests` directory
- **asyncio_mode**: `"auto"` — automatic `async def test_*` handling (no explicit `@pytest.mark.asyncio`)
- **pythonpath**: absolute imports from root

### Run Commands

```bash
# All tests
python -m pytest -v

# Unit tests only (excluding slow eval tests)
python -m pytest -v -m "not slow"

# Eval tests only
python -m pytest tests/test_*_eval.py -v

# Single test
python -m pytest tests/test_parser.py::TestParseOpenAPIFromFile::test_parse_petstore_yaml -v

# With coverage
python -m pytest --cov=backend --cov-report=term-missing
```

---

## Test Structure

### Directory Layout

```
tests/
├── conftest.py                          # Global fixtures
├── fixtures/                            # Test data
│   ├── petstore.yaml                    # OpenAPI spec
│   └── sample_api_docs.md               # Markdown docs for extraction
├── test_parser.py                       # Unit tests
├── test_agent_models.py                 # Unit tests
├── test_validator.py                    # Unit tests
├── test_config.py                       # Unit tests
├── test_metrics.py                      # Unit tests
├── test_analyzer_agent.py               # Unit tests
├── test_generator_agent.py              # Unit tests
├── test_extractor_agent.py              # Unit tests
├── test_chat_agent.py                   # Unit tests
├── test_analyzer_eval.py                # Eval tests (real LLM calls)
├── test_generator_eval.py               # Eval tests (real LLM calls)
├── test_extractor_eval.py               # Eval tests (real LLM calls)
├── test_api_jobs.py                     # Integration tests
├── test_api_specs.py                    # Integration tests
├── e2e/                                 # End-to-end tests
│   └── test_agent_with_mcp.py           # Full pipeline
└── __init__.py
```

### Test Classification

**Unit tests** — test functions in isolation, no external APIs
- Location: `test_parser.py`, `test_agent_models.py`, `test_validator.py`, `test_config.py`, `test_metrics.py`
- Mocking: HTTP calls, database, external APIs
- Speed: fast (<100ms per test)
- No markers needed

**Eval tests** — test LLM agents with real API calls and deepeval
- Location: `test_*_eval.py` files
- Markers: `@pytest.mark.slow`
- Speed: slow (5-30s per test)
- Require real OpenRouter API key
- Run on demand: `pytest tests/test_*_eval.py -v`

**Integration tests** — test FastAPI endpoints with test client
- Location: `test_api_*.py`
- Mock database and agent returns
- Use `AsyncClient` from httpx

**E2E tests** — full pipeline, end-to-end
- Location: `tests/e2e/`
- May require Docker, real services
- Run last in CI/CD

---

## Global Fixtures (conftest.py)

From `/tests/conftest.py`:
```python
@pytest.fixture(autouse=True)
def set_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set required environment variables for all tests."""
    monkeypatch.setenv("SUPABASE_URL", "https://test-project.supabase.co")
    monkeypatch.setenv("SUPABASE_KEY", "test-supabase-key")
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")
    monkeypatch.setenv("OPENROUTER_MODEL", "x-ai/grok-code-fast-1")
    monkeypatch.setenv("DOCKER_REGISTRY", "ghcr.io/test-user")
    monkeypatch.setenv("DOCKER_REGISTRY_PUSH_ENABLED", "false")
```

- **autouse=True** — applied to all tests automatically
- **monkeypatch** — pytest fixture for environment variable mocking
- All required env vars set once globally

---

## Unit Testing Patterns

### Test Class Organization

Group related tests in classes (one per module):
```python
class TestParseOpenAPIFromFile:
    def test_parse_petstore_yaml(self) -> None: ...
    def test_parse_petstore_has_endpoints(self) -> None: ...
    def test_parse_nonexistent_file_raises(self) -> None: ...

class TestParseOpenAPIFromDict:
    def test_parse_minimal_spec(self) -> None: ...
    def test_parse_spec_without_servers(self) -> None: ...
```

From `/tests/test_parser.py`:
- One test class per function/feature
- Descriptive method names: `test_<what>_<condition>_<expected>`
- No shared state between test methods

### Assertion Patterns

From `/tests/test_agent_models.py`:
```python
def test_create_tool_parameter(self) -> None:
    param = ToolParameter(
        name="pet_id",
        type="integer",
        description="The ID of the pet to retrieve",
        required=True,
    )
    assert param.name == "pet_id"
    assert param.required is True
```

- **Arrange-Act-Assert** (AAA) pattern
- One logical assertion per test (may have multiple `assert` lines)
- Use `assert` not `self.assertEqual()` (pytest style)

### Error Testing

From `/tests/test_parser.py`:
```python
def test_parse_nonexistent_file_raises(self) -> None:
    with pytest.raises(FileNotFoundError):
        parse_openapi_from_file(Path("/nonexistent/file.yaml"))
```

- Use `pytest.raises()` context manager
- Verify exception type and message (when meaningful)

### Pydantic Model Validation

From `/tests/test_agent_models.py`:
```python
def test_generated_server_requires_files(self) -> None:
    with pytest.raises(ValidationError):
        GeneratedServer(
            files=[],  # Empty, violates validator
            requirements=[],
            env_vars=[],
            startup_command="python server.py",
        )
```

- Instantiate with invalid data, expect `ValidationError`
- Models validate on instantiation (Pydantic 2.x)

---

## Mocking Patterns

### Mock External APIs

From `/tests/test_api_specs.py` (integration test):
```python
@pytest.fixture
def async_client() -> AsyncClient:
    """FastAPI test client with mocked services."""
    with patch("backend.api.specs.parse_openapi_from_file"):
        yield AsyncClient(app=app, base_url="http://test")
```

- Use `unittest.mock.patch()` or `pytest-mock` plugin
- Mock at the module import level, not the function call
- Fixtures provide pre-patched clients

### Mock HTTP Responses

Example pattern (used implicitly in integration tests):
```python
from unittest.mock import AsyncMock, patch
import httpx

# Mock httpx.AsyncClient context manager
with patch("httpx.AsyncClient") as mock_client:
    mock_response = AsyncMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"data": "test"}
    mock_client.return_value.__aenter__.return_value = mock_response
    # Test code that calls httpx
```

### Fixture Helpers

From `/tests/test_validator.py`:
```python
def make_server(server_code: str) -> GeneratedServer:
    return GeneratedServer(
        files=[
            GeneratedFile(filename="server.py", content=server_code, description="Main server"),
        ],
        requirements=["fastmcp>=3.1.0", "httpx>=0.28"],
        env_vars=["API_KEY"],
        startup_command="python server.py",
    )
```

- Helper functions to construct test objects
- Reduces boilerplate in test methods
- Used across multiple test methods

### Test Data Fixtures

From `/tests/test_generator_agent.py`:
```python
def sample_analysis() -> AnalysisResult:
    """Create a sample AnalysisResult for testing."""
    return AnalysisResult(
        server_name="petstore_mcp",
        server_description="MCP server for the Petstore API",
        tools=[...],
        auth_recommendation="api_key",
        notes=[],
    )
```

- Functions that return test data
- Reusable across multiple test classes
- Named `sample_*()`, `make_*()`, or `fake_*()`

---

## Async Testing

### Async Test Functions

From `/tests/test_generator_eval.py`:
```python
@pytest.mark.slow
class TestGeneratorEval:
    async def test_generator_produces_valid_server(self) -> None:
        """Test structural validity of generated server."""
        agent = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        result = await agent.run(prompt)
        assert isinstance(result.output, GeneratedServer)
```

- Define test as `async def test_*()`
- PydanticAI agents return `result: RunResult[T]`; access output via `result.output`
- `asyncio_mode = "auto"` in pytest config handles event loop

### Async Fixtures

Pattern (not shown in current tests but used for API fixtures):
```python
@pytest.fixture
async def async_db():
    """Async database fixture."""
    db = AsyncDatabase()
    await db.connect()
    yield db
    await db.disconnect()
```

---

## DeepEval Integration

### LLM-as-Judge Pattern

From `/tests/test_generator_eval.py`:
```python
from deepeval import evaluate
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams
from backend.eval.openrouter_judge import OpenRouterJudge

async def test_generated_code_quality(self) -> None:
    """Use deepeval GEval with OpenRouter judge to assess code quality."""
    api_key = get_openrouter_key()
    judge = OpenRouterJudge(api_key=api_key, model_name="x-ai/grok-code-fast-1")

    code_quality = GEval(
        name="MCP Server Code Quality",
        criteria=(
            "Assess this Python MCP server code for: "
            "1) Correct use of FastMCP decorators (@mcp.tool). "
            "2) Proper async/await with httpx for HTTP calls. "
            "3) Error handling (try/except around HTTP calls). "
            "4) Auth credentials read from os.environ. "
            "5) Proper type hints on function parameters."
        ),
        threshold=0.7,
        evaluation_params=[
            LLMTestCaseParams.INPUT,
            LLMTestCaseParams.ACTUAL_OUTPUT,
        ],
        model=judge,
    )

    test_case = LLMTestCase(
        input="Generate a FastMCP server with tools for listing pets and getting pet by ID, using API key auth.",
        actual_output=server_py.content,
    )

    results = evaluate([test_case], [code_quality])
    assert results.test_results[0].success, (
        f"Code quality failed: {results.test_results[0].metrics_data}"
    )
```

- **GEval**: deepeval metric that uses LLM as judge
- **LLMTestCase**: input + expected output pair
- **Criteria**: detailed instructions for judge
- **Threshold**: minimum score (0.0-1.0)
- **evaluation_params**: which fields to pass to judge

### Custom Judge (OpenRouter)

From `/backend/eval/openrouter_judge.py`:
```python
class OpenRouterJudge(DeepEvalBaseLLM):
    """DeepEval LLM implementation using OpenRouter API."""

    def __init__(self, api_key: str, model_name: str):
        self._api_key = api_key
        self._model_name = model_name
        self._client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key,
        )

    def load_model(self) -> OpenAI:
        return self._client

    def generate(self, prompt: str, schema: BaseModel | None = None) -> str | BaseModel:
        client = self.load_model()
        # ... JSON or text response handling ...
        return response.choices[0].message.content or ""

    async def a_generate(self, prompt: str, schema: BaseModel | None = None) -> str | BaseModel:
        return self.generate(prompt, schema)
```

- Implements `DeepEvalBaseLLM` interface
- Wraps OpenAI-compatible OpenRouter API
- Handles JSON schema validation responses

### Skip Tests Without API Key

From `/tests/test_generator_eval.py`:
```python
def get_openrouter_key() -> str:
    env_path = Path(__file__).parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("OPENROUTER_API_KEY="):
                key = line.split("=", 1)[1].strip()
                if key and not key.startswith("sk-or-v1-your"):
                    return key
    pytest.skip("Real OPENROUTER_API_KEY not found in .env")
    return ""
```

- Helper to read real API key from `.env`
- Skips test if key not found or is placeholder
- Eval tests marked `@pytest.mark.slow` to exclude from CI by default

---

## Evaluation Metrics

### Automated Metrics (No LLM Calls)

From `/backend/eval/metrics.py`:
```python
def check_syntax(server: GeneratedServer) -> MetricResult:
    """D2.1: All .py files must compile without SyntaxError."""
    errors = []
    for f in server.files:
        if not f.filename.endswith(".py"):
            continue
        try:
            compile(f.content, f.filename, "exec")
        except SyntaxError as e:
            errors.append(f"{f.filename}:{e.lineno}: {e.msg}")

    passed = len(errors) == 0
    return MetricResult(
        name="Syntax Validity",
        dimension="Code Correctness",
        score=1.0 if passed else 0.0,
        passed=passed,
        details="; ".join(errors) if errors else "All files compile successfully",
    )
```

- **MetricResult**: name, dimension, score (0.0-1.0), passed (boolean), details (string)
- **Automated metrics** (8 total): syntax, secrets, auth, endpoint coverage, health check, error handling, type hints, runtime
- No external API calls

### Judge Metrics (LLM Evaluation)

From `/backend/eval/metrics.py`:
```python
def judge_code_quality(
    server: GeneratedServer,
    judge: OpenRouterJudge,
) -> MetricResult:
    """D2.5 + D7.3: Code quality assessed by LLM judge."""
    server_py = next((f for f in server.files if f.filename == "server.py"), server.files[0])

    metric = GEval(
        name="Code Quality",
        criteria=(
            "Evaluate this MCP server Python code for production quality: "
            "(1) Correct use of FastMCP — @mcp.tool decorator, Annotated params. "
            # ... more criteria ...
        ),
        threshold=0.7,
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
    )

    test_case = LLMTestCase(input="N/A", actual_output=server_py.content)
    results = evaluate([test_case], [metric])
    result = results.test_results[0]

    return MetricResult(
        name="Code Quality",
        dimension="Code Correctness",
        score=result.metrics_data[0].score or 0.0,
        passed=result.success,
        details=result.metrics_data[0].reason or "",
    )
```

- **10 judge metrics** (different from 8 automated)
- Dimensions: Tool Design (3), Code Correctness (2), Security (1), Robustness (1), Completeness (1), Documentation (1), MCP Protocol (1)

### Evaluation Report

From `/backend/eval/metrics.py`:
```python
@dataclass
class EvaluationReport:
    metrics: list[MetricResult] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return all(m.passed for m in self.metrics)

    @property
    def composite_score(self) -> float:
        if not self.metrics:
            return 0.0
        return sum(m.score for m in self.metrics) / len(self.metrics)

    @property
    def summary(self) -> dict:
        by_dimension: dict[str, list[MetricResult]] = {}
        for m in self.metrics:
            by_dimension.setdefault(m.dimension, []).append(m)
        return {
            dim: {
                "score": sum(m.score for m in results) / len(results),
                "passed": all(m.passed for m in results),
                "metrics": [{"name": m.name, "score": m.score, "passed": m.passed} for m in results],
            }
            for dim, results in by_dimension.items()
        }
```

- Aggregates all metrics
- `composite_score`: average across all metrics
- `summary`: grouped by dimension (Tool Design, Code Correctness, etc.)

### Test Validation Metrics

From `/tests/test_metrics.py`:
```python
def test_valid_code_passes(self) -> None:
    result = check_syntax(make_server("x = 1"))
    assert result.passed is True
    assert result.score == 1.0

def test_invalid_code_fails(self) -> None:
    result = check_syntax(make_server("def f(\n  return"))
    assert result.passed is False
    assert result.score == 0.0
```

- Unit tests for metric functions
- Test both passing and failing cases
- Verify score ranges and details

---

## Integration Testing

### FastAPI Test Client

Pattern from integration tests:
```python
from httpx import AsyncClient

@pytest.fixture
async def async_client() -> AsyncClient:
    yield AsyncClient(app=app, base_url="http://test")

@pytest.mark.asyncio
async def test_spec_upload(async_client: AsyncClient) -> None:
    response = await async_client.post("/api/specs/upload", files={"file": ("petstore.yaml", yaml_content)})
    assert response.status_code == 200
    data = response.json()
    assert "job_id" in data
```

- `AsyncClient` from httpx for async FastAPI apps
- Fixture passed to test; used like real HTTP client
- Test endpoints in isolation with mocked downstream services

### Database Mocking

Pattern (typical for integration tests):
```python
from unittest.mock import AsyncMock, patch

@patch("backend.db.store.SupabaseStore.get_job")
async def test_get_job_detail(mock_get: AsyncMock, async_client: AsyncClient) -> None:
    mock_get.return_value = {"id": "job-123", "status": "completed"}
    response = await async_client.get("/api/jobs/job-123")
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
```

- Mock database methods using `patch()`
- Avoid real Supabase calls in tests
- Control return values to test different scenarios

---

## Test Coverage

### Coverage Reporting

```bash
# Run tests with coverage
python -m pytest --cov=backend --cov-report=term-missing --cov-report=html

# Check coverage by module
python -m pytest --cov=backend --cov-report=term-missing | grep backend/
```

**Coverage goals:**
- `backend/` modules: 70%+ coverage
- Critical paths (agents, validators): 85%+
- UI/utilities: 60%+

### Coverage Exclusion

Mark code not worth testing (rare):
```python
if __name__ == "__main__":  # pragma: no cover
    main()
```

---

## Performance & Markers

### Test Markers

From `pyproject.toml` and test files:
```python
@pytest.mark.slow
class TestGeneratorEval:
    """Slow tests that make real API calls."""
```

Custom markers:
- `@pytest.mark.slow` — eval tests with real LLM calls (5-30s)
- `@pytest.mark.asyncio` — async tests (usually automatic with `asyncio_mode = "auto"`)

Run commands:
```bash
# Exclude slow tests (unit only)
python -m pytest -v -m "not slow"

# Only slow tests
python -m pytest -v -m "slow"
```

### Test Execution Order

pytest runs tests in:
1. Discovery order (files alphabetically, methods top-to-bottom)
2. No dependency between tests (each is independent)

Use markers to group:
```python
@pytest.mark.slow
@pytest.mark.integration
async def test_full_pipeline() -> None: ...
```

---

## Test Data & Fixtures

### Fixture Files

Location: `/tests/fixtures/`
- `petstore.yaml` — OpenAPI 3.0 spec used in parser, analyzer, validator tests
- `sample_api_docs.md` — Markdown documentation for extractor agent tests

Loading in tests:
```python
FIXTURES_DIR = Path(__file__).parent / "fixtures"

def test_parse_petstore_yaml(self) -> None:
    spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
    assert spec.title == "Swagger Petstore"
```

### Test Data Builders

Reusable helpers:
```python
def make_server(server_code: str) -> GeneratedServer: ...
def sample_analysis() -> AnalysisResult: ...
def make_judge(api_key: str) -> OpenRouterJudge: ...
```

Defined in test modules, used by multiple test classes

---

## Best Practices

### Naming

- Test file: `test_<module>.py` (e.g., `test_parser.py`)
- Test class: `Test<Feature>` (e.g., `TestParseOpenAPIFromFile`)
- Test method: `test_<what>_<condition>_<expected>`
  - ✅ `test_parse_nonexistent_file_raises`
  - ✅ `test_prompt_includes_tool_names`
  - ❌ `test_1`, `test_parser`

### One Assertion Per Test (Logical)

- ✅ Multiple `assert` lines testing one concept
- ❌ Multiple unrelated assertions in one test
- If assertion fails, reader knows exactly what broke

### AAA Pattern

```python
def test_something(self) -> None:
    # Arrange: Set up test data
    param = ToolParameter(name="id", type="integer", description="ID", required=True)

    # Act: Call the code
    result = some_function(param)

    # Assert: Verify results
    assert result.name == "id"
    assert result.required is True
```

### Isolation

- No test depends on another test's state
- Each test sets up its own fixtures
- Can run tests in any order: `pytest --random-order`

### Descriptive Failure Messages

```python
# Good: custom message on failure
assert len(endpoints) > 0, "Expected at least 1 endpoint from petstore spec"

# Good: use helper that provides context
missing = expected_tools - discovered
assert len(missing) == 0, f"Missing tools: {missing}. Discovered: {discovered}."
```

### Avoid Testing Implementation

- ✅ Test behavior and outputs
- ❌ Test internal variable states or private methods
- Example: don't test `_extract_base_url()` directly; test it via `parse_openapi_from_file()`

---

## Running Tests in CI/CD

### Pre-commit Checks

```bash
# Format + lint
ruff check backend tests --fix
ruff format backend tests

# Type check (if mypy used)
# mypy backend

# Unit tests
python -m pytest -v -m "not slow"
```

### Full Test Suite (on merge)

```bash
# All unit tests
python -m pytest -v -m "not slow"

# Eval tests (if API key available)
python -m pytest tests/test_*_eval.py -v

# Coverage report
python -m pytest --cov=backend --cov-report=term-missing
```

---

## Summary

| Aspect | Pattern |
|--------|---------|
| Framework | pytest; async tests with `async def` |
| Configuration | `pyproject.toml` + `conftest.py` |
| Markers | `@pytest.mark.slow` for eval tests |
| Mocking | `unittest.mock.patch()` for external APIs/DB |
| LLM Evaluation | deepeval `GEval` + custom `OpenRouterJudge` |
| Test Data | Fixtures + builders (`make_*`, `sample_*`) |
| Naming | `test_<what>_<condition>` in classes `Test<Feature>` |
| Assertions | AAA pattern; one logical assertion per test |
| Coverage | 70%+ target; critical paths 85%+ |
| Performance | Fast unit tests; slow eval tests marked and skipped by default |

