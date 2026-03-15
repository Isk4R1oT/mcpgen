"""Service for fetching and parsing API docs from URLs, PDFs, and Markdown files."""

import json
import re
from urllib.parse import urljoin, urlparse

import httpx
import trafilatura
import yaml

from backend.pipeline.parser import ParsedSpec, parse_openapi_from_dict


# Common paths where OpenAPI/Swagger specs live
OPENAPI_SPEC_PATHS = [
    "/openapi.json",
    "/swagger.json",
    "/api/openapi.json",
    "/api/swagger.json",
    "/v1/openapi.json",
    "/v2/swagger.json",
    "/api-docs",
    "/api-docs.json",
    "/docs/openapi.json",
]


async def fetch_url_content(url: str) -> tuple[str, str]:
    """Fetch content from URL and detect its type.

    Smart detection:
    - If URL points to Swagger UI (/docs, /swagger-ui) → auto-discover openapi.json
    - If URL returns JSON/YAML OpenAPI spec → return directly
    - If URL returns HTML docs → extract text with trafilatura

    Returns (content_text, content_type) where content_type is one of:
    openapi_json, openapi_yaml, html, text
    """
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        content = response.text
        content_type_header = response.headers.get("content-type", "")

        # Check if the response itself is an OpenAPI spec
        detected = detect_content_type(content)
        if detected in ("openapi_json", "openapi_yaml"):
            return content, detected

        # If HTML — might be Swagger UI, try to discover OpenAPI spec URL
        if "html" in content_type_header or detected == "html":
            spec_url = _extract_openapi_url_from_html(content, url)
            if spec_url:
                spec_content = await _try_fetch_spec(client, spec_url)
                if spec_content:
                    return spec_content, "openapi_json"

            # Try common spec paths relative to the base URL
            base_url = _get_base_url(url)
            spec_content = await _try_common_spec_paths(client, base_url)
            if spec_content:
                return spec_content, "openapi_json"

            # Fallback: extract text with trafilatura
            extracted = trafilatura.extract(content)
            if extracted:
                return extracted, "text"
            return content, "html"

        return content, detected


def _extract_openapi_url_from_html(html: str, page_url: str) -> str | None:
    """Extract OpenAPI spec URL from Swagger UI or Redoc HTML page."""
    # Swagger UI: url: "/openapi.json" or SwaggerUIBundle({url: "..."})
    patterns = [
        r'url\s*:\s*["\']([^"\']+(?:openapi|swagger)[^"\']*\.(?:json|yaml|yml))["\']',
        r'url\s*:\s*["\']([^"\']+/openapi\.json)["\']',
        r'url\s*:\s*["\']([^"\']+/swagger\.json)["\']',
        r'url\s*:\s*["\']([^"\']+/api-docs)["\']',
        r'spec-url\s*=\s*["\']([^"\']+)["\']',  # Redoc
        r'"url"\s*:\s*"([^"]+\.json)"',
    ]

    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            spec_path = match.group(1)
            if spec_path.startswith("http"):
                return spec_path
            return urljoin(page_url, spec_path)

    # Check for common relative paths in script tags or config
    if "swagger" in html.lower() or "openapi" in html.lower():
        # FastAPI default: /openapi.json
        for marker in ["/openapi.json", "/swagger.json"]:
            if marker in html:
                return urljoin(page_url, marker)

    return None


async def _try_fetch_spec(client: httpx.AsyncClient, url: str) -> str | None:
    """Try to fetch an OpenAPI spec from a URL."""
    try:
        response = await client.get(url, timeout=15.0)
        if response.status_code == 200:
            content = response.text
            detected = detect_content_type(content)
            if detected in ("openapi_json", "openapi_yaml"):
                return content
    except Exception:
        pass
    return None


async def _try_common_spec_paths(client: httpx.AsyncClient, base_url: str) -> str | None:
    """Try common OpenAPI spec paths relative to a base URL."""
    for path in OPENAPI_SPEC_PATHS:
        url = base_url.rstrip("/") + path
        result = await _try_fetch_spec(client, url)
        if result:
            return result
    return None


def _get_base_url(url: str) -> str:
    """Extract base URL (scheme + host) from a full URL."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


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
