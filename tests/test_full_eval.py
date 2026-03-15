"""Full pipeline evaluation — generates MCP server and runs all metrics.

Run with: pytest tests/test_full_eval.py -v
Makes real API calls to OpenRouter. Slow (~60s).
"""

from pathlib import Path

import pytest

from backend.agents.analyzer_agent import create_analyzer_agent, build_analysis_prompt
from backend.agents.generator_agent import create_generator_agent, build_generation_prompt
from backend.eval.metrics import evaluate_generated_server, run_automated_metrics
from backend.eval.openrouter_judge import OpenRouterJudge
from backend.pipeline.parser import parse_openapi_from_file, extract_endpoints_from_spec

FIXTURES_DIR = Path(__file__).parent / "fixtures"


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


@pytest.mark.slow
class TestFullPipelineEval:
    async def test_petstore_full_pipeline_automated_metrics(self) -> None:
        """Run full pipeline on petstore and check all automated metrics."""
        api_key = get_openrouter_key()

        # Parse
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)

        # Analyze (first 4 endpoints)
        analyzer = create_analyzer_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        analysis_prompt = build_analysis_prompt(endpoints[:4], spec.auth_schemes)
        analysis = (await analyzer.run(analysis_prompt)).output

        # Generate
        generator = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        gen_prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url=spec.base_url or "https://petstore.swagger.io/v2",
        )
        server = (await generator.run(gen_prompt)).output

        # Evaluate — automated only (no LLM judge to keep it faster)
        metrics = run_automated_metrics(server, analysis)

        # Print report
        print("\n=== AUTOMATED METRICS REPORT ===")
        for m in metrics:
            status = "PASS" if m.passed else "FAIL"
            print(f"  [{status}] {m.dimension} / {m.name}: {m.score:.2f} — {m.details[:100]}")

        # Core metrics must pass
        syntax = next(m for m in metrics if m.name == "Syntax Validity")
        assert syntax.passed, f"Syntax failed: {syntax.details}"

        runtime = next(m for m in metrics if m.name == "Runtime & Tool Registration")
        assert runtime.passed, f"Runtime failed: {runtime.details}"

        secrets = next(m for m in metrics if m.name == "No Hardcoded Secrets")
        assert secrets.passed, f"Secrets found: {secrets.details}"

        auth = next(m for m in metrics if m.name == "Auth From Environment")
        assert auth.passed, f"Auth issue: {auth.details}"

    async def test_petstore_full_pipeline_with_judge(self) -> None:
        """Run full pipeline with LLM-as-judge evaluation."""
        api_key = get_openrouter_key()
        judge = OpenRouterJudge(api_key=api_key, model_name="x-ai/grok-code-fast-1")

        # Parse
        spec = parse_openapi_from_file(FIXTURES_DIR / "petstore.yaml")
        endpoints = extract_endpoints_from_spec(spec)

        # Analyze
        analyzer = create_analyzer_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        analysis_prompt = build_analysis_prompt(endpoints[:4], spec.auth_schemes)
        analysis = (await analyzer.run(analysis_prompt)).output

        # Generate
        generator = create_generator_agent(api_key=api_key, model_name="x-ai/grok-code-fast-1")
        gen_prompt = build_generation_prompt(
            analysis,
            auth_type="api_key",
            base_url=spec.base_url or "https://petstore.swagger.io/v2",
        )
        server = (await generator.run(gen_prompt)).output

        # Full evaluation with judge
        report = evaluate_generated_server(server, analysis, judge)

        # Print full report
        print("\n=== FULL EVALUATION REPORT ===")
        print(f"Composite Score: {report.composite_score:.2f}")
        print(f"Overall Pass: {report.passed}")
        for dim, data in report.summary.items():
            print(f"\n  {dim}: {data['score']:.2f} ({'PASS' if data['passed'] else 'FAIL'})")
            for m in data["metrics"]:
                print(f"    {'PASS' if m['passed'] else 'FAIL'} {m['name']}: {m['score']:.2f}")

        # Composite must be reasonable
        assert report.composite_score >= 0.5, (
            f"Composite score too low: {report.composite_score:.2f}"
        )
