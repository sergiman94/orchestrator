# Orchestrator — Project Documentation Index

## Project Overview

- **Type:** Monolith (backend + frontend)
- **Primary Language:** Python (backend), JavaScript/JSX (frontend)
- **Architecture:** Service-oriented monolith with modular routers + AI agent + vector memory

## Quick Reference

### Backend (FastAPI)
- **Framework:** FastAPI + SQLAlchemy + PostgreSQL
- **AI:** Groq API (LLaMA 3.3 70B, tool_use)
- **Memory:** ChromaDB (embedded, cosine similarity)
- **Entry Point:** `run.py` → `backend/main.py`
- **Port:** 8005
- **Models:** 13 tables (User, Workplace, UnitOfWork, Step, Pipeline, PipelineStep, Agent, Asset, Channel, MemoryEntry, Event, Execution, StepResult)
- **API Endpoints:** 39 routes across 6 routers

### Frontend (React)
- **Framework:** React 18 + Vite + Tailwind CSS
- **Editor:** CodeMirror 6 (Python)
- **Entry Point:** `frontend/src/main.jsx`
- **Port:** 3002 (dev)
- **Pages:** 11 | **Components:** 11

## Generated Documentation

- [Project Overview](./project-overview.md)
- [Source Tree Analysis](./source-tree-analysis.md)
- [Development Guide](./development-guide.md)
- [API Contracts](./api-contracts.md)
- [Data Models](./data-models.md)

## Existing Documentation

- [README](../README.md) — Project overview, concepts, quick start, architecture diagram
- [Architecture](../ARCHITECTURE.md) — Full system architecture, data flows, agent design, security
- [Technical Specifications](../SPECS.md) — Data model, API endpoints, agent tools, memory design
- [Claude Context](../CLAUDE.md) — Dev reference for AI-assisted sessions

## Getting Started

1. Start infrastructure: `docker-compose up -d`
2. Backend: `conda activate orchestrator && python run.py`
3. Frontend: `cd frontend && npm run dev`
4. Open `http://localhost:3002`, register, create a workplace

For full setup instructions see the [Development Guide](./development-guide.md).
