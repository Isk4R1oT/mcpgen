"""Service for fetching and parsing API docs from URLs, PDFs, and Markdown files."""

import json

import httpx
import trafilatura
import yaml

from backend.pipeline.parser import ParsedSpec, parse_openapi_from_dict


async def fetch_url_content(url: str) -> tuple[str, str]:
    """Fetch content from URL and detect its type.

    Returns (content_text, content_type) where content_type is one of:
    openapi_json, openapi_yaml, html, text
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()

    content = response.text
    content_type_header = response.headers.get("content-type", "")

    # Try to detect if it's an OpenAPI spec
    detected = detect_content_type(content)

    # If HTML content-type header but content looks like JSON/YAML spec, trust the content
    if detected in ("openapi_json", "openapi_yaml"):
        return content, detected

    # If HTML, extract main text with trafilatura
    if "html" in content_type_header or detected == "html":
        extracted = trafilatura.extract(content)
        if extracted:
            return extracted, "text"
        return content, "html"

    return content, detected


def detect_content_type(content: str) -> str:
    """Detect whether content is OpenAPI JSON, YAML, HTML, or plain text."""
    stripped = content.strip()

    # Try JSON
    if stripped.startswith("{"):
        try:
            data = json.loads(stripped)
            if "openapi" in data or "swagger" in data:
                return "openapi_json"
            return "json"
        except json.JSONDecodeError:
            pass

    # Try YAML with OpenAPI markers
    if any(marker in stripped[:500] for marker in ("openapi:", "swagger:", "openapi :")):
        try:
            data = yaml.safe_load(stripped)
            if isinstance(data, dict) and ("openapi" in data or "swagger" in data):
                return "openapi_yaml"
        except yaml.YAMLError:
            pass

    # HTML
    if stripped.startswith("<!") or stripped.startswith("<html") or "<body" in stripped[:500]:
        return "html"

    return "text"


def parse_content_to_spec(content: str, content_type: str) -> ParsedSpec:
    """Parse content into a ParsedSpec based on detected type."""
    if content_type == "openapi_json":
        raw = json.loads(content)
        return parse_openapi_from_dict(raw)

    if content_type == "openapi_yaml":
        raw = yaml.safe_load(content)
        return parse_openapi_from_dict(raw)

    raise ValueError(
        f"Cannot directly parse content_type '{content_type}' into OpenAPI spec. "
        "Use LLM-assisted extraction for HTML/text content."
    )


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from PDF bytes using pdfplumber."""
    import io
    import pdfplumber

    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

    if not text_parts:
        raise ValueError("Could not extract any text from PDF")

    return "\n\n".join(text_parts)


def extract_text_from_markdown(md_content: str) -> str:
    """Extract text from markdown — essentially returns as-is since markdown is readable."""
    return md_content
