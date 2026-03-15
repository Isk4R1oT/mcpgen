# API Reference

Base URL: `http://localhost:8000/api`

## Specs

### POST /api/specs/upload
Upload an API specification file.

**Request**: `multipart/form-data`
- `file`: OpenAPI spec (JSON/YAML), PDF, or Markdown file

**Response** `200`:
```json
{
  "job_id": "uuid",
  "parsed_spec_id": "uuid",
  "endpoints_count": 15
}
```

### POST /api/specs/from-url
Parse API documentation from a URL.

**Request**:
```json
{
  "url": "https://petstore.swagger.io/v2/swagger.json"
}
```

**Response** `200`: Same as upload

### GET /api/specs/{job_id}/endpoints
List parsed endpoints for selection.

**Response** `200`:
```json
[
  {
    "id": "get_/pets",
    "method": "GET",
    "path": "/pets",
    "summary": "List all pets",
    "tag": "pets",
    "parameters_count": 2
  }
]
```

## Jobs

### POST /api/jobs/{job_id}/configure
Save user configuration for the generation.

**Request**:
```json
{
  "selected_endpoints": ["get_/pets", "post_/pets", "get_/pets/{petId}"],
  "auth_strategy": {
    "type": "api_key",
    "header_name": "X-API-Key",
    "env_var_name": "API_KEY"
  },
  "server_name": "petstore-mcp"
}
```

**Response** `200`:
```json
{
  "job_id": "uuid",
  "status": "pending"
}
```

### POST /api/jobs/{job_id}/generate
Trigger the async generation pipeline.

**Response** `202`:
```json
{
  "job_id": "uuid",
  "status": "parsing"
}
```

### GET /api/jobs/{job_id}
Get full job details.

**Response** `200`:
```json
{
  "id": "uuid",
  "status": "completed",
  "error_message": null,
  "input_type": "openapi_yaml",
  "config": { ... },
  "docker_image_tag": "ghcr.io/user/mcpgen/job-uuid:latest",
  "source_archive_path": "artifacts/job-uuid/source.tar.gz",
  "created_at": "2026-03-15T10:00:00Z",
  "updated_at": "2026-03-15T10:05:00Z"
}
```

### GET /api/jobs/{job_id}/status
Lightweight status polling.

**Response** `200`:
```json
{
  "status": "generating",
  "progress_stage": 3,
  "total_stages": 5
}
```

## Artifacts

### GET /api/jobs/{job_id}/artifacts/source
Download generated source as .tar.gz.

**Response** `200`: `application/gzip` stream

### GET /api/jobs/{job_id}/artifacts/code
Preview generated server code.

**Response** `200`:
```json
{
  "files": [
    {"filename": "server.py", "content": "..."},
    {"filename": "requirements.txt", "content": "..."}
  ]
}
```

### GET /api/jobs/{job_id}/artifacts/docker-info
Get Docker pull information.

**Response** `200`:
```json
{
  "image_tag": "ghcr.io/user/mcpgen/job-uuid:latest",
  "pull_command": "docker pull ghcr.io/user/mcpgen/job-uuid:latest",
  "run_command": "docker run -p 8000:8000 --env-file .env ghcr.io/user/mcpgen/job-uuid:latest"
}
```

## Chat

### POST /api/jobs/{job_id}/chat
Send a message to the AI assistant.

**Request**:
```json
{
  "message": "Should I include the admin endpoints?"
}
```

**Response** `200`:
```json
{
  "message": "I'd recommend excluding admin endpoints from the MCP server...",
  "config_updates": null,
  "endpoint_suggestions": ["delete_/admin/users"]
}
```

### GET /api/jobs/{job_id}/chat/history
Get chat history.

**Response** `200`:
```json
[
  {"role": "user", "content": "...", "created_at": "..."},
  {"role": "assistant", "content": "...", "created_at": "..."}
]
```
