# Source Tree Analysis — Orchestrator

```
orchestrator/
├── run.py                          # Entry point: uvicorn on port 8005
├── requirements.txt                # Python dependencies (16 packages)
├── docker-compose.yml              # PostgreSQL 16 + Redis 7
├── .env / .env.example             # Environment configuration
├── README.md                       # Project overview + quick start
├── ARCHITECTURE.md                 # Full system architecture document
├── SPECS.md                        # Technical specifications (data model, API, agent)
├── CLAUDE.md                       # AI dev context reference
│
├── backend/                        # FastAPI application
│   ├── main.py                     # App setup, auth routes, router registration, frontend serving
│   ├── config.py                   # All settings from .env (DB, Redis, JWT, Groq, ChromaDB, SMTP)
│   ├── database.py                 # SQLAlchemy models (13 tables), init_db(), session management
│   ├── executor.py                 # Sandboxed subprocess runner (timeout, memory limits, metrics)
│   ├── auth.py                     # JWT auth (PyJWT + bcrypt), register, login, get_current_user
│   ├── env_vars.py                 # Fernet encryption for secret environment variables
│   │
│   ├── workplaces/
│   │   └── router.py               # Workplace CRUD + dashboard stats
│   │
│   ├── units/
│   │   └── router.py               # Unit + Step CRUD, execution, test run, AI snippet suggestions
│   │
│   ├── executions/
│   │   └── router.py               # Execution list (workspace-scoped), detail with step results
│   │
│   ├── agent/
│   │   ├── router.py               # Agent config, invoke, chat, decision history
│   │   ├── service.py              # Core agent loop: context → Groq API → tool calls → response
│   │   ├── tools.py                # 6 tool definitions + implementations
│   │   ├── prompts.py              # System prompt + context assembly
│   │   └── snippets.py             # AI code snippet suggestions (Groq)
│   │
│   ├── memory/
│   │   ├── router.py               # Memory CRUD, semantic search, stats
│   │   ├── service.py              # ChromaDB store, query, list, delete
│   │   └── ingestion.py            # Auto-ingest executions + agent decisions
│   │
│   └── events/
│       └── __init__.py             # Placeholder (Phase 5: Redis pub/sub event bus)
│
├── frontend/                       # React 18 SPA (Vite + Tailwind CSS)
│   ├── package.json                # Dependencies: React 18, React Router 6, CodeMirror 6, Tailwind
│   ├── vite.config.js              # Dev server port 3002, proxy /api → localhost:8005
│   ├── tailwind.config.js          # Custom dark theme colors
│   ├── index.html                  # Entry HTML
│   │
│   └── src/
│       ├── main.jsx                # ReactDOM entry: AuthProvider + ToastProvider + BrowserRouter
│       ├── App.jsx                 # Routes: login, workplaces, workspace subroutes
│       ├── index.css               # Tailwind directives + custom dark theme
│       │
│       ├── api/                    # API client modules
│       │   ├── client.js           # Base fetch wrapper (JWT auto-attach, 401 redirect)
│       │   ├── workplaces.js       # Workplace CRUD + dashboard
│       │   ├── units.js            # Units + Steps CRUD, run, test, snippets
│       │   ├── executions.js       # Execution list, detail, active
│       │   ├── agent.js            # Agent config, chat, invoke, history
│       │   └── memory.js           # Memory list, search, create, delete, stats
│       │
│       ├── components/             # Reusable UI components
│       │   ├── Layout.jsx          # Top-level layout (workspace list page)
│       │   ├── WorkspaceLayout.jsx # Sidebar layout (inside a workspace)
│       │   ├── Sidebar.jsx         # Workspace nav (Dashboard, Units, Agent, Memory, History)
│       │   ├── InlineAgentChat.jsx # Embedded chat for failed executions
│       │   ├── CodeEditor.jsx      # CodeMirror 6 wrapper (Python syntax, dark theme)
│       │   ├── Modal.jsx           # Reusable modal overlay
│       │   ├── ConfirmDialog.jsx   # Confirmation modal
│       │   ├── StatusBadge.jsx     # Colored status pill badges
│       │   ├── StatsBar.jsx        # Horizontal stats row
│       │   ├── FilterBar.jsx       # Search input + toggle filter buttons
│       │   └── EmptyState.jsx      # Empty placeholder with floating icon
│       │
│       ├── pages/                  # Route pages
│       │   ├── Login.jsx           # Auth (register/login)
│       │   ├── Workplaces.jsx      # Workspace list + create modal
│       │   ├── WorkplaceDashboard.jsx  # Overview, stats, recent activity, agent/memory cards
│       │   ├── Units.jsx           # Unit list with play/edit/delete, search/filter
│       │   ├── UnitDetail.jsx      # Unit stats, execution history, inline agent chat
│       │   ├── UnitEditor.jsx      # Edit unit config + steps + CodeMirror + AI snippets
│       │   ├── AgentPanel.jsx      # Agent config, chat interface, decision history
│       │   ├── MemoryBrowser.jsx   # Semantic search, source-type filters, add/delete
│       │   ├── ExecutionHistory.jsx # All executions table with status filters
│       │   └── ExecutionDetail.jsx # Status banner, step results, agent decision, inline chat
│       │
│       ├── hooks/                  # Custom React hooks
│       │   ├── useAuth.jsx         # Auth context (JWT, login, register, logout)
│       │   ├── useToast.jsx        # Toast notification context
│       │   └── usePolling.js       # Auto-refresh hook
│       │
│       └── utils/
│           └── formatters.js       # Date, time, duration, relative time, size formatters
│
├── data/                           # Runtime data (gitignored)
│   └── chromadb/                   # ChromaDB persistent storage
│
└── docs/                           # Generated project documentation
    └── project-scan-report.json    # BMAD scan state file
```

## Critical Directories

| Directory | Purpose |
|-----------|---------|
| `backend/` | FastAPI application — all server-side logic |
| `backend/agent/` | AI agent service — Groq API integration, tool_use loop, prompts |
| `backend/memory/` | Shared memory — ChromaDB vector store, auto-ingestion, RAG |
| `backend/units/` | Unit + Step CRUD — the core execution entities |
| `backend/executions/` | Execution history and detail API |
| `frontend/src/pages/` | All React page components (11 pages) |
| `frontend/src/components/` | Reusable UI components (11 components) |
| `frontend/src/api/` | API client layer — all backend communication |

## Entry Points

| Entry Point | Purpose |
|-------------|---------|
| `run.py` | Backend server (uvicorn, port 8005) |
| `frontend/src/main.jsx` | React app entry (AuthProvider → ToastProvider → BrowserRouter) |
| `backend/main.py` | FastAPI app creation, middleware, router registration |

## Integration Points

| From | To | Type |
|------|----|------|
| Frontend (`api/client.js`) | Backend (`/api/*`) | HTTP REST (proxied via Vite in dev) |
| Backend (`agent/service.py`) | Groq API | HTTPS (tool_use chat completions) |
| Backend (`memory/service.py`) | ChromaDB | Embedded (in-process, persistent to `data/chromadb/`) |
| Backend (`database.py`) | PostgreSQL | TCP (psycopg2, port 5434) |
| Backend (`executor.py`) | Python subprocess | Local process (sandboxed, resource-limited) |
