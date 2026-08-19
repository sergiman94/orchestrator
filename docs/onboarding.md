# Orchestrator — Engineering Onboarding Guide

Welcome to Orchestrator, an AI-native data pipeline platform where AI agents share persistent memory across workplaces. This guide covers everything you need to understand the system, contribute code, and debug issues.

---

## What Is Orchestrator?

Orchestrator lets developers build data pipelines where each pipeline has its own AI agent that monitors executions, diagnoses failures, retries with modified parameters, and accumulates operational knowledge over time. The core differentiator is **shared memory** — a vector database that stores semantic embeddings of every execution result, failure pattern, and agent decision, queryable by natural language.

**Key mental model:** Think of it as "Airflow meets an AI that remembers everything."

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend framework | FastAPI | REST API, async-capable but used synchronously |
| ORM | SQLAlchemy 2.0 | Database models, session management |
| Database | PostgreSQL 16 | Primary data store (port 5434 via Docker) |
| Vector store | ChromaDB (embedded) | Semantic memory, one collection per workplace |
| AI | Groq API (LLaMA 3.3 70B) | Agent tool-use loop, snippet generation |
| Auth | JWT (PyJWT) + bcrypt | Token-based authentication |
| Task scheduling | APScheduler | Cron triggers, health check intervals |
| Frontend | React 18 + Vite + Tailwind CSS | SPA with dark theme |
| Code editor | CodeMirror 6 | Python script editing in browser |
| Encryption | Fernet (cryptography lib) | Credential encryption at rest |

**Not used (intentionally):** LangChain, Celery, Redis (reserved for future event pub/sub), async/await in core execution.

---

## Project Structure

```
orchestrator/
  run.py                    # Entry point — starts uvicorn on port 8005
  docker-compose.yml        # PostgreSQL + Redis

  backend/
    main.py                 # FastAPI app, lifespan, middleware, router registration
    database.py             # ALL SQLAlchemy models (13 tables)
    config.py               # Environment variables from .env
    auth.py                 # JWT creation/verification, bcrypt password hashing
    executor.py             # Sandboxed subprocess runner with resource limits
    env_vars.py             # Legacy Fernet encryption (from cron-job-manager)

    units/
      router.py             # Unit + Step CRUD, execution endpoints, background execution
      step_runner.py         # Step type dispatcher (script, connector, future types)

    agent/
      service.py            # Agent invocation loop (context → LLM → tools → response)
      tools.py              # 6 tool definitions + implementations
      prompts.py            # System prompts, context assembly

    memory/
      service.py            # ChromaDB store/query operations
      ingestion.py          # Auto-ingest executions, agent decisions, connector interactions

    connectors/
      router.py             # Connector CRUD API
      service.py            # Business logic, credential encryption, health checks, step execution
      registry.py           # BaseConnector protocol, type→class mapping
      providers/
        s3.py               # AWS S3 connector (boto3)
        postgresql.py       # PostgreSQL connector (psycopg2)
        http_rest.py        # HTTP/REST API connector (httpx)

    events/
      emit.py               # Centralized event emission (never raises)

    utils/
      crypto.py             # Fernet encrypt/decrypt (derives key from JWT_SECRET)

    workplaces/
      router.py             # Workplace CRUD

    executions/
      router.py             # Execution history API

  frontend/src/
    App.jsx                 # React Router routes
    api/
      client.js             # apiFetch wrapper (auto-auth, 401 redirect)
      workplaces.js          # Workplace API methods
      units.js              # Unit/Step API methods
      agent.js              # Agent chat/invoke API
      connectors.js          # Connector CRUD API
      executions.js          # Execution history API
    components/
      Layout.jsx            # Top-level layout (no sidebar)
      WorkspaceLayout.jsx   # Workspace layout (with sidebar)
      Sidebar.jsx           # Navigation items per workspace
      Modal.jsx             # Reusable modal
      CodeEditor.jsx        # CodeMirror 6 wrapper
      StatusBadge.jsx        # Status indicator component
      InlineAgentChat.jsx   # Chat with agent on failed executions
    pages/
      Workplaces.jsx        # Workplace list
      WorkplaceDashboard.jsx # Workplace overview with stats
      Units.jsx             # Unit list
      UnitDetail.jsx        # Unit detail with steps + execution
      UnitEditor.jsx        # Create/edit unit
      AgentPanel.jsx        # Agent config + chat
      MemoryBrowser.jsx     # Memory search + list
      ExecutionHistory.jsx  # Execution list
      ExecutionDetail.jsx   # Execution detail with step results
      ConnectorList.jsx     # Connector management
    hooks/
      useAuth.jsx           # Auth context (token, user, login/logout)
      useToast.jsx          # Toast notification context
      usePolling.jsx        # setInterval-based polling hook
```

---

## Core Concepts

### Workplace
The top-level container. Everything belongs to a Workplace — units, agent, connectors, memory, executions, events. One user can have many workplaces. Deleting a workplace cascades to everything inside it.

### Unit of Work
A task definition containing ordered Steps. Each Unit has a type (script, http_request, llm_call, transform, condition), retry policy, timeout, and enabled flag.

### Step
A single executable action within a Unit. Currently supports two types:
- **script** — Python code executed in a sandboxed subprocess
- **connector** — Configured integration (S3, PostgreSQL, HTTP) executed via the connector service

Steps can be **independent** (no input from previous step) or **chained** (receives previous step's `return_value` as `INPUT_DATA` environment variable).

### Execution
A single run of a Unit. Created when you click "Run" or "Test", or when the agent triggers a retry. Tracks status (pending → running → completed/failed), timing, and per-step results.

### Agent
An AI supervisor per Workplace. Not a chatbot — it's an operational tool-use loop. Triggered on failures, events, or manual chat. Uses Groq API with 6 tools to act on the system.

### Connector
A configured integration with an external system. Three built-in providers: S3, PostgreSQL, HTTP/REST. Connectors have encrypted credentials, health monitoring, and automatic memory ingestion of interactions.

### Shared Memory
ChromaDB vector store. One collection per Workplace. Stores semantic embeddings of execution summaries, failure patterns, agent decisions, and connector observations. The agent queries memory before every decision via RAG (top 5 results).

### Event
Everything emits structured events — execution completion, agent decisions, connector health changes. Events use dot notation (`unit.completed`, `connector.failed`) and have a constrained `source_type` enum.

---

## How the Execution Flow Works

This is the most important flow in the system. Here's what happens when a user clicks "Run" on a Unit:

```
User clicks "Run"
    │
    ▼
POST /api/workplaces/{wp}/units/{unit}/run
    │
    ▼
Create Execution record (status: pending)
    │
    ▼
Spawn background daemon thread
    │
    ▼
┌─────────────────────────────────────┐
│  _execute_unit_steps() (bg thread)  │
│                                     │
│  1. Set Execution status → running  │
│  2. Load ordered Steps              │
│  3. For each Step:                  │
│     a. Create StepResult (running)  │
│     b. Check: script step w/o code? │
│        → skip                       │
│     c. Call step_runner.run_step()   │
│        ┌─ type=script → executor    │
│        └─ type=connector → service  │
│     d. Update StepResult with       │
│        stdout, stderr, return_value,│
│        metrics, status              │
│     e. If chained: pass return_value│
│        as input_data to next step   │
│     f. If failed: stop execution    │
│  4. Set Execution status →          │
│     completed or failed             │
└─────────────────────────────────────┘
    │
    ▼
Post-execution (still in bg thread):
    │
    ├── Ingest execution into memory
    │   (fire-and-forget, never blocks)
    │
    └── If FAILED and agent enabled:
        invoke_agent() with failure context
```

### The Subprocess Sandbox (executor.py)

When a script step runs, the code executes in a **sandboxed subprocess**, not in the main process:

- The script is written to a temp file and executed via `subprocess.Popen`
- Resource limits: `RLIMIT_AS` restricts memory (default 512MB)
- Timeout: sends `SIGTERM`, waits 5 seconds, then `SIGKILL`
- In sandbox mode: dangerous env vars stripped (AWS keys, DB passwords, etc.)
- `return_value` is extracted as the **last non-empty line of stdout**
- Metrics (wall time, CPU time, peak memory) are injected into stderr as a `__METRICS__:{json}` line and extracted after execution

### Step Chaining

When `step.mode == "chained"`, the previous step's `return_value` is passed as the `INPUT_DATA` environment variable to the next step. Inside a Python script step, access it via:

```python
import os, json
data = json.loads(os.environ.get("INPUT_DATA", "{}"))
```

For connector steps, `return_value` is always a JSON string of the connector's output data.

---

## How the Agent Works

The agent is NOT a chatbot. It's an operational supervisor that uses a **tool-use loop** pattern:

```
Trigger event (unit.failed, manual chat, etc.)
    │
    ▼
Build context (~50K tokens):
  ├── System prompt (behavior rules)
  ├── Workplace config
  ├── Trigger event details
  ├── Memory RAG (top 5 semantic matches)
  └── Recent execution history (last 5)
    │
    ▼
Call Groq API with tool definitions
    │
    ▼
┌────────────────────────────┐
│  Tool-use loop (max 5 iter)│
│                            │
│  LLM returns tool_calls?   │
│  ├── Yes: execute tools,   │
│  │   append results to     │
│  │   messages, loop        │
│  └── No: return response   │
└────────────────────────────┘
    │
    ▼
Two-phase trick:
  1st call: WITH tools → gets tool_calls
  2nd call: WITHOUT tools → forces text response
  (Groq returns empty content if tools are
   included on follow-up calls)
    │
    ▼
Ingest agent decision into memory
Return response + actions_taken to caller
```

### Agent Tools

| Tool | What it does |
|------|-------------|
| `execute_unit` | Spawn a new execution of a unit |
| `retry_unit` | Re-run a failed execution |
| `query_memory` | Semantic search over workplace memory |
| `store_observation` | Persist an insight to memory |
| `get_execution_history` | Query recent execution records |
| `alert_user` | Create an alert event |

Tools are defined in OpenAI function-calling format and dispatched by name in `tools.py`.

---

## How the Connector System Works

```
Step config: { connector_id: "abc", params: { query: "SELECT * FROM users" } }
    │
    ▼
step_runner.run_step(step, db=db)
    │  type == "connector"
    ▼
connectors/service.py.execute_step(db, connector_id, params)
    │
    ├── Load Connector from DB
    ├── Decrypt credentials (Fernet)
    ├── Merge creds into config as config["_credentials"]
    ├── Look up provider: registry.get_connector(type)
    ├── Call provider.execute(config, params)
    ├── Convert ConnectorResult → ExecutionResult
    ├── Ingest interaction into memory (fire-and-forget)
    └── On failure: emit connector.failed event + ingest error
```

### Security Rules (AD-8)

- Credentials are **Fernet-encrypted** in the database
- Decrypted **only at point of use** (inside `execute_step`)
- **Never** appear in API responses — `serialize_connector()` returns `has_credentials: bool`
- **Never** ingested into memory — the ingestion function filters out `_credentials`
- **Never** logged — providers receive creds in `config["_credentials"]` and use them internally

---

## How the Memory System Works

ChromaDB runs in **embedded mode** (no separate server). Data persists to `./data/chromadb/`.

```
Store: content string → ChromaDB embeds → stored with metadata
Query: natural language → ChromaDB semantic search → top_k results by cosine similarity
```

### What Gets Auto-Ingested

| Trigger | Source Type | What's Stored |
|---------|-----------|---------------|
| Unit execution completes | `execution` or `error_pattern` | Step summaries, status, timing, errors |
| Agent makes a decision | `agent_decision` | What the agent decided and why |
| Connector step runs | `observation` or `error_pattern` | Record counts, response times, schemas, errors |
| User adds manually | `user_input` | Whatever the user writes |

### Memory Query in Agent Context

Before every agent invocation, `agent/prompts.py` queries memory with the trigger event's description and retrieves the top 5 most semantically relevant entries. This gives the agent historical context — "this error happened before, here's what we did last time."

---

## How the Event System Works

Every significant system action emits a structured event:

```python
emit_event(db, workplace_id, type="unit.completed", source_type="unit", source_id=unit_id, payload={...})
```

**Key properties:**
- `type` uses dot notation: `unit.completed`, `connector.failed`, `agent.invoked`
- `source_type` is a constrained enum: `unit`, `pipeline`, `agent`, `asset`, `connector`, `channel`, `memory`, `system`, `user`
- `emit_event()` **never raises** — wraps in try/except, rolls back on failure, logs warning
- Events are persisted to the Event table (the audit log)

Events currently serve as an audit trail. Future phases will add Redis pub/sub for real-time SSE streaming and event-triggered pipelines.

---

## Frontend Architecture

### Routing

```
/login                              → Login page
/workplaces                         → Workplace list (Layout — no sidebar)
/workplaces/:id                     → Dashboard (WorkspaceLayout — with sidebar)
/workplaces/:id/units               → Unit list
/workplaces/:id/units/:unitId       → Unit detail (steps, run, inline chat)
/workplaces/:id/connectors          → Connector management
/workplaces/:id/agent               → Agent config + chat
/workplaces/:id/memory              → Memory browser + search
/workplaces/:id/history             → Execution history
/workplaces/:id/executions/:execId  → Execution detail (step results)
```

### Data Fetching Pattern

Every page follows the same pattern:

```jsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

const fetchData = useCallback(async () => {
  try {
    const result = await someApi.list(workplaceId);
    setData(result);
  } catch (err) {
    addToast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}, [workplaceId]);

useEffect(() => { fetchData(); }, [fetchData]);

// For live updates during execution:
usePolling(fetchData, 5000, isRunning);
```

### API Client (`api/client.js`)

All API calls go through `apiFetch(path, options)`:
- Auto-adds `Authorization: Bearer <token>` from localStorage
- Auto-redirects to `/login` on 401
- Base URL is `/api` (proxied to port 8005 via Vite config)

### State Management

- **Global state:** React Context only (`AuthContext`, `ToastContext`). No Redux.
- **Page state:** Local `useState` + `useEffect`. No global store for domain data.
- **Polling:** `usePolling(callback, intervalMs, enabled)` for live-updating data during execution.

---

## Authentication Flow

```
Register/Login → POST /api/auth/register or /api/auth/login
    │
    ▼
Backend: bcrypt verify → create JWT (sub=user_id, exp=24h)
    │
    ▼
Frontend: store token in localStorage
    │
    ▼
Every API call: apiFetch adds Authorization: Bearer <token>
    │
    ▼
Backend: get_current_user() dependency → decode JWT → fetch User from DB
    │
    ▼
Route handler receives User object → verifies ownership of resources
```

**Ownership check:** Every route that accesses a Workplace filters by `owner_id == user.id`. This prevents users from accessing each other's data. There's no RBAC or team model — one user = one account.

---

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | `postgresql://orchestrator:orchestrator@localhost:5434/orchestrator` | PostgreSQL connection |
| `JWT_SECRET` | Yes | `change-me-to-a-random-string` | JWT signing + Fernet key derivation |
| `GROQ_API_KEY` | Yes | — | Groq API for AI agent |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | LLM model identifier |
| `CHROMADB_PATH` | No | `./data/chromadb` | Vector store location |
| `SANDBOX_MODE` | No | `false` | Restrict script execution environment |
| `MAX_MEMORY_MB` | No | `512` | Script memory limit |
| `REDIS_URL` | No | `redis://localhost:6380/0` | Reserved for future event pub/sub |

---

## Database

13 tables, auto-created on startup via `Base.metadata.create_all()`. **No migration framework** — schema changes require a DB reset:

```bash
docker-compose down -v && docker-compose up -d
# Restart backend — tables recreated automatically
```

All primary keys are UUID v4 stored as `VARCHAR(36)` strings. JSON columns use PostgreSQL's native JSON type.

---

## Common Development Tasks

### Add a New API Router

1. Create `backend/{domain}/router.py` with `APIRouter`
2. Create `backend/{domain}/service.py` for business logic
3. Import and register in `backend/main.py`: `app.include_router(router)`
4. Static paths before parameterized paths

### Add a New Step Type

1. Add dispatch case to `backend/units/step_runner.py:run_step()`
2. Return `ExecutionResult` with uniform shape
3. Update frontend step editor to show appropriate form

### Add a New Agent Tool

1. Define tool schema in `backend/agent/tools.py` (OpenAI function format)
2. Add implementation as `_tool_name()` function
3. Add to `TOOL_DEFINITIONS` list and `execute_tool()` dispatcher

### Add a New React Page

1. Create `frontend/src/pages/MyPage.jsx`
2. Add route in `frontend/src/App.jsx`
3. Add nav item in `frontend/src/components/Sidebar.jsx`

### Add a New Connector Provider

1. Create `backend/connectors/providers/{type}.py` implementing `BaseConnector`
2. Import and register in `backend/connectors/providers/__init__.py`
3. Add type to `TYPE_CONFIG_FIELDS` in `frontend/src/pages/ConnectorList.jsx`

---

## Key Patterns and Gotchas

1. **Router registration order matters.** FastAPI matches routes top-down. Always register static paths (`/search`, `/stats`) before parameterized paths (`/{id}`).

2. **Background execution uses daemon threads.** Unit execution spawns `threading.Thread(daemon=True)`. This means if the main process dies, running executions are killed. No external job queue.

3. **Memory ingestion is fire-and-forget.** All `ingest_*()` calls wrap in try/except. A ChromaDB failure never blocks execution completion or API responses.

4. **The agent two-phase trick.** Groq returns empty content when tools are included in follow-up calls after tool execution. Solution: first call WITH tools, subsequent calls WITHOUT tools. See `agent/service.py`.

5. **Credentials never leak.** Encrypted at rest (Fernet), decrypted only at point of use, never in API responses, never in memory, never in logs. The key is derived from `JWT_SECRET` via SHA-256.

6. **Cascade deletes are aggressive.** Deleting a Workplace removes ALL child entities (units, executions, memory, connectors, events). Be careful in production.

7. **No database migrations.** Schema changes require `docker-compose down -v`. This means all data is lost. Introduce Alembic before production deployment.

8. **ChromaDB metadata constraint.** Values must be `str`, `int`, `float`, or `bool` only. Complex metadata must be JSON-serialized to strings.

9. **The `__METRICS__` stderr trick.** The executor injects a JSON metrics line into subprocess stderr. After execution, it parses this line out and extracts wall_time, cpu_time, peak_memory. Don't accidentally filter it in error handling.

10. **Frontend has no error boundaries.** API errors are caught in try/catch and shown as toast notifications. A component crash will white-screen the page.

---

## Local Development Setup

```bash
# 1. Infrastructure
cd orchestrator
docker-compose up -d    # PostgreSQL (5434) + Redis (6380)

# 2. Backend
conda create -n orchestrator python=3.11 -y
conda activate orchestrator
pip install -r requirements.txt
cp .env.example .env    # Edit: set GROQ_API_KEY at minimum
python run.py           # Starts on port 8005

# 3. Frontend
cd frontend
npm install
npm run dev             # Starts on port 3002, proxies /api to 8005

# 4. Open http://localhost:3002, register, create a workplace
```

### Resetting Everything

```bash
docker-compose down -v && docker-compose up -d  # Reset DB
rm -rf data/chromadb                             # Reset memory
# Restart backend — tables + ChromaDB recreated on startup
```

---

## What's Built vs. What's Planned

### Built (Phases 1-3 + Epic 1)
- Workplace management with full CRUD
- Unit of Work execution with step chaining
- Sandboxed Python script execution with resource limits
- AI agent with tool-use loop (6 tools)
- Shared memory (ChromaDB) with auto-ingestion
- Inline agent chat on failed executions
- Connector system (S3, PostgreSQL, HTTP/REST) with encrypted credentials
- Step type dispatcher (script + connector)
- Event emission utility
- Fernet encryption utility

### Planned (Epics 2-7)
- **Epic 2:** Asset monitoring with health checks (APScheduler)
- **Epic 3:** Agent safety guardrails, LLM call steps, LLM provider abstraction
- **Epic 4:** Memory TTL/expiration and compaction
- **Epic 5:** Cross-workplace shared memory, vector logging
- **Epic 6:** Pipeline orchestration (DAG execution, cron/webhook triggers)
- **Epic 7:** Channels (Slack/webhook notifications), full event system with SSE
