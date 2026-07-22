# Orchestrator — Architecture

## Overview

Orchestrator is an AI-native orchestration platform where AI agents supervise workplaces — containers that house units of work, shared memory, and communication channels. The platform learns from every execution, building persistent operational context that makes the AI smarter over time.

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
│              React 18 + Vite + Tailwind CSS                 │
└───────────────────────┬─────────────────────────────────────┘
                        │ HTTP / JSON
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Backend                           │
│                                                             │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐ │
│  │   Auth   │  │ Workplace │  │  Units   │  │ Executions│ │
│  │  (JWT)   │  │   CRUD    │  │ + Steps  │  │  History  │ │
│  └──────────┘  └───────────┘  └────┬─────┘  └───────────┘ │
│                                     │                       │
│  ┌──────────┐  ┌───────────┐  ┌────▼─────┐  ┌───────────┐ │
│  │  Agent   │  │  Memory   │  │ Executor │  │ Snippets  │ │
│  │ Service  │──│  Service  │  │(sandbox) │  │  (Groq)   │ │
│  └────┬─────┘  └─────┬─────┘  └──────────┘  └───────────┘ │
│       │               │                                     │
└───────┼───────────────┼─────────────────────────────────────┘
        │               │
        ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Groq API   │ │   ChromaDB   │ │  PostgreSQL  │
│  (LLM +      │ │  (vectors /  │ │  (relational │
│  tool_use)   │ │   memory)    │ │    data)     │
└──────────────┘ └──────────────┘ └──────────────┘
```

## System Components

### 1. Frontend (React SPA)

```
frontend/src/
├── api/                    # API client modules
│   ├── client.js           # Base fetch wrapper (JWT auto-attach, 401 redirect)
│   ├── workplaces.js       # Workplace CRUD + dashboard
│   ├── units.js            # Units + Steps CRUD, run, test, snippets
│   ├── executions.js       # Execution list, detail, active
│   ├── agent.js            # Agent config, chat, invoke, history
│   ├── memory.js           # Memory list, search, create, delete, stats
│   └── outputs.js          # Stored outputs
├── components/
│   ├── Layout.jsx           # Top-level layout (workplace list)
│   ├── WorkspaceLayout.jsx  # Sidebar layout (inside a workspace)
│   ├── Sidebar.jsx          # Workspace navigation
│   ├── InlineAgentChat.jsx  # Embedded chat for failed executions
│   ├── CodeEditor.jsx       # CodeMirror 6 (Python)
│   ├── Modal.jsx            # Reusable modal
│   ├── StatusBadge.jsx      # Colored status indicators
│   ├── StatsBar.jsx         # Horizontal stats row
│   ├── FilterBar.jsx        # Search + toggle filters
│   ├── EmptyState.jsx       # Empty placeholder
│   └── ConfirmDialog.jsx    # Confirmation modal
├── pages/
│   ├── Login.jsx            # Auth (register/login)
│   ├── Workplaces.jsx       # Workspace list + create
│   ├── WorkplaceDashboard.jsx  # Overview, stats, recent activity
│   ├── Units.jsx            # Unit list with play/edit/delete
│   ├── UnitDetail.jsx       # Unit stats, execution history, inline chat
│   ├── UnitEditor.jsx       # Edit unit config + steps + code editor
│   ├── AgentPanel.jsx       # Agent config, chat, decision history
│   ├── MemoryBrowser.jsx    # Semantic search, filter, add/delete
│   ├── ExecutionHistory.jsx # All executions table with filters
│   └── ExecutionDetail.jsx  # Status, step results, agent decision, inline chat
├── hooks/
│   ├── useAuth.jsx          # Auth context (JWT, login, logout)
│   ├── useToast.jsx         # Toast notification context
│   └── usePolling.js        # Auto-refresh hook
└── utils/
    └── formatters.js        # Date, time, duration, relative time
```

**Route structure:**
```
/login                              → Login/Register
/workplaces                         → Workplace list
/workplaces/:id                     → Workspace dashboard
/workplaces/:id/units               → Unit list
/workplaces/:id/units/new           → Create unit
/workplaces/:id/units/:uid          → Unit detail (stats, history)
/workplaces/:id/units/:uid/edit     → Edit unit + steps
/workplaces/:id/agent               → Agent config + chat
/workplaces/:id/memory              → Memory browser
/workplaces/:id/history             → Execution history
/workplaces/:id/executions/:eid     → Execution detail
```

### 2. Backend (FastAPI)

```
backend/
├── main.py              # App setup, auth routes, router registration, frontend serving
├── config.py             # All settings from .env
├── database.py           # SQLAlchemy models (13 tables), init_db, session management
├── executor.py           # Sandboxed subprocess runner (timeout, memory limits, metrics)
├── auth.py               # JWT (PyJWT + bcrypt), register, login, get_current_user
├── env_vars.py           # Fernet encryption for secret values
├── workplaces/
│   └── router.py         # Workplace CRUD + dashboard stats
├── units/
│   └── router.py         # Unit + Step CRUD, execution, test run, snippet suggestions
├── executions/
│   └── router.py         # Execution list (workspace-scoped), detail with step results
├── agent/
│   ├── router.py         # Agent config, invoke, chat, decision history
│   ├── service.py        # Core agent loop: context → Groq API → tool calls → response
│   ├── tools.py          # 6 tool definitions + implementations
│   ├── prompts.py        # System prompt + context assembly
│   └── snippets.py       # AI-powered code snippet suggestions (Groq)
└── memory/
    ├── router.py          # Memory CRUD, semantic search, stats
    ├── service.py         # ChromaDB store, query, list, delete
    └── ingestion.py       # Auto-ingest executions + agent decisions
```

### 3. Data Layer

#### PostgreSQL (Relational Data)

13 tables with UUID primary keys:

```
User
 └─── Workplace (owner_id FK)
       ├── UnitOfWork
       │    └── Step (script, mode, timeout)
       ├── Pipeline (future)
       │    └── PipelineStep (future)
       ├── Agent (model, system_prompt, temperature)
       ├── Asset (future)
       ├── Channel (future)
       ├── MemoryEntry (content, source_type, metadata)
       ├── Event (type, payload)
       └── Execution (status, trigger_type)
            └── StepResult (stdout, stderr, return_value, metrics)
```

**Key relationships:**
- Workplace → Units → Steps (cascade delete)
- Workplace → Agent (1:1 in MVP)
- Workplace → Executions → StepResults
- All entities use UUID string PKs

#### ChromaDB (Vector Memory)

- **Embedded mode** (no separate server)
- **Persistent storage** at `./data/chromadb`
- **One collection per workspace**: `workplace_{uuid}`
- **Cosine similarity** for semantic search
- **Default embeddings**: sentence-transformers (local, no API cost)

**What gets stored:**
| Source | Content | Trigger |
|--------|---------|---------|
| Execution success | "Unit 'X' completed in 3.2s. Steps: ..." | Auto after every run |
| Execution failure | "Unit 'X' failed. Step 'Y' error: ..." | Auto after every run |
| Agent decision | "Agent decided to retry because: ..." | Auto after agent acts |
| User observation | Manual notes, annotations | User via Memory Browser |

### 4. AI Agent Architecture

```
Trigger Event                    Context Assembly              Groq API
(unit.failed,     ──────►  ┌──────────────────┐  ──────►  ┌────────────┐
 user.request)              │ 1. System prompt  │           │ LLM +      │
                            │ 2. Event details  │           │ tool_use   │
                            │ 3. RAG: top 5     │◄── ChromaDB           │
                            │    memory entries  │           │            │
                            │ 4. Last 5 execs   │◄── PostgreSQL         │
                            │ 5. Tool defs      │           │            │
                            └──────────────────┘           └──────┬─────┘
                                                                  │
                                                          Tool calls
                                                                  │
                                                           ┌──────▼─────┐
                                                           │ Execute    │
                                                           │ tools      │
                                                           │            │
                                                           │ → Groq    │
                                                           │   again   │
                                                           │ (no tools)│
                                                           │            │
                                                           │ → Final   │
                                                           │   response│
                                                           └────────────┘
```

**Agent invocation flow:**
1. Trigger arrives (unit failure, user chat message)
2. Load workspace config from PostgreSQL
3. Query ChromaDB for relevant memories (RAG, top 5 by cosine similarity)
4. Fetch last 5 executions from PostgreSQL
5. Assemble system prompt + context message
6. Call Groq API with tool definitions
7. If Groq returns tool calls → execute tools → call Groq again (without tools) for final text response
8. Store agent decision in ChromaDB memory
9. Return response + actions taken

**6 Agent Tools:**
| Tool | Purpose |
|------|---------|
| `execute_unit` | Run a unit of work |
| `retry_unit` | Retry a failed execution |
| `query_memory` | Semantic search over shared memory |
| `store_observation` | Add note to memory |
| `get_execution_history` | Fetch recent execution results |
| `alert_user` | Create an alert event |

**Two invocation modes:**
- **Automatic**: Triggered when a unit fails (if agent is enabled)
- **Manual**: User sends a message via Agent Chat or Inline Chat

### 5. Execution Engine

```
Unit Run Request
       │
       ▼
┌──────────────────┐
│ Create Execution │ (status: pending)
│ record in DB     │
└───────┬──────────┘
        │
        ▼ (background thread)
┌──────────────────────────────────────┐
│  For each Step (ordered):            │
│                                      │
│  1. Create StepResult (running)      │
│  2. If mode=chained:                 │
│     inject INPUT_DATA from prev step │
│  3. Call executor.run_script()       │
│     → subprocess with:              │
│       - timeout (SIGTERM → SIGKILL)  │
│       - memory limit (RLIMIT_AS)     │
│       - sandbox mode (optional)      │
│       - env vars injected            │
│  4. Capture stdout, stderr, metrics  │
│  5. Update StepResult               │
│  6. If failed → break               │
│                                      │
│  After all steps:                    │
│  7. Update Execution status          │
│  8. Ingest into ChromaDB memory      │
│  9. If failed + agent enabled:       │
│     → invoke_agent(unit.failed)      │
└──────────────────────────────────────┘
```

**Chained execution:**
```
Step 1 (independent)     Step 2 (chained)        Step 3 (chained)
   │                        │                        │
   │ stdout: "data"         │ INPUT_DATA = "data"    │ INPUT_DATA = "result"
   │ return_value: "data"   │ stdout: "result"       │ stdout: "final"
   └────────────────────────└────────────────────────└──→
```

### 6. Snippet Suggestion Engine

```
User adds step → clicks "AI Suggestions"
       │
       ▼
┌──────────────────────────────┐
│ POST /steps/suggest-snippets │
│                              │
│ Context sent to Groq:        │
│  - Workspace name/desc       │
│  - Unit name/desc            │
│  - Step name                 │
│  - Existing steps (preview)  │
│                              │
│ Groq returns 4 snippets      │
│ (title, description, code)   │
└──────────────────────────────┘
       │
       ▼
┌──────────────────────────────┐
│ User picks a snippet         │
│ → Applied to CodeMirror      │
│ → Edit and save              │
└──────────────────────────────┘

Fallback: If Groq unavailable, returns
built-in templates based on step name
(scraping, transform, load, generic)
```

## Infrastructure

### Docker Compose Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| PostgreSQL | postgres:16-alpine | 5434 | Relational data |
| Redis | redis:7-alpine | 6380 | Future: event bus, caching |

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://orchestrator:orchestrator@localhost:5434/orchestrator

# Redis (future: events)
REDIS_URL=redis://localhost:6380/0

# Auth
JWT_SECRET=<random-string>
JWT_EXPIRATION_HOURS=24

# AI (Groq)
GROQ_API_KEY=<groq-api-key>
GROQ_MODEL=llama-3.3-70b-versatile

# Memory
CHROMADB_PATH=./data/chromadb

# Executor
SANDBOX_MODE=false
MAX_MEMORY_MB=512
```

## Data Flow Diagrams

### Happy Path: Unit Execution

```
User clicks "Run"
    │
    ├─► POST /api/workplaces/{id}/units/{uid}/run
    │       │
    │       ├─► Create Execution (DB)
    │       ├─► Background thread: execute steps
    │       │       │
    │       │       ├─► Step 1: run_script() → StepResult
    │       │       ├─► Step 2: run_script(INPUT_DATA) → StepResult
    │       │       └─► Update Execution status
    │       │
    │       ├─► Ingest execution summary → ChromaDB
    │       └─► Return execution ID
    │
    └─► Frontend polls execution status
            │
            └─► Shows step results as they complete
```

### Failure Path: Agent Auto-Invocation

```
Step fails
    │
    ├─► Execution marked as "failed"
    ├─► Ingest failure details → ChromaDB
    │
    ├─► Check: Agent enabled for this workspace?
    │       │ YES
    │       ▼
    │   invoke_agent(trigger: "unit.failed")
    │       │
    │       ├─► Query ChromaDB: similar past failures (RAG)
    │       ├─► Fetch last 5 executions (PostgreSQL)
    │       ├─► Call Groq with context + tools
    │       │       │
    │       │       ├─► Tool: query_memory("timeout errors")
    │       │       ├─► Tool: alert_user("Connection refused...")
    │       │       └─► Final response with analysis
    │       │
    │       └─► Store agent decision → ChromaDB
    │
    └─► Frontend shows:
        - Failed execution with error details
        - Agent decision card
        - Inline chat: "Ask AI about this error..."
```

### Memory Learning Loop

```
Run 1: Unit fails (no memory)
    │
    ├─► Agent: "Connection refused. No similar past issues found. Alerting user."
    ├─► Stored in memory: failure details + agent decision
    │
Run 2: Same unit fails again
    │
    ├─► Agent queries memory → finds Run 1 failure
    ├─► Agent: "This is the 2nd connection failure. Same error as before.
    │          Consider checking database credentials."
    ├─► Stored in memory: updated pattern
    │
User adds manual note: "DB has maintenance window 2-3 AM"
    │
Run 3: Unit fails at 2:30 AM
    │
    ├─► Agent queries memory → finds failures + maintenance note
    ├─► Agent: "Connection failed during known maintenance window (2-3 AM).
    │          This is expected. Will retry after 3 AM."
    └─► THE AGENT GOT SMARTER
```

## Security

| Layer | Mechanism |
|-------|-----------|
| Authentication | JWT (PyJWT, HS256, 24h expiry) |
| Password storage | bcrypt hashing |
| Secret env vars | Fernet encryption at rest (key derived from JWT_SECRET) |
| Script execution | Sandboxed subprocess (optional: restricted PATH, memory limit, temp cwd) |
| API rate limiting | slowapi (10/min auth, 60/min general) |
| CORS | Configured for frontend origins |
| Workspace isolation | All routes verify owner_id matches current user |

## Build Phases

| Phase | Status | What |
|-------|--------|------|
| 1. Workplace Shell | Done | Models, CRUD, basic UI |
| 2. Agent Core | Done | Groq tool_use loop, agent chat, auto-invoke on failure |
| 3. Shared Memory | Done | ChromaDB, auto-ingest, memory browser, RAG |
| 4. Assets | Planned | External service registry, health checks |
| 5. Channels | Planned | Slack, webhook, email communication |
| 6. Events | Planned | Redis pub/sub event bus |
| 7. Pipelines | Planned | Multi-unit pipelines with visual builder |

## Key Design Decisions

1. **Groq over Anthropic/OpenAI** — Fast inference, low cost, OpenAI-compatible API with tool_use support. Easy to swap later.

2. **ChromaDB embedded over hosted vector DB** — No separate server for MVP. Persistent to disk. One collection per workspace for isolation.

3. **No LangChain/LangGraph** — Direct API calls with tool_use give full control. The agent logic is domain-specific; framework abstractions add complexity without proportional value.

4. **Subprocess executor over in-process eval** — Full isolation, resource limits, no risk of user code crashing the server.

5. **UUID PKs over auto-increment** — Better for distributed systems, no sequential ID leaking, safe for client-side generation.

6. **Tool-use loop with two-phase Groq calls** — First call with tools (agent decides what to do), second call without tools (agent generates text response from tool results). Prevents Groq from returning empty content.

7. **Inline agent chat on failures** — Users can ask about errors without leaving the execution detail page. Context is pre-filled with error details.
