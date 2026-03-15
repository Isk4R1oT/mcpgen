# Deployment

## Local Development

### Prerequisites
- Python 3.12+
- Node.js 20+
- Docker Desktop
- Supabase account (or local Supabase via CLI)

### Setup

```bash
# Clone
git clone https://github.com/Isk4R1oT/mcpgen.git
cd mcpgen

# Backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Frontend
cd frontend && npm install && cd ..

# Environment
cp .env.example .env
# Edit .env with your keys

# Database
# Apply migrations to your Supabase project (see docs/database.md)

# Run
docker-compose up
```

### Individual Services

```bash
# Backend only
cd backend && uvicorn main:app --reload --port 8000

# Frontend only
cd frontend && npm run dev

# Tests
python -m pytest -v
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon/service key |
| `OPENROUTER_API_KEY` | Yes | OpenRouter API key |
| `OPENROUTER_MODEL` | No | LLM model ID (default: `anthropic/claude-sonnet-4-5`) |
| `DOCKER_REGISTRY` | No | Registry for pushing built images (e.g., `ghcr.io/user`) |
| `DOCKER_REGISTRY_PUSH_ENABLED` | No | Enable registry push (default: `false`) |

## Docker Compose

```yaml
# docker-compose.yml runs:
# - backend (FastAPI on :8000)
# - frontend (Vite dev server on :5173)
```

## Generated MCP Server Deployment

Users receive a Docker image or source archive. To deploy:

```bash
# Option 1: Docker pull
docker pull <image-tag>
docker run -p 8000:8000 --env-file .env <image-tag>

# Option 2: Build from source
tar xzf source.tar.gz
cd mcp-server/
docker build -t my-mcp-server .
docker run -p 8000:8000 --env-file .env my-mcp-server
```

The generated MCP server uses **Streamable HTTP** transport on port 8000.

### Connecting MCP Clients

**Claude Desktop** (remote HTTP):
Settings → Connectors → Add custom connector → `http://localhost:8000/mcp`

**Claude Desktop** (Docker stdio):
```json
{
  "mcpServers": {
    "my-api": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "--env-file", ".env", "<image-tag>"]
    }
  }
}
```
