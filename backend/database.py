"""SQLAlchemy models and database setup for Orchestrator."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    create_engine,
    Column,
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

from backend.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def utcnow():
    return datetime.now(timezone.utc)


def new_uuid():
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=new_uuid)
    username = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    workplaces = relationship("Workplace", back_populates="owner", cascade="all, delete-orphan")


class Workplace(Base):
    __tablename__ = "workplaces"

    id = Column(String(36), primary_key=True, default=new_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    status = Column(String(20), default="active")  # active, paused, archived
    config = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    owner = relationship("User", back_populates="workplaces")
    units = relationship("UnitOfWork", back_populates="workplace", cascade="all, delete-orphan")
    pipelines = relationship("Pipeline", back_populates="workplace", cascade="all, delete-orphan")
    agents = relationship("Agent", back_populates="workplace", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="workplace", cascade="all, delete-orphan")
    channels = relationship("Channel", back_populates="workplace", cascade="all, delete-orphan")
    memory_entries = relationship("MemoryEntry", back_populates="workplace", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="workplace", cascade="all, delete-orphan")
    executions = relationship("Execution", back_populates="workplace", cascade="all, delete-orphan")


class UnitOfWork(Base):
    __tablename__ = "units_of_work"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    type = Column(String(50), default="script")  # script, http_request, llm_call, transform, condition
    config = Column(JSON, default=dict)
    retry_policy = Column(JSON, default=dict)  # {max_retries, delay, backoff_multiplier}
    enabled = Column(Boolean, default=True)
    order = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    workplace = relationship("Workplace", back_populates="units")
    steps = relationship("Step", back_populates="unit", cascade="all, delete-orphan", order_by="Step.order")
    pipeline_steps = relationship("PipelineStep", back_populates="unit", cascade="all, delete-orphan")
    step_results = relationship("StepResult", back_populates="unit", cascade="all, delete-orphan")


class Step(Base):
    __tablename__ = "steps"

    id = Column(String(36), primary_key=True, default=new_uuid)
    unit_id = Column(String(36), ForeignKey("units_of_work.id"), nullable=False)
    name = Column(String(255), nullable=False)
    order = Column(Integer, default=0)
    script = Column(Text, default="")
    mode = Column(String(20), default="independent")  # independent, chained
    timeout = Column(Integer, default=300)
    created_at = Column(DateTime, default=utcnow)

    unit = relationship("UnitOfWork", back_populates="steps")
    step_results = relationship("StepResult", back_populates="step")


class Pipeline(Base):
    __tablename__ = "pipelines"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, default="")
    trigger_config = Column(JSON, default=dict)  # cron expression, webhook config, event pattern
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    workplace = relationship("Workplace", back_populates="pipelines")
    steps = relationship("PipelineStep", back_populates="pipeline", cascade="all, delete-orphan")
    executions = relationship("Execution", back_populates="pipeline")


class PipelineStep(Base):
    __tablename__ = "pipeline_steps"

    id = Column(String(36), primary_key=True, default=new_uuid)
    pipeline_id = Column(String(36), ForeignKey("pipelines.id"), nullable=False)
    unit_id = Column(String(36), ForeignKey("units_of_work.id"), nullable=False)
    order = Column(Integer, default=0)
    condition = Column(JSON, default=None, nullable=True)
    on_failure = Column(String(20), default="stop")  # stop, skip, retry, ask_agent

    pipeline = relationship("Pipeline", back_populates="steps")
    unit = relationship("UnitOfWork", back_populates="pipeline_steps")


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    name = Column(String(255), nullable=False)
    model = Column(String(100), default="claude-sonnet-4-20250514")
    system_prompt = Column(Text, default="")
    capabilities = Column(JSON, default=dict)
    temperature = Column(Float, default=0.3)
    max_tokens = Column(Integer, default=4096)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

    workplace = relationship("Workplace", back_populates="agents")


class Asset(Base):
    __tablename__ = "assets"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), default="custom")  # database, api, aws_service, storage, custom
    config = Column(JSON, default=dict)
    credentials = Column(Text, default="")  # Fernet-encrypted
    health_status = Column(String(20), default="unknown")  # healthy, degraded, unreachable, unknown
    last_checked = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    workplace = relationship("Workplace", back_populates="assets")


class Channel(Base):
    __tablename__ = "channels"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), default="log")  # slack, email, webhook, queue, log
    config = Column(JSON, default=dict)
    direction = Column(String(20), default="outbound")  # inbound, outbound, bidirectional
    created_at = Column(DateTime, default=utcnow)

    workplace = relationship("Workplace", back_populates="channels")


class MemoryEntry(Base):
    __tablename__ = "memory_entries"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    source_type = Column(String(50), default="observation")  # execution, agent_decision, user_input, observation, error_pattern
    source_id = Column(String(255), default="")
    content = Column(Text, default="")
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, nullable=True)

    workplace = relationship("Workplace", back_populates="memory_entries")


class Event(Base):
    __tablename__ = "events"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    type = Column(String(100), default="")
    source_type = Column(String(50), default="system")  # unit, channel, agent, system, user
    source_id = Column(String(36), default="")
    payload = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    workplace = relationship("Workplace", back_populates="events")


class Execution(Base):
    __tablename__ = "executions"

    id = Column(String(36), primary_key=True, default=new_uuid)
    workplace_id = Column(String(36), ForeignKey("workplaces.id"), nullable=False)
    pipeline_id = Column(String(36), ForeignKey("pipelines.id"), nullable=True)
    unit_id = Column(String(36), ForeignKey("units_of_work.id"), nullable=True)
    agent_id = Column(String(36), ForeignKey("agents.id"), nullable=True)
    trigger_type = Column(String(20), default="manual")  # cron, manual, event, agent, webhook
    status = Column(String(20), default="pending")  # pending, running, completed, failed, cancelled, retrying
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    retry_count = Column(Integer, default=0)
    agent_context = Column(JSON, default=None, nullable=True)
    created_at = Column(DateTime, default=utcnow)

    workplace = relationship("Workplace", back_populates="executions")
    pipeline = relationship("Pipeline", back_populates="executions")
    unit = relationship("UnitOfWork")
    agent = relationship("Agent")
    step_results = relationship("StepResult", back_populates="execution", cascade="all, delete-orphan")


class StepResult(Base):
    __tablename__ = "step_results"

    id = Column(String(36), primary_key=True, default=new_uuid)
    execution_id = Column(String(36), ForeignKey("executions.id"), nullable=False)
    unit_id = Column(String(36), ForeignKey("units_of_work.id"), nullable=True)
    step_id = Column(String(36), ForeignKey("steps.id"), nullable=True)
    status = Column(String(20), default="pending")  # pending, running, completed, failed, skipped
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    stdout = Column(Text, default="")
    stderr = Column(Text, default="")
    return_value = Column(Text, default="")
    input_data = Column(Text, default="")
    agent_notes = Column(Text, default="")
    metrics = Column(JSON, default=dict)

    execution = relationship("Execution", back_populates="step_results")
    unit = relationship("UnitOfWork", back_populates="step_results")
    step = relationship("Step", back_populates="step_results")


# ---------------------------------------------------------------------------
# Database initialization
# ---------------------------------------------------------------------------

def init_db():
    """Create all tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
