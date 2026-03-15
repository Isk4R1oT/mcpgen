from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import yaml
from prance import ResolvingParser


HTTP_METHODS = ("get", "post", "put", "delete", "patch", "head", "options")


@dataclass
class ParsedEndpoint:
    id: str
    method: str
    path: str
    summary: str
    tag: str
    parameters_count: int
    parameters: list[dict]
    request_body: dict | None
    response_schema: dict | None


@dataclass
class ParsedSpec:
    title: str
    base_url: str | None
    auth_schemes: list[dict]
    endpoints: list[dict]
    raw_spec: dict


def parse_openapi_from_file(file_path: Path) -> ParsedSpec:
    """Parse an OpenAPI/Swagger spec from a YAML or JSON file."""
    if not file_path.exists():
        raise FileNotFoundError(f"Spec file not found: {file_path}")

    parser = ResolvingParser(str(file_path))
    return _build_parsed_spec(parser.specification)


def parse_openapi_from_dict(raw: dict) -> ParsedSpec:
    """Parse an OpenAPI/Swagger spec from a raw dict."""
    return _build_parsed_spec(raw)


def _build_parsed_spec(spec: dict) -> ParsedSpec:
    """Build ParsedSpec from a resolved OpenAPI/Swagger dict."""
    title = spec.get("info", {}).get("title", "Untitled API")
    base_url = _extract_base_url(spec)
    auth_schemes = _extract_auth_schemes(spec)
    endpoints = _extract_raw_endpoints(spec)

    return ParsedSpec(
        title=title,
        base_url=base_url,
        auth_schemes=auth_schemes,
        endpoints=endpoints,
        raw_spec=spec,
    )


def _extract_base_url(spec: dict) -> str | None:
    """Extract base URL from OpenAPI 3.x servers or Swagger 2.0 host/basePath."""
    # OpenAPI 3.x
    servers = spec.get("servers", [])
    if servers:
        return servers[0].get("url")

    # Swagger 2.0
    host = spec.get("host")
    if host:
        base_path = spec.get("basePath", "")
        schemes = spec.get("schemes", ["https"])
        scheme = schemes[0] if schemes else "https"
        return f"{scheme}://{host}{base_path}"

    return None


def _extract_auth_schemes(spec: dict) -> list[dict]:
    """Extract security scheme definitions."""
    schemes = []

    # OpenAPI 3.x
    components = spec.get("components", {})
    security_schemes = components.get("securitySchemes", {})

    # Swagger 2.0
    if not security_schemes:
        security_schemes = spec.get("securityDefinitions", {})

    for name, scheme_def in security_schemes.items():
        scheme = {"name": name, "type": scheme_def.get("type", "unknown")}
        if "in" in scheme_def:
            scheme["in"] = scheme_def["in"]
        if "flows" in scheme_def:
            scheme["flows"] = scheme_def["flows"]
        if "authorizationUrl" in scheme_def:
            scheme["authorizationUrl"] = scheme_def["authorizationUrl"]
        schemes.append(scheme)

    return schemes


def _extract_raw_endpoints(spec: dict) -> list[dict]:
    """Extract all endpoints as raw dicts with full detail."""
    endpoints = []
    paths = spec.get("paths", {})

    for path, path_item in paths.items():
        for method in HTTP_METHODS:
            operation = path_item.get(method)
            if operation is None:
                continue

            tags = operation.get("tags", ["default"])
            tag = tags[0] if tags else "default"
            summary = operation.get("summary", "")
            parameters = operation.get("parameters", [])
            request_body = operation.get("requestBody")

            # Swagger 2.0: body parameters are in parameters list
            if request_body is None:
                body_params = [p for p in parameters if p.get("in") == "body"]
                if body_params:
                    request_body = body_params[0].get("schema")
                    parameters = [p for p in parameters if p.get("in") != "body"]

            responses = operation.get("responses", {})
            response_200 = responses.get("200", responses.get("201", {}))
            response_schema = None
            if isinstance(response_200, dict):
                content = response_200.get("content", {})
                if content:
                    json_content = content.get("application/json", {})
                    response_schema = json_content.get("schema")
                elif "schema" in response_200:
                    response_schema = response_200.get("schema")

            endpoint_id = f"{method}_{path}"

            endpoints.append({
                "id": endpoint_id,
                "method": method.upper(),
                "path": path,
                "summary": summary,
                "tag": tag,
                "parameters": parameters,
                "parameters_count": len(parameters),
                "request_body": request_body,
                "response_schema": response_schema,
                "operation_id": operation.get("operationId"),
                "security": operation.get("security"),
                "deprecated": operation.get("deprecated", False),
            })

    return endpoints


def extract_endpoints_from_spec(spec: ParsedSpec) -> list[ParsedEndpoint]:
    """Convert raw endpoint dicts from ParsedSpec into ParsedEndpoint objects."""
    result = []
    for ep in spec.endpoints:
        result.append(
            ParsedEndpoint(
                id=ep["id"],
                method=ep["method"],
                path=ep["path"],
                summary=ep.get("summary", ""),
                tag=ep.get("tag", "default"),
                parameters_count=ep.get("parameters_count", 0),
                parameters=ep.get("parameters", []),
                request_body=ep.get("request_body"),
                response_schema=ep.get("response_schema"),
            )
        )
    return result
