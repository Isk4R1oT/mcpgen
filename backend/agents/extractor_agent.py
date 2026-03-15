"""LLM-assisted endpoint extractor for unstructured API documentation."""

from pydantic import BaseModel

from pydantic_ai import Agent
from pydantic_ai.models.openrouter import OpenRouterModel
from pydantic_ai.providers.openrouter import OpenRouterProvider


class ExtractedEndpoint(BaseModel):
    method: str
    path: str
    summary: str
    parameters: list[dict]
    request_body: dict | None
    response_description: str
    tag: str


class ExtractionResult(BaseModel):
    title: str
    base_url: str | None
    auth_type: str | None
    endpoints: list[ExtractedEndpoint]


EXTRACTOR_INSTRUCTIONS = """You are an API documentation analyst. Given raw text from API documentation
(HTML page, PDF, markdown), extract all API endpoints with their details.

Rules:
- Extract EVERY endpoint mentioned in the text
- For each endpoint, identify: HTTP method, path, summary, parameters, request body, response
- Determine the base URL if mentioned
- Identify the authentication method if described
- Group endpoints by logical resource/tag
- Use standard HTTP methods (GET, POST, PUT, DELETE, PATCH)
- If a parameter type is unclear, default to "string"
- If information is incomplete, include what you have and note it in the summary"""


def create_extractor_agent(api_key: str, model_name: str) -> Agent:
    """Create a PydanticAI agent for extracting endpoints from unstructured docs."""
    model = OpenRouterModel(
        model_name,
        provider=OpenRouterProvider(api_key=api_key),
    )
    return Agent(
        model,
        output_type=ExtractionResult,
        instructions=EXTRACTOR_INSTRUCTIONS,
    )


def build_extraction_prompt(text: str, source_type: str) -> str:
    """Build prompt for endpoint extraction from unstructured text."""
    # Truncate very long texts
    truncated = text[:10000]
    was_truncated = len(text) > 10000

    return f"""Extract all API endpoints from this {source_type} documentation.

## Documentation Text

{truncated}

{"[... text truncated, extract endpoints from what is shown ...]" if was_truncated else ""}

Extract all endpoints into an ExtractionResult with title, base_url, auth_type, and endpoints list."""
