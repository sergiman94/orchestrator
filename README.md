# Orchestrator

AI-native orchestration platform with shared context memory.

## What is this?

Orchestrator is a platform where AI agents own and operate **workplaces** — self-contained environments that house units of work, data pipelines, external assets, and communication channels. The key differentiator is **shared memory**: every execution, failure, decision, and pattern is stored in a vector database, giving the AI agent persistent operational context that accumulates over time.

Unlike traditional orchestration tools (Airflow, Prefect, Temporal) that are stateless between runs, Orchestrator's AI agents **learn from history**. They remember that a certain API fails on Mondays, that increasing timeout from 300s to 600s resolves 80% of scraper timeouts, and that schema changes in the source database broke the transform step twice last month.

## Core Concepts

- **Workplace** — A container/namespace for a project or system. Could be a data pipeline, monitoring setup, or automation workflow.
- **Unit of Work** — A discrete task: a Python script, HTTP request, data transform, or LLM call. Units live inside workplaces and can be chained together.
- **Pipeline** — An ordered sequence of units with triggers (cron, webhook, event) and failure policies (stop, skip, retry, ask the agent).
- **Agent (Owner)** — An AI (Claude) assigned to a workplace. It monitors executions, diagnoses failures, makes decisions, and gets smarter over time through shared memory.
- **Asset** — An external service the workplace interacts with: databases, APIs, AWS services, storage. The agent has awareness of asset health.
- **Channel** — A communication pathway: Slack, email, webhook, message queue. Units publish to channels, channels can trigger units.
- **Shared Memory** — A vector store (ChromaDB) that accumulates operational knowledge. Every execution summary, error pattern, agent decision, and user annotation is embedded and retrievable via semantic search.
- **Event** — The nervous system. Everything emits events. Events trigger agents, channels, and pipelines.

## Tech Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + APScheduler
- **Frontend**: React 18 + Vite + Tailwind CSS + CodeMirror 6
- **AI**: Anthropic Claude API (direct tool_use, no LangChain)
- **Memory**: ChromaDB (embedded mode)
- **Events**: Redis (pub/sub)
- **Auth**: JWT + bcrypt
- **Executor**: Sandboxed Python subprocess with resource limits

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL
- Redis
- Anthropic API key

### Setup

```bash
# Clone
git clone https://github.com/sergiman94/orchestrator.git
cd orchestrator

# Backend
conda create -n orchestrator python=3.11 -y
conda activate orchestrator
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your credentials (ANTHROPIC_API_KEY, DATABASE_URL, REDIS_URL)

# Start infrastructure
docker-compose up -d  # PostgreSQL + Redis

# Start backend
python run.py  # port 8005

# Frontend (separate terminal)
cd frontend
npm install
npm run dev  # port 3000, proxies API to 8005
```

### First Steps

1. Open `http://localhost:3000`
2. Register an account
3. Create a workplace (e.g., "Price Scraper Pipeline")
4. Add units of work (scrape, transform, load)
5. Configure the AI agent with a system prompt
6. Run the pipeline — watch the agent learn

## Architecture

```
User/Browser
     |
     v
React Frontend (Vite + Tailwind)
     |
     v
FastAPI Backend
     |
     +---> Auth (JWT)
     +---> Workplace API
     +---> Unit/Pipeline API
     +---> Agent Service ---> Claude API (tool_use)
     +---> Memory Service --> ChromaDB (vectors)
     +---> Event Bus -------> Redis (pub/sub)
     +---> Executor --------> Sandboxed subprocess
     +---> Scheduler -------> APScheduler (cron)
     |
     v
PostgreSQL (data) + Redis (events/cache) + ChromaDB (memory)
```

## Project Status

Currently in active development. Building in phases:

- [x] Phase 0: Project setup, specs, documentation
- [ ] Phase 1: Workplace shell (models, CRUD, basic UI)
- [ ] Phase 2: Agent core (Claude tool_use loop, agent panel)
- [ ] Phase 3: Shared memory (ChromaDB, auto-ingest, memory browser)
- [ ] Phase 4: Assets and channels
- [ ] Phase 5: Event system (Redis pub/sub)
- [ ] Phase 6: Pipeline builder (visual DAG editor)

## License

MIT
