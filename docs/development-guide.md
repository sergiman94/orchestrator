# Development Guide — Orchestrator

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose
- Conda (miniconda or anaconda)
- Groq API key ([console.groq.com](https://console.groq.com))

## Initial Setup

### 1. Infrastructure

```bash
cd orchestrator
docker-compose up -d    # PostgreSQL (port 5434) + Redis (port 6380)
```

### 2. Backend

```bash
conda create -n orchestrator python=3.11 -y
conda activate orchestrator
pip install -r requirements.txt
cp .env.example .env
# Edit .env — set GROQ_API_KEY at minimum
```

### 3. Frontend

```bash
cd frontend
npm install
```

## Running

### Development (two terminals)

```bash
# Terminal 1 — Backend (port 8005)
conda activate orchestrator
python run.py

# Terminal 2 — Frontend dev server (port 3002, proxies /api to 8005)
cd frontend
npm run dev
```

Open `http://localhost:3002`

### Production (single server)

```bash
cd frontend && npm run build    # builds to frontend/dist/
conda activate orchestrator
python run.py                   # serves React build + API on port 8005
```

## Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | Yes | `postgresql://orchestrator:orchestrator@localhost:5434/orchestrator` | PostgreSQL connection |
| `REDIS_URL` | No | `redis://localhost:6380/0` | Redis (future: events) |
| `JWT_SECRET` | Yes | `change-me-to-a-random-string` | JWT signing key |
| `GROQ_API_KEY` | Yes | - | Groq API for AI agent + snippets |
| `GROQ_MODEL` | No | `llama-3.3-70b-versatile` | LLM model |
| `CHROMADB_PATH` | No | `./data/chromadb` | Vector store path |
| `SANDBOX_MODE` | No | `false` | Restrict script execution |
| `MAX_MEMORY_MB` | No | `512` | Script memory limit |

## Project Structure

```
backend/
  main.py           — App setup, auth routes, router registration
  database.py       — 13 SQLAlchemy models
  config.py         — .env settings
  executor.py       — Sandboxed script runner
  auth.py           — JWT + bcrypt
  agent/            — AI agent (Groq tool_use loop)
  memory/           — ChromaDB shared memory
  units/            — Unit + Step CRUD + execution
  workplaces/       — Workspace CRUD
  executions/       — Execution history API

frontend/src/
  pages/            — 11 React pages
  components/       — 11 reusable components
  api/              — 6 API client modules
  hooks/            — useAuth, useToast, usePolling
```

## Database

PostgreSQL with 13 tables. Tables auto-created on first startup via `init_db()`.

To reset the database:
```bash
docker-compose down -v && docker-compose up -d
# Restart backend — tables recreated automatically
```

## API Authentication

All endpoints (except `/api/auth/register` and `/api/auth/login`) require JWT:

```bash
# Register
curl -X POST http://localhost:8005/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Login (returns token)
curl -X POST http://localhost:8005/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Use token
curl http://localhost:8005/api/workplaces \
  -H "Authorization: Bearer <token>"
```

## Common Tasks

### Add a new API router

1. Create `backend/<domain>/router.py` with `APIRouter`
2. Import and register in `backend/main.py`: `app.include_router(router)`
3. Remember: static paths (`/stats`, `/search`) before parameterized (`/{id}`)

### Add a new React page

1. Create `frontend/src/pages/MyPage.jsx`
2. Add route in `frontend/src/App.jsx`
3. Add nav item in `frontend/src/components/Sidebar.jsx` (if workspace-scoped)

### Add a new agent tool

1. Define tool schema in `backend/agent/tools.py` (OpenAI function format)
2. Add implementation in `execute_tool()` dispatcher
3. Add to `TOOL_DEFINITIONS` list

## Testing

No automated test suite currently. Manual testing via:
- API: `curl` or FastAPI docs at `http://localhost:8005/docs`
- Frontend: Browser at `http://localhost:3002`
- Agent: Agent Chat panel or inline chat on failed executions
