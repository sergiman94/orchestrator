# Orchestrator

AI-native orchestration platform with shared context memory.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + APScheduler + Redis
- **Frontend**: React 18 + Vite + Tailwind CSS + CodeMirror 6
- **AI**: Anthropic Claude API (direct tool_use, no LangChain)
- **Memory**: ChromaDB (embedded, vector store for shared operational context)
- **Auth**: JWT (PyJWT + bcrypt)
- **Conda env**: `orchestrator` (Python 3.11)

## Running

```bash
# Infrastructure
docker-compose up -d  # PostgreSQL + Redis

# Backend (port 8005)
conda activate orchestrator
python run.py

# Frontend dev (port 3000, proxies to 8005)
cd frontend
npm run dev
```

## Project Structure

```
backend/
  main.py              — FastAPI app, router registration
  database.py          — SQLAlchemy models (Workplace, UnitOfWork, Pipeline, Agent, Asset, Channel, MemoryEntry, Event, Execution, StepResult, User)
  config.py            — Settings from .env
  executor.py          — Sandboxed subprocess runner (from cron-job-manager)
  auth.py              — JWT auth (from cron-job-manager)
  env_vars.py          — Fernet encryption (from cron-job-manager)
  agent/
    service.py         — Agent invocation loop (context assembly → Claude API → tool dispatch)
    tools.py           — Tool definitions + implementations
    prompts.py         — System prompts and templates
    sessions.py        — Redis-based agent session management
  memory/
    service.py         — ChromaDB store/query
    embeddings.py      — Embedding generation
    ingestion.py       — Auto-ingest execution results
  events/
    bus.py             — Redis pub/sub event bus
    handlers.py        — Event handlers
  workplaces/
    router.py          — Workplace CRUD routes
  units/
    router.py          — Unit CRUD + execution routes

frontend/              — React SPA (Vite + Tailwind)
  src/
    api/               — API client modules
    components/        — Layout, Sidebar, Modal, CodeEditor, Toast, etc.
    pages/             — Login, Workplaces, WorkplaceDashboard, UnitEditor, AgentPanel, MemoryBrowser, etc.
    hooks/             — useAuth, useToast, usePolling
    utils/             — formatters, cron parser

data/                  — ChromaDB + outputs (gitignored)
```

## Core Concepts

- **Workplace**: Container for units, pipelines, agent, assets, channels, memory
- **Unit of Work**: A task (Python script, HTTP call, transform). Has type, config, timeout, retry policy
- **Pipeline**: Ordered sequence of units with trigger (cron/webhook/event) and failure policies
- **Agent**: Claude-powered supervisor. Invoked on failures/events. Uses tool_use to act.
- **Asset**: External service (DB, API, AWS). Agent monitors health.
- **Channel**: Communication pathway (Slack, webhook, email).
- **Shared Memory**: ChromaDB vector store. One collection per workplace. Auto-ingests execution results. Agent queries before every decision.
- **Event**: Everything emits events → Redis pub/sub → triggers agent/channels/UI

## Agent Architecture

Tool-use loop pattern (not chatbot). Triggered by events (unit.failed, anomaly, user request).

Context per invocation (~50K tokens): system prompt + workplace config + current event + RAG memory (top 5) + recent history + tool definitions.

10 tools: execute_unit, retry_unit, skip_step, send_to_channel, query_memory, store_observation, check_asset, modify_unit_config, get_execution_history, alert_user.

## Route Ordering

FastAPI matches top-down. Register static paths (`/stats`, `/active`, `/search`) BEFORE parameterized paths (`/{id}`).

## Reused from cron-job-manager

- executor.py (sandboxed subprocess with resource limits)
- auth.py (JWT + bcrypt)
- env_vars.py (Fernet encryption)
- React components (Toast, Modal, CodeEditor, StatusBadge, FilterBar, StatsBar, EmptyState)
- Hooks (useAuth, useToast, usePolling)
- API client pattern (apiFetch with JWT)

## Build Phases

1. Workplace shell (models, CRUD, basic UI)
2. Agent core (Claude tool_use, agent panel)
3. Shared memory (ChromaDB, auto-ingest, memory browser)
4. Assets + channels
5. Event system (Redis pub/sub)
6. Pipeline builder (visual)
