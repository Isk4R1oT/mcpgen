from backend.agents.analyzer_agent import create_analyzer_agent, build_analysis_prompt
from backend.agents.generator_agent import create_generator_agent, build_generation_prompt
from backend.agents.models import AnalysisResult, GeneratedServer
from backend.config import Settings
from backend.db.store import get_job, update_job_status, save_analysis, save_generated_server
from backend.pipeline.parser import ParsedSpec, extract_endpoints_from_spec
from backend.pipeline.validator import validate_generated_code, ValidationResult


async def run_pipeline(job_id: str, settings: Settings) -> None:
    """Run the full generation pipeline for a job.

    Stages: parse → analyze → generate → validate → (package)
    """
    job = get_job(job_id)

    try:
        # Stage 1: PARSE (already done during upload)
        update_job_status(job_id, "parsing", None)
        parsed_spec: ParsedSpec = job["parsed_spec"]
        endpoints = job["endpoints"]

        # Stage 2: ANALYZE
        update_job_status(job_id, "analyzing", None)
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
        save_analysis(job_id, analysis)

        # Stage 3: GENERATE
        update_job_status(job_id, "generating", None)
        auth_type = config.get("auth_strategy", {}).get("type", analysis.auth_recommendation)
        base_url = parsed_spec.base_url or "https://api.example.com"

        gen_prompt = build_generation_prompt(analysis, auth_type=auth_type, base_url=base_url)
        generator = create_generator_agent(
            api_key=settings.openrouter_api_key,
            model_name=settings.openrouter_model,
        )
        gen_result = await generator.run(gen_prompt)
        generated: GeneratedServer = gen_result.output

        # Stage 4: VALIDATE
        update_job_status(job_id, "validating", None)
        validation = validate_generated_code(generated)
        validation_dict = {
            "syntax_ok": validation.syntax_ok,
            "imports_ok": validation.imports_ok,
            "runtime_ok": validation.runtime_ok,
            "tools_discovered": validation.tools_discovered,
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

            validation = validate_generated_code(generated)
            validation_dict = {
                "syntax_ok": validation.syntax_ok,
                "imports_ok": validation.imports_ok,
                "runtime_ok": validation.runtime_ok,
                "tools_discovered": validation.tools_discovered,
                "errors": validation.errors,
            }

            if not validation.syntax_ok:
                update_job_status(job_id, "failed",
                                  f"Code generation failed after retry: {validation.errors}")
                return

        save_generated_server(job_id, generated, validation_dict)

        # Stage 5: PACKAGE (source archive created on-demand at download)
        update_job_status(job_id, "completed", None)

    except Exception as e:
        update_job_status(job_id, "failed", str(e))
        raise
