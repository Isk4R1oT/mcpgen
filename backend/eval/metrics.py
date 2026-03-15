"""Comprehensive evaluation metrics for generated MCP servers.

7 dimensions, 20+ metrics. Mix of automated checks and LLM-as-judge (GEval).

Usage:
    from backend.eval.metrics import evaluate_generated_server
    report = evaluate_generated_server(generated_server, analysis_result, judge)
"""

import ast
import re
from dataclasses import dataclass, field

from deepeval import evaluate
from deepeval.metrics import GEval
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

from backend.agents.models import AnalysisResult, GeneratedServer
from backend.eval.openrouter_judge import OpenRouterJudge
from backend.pipeline.validator import validate_generated_code, ValidationResult


@dataclass
class MetricResult:
    name: str
    dimension: str
    score: float  # 0.0 - 1.0
    passed: bool
    details: str


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


# ============================================================================
# Automated Metrics (no LLM calls)
# ============================================================================

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


def check_no_hardcoded_secrets(server: GeneratedServer) -> MetricResult:
    """D3.1: No hardcoded API keys, tokens, or passwords."""
    secret_patterns = [
        r'["\']sk-[a-zA-Z0-9]{20,}["\']',
        r'["\']ghp_[a-zA-Z0-9]{36}["\']',
        r'["\']Bearer\s+[a-zA-Z0-9._-]{20,}["\']',
        r'api_key\s*=\s*["\'][^"\']{10,}["\']',
        r'password\s*=\s*["\'][^"\']+["\']',
        r'token\s*=\s*["\'][a-zA-Z0-9._-]{20,}["\']',
    ]

    findings = []
    for f in server.files:
        for pattern in secret_patterns:
            matches = re.findall(pattern, f.content, re.IGNORECASE)
            for m in matches:
                # Exclude obvious env var reads
                if "os.environ" in f.content[max(0, f.content.index(m) - 50):f.content.index(m)]:
                    continue
                findings.append(f"{f.filename}: possible hardcoded secret: {m[:30]}...")

    passed = len(findings) == 0
    return MetricResult(
        name="No Hardcoded Secrets",
        dimension="Security",
        score=1.0 if passed else 0.0,
        passed=passed,
        details="; ".join(findings) if findings else "No hardcoded secrets detected",
    )


def check_auth_from_env(server: GeneratedServer) -> MetricResult:
    """D3.3: Auth credentials must come from os.environ, not tool parameters."""
    issues = []
    for f in server.files:
        if not f.filename.endswith(".py"):
            continue
        tree = ast.parse(f.content)
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) or isinstance(node, ast.AsyncFunctionDef):
                # Check if any decorated function has auth-related params
                for decorator in node.decorator_list:
                    is_tool = False
                    if isinstance(decorator, ast.Attribute) and decorator.attr == "tool":
                        is_tool = True
                    elif isinstance(decorator, ast.Name) and decorator.id == "tool":
                        is_tool = True
                    if is_tool:
                        for arg in node.args.args:
                            name = arg.arg.lower()
                            if name in ("api_key", "token", "password", "secret", "auth", "bearer_token"):
                                issues.append(f"{f.filename}:{node.name} has auth param '{arg.arg}'")

    passed = len(issues) == 0
    return MetricResult(
        name="Auth From Environment",
        dimension="Security",
        score=1.0 if passed else 0.0,
        passed=passed,
        details="; ".join(issues) if issues else "All auth from os.environ",
    )


def check_endpoint_coverage(
    server: GeneratedServer,
    analysis: AnalysisResult,
) -> MetricResult:
    """D4.1: All requested tools from analysis should be implemented."""
    expected = {t.tool_name for t in analysis.tools}
    validation = validate_generated_code(server)
    discovered = set(validation.tools_discovered)

    covered = expected & discovered
    missing = expected - discovered
    coverage = len(covered) / len(expected) if expected else 1.0

    return MetricResult(
        name="Endpoint Coverage",
        dimension="Completeness",
        score=coverage,
        passed=coverage >= 0.9,
        details=f"Covered: {len(covered)}/{len(expected)}. Missing: {missing or 'none'}",
    )


def check_health_check(server: GeneratedServer) -> MetricResult:
    """D4.2: Server must include a health check tool."""
    validation = validate_generated_code(server)
    has_health = any("health" in t.lower() for t in validation.tools_discovered)

    return MetricResult(
        name="Health Check Present",
        dimension="Completeness",
        score=1.0 if has_health else 0.0,
        passed=has_health,
        details="health_check tool found" if has_health else "No health check tool",
    )


def check_error_handling(server: GeneratedServer) -> MetricResult:
    """D5.1: HTTP calls should have try/except error handling."""
    server_py = next((f for f in server.files if f.filename == "server.py"), server.files[0])
    content = server_py.content

    has_try_except = "try:" in content and "except" in content
    has_raise_for_status = "raise_for_status" in content
    has_http_error_catch = "HTTPStatusError" in content or "HTTPError" in content or "RequestError" in content
    has_timeout = "timeout" in content.lower()

    score_parts = [has_try_except, has_raise_for_status, has_http_error_catch, has_timeout]
    score = sum(score_parts) / len(score_parts)

    details = []
    if not has_try_except:
        details.append("missing try/except")
    if not has_raise_for_status:
        details.append("missing raise_for_status()")
    if not has_http_error_catch:
        details.append("missing HTTP error type catches")
    if not has_timeout:
        details.append("missing timeout config")

    return MetricResult(
        name="Error Handling",
        dimension="Robustness",
        score=score,
        passed=score >= 0.5,
        details="; ".join(details) if details else "Proper error handling present",
    )


def check_type_hints(server: GeneratedServer) -> MetricResult:
    """D7.1: Functions should have type hints."""
    total_funcs = 0
    annotated_funcs = 0

    for f in server.files:
        if not f.filename.endswith(".py"):
            continue
        try:
            tree = ast.parse(f.content)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                total_funcs += 1
                has_return = node.returns is not None
                has_params = all(
                    arg.annotation is not None
                    for arg in node.args.args
                    if arg.arg not in ("self", "cls")
                )
                if has_return and has_params:
                    annotated_funcs += 1

    if total_funcs == 0:
        return MetricResult(
            name="Type Hint Coverage",
            dimension="Documentation",
            score=1.0,
            passed=True,
            details="No functions found",
        )

    coverage = annotated_funcs / total_funcs
    return MetricResult(
        name="Type Hint Coverage",
        dimension="Documentation",
        score=coverage,
        passed=coverage >= 0.7,
        details=f"{annotated_funcs}/{total_funcs} functions fully annotated ({coverage:.0%})",
    )


def check_runtime(server: GeneratedServer) -> MetricResult:
    """D2.4 + D6.2: Server starts and tools register correctly."""
    validation = validate_generated_code(server)

    if validation.runtime_ok:
        return MetricResult(
            name="Runtime & Tool Registration",
            dimension="MCP Protocol",
            score=1.0,
            passed=True,
            details=f"Tools discovered: {validation.tools_discovered}",
        )
    else:
        return MetricResult(
            name="Runtime & Tool Registration",
            dimension="MCP Protocol",
            score=0.0,
            passed=False,
            details=f"Errors: {validation.errors}",
        )


# ============================================================================
# LLM-Judge Metrics (GEval via OpenRouter)
# ============================================================================

def judge_tool_descriptions(
    server: GeneratedServer,
    analysis: AnalysisResult,
    judge: OpenRouterJudge,
) -> MetricResult:
    """D1.2: Tool descriptions quality assessed by LLM judge."""
    tool_descriptions = "\n".join(
        f"- {t.tool_name}: {t.description}" for t in analysis.tools
    )

    metric = GEval(
        name="Tool Description Quality",
        criteria=(
            "Evaluate MCP tool descriptions for LLM agent consumption. Each description should: "
            "(1) Start with 'Use when' to explain the trigger condition. "
            "(2) Explain what data the tool returns. "
            "(3) Mention any side effects (creates/deletes/modifies data). "
            "(4) Be specific to the API domain, not generic. "
            "(5) Be 1-3 concise sentences."
        ),
        threshold=0.7,
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
    )

    test_case = LLMTestCase(input="N/A", actual_output=tool_descriptions)
    results = evaluate([test_case], [metric])
    result = results.test_results[0]

    return MetricResult(
        name="Tool Description Quality",
        dimension="Tool Design",
        score=result.metrics_data[0].score or 0.0,
        passed=result.success,
        details=result.metrics_data[0].reason or "",
    )


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
            "(2) Proper async/await with httpx.AsyncClient() for HTTP calls. "
            "(3) Error handling — try/except around HTTP calls, informative error returns. "
            "(4) Auth credentials from os.environ, never hardcoded. "
            "(5) Type hints on all function parameters and returns. "
            "(6) Clean code structure — no magic strings, meaningful names. "
            "(7) Proper use of streamable-http transport."
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


def judge_security(
    server: GeneratedServer,
    judge: OpenRouterJudge,
) -> MetricResult:
    """D3.2 + D3.4: Security review by LLM judge."""
    all_code = "\n\n".join(f"# {f.filename}\n{f.content}" for f in server.files)

    metric = GEval(
        name="Security Review",
        criteria=(
            "Review this MCP server code for security issues: "
            "(1) Input validation — are tool inputs validated before use? "
            "(2) No command injection — no os.system(), subprocess with unsanitized input. "
            "(3) No path traversal — file paths are not constructed from user input. "
            "(4) Auth is server-side — credentials never exposed as tool parameters. "
            "(5) Least privilege — destructive operations (DELETE) have safeguards. "
            "(6) No SQL injection risk (if applicable). "
            "(7) Error messages don't leak sensitive info (full stack traces, internal paths)."
        ),
        threshold=0.7,
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        model=judge,
    )

    test_case = LLMTestCase(input="N/A", actual_output=all_code)
    results = evaluate([test_case], [metric])
    result = results.test_results[0]

    return MetricResult(
        name="Security Review",
        dimension="Security",
        score=result.metrics_data[0].score or 0.0,
        passed=result.success,
        details=result.metrics_data[0].reason or "",
    )


# ============================================================================
# Composite Evaluation
# ============================================================================

def run_automated_metrics(
    server: GeneratedServer,
    analysis: AnalysisResult,
) -> list[MetricResult]:
    """Run all automated (non-LLM) metrics."""
    return [
        check_syntax(server),
        check_no_hardcoded_secrets(server),
        check_auth_from_env(server),
        check_endpoint_coverage(server, analysis),
        check_health_check(server),
        check_error_handling(server),
        check_type_hints(server),
        check_runtime(server),
    ]


def run_judge_metrics(
    server: GeneratedServer,
    analysis: AnalysisResult,
    judge: OpenRouterJudge,
) -> list[MetricResult]:
    """Run all LLM-judge metrics."""
    return [
        judge_tool_descriptions(server, analysis, judge),
        judge_code_quality(server, judge),
        judge_security(server, judge),
    ]


def evaluate_generated_server(
    server: GeneratedServer,
    analysis: AnalysisResult,
    judge: OpenRouterJudge | None,
) -> EvaluationReport:
    """Run full evaluation suite on a generated MCP server.

    Args:
        server: The generated server to evaluate
        analysis: The analysis result used to generate the server
        judge: OpenRouter LLM judge (None to skip judge metrics)

    Returns:
        EvaluationReport with all metric results
    """
    report = EvaluationReport()
    report.metrics.extend(run_automated_metrics(server, analysis))

    if judge is not None:
        report.metrics.extend(run_judge_metrics(server, analysis, judge))

    return report
