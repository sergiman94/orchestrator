"""FastAPI application for Orchestrator."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from backend.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)
from backend.database import get_db, init_db, User, utcnow
from backend.workplaces.router import router as workplaces_router
from backend.units.router import router as units_router
from backend.memory.router import router as memory_router
from backend.agent.router import router as agent_router
from backend.executions.router import wp_router as executions_wp_router, detail_router as executions_detail_router
from backend.connectors.router import router as connectors_router
from backend.assets.router import router as assets_router, init_scheduler, schedule_existing_assets
import backend.connectors.providers  # noqa: F401 — auto-register built-in connector providers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("orchestrator")

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize database on startup."""
    logger.info("Initializing database...")
    init_db()
    logger.info("Database initialized.")
    # Initialize ChromaDB memory store
    from backend.memory.service import init_memory
    try:
        init_memory()
        logger.info("ChromaDB memory initialized.")
    except Exception as e:
        logger.warning(f"ChromaDB initialization failed (non-fatal): {e}")
    # Initialize APScheduler for asset health checks (AD-11)
    from apscheduler.schedulers.background import BackgroundScheduler
    scheduler = BackgroundScheduler()
    init_scheduler(scheduler)
    scheduler.start()
    schedule_existing_assets()
    # Schedule memory lifecycle jobs
    from backend.memory.service import purge_expired_memories
    scheduler.add_job(purge_expired_memories, "cron", hour=2, minute=0, id="memory_purge_daily")
    scheduler.add_job(_run_compaction_all, "cron", day_of_week="sun", hour=3, minute=0, id="memory_compaction_weekly")
    logger.info("APScheduler started (asset health checks, memory purge, memory compaction).")
    yield
    scheduler.shutdown(wait=False)
    logger.info("Shutting down.")


def _run_compaction_all():
    """Weekly job: compact memories for all workplaces."""
    from backend.database import SessionLocal, Workplace
    from backend.memory.service import compact_memories
    db = SessionLocal()
    try:
        workplaces = db.query(Workplace).all()
        for wp in workplaces:
            try:
                compact_memories(wp.id)
            except Exception as e:
                logger.warning(f"Compaction failed for workplace {wp.id}: {e}")
    except Exception as e:
        logger.error(f"Weekly compaction job failed: {e}")
    finally:
        db.close()


app = FastAPI(title="Orchestrator", version="0.1.0", lifespan=lifespan)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.post("/api/auth/register", response_model=TokenResponse)
@limiter.limit("10/minute")
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="Username and password required")
    if len(body.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    existing = db.query(User).filter(User.username == body.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.username)
    return TokenResponse(access_token=token)


@app.post("/api/auth/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(user.id, user.username)
    return TokenResponse(access_token=token)


@app.get("/api/auth/me")
def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


# ---------------------------------------------------------------------------
# Include routers
# ---------------------------------------------------------------------------

app.include_router(workplaces_router)
app.include_router(units_router)
app.include_router(memory_router)
app.include_router(agent_router)
app.include_router(executions_wp_router)
app.include_router(executions_detail_router)
app.include_router(connectors_router)
app.include_router(assets_router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Frontend serving
# ---------------------------------------------------------------------------

_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if _frontend_dist.exists() and _frontend_dist.is_dir():
    if (_frontend_dist / "assets").exists():
        app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

    @app.get("/")
    def serve_index():
        return FileResponse(str(_frontend_dist / "index.html"))

    # SPA routes — serve index.html for client-side routing
    @app.get("/login")
    def serve_login():
        return FileResponse(str(_frontend_dist / "index.html"))

    @app.get("/workplaces/{rest:path}")
    def serve_workplaces_sub(rest: str = ""):
        return FileResponse(str(_frontend_dist / "index.html"))

    @app.get("/workplaces")
    def serve_workplaces():
        return FileResponse(str(_frontend_dist / "index.html"))
else:
    @app.get("/")
    def root():
        return {
            "message": "Orchestrator API is running. Frontend not built yet.",
            "docs": "/docs",
        }
