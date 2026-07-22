# Project Overview — Orchestrator

## Purpose

Orchestrator is an AI-native orchestration platform where AI agents supervise workplaces — containers that house units of work, shared memory, and communication channels. The platform's differentiator is **shared context memory**: a vector store (ChromaDB) that accumulates operational knowledge from every execution, failure, and agent decision, making the AI smarter over time.

## Executive Summary

| Attribute | Value |
|-----------|-------|
| **Project Name** | Orchestrator |
| **Repository Type** | Monolith (backend + frontend) |
| **Primary Language** | Python (backend), JavaScript/JSX (frontend) |
| **Backend Framework** | FastAPI |
| **Frontend Framework** | React 18 (Vite + Tailwind CSS) |
| **Database** | PostgreSQL 16 |
| **Vector Store** | ChromaDB (embedded) |
| **AI Provider** | Groq API (LLaMA 3.3 70B) |
| **Auth** | JWT (PyJWT + bcrypt) |
| **Infrastructure** | Docker Compose (PostgreSQL + Redis) |
| **Conda Env** | `orchestrator` (Python 3.11) |
| **Backend Port** | 8005 |
| **Frontend Port** | 3002 (dev) |

## Tech Stack

| Category | Technology | Version | Purpose |
|----------|-----------|---------|---------|
| **Backend** | FastAPI | >=0.100 | REST API framework |
| | SQLAlchemy | >=2.0 | ORM (13 models) |
| | PostgreSQL | 16 | Relational data store |
| | ChromaDB | >=0.4 | Vector memory (embeddings) |
| | APScheduler | >=3.10 | Cron-based job scheduling |
| | Redis | >=5.0 | Future: event bus, caching |
| | Groq API (httpx) | - | AI agent (LLM + tool_use) |
| | PyJWT + bcrypt | - | Authentication |
| | cryptography (Fernet) | - | Secret encryption |
| | slowapi | - | Rate limiting |
| **Frontend** | React | 18.2 | UI framework |
| | Vite | 5.0 | Build tool + dev server |
| | Tailwind CSS | 3.3 | Styling (dark theme) |
| | React Router | 6.20 | Client-side routing |
| | CodeMirror | 6.x | Python code editor |

## Architecture Pattern

**Service-oriented monolith** with modular backend routers:
- Each domain (workplaces, units, agent, memory, executions) has its own router module
- Shared database and memory services
- AI agent as an internal service with tool_use loop
- React SPA communicates via REST API

## Repository Structure

- `backend/` — FastAPI application (8 modules, 13 DB models, 39 API endpoints)
- `frontend/` — React SPA (11 pages, 11 components, 6 API client modules)
- `docker-compose.yml` — PostgreSQL + Redis
- `docs/` — Generated documentation

## Key Features (Current)

1. **Workplaces** — Create isolated containers for different projects/pipelines
2. **Units of Work** — Python scripts organized as steps within units
3. **AI Agent** — Groq-powered supervisor with 6 tools, auto-invoked on failures
4. **Shared Memory** — ChromaDB vector store, auto-ingests executions, semantic search
5. **Code Editor** — CodeMirror 6 with Python syntax highlighting
6. **AI Snippet Suggestions** — Contextual code suggestions from Groq
7. **Inline Error Chat** — Ask the agent about failures directly from execution detail
8. **Execution History** — Full history with step results, status, metrics
9. **JWT Authentication** — Register/login, token-based API access

## Planned Features

- Pipelines (multi-unit with visual builder)
- Assets (external service registry)
- Channels (Slack, webhook, email)
- Event system (Redis pub/sub)

## Links

- [Architecture Document](../ARCHITECTURE.md)
- [Technical Specifications](../SPECS.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Development Guide](./development-guide.md)
