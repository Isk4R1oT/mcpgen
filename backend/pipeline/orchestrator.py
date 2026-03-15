from backend.agents.analyzer_agent import create_analyzer_agent, build_analysis_prompt
from backend.agents.generator_agent import create_generator_agent, build_generation_prompt
from backend.agents.models import AnalysisResult, GeneratedServer
from backend.api.specs import _jobs_store
from backend.config import Settings
from backend.pipeline.parser import ParsedSpec, extract_endpoints_from_spec
from backend.pipeline.validator import validate_generated_code, ValidationResult


async def run_pipeline(job_id: str, settings: Settings) -> None:
    """Run the full generation pipeline for a job.

    Stages: parse → analyze → generate → validate → (package — M5)
    """
    job = _jobs_store[job_id]

    try:
        # Stage 1: PARSE (already done during upload)
        _update_status(job, "parsing")
        parsed_spec: ParsedSpec = job["parsed_spec"]
        endpoints = job["endpoints"]

        # Stage 2: ANALYZE
        _update_status(job, "analyzing")
        config = job.get("config", {})
        selected_ids = config.get("selected_endpoints", [])

        if selected_ids:
            selected_endpoints = [e for e in endpoints if e.id in selected_ids]
        else:
            selected_endpoints = endpoints

        prompt = build_analysis_prompt(selected_endpoints, parsed_spec.auth_schemes)
        analyzer = create_analyzer_agent(
            api_key=settings.openrouter_api_key,
            model_name=settings.openrouter_model,
        )
        analysis_result = await analyzer.run(prompt)
        analysis: AnalysisResult = analysis_result.output
        job["analysis"] = analysis

        # Stage 3: GENERATE
        _update_status(job, "generating")
        auth_type = config.get("auth_strategy", {}).get("type", analysis.auth_recommendation)
        base_url = parsed_spec.base_url or "https://api.example.com"

        gen_prompt = build_generation_prompt(analysis, auth_type=auth_type, base_url=base_url)
        generator = create_generator_agent(
            api_key=settings.openrouter_api_key,
            model_name=settings.openrouter_model,
        )
        gen_result = await generator.run(gen_prompt)
        generated: GeneratedServer = gen_result.output
        job["generated_server"] = generated

        # Stage 4: VALIDATE
        _update_status(job, "validating")
        validation = validate_generated_code(generated)
        job["validation"] = {
            "syntax_ok": validation.syntax_ok,
            "imports_ok": validation.imports_ok,
            "errors": validation.errors,
        }

        if not validation.syntax_ok:
            # Retry generation once with error feedback
            fix_prompt = (
                f"{gen_prompt}\n\n"
                f"IMPORTANT: The previous generation had errors:\n"
                f"{chr(10).join(validation.errors)}\n\n"
                f"Please fix these errors and regenerate."
            )
            gen_result = await generator.run(fix_prompt)
            generated = gen_result.output
            job["generated_server"] = generated

            validation = validate_generated_code(generated)
            job["validation"] = {
                "syntax_ok": validation.syntax_ok,
                "imports_ok": validation.imports_ok,
                "errors": validation.errors,
            }

            if not validation.syntax_ok:
                _update_status(job, "failed")
                job["error_message"] = f"Code generation failed after retry: {validation.errors}"
                return

        # Stage 5: PACKAGE (will be implemented in M5)
        _update_status(job, "completed")

    except Exception as e:
        _update_status(job, "failed")
        job["error_message"] = str(e)
        raise


def _update_status(job: dict, status: str) -> None:
    job["status"] = status
