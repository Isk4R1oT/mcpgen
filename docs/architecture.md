# Architecture

## System Overview

mcpgen is a web application that generates MCP (Model Context Protocol) servers from API documentation. It combines AI-powered analysis with code generation to produce production-ready Docker containers.

## High-Level Flow

```mermaid
graph LR
    U[User] -->|Upload spec / URL / file| FE[React Frontend]
    FE -->|API calls| BE[FastAPI Backend]
    BE -->|Store jobs, specs, artifacts| SB[Supabase]
    BE -->|LLM calls| OR[OpenRouter]
    BE -->|Build images| DK[Docker]
    DK -->|Push| DR[Docker Registry]
    U -->|docker pull| DR
    U -->|Download .tar.gz| SB
```

## Components

### Frontend (React + Vite)
- **WizardPage**: 5-step flow (Upload → Select Endpoints → Auth → Review → Progress)
- **ChatPanel**: Floating AI assistant for clarifications during wizard steps 2-4
- **ResultPage**: Docker pull command + source download

### Backend (FastAPI)
- **API layer** (`backend/api/`): REST endpoints for jobs, specs, generation, artifacts, chat
- **Pipeline** (`backend/pipeline/`): Orchestrated 5-stage generation pipeline
- **Agents** (`backend/agents/`): PydanticAI agents (analyzer, generator, chat)
- **Codegen** (`backend/codegen/`): Jinja2 templates for MCP server scaffolding
- **Services** (`backend/services/`): Docker, Supabase Storage, URL fetching

### External Services
- **Supabase**: PostgreSQL (jobs, specs, generated servers, chat) + Storage (file uploads, artifacts)
- **OpenRouter**: LLM provider (dev: DeepSeek V3.2, prod: Claude Sonnet 4.6)
- **Docker**: Programmatic image builds via docker-py

## Data Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as FastAPI
    participant DB as Supabase
    participant LLM as OpenRouter
    participant DK as Docker

    U->>FE: Upload OpenAPI spec
    FE->>API: POST /api/specs/upload
    API->>DB: Store file, create job (status: pending)
    API-->>FE: {job_id, endpoints_count}

    U->>FE: Select endpoints, configure auth
    FE->>API: POST /api/jobs/{id}/configure
    API->>DB: Save config

    U->>FE: Click "Generate"
    FE->>API: POST /api/jobs/{id}/generate

    API->>DB: Update status: parsing
    API->>API: Parse OpenAPI spec (prance)
    API->>DB: Save parsed_spec

    API->>DB: Update status: analyzing
    API->>LLM: Analyze endpoints (PydanticAI)
    LLM-->>API: AnalysisResult

    API->>DB: Update status: generating
    API->>LLM: Generate MCP code (PydanticAI)
    LLM-->>API: GeneratedServer

    API->>DB: Update status: validating
    API->>API: Syntax + import + mock test

    API->>DB: Update status: packaging
    API->>DB: Upload source archive
    API->>DK: Build Docker image
    API->>DK: Push to registry

    API->>DB: Update status: completed
    FE->>API: Poll GET /api/jobs/{id}/status
    API-->>FE: {status: completed, docker_tag, download_url}
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| AI Framework | PydanticAI | Best structured outputs, native OpenRouter, type-safe |
| MCP Framework | FastMCP v3.1 | Python-native, Streamable HTTP transport |
| LLM Provider | OpenRouter | Multi-model, cost-effective (free dev models) |
| Transport | Streamable HTTP | SSE deprecated in MCP spec 2025-03-26 |
| Backend | FastAPI | Async, Pydantic-native, matches PydanticAI ecosystem |
| Database | Supabase | PostgreSQL + Storage + Auth (future) in one |
| Frontend | React + Vite | Minimal, fast, TypeScript |
