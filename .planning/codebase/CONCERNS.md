# Codebase Concerns & Technical Debt

## Critical Issues

### 1. **EXPOSED CREDENTIALS IN .env FILE** 🔴
**File:** `/Users/igor/Projects/mcpgen/.env`
**Severity:** CRITICAL - Security Risk

The `.env` file contains real, working credentials:
- `SUPABASE_KEY=<REDACTED>` (Supabase API key)
- `OPENROUTER_API_KEY=<REDACTED>` (OpenRouter API key)
- `DATABASE_URL=<REDACTED>` (Database credentials)

**Impact:** If this repository is public or compromised, attackers can:
- Access the Supabase database and storage
- Make API calls to OpenRouter (cost exploitation)
- Access the PostgreSQL database directly

**Action Required:**
- [ ] Rotate all exposed keys immediately
- [ ] Remove `.env` from git history: `git filter-branch --tree-filter 'rm -f .env' -- --all`
- [ ] Add `.env` to `.gitignore` (already done, but too late)
- [ ] Use `.env.local` for development (ignored by git)

---

## Error Handling Issues

### 2. **Silent Exception Swallowing**
**Files:**
- `backend/services/sandbox.py` (lines 88-94, 133-139, 155-160, 175-183)
- `backend/services/spec_fetcher.py` (lines 105-113, 139-145, 149-154)
- `backend/api/sandbox.py` (line 171-172)
- `backend/db/store.py` (lines 22-31)

**Pattern:** Bare `except Exception: pass` clauses hide real errors.

```python
# Bad: sandbox.py:88-94
try:
    for net in client.networks.list():
        if "mcpgen" in net.name:
            network_name = net.name
            break
except Exception:
    pass  # Silently ignores Docker connection failures, permission issues, etc.
```

**Impact:**
- Runtime failures go undiagnosed
- Users get cryptic "failed to start sandbox" messages without root cause
- Debugging becomes impossible in production

**Action Required:**
- [ ] Replace `pass` with specific error handling
- [ ] Log warnings before falling back: `logger.warning(f"Failed to get networks: {e}")`
- [ ] Surface errors to API responses where appropriate

---

### 3. **Insufficient Error Context in Exceptions**
**Files:**
- `backend/api/sandbox.py:66` — "Failed to start sandbox: {e}" (too generic)
- `backend/pipeline/orchestrator.py:97` — catches Exception but only passes `str(e)`
- `backend/api/generation.py:25` — Settings() called without error handling for missing env vars

**Impact:**
- Error responses don't include enough context for debugging
- Supabase errors, Docker errors, API errors all map to same generic message
- Users can't distinguish between bad credentials vs network issues

**Action Required:**
- [ ] Implement structured error logging with context (request params, response bodies)
- [ ] Create custom exception classes for different failure modes
- [ ] Include error codes in API responses

---

## State Management Issues

### 4. **In-Memory Job Store Without Persistence** 🟡
**File:** `backend/db/store.py` (lines 16-17)

```python
# In-memory cache (fast access during pipeline execution)
_jobs_cache: dict[str, dict] = {}
```

**Issues:**
- Jobs are stored in-memory only; if the server crashes mid-pipeline, all jobs are lost
- Supabase fallback is optional (returns `None` if unreachable)
- No synchronization mechanism — cache and Supabase can diverge
- Multiple server instances don't share state (horizontal scaling impossible)

**Impact:**
- User loses progress if server restarts during generation
- Chat history may not sync to Supabase
- Deploying new versions requires careful cleanup

**Action Required:**
- [ ] Make Supabase writes synchronous for critical operations (job creation, status updates)
- [ ] Add transaction support or event sourcing for multi-step operations
- [ ] Document the cache invalidation strategy
- [ ] Add health check to verify Supabase connectivity on startup

---

### 5. **Sandbox Tracking Without Persistence**
**File:** `backend/services/sandbox.py` (lines 24-25)

```python
# Track running sandboxes
_sandboxes: dict[str, SandboxInstance] = {}
```

**Issues:**
- Sandbox state is only in memory
- Container restart orphans containers (no way to reconnect)
- Multiple instances can't coordinate (port conflicts)
- No automatic cleanup if server crashes

**Impact:**
- Docker containers accumulate on server crashes
- Zombie containers consume resources
- Port exhaustion possible (port range: 9100-9200)

**Action Required:**
- [ ] Store sandbox state in Supabase with heartbeat mechanism
- [ ] Add cleanup routine: scan Docker for orphaned "mcpgen-sandbox-*" containers on startup
- [ ] Use dynamic port allocation with conflict detection
- [ ] Set container auto-remove flag or implement periodic cleanup

---

## Port & Resource Management

### 6. **Fixed Port Range with Wraparound**
**File:** `backend/services/sandbox.py:28-37`

```python
_next_port = 9100
def _allocate_port() -> int:
    global _next_port
    port = _next_port
    _next_port += 1
    if _next_port > 9200:
        _next_port = 9100  # Wraparound — can conflict with existing containers!
    return port
```

**Issues:**
- Port reuse without checking if the port is already in use
- No conflict detection across multiple server instances
- Race condition if two requests allocate the same port simultaneously
- Max 101 concurrent sandboxes before port collision

**Impact:**
- Intermittent "port already in use" errors
- Containers mapped to wrong ports
- Users can't run more than ~100 sandboxes

**Action Required:**
- [ ] Use Docker automatic port assignment (`:8000` → random host port)
- [ ] Query Docker API to find bound ports before allocating
- [ ] Store allocated ports in Supabase with cleanup on sandbox stop

---

## Validation & Testing Gaps

### 7. **Insufficient Input Validation**
**Files:**
- `backend/api/sandbox.py:32` — `env_vars: dict[str, str]` has no size/content validation
- `backend/api/generation.py:24` — `Settings()` can raise `ValidationError` but not caught
- `backend/services/spec_fetcher.py:28` — `fetch_url_content()` has no URL scheme validation

**Impact:**
- Malicious env vars (very large values, special chars) could break sandbox
- Missing required env vars crash the server without clear error
- Users can pass arbitrary URLs (SSRF risk)

**Action Required:**
- [ ] Add Pydantic validators for env vars (size limits, allowed keys)
- [ ] Validate URLs: whitelist schemes (https only?), check against private ranges
- [ ] Add request size limits to FastAPI

---

### 8. **Validation Retry Limited to One Attempt**
**File:** `backend/pipeline/orchestrator.py:66-89`

Only one retry on syntax errors. If the AI's fix still has errors, the pipeline fails without further attempts.

**Impact:**
- ~10-15% of generated code still fails after first retry (based on typical LLM performance)
- User must manually debug and re-trigger

**Action Required:**
- [ ] Implement up to 3 retries with error feedback
- [ ] Add metrics/telemetry to track retry success rates
- [ ] Consider stepping back to analyzer if generation consistently fails

---

## Security Issues

### 9. **Credentials Passed in Docker Env Vars**
**File:** `backend/services/sandbox.py:99` and `backend/api/sandbox.py:63`

Generated servers receive user credentials (API tokens, keys) as environment variables. These are visible in:
- `docker inspect <container>` (anyone with Docker access)
- Container logs if logged
- Running process environment (ps output)

**Impact:**
- If user shares container logs for debugging, credentials are leaked
- Malicious containers could read env vars of sibling containers

**Action Required:**
- [ ] Use Docker secrets instead of env vars (requires Docker Swarm or compose file)
- [ ] Mount credentials as files from a volume (more complex)
- [ ] Document security implications in README

---

### 10. **No Rate Limiting on API Endpoints**
**Files:** All `backend/api/*.py` routes

**Impact:**
- Users can spam requests to generation/sandbox endpoints
- DOS possible: trigger unlimited background task spawning
- No cost protection (Supabase/OpenRouter costs scale unbounded)

**Action Required:**
- [ ] Add `slowapi` rate limiting middleware
- [ ] Implement per-IP/per-user throttling
- [ ] Add job concurrency limits

---

## Logging & Observability

### 11. **No Structured Logging**
**Files:** Entire backend codebase

The code has **zero logging imports** — no `import logging` anywhere. This means:
- No visibility into what the AI agents are doing
- Can't track pipeline stage timing
- Errors are only visible when they crash the API
- No audit trail for generated code

**Impact:**
- Debugging production issues is nearly impossible
- Can't measure agent performance (latency, token usage)
- No alerts possible for failures

**Action Required:**
- [ ] Add `structlog` or `loguru` for structured logging
- [ ] Log at each pipeline stage with duration
- [ ] Log agent prompts/outputs (redacted) for debugging
- [ ] Set up log aggregation (e.g., Cloud Logging, ELK)

---

### 12. **No Telemetry or Metrics**
**Impact:**
- Can't track what specs are failing
- No visibility into agent quality
- Can't measure user adoption or feature usage

**Action Required:**
- [ ] Add Prometheus metrics for pipeline success/failure/timing
- [ ] Track API response times
- [ ] Monitor Docker resource usage
- [ ] Log agent quality metrics (test pass rate, code complexity, etc.)

---

## Database & Persistence

### 13. **Weak Supabase Error Handling**
**Files:** `backend/db/store.py:40-46`, `backend/db/client.py` (if exists)

Supabase API calls don't check for:
- Network timeouts
- Rate limit errors (429)
- Invalid credentials (401)
- Permission errors (403)

These errors would crash the endpoint without graceful degradation.

**Action Required:**
- [ ] Wrap Supabase calls with retry logic and timeout handling
- [ ] Return 503 (Service Unavailable) if DB is unreachable
- [ ] Log Supabase errors separately for monitoring

---

### 14. **No Database Migration Strategy**
**Impact:**
- Can't evolve schema safely
- No version tracking for backward compatibility
- Deploys could fail if schema assumptions change

**Action Required:**
- [ ] Use Supabase migrations (SQL files in version control)
- [ ] Run migrations as part of deployment

---

## Code Quality Issues

### 15. **Dynamic Type Annotations**
**Files:** Multiple

The CLAUDE.md rules state "No generic types: `Any`, `unknown`, `Dict[str, Any]`" but the code violates this:
- `backend/api/sandbox.py:32` — `env_vars: dict[str, str]` (ok)
- `backend/db/store.py` — Various `dict` without full type annotations
- `backend/agents/models.py` — `request_body_schema: dict | None` (should be typed schema)

**Action Required:**
- [ ] Create TypedDict classes for structured data (configs, job state)
- [ ] Replace `dict` with specific Pydantic models
- [ ] Enable mypy strict mode

---

### 16. **Circular Imports Risk**
**Files:** `backend/api/sandbox.py:139, 151`

Inline imports inside function bodies suggest circular dependency issues:
```python
from backend.agents.models import GeneratedFile
from backend.agents.models import GeneratedServer
```

**Action Required:**
- [ ] Refactor to avoid inline imports
- [ ] Check for cycles: `python -m py_compile backend/**/*.py`

---

## Testing Gaps

### 17. **Low Test Coverage for Critical Paths**
**Missing Tests:**
- Sandbox Docker lifecycle (start/stop/cleanup) — has unit tests but no integration tests
- Supabase persistence sync — no tests for cache/DB divergence
- Multi-concurrent job handling — race conditions untested
- Spec fetcher error handling — only happy path tested

**Action Required:**
- [ ] Add integration tests with real Docker
- [ ] Add concurrency tests for job handling
- [ ] Add chaos testing (kill containers, disconnect DB)

---

### 18. **No Test Fixtures for Supabase**
**Files:** `tests/conftest.py`

Uses in-memory cache for tests, never tests actual Supabase integration.

**Action Required:**
- [ ] Create a test Supabase instance or use mock
- [ ] Test persistence across server restarts

---

## Configuration & Deployment

### 19. **No Environment Validation on Startup**
**File:** `backend/main.py` (not examined yet, but likely)

If `Settings()` is instantiated lazily or incompletely, missing env vars crash the app on first request instead of startup.

**Action Required:**
- [ ] Validate all required settings in app startup
- [ ] Return clear error message for missing keys
- [ ] Check Supabase connectivity

---

### 20. **Docker Image Hardcoded Details**
**File:** `backend/services/sandbox.py:67-72`

Dockerfile is hardcoded, no customization for:
- Python version (pinned to 3.12)
- Base image security updates
- Build cache optimization

**Action Required:**
- [ ] Use template variables for base image
- [ ] Add `.dockerignore`
- [ ] Build with `BuildKit` for better layer caching

---

## API Design Issues

### 21. **Synchronous Settings() Instantiation**
**Files:** `backend/api/generation.py:24`, `backend/api/sandbox.py:94, 121`

Every endpoint calls `Settings()` which re-reads environment and validates. This is wasteful and adds latency.

**Action Required:**
- [ ] Create singleton `settings` instance at app startup
- [ ] Inject into endpoints via FastAPI dependency

---

### 22. **No Async Handling for Long Operations**
**Files:** `backend/pipeline/orchestrator.py`

The orchestrator runs synchronously in background tasks. If an operation takes >30s:
- Client timeout possible if polling too slowly
- No way to cancel/pause operations
- No progress reporting

**Action Required:**
- [ ] Add progress update mechanism (WebSocket or SSE)
- [ ] Implement operation cancellation
- [ ] Add operation queuing (avoid thundering herd)

---

## Dependency & Version Issues

### 23. **Pinned but Outdated Dependencies**
**File:** `pyproject.toml`

- `pydantic-ai>=0.0.49` (0.0.x is pre-release; consider upgrading)
- No upper bounds on major versions (could break on minor updates)

**Action Required:**
- [ ] Audit dependency versions
- [ ] Add tighter upper bounds: `fastapi>=0.115,<0.120`
- [ ] Set up dependabot for security updates

---

### 24. **Optional Dependency on Docker**
**Impact:**
- If Docker is not installed/configured, errors are silent
- API appears to work but sandboxes fail mysteriously

**Action Required:**
- [ ] Check Docker availability on startup
- [ ] Return 503 if unavailable

---

## Documentation Gaps

### 25. **Architecture Documents Outdated**
**Files:** `docs/` folder (not examined in detail)

Based on CLAUDE.md reference, architecture docs exist but may not match current implementation.

**Action Required:**
- [ ] Verify docs match current code
- [ ] Document deployment prerequisites (Docker, Supabase setup)

---

## Performance Concerns

### 26. **No Caching for Parsed Specs**
**Files:** `backend/services/spec_fetcher.py`

Re-parsing the same URL/file multiple times regenerates the model.

**Action Required:**
- [ ] Cache parsed specs by URL hash
- [ ] Store in Supabase for persistence

---

### 27. **Inefficient Port Scanning**
Every sandbox start iterates Docker networks. If there are many networks, this is slow.

**Action Required:**
- [ ] Cache network discovery (refresh every N seconds)

---

## Summary Table

| Issue | Severity | Category | Status |
|-------|----------|----------|--------|
| Exposed credentials in .env | CRITICAL | Security | Unfixed |
| Silent exception swallowing | HIGH | Error Handling | Unfixed |
| In-memory job store | HIGH | Persistence | Unfixed |
| No structured logging | HIGH | Observability | Unfixed |
| Rate limiting missing | HIGH | Security | Unfixed |
| Port allocation race condition | MEDIUM | Resource Mgmt | Unfixed |
| Validation one-retry only | MEDIUM | Quality | Unfixed |
| No database migrations | MEDIUM | Database | Unfixed |
| Inline imports (circular deps) | MEDIUM | Code Quality | Unfixed |
| No async progress reporting | MEDIUM | API Design | Unfixed |
| Test coverage gaps | MEDIUM | Testing | Unfixed |
| Docker error handling | LOW | Error Handling | Unfixed |
| Settings lazy loading | LOW | Performance | Unfixed |

---

## Quick Wins (Low Effort, High Impact)

1. **Rotate all exposed credentials immediately** (10 min)
2. **Add `logger.warning()` before silent exception handlers** (30 min)
3. **Create singleton Settings instance** (15 min)
4. **Add startup health checks for Docker/Supabase** (30 min)
5. **Enable mypy with strict mode and fix errors** (2 hours)

---

## Next Steps

1. **Immediate (Today):** Rotate credentials, commit fixes for #1-5
2. **This Week:** Implement structured logging, rate limiting
3. **This Sprint:** Fix persistence issues (#4-5), add tests for critical paths
4. **Next Sprint:** Add async progress reporting, database migrations
