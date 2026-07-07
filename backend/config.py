import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# Database (PostgreSQL)
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://orchestrator:orchestrator@localhost:5433/orchestrator")

# Redis
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6380/0")

# Auth
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-to-a-random-string")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

# AI Agent
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
AGENT_MODEL = os.getenv("AGENT_MODEL", "claude-sonnet-4-20250514")
AGENT_MAX_TOKENS = int(os.getenv("AGENT_MAX_TOKENS", "4096"))
AGENT_TEMPERATURE = float(os.getenv("AGENT_TEMPERATURE", "0.3"))

# Memory (ChromaDB)
CHROMADB_PATH = os.getenv("CHROMADB_PATH", "./data/chromadb")

# Executor / Sandbox
SANDBOX_MODE = os.getenv("SANDBOX_MODE", "false").lower() in ("true", "1", "yes")
MAX_MEMORY_MB = int(os.getenv("MAX_MEMORY_MB", "512"))

# SMTP / Email notifications
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "")

# App
TIMEZONE = os.getenv("TIMEZONE", "UTC")
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "./data/outputs"))

# Ensure directories exist
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
Path("./data").mkdir(parents=True, exist_ok=True)
