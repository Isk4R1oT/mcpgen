import json
import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile

import yaml
from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from backend.agents.extractor_agent import (
    create_extractor_agent,
    build_extraction_prompt,
    ExtractionResult,
)
from backend.config import Settings
from backend.db.store import create_job, get_job
from backend.pipeline.parser import (
    ParsedEndpoint,
    ParsedSpec,
    extract_endpoints_from_spec,
    parse_openapi_from_dict,
    parse_openapi_from_file,
)
from backend.services.spec_fetcher import (
    detect_content_type,
    extract_text_from_markdown,
    extract_text_from_pdf,
    fetch_url_content,
    parse_content_to_spec,
)

router = APIRouter(prefix="/specs", tags=["specs"])

ALLOWED_EXTENSIONS = {".yaml", ".yml", ".json", ".pdf", ".md"}


def _extraction_to_parsed_spec(extraction: ExtractionResult) -> ParsedSpec:
    """Convert LLM ExtractionResult to ParsedSpec."""
    endpoints = []
    for ep in extraction.endpoints:
        endpoint_id = f"{ep.method.lower()}_{ep.path}"
        endpoints.append({
            "id": endpoint_id,
            "method": ep.method.upper(),
            "path": ep.path,
            "summary": ep.summary,
            "tag": ep.tag,
            "parameters": ep.parameters,
            "parameters_count": len(ep.parameters),
            "request_body": ep.request_body,
            "response_schema": None,
            "operation_id": None,
            "security": None,
            "deprecated": False,
        })

    auth_schemes = []
    if extraction.auth_type:
        auth_schemes.append({"type": extraction.auth_type, "name": "detected"})

    return ParsedSpec(
        title=extraction.title,
        base_url=extraction.base_url,
        auth_schemes=auth_schemes,
        endpoints=endpoints,
        raw_spec={"source": "llm_extraction", "endpoints_count": len(endpoints)},
    )


@router.post("/upload")
async def upload_spec(file: UploadFile) -> dict:
    """Upload an API spec file (YAML, JSON, PDF, or Markdown) and parse it."""
    filename = file.filename or "unknown"
    ext = Path(filename).suffix.lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    content = await file.read()

    if ext in (".yaml", ".yml"):
        return await _handle_openapi_file(content, ext)

    if ext == ".json":
        return await _handle_openapi_file(content, ext)

    if ext == ".pdf":
        text = extract_text_from_pdf(content)
        return await _handle_unstructured_text(text, "pdf")

    if ext == ".md":
        text = extract_text_from_markdown(content.decode("utf-8"))
        return await _handle_unstructured_text(text, "markdown")

    raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}")


class UrlInput(BaseModel):
    url: str


@router.post("/from-url")
async def parse_from_url(payload: UrlInput) -> dict:
    """Parse API documentation from a URL."""
    try:
        content, content_type = await fetch_url_content(payload.url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch URL: {e}")

    if content_type in ("openapi_json", "openapi_yaml"):
        parsed_spec = parse_content_to_spec(content, content_type)
        endpoints = extract_endpoints_from_spec(parsed_spec)
        job_id = create_job(parsed_spec, endpoints, content_type)
        return {
            "job_id": job_id,
            "parsed_spec_id": str(uuid.uuid4()),
            "endpoints_count": len(endpoints),
        }

    return await _handle_unstructured_text(content, "url")


@router.get("/{job_id}/endpoints")
async def get_endpoints(job_id: str) -> list[dict]:
    """Get parsed endpoints for a job."""
    job = get_job(job_id)
    endpoints = job.get("endpoints", [])

    return [
        {
            "id": ep.id if isinstance(ep, ParsedEndpoint) else ep.get("id", ""),
            "method": ep.method if isinstance(ep, ParsedEndpoint) else ep.get("method", ""),
            "path": ep.path if isinstance(ep, ParsedEndpoint) else ep.get("path", ""),
            "summary": ep.summary if isinstance(ep, ParsedEndpoint) else ep.get("summary", ""),
            "tag": ep.tag if isinstance(ep, ParsedEndpoint) else ep.get("tag", ""),
            "parameters_count": ep.parameters_count if isinstance(ep, ParsedEndpoint) else ep.get("parameters_count", 0),
        }
        for ep in endpoints
    ]


async def _handle_openapi_file(content: bytes, ext: str) -> dict:
    """Parse OpenAPI YAML/JSON file."""
    with NamedTemporaryFile(suffix=ext, delete=False, mode="wb") as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        parsed_spec = parse_openapi_from_file(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    endpoints = extract_endpoints_from_spec(parsed_spec)
    input_type = "openapi_yaml" if ext in (".yaml", ".yml") else "openapi_json"
    job_id = create_job(parsed_spec, endpoints, input_type)

    return {
        "job_id": job_id,
        "parsed_spec_id": str(uuid.uuid4()),
        "endpoints_count": len(endpoints),
    }


async def _handle_unstructured_text(text: str, source_type: str) -> dict:
    """Use LLM to extract endpoints from unstructured text."""
    settings = Settings()
    agent = create_extractor_agent(
        api_key=settings.openrouter_api_key,
        model_name=settings.openrouter_model,
    )

    prompt = build_extraction_prompt(text, source_type)
    result = await agent.run(prompt)
    extraction: ExtractionResult = result.output

    parsed_spec = _extraction_to_parsed_spec(extraction)
    endpoints = extract_endpoints_from_spec(parsed_spec)
    job_id = create_job(parsed_spec, endpoints, "file_upload")

    return {
        "job_id": job_id,
        "parsed_spec_id": str(uuid.uuid4()),
        "endpoints_count": len(endpoints),
    }
