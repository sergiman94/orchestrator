# Data Models — Orchestrator

Database: **PostgreSQL 16** via SQLAlchemy ORM. All primary keys are UUID strings (36 chars).

---

## Entity Relationship Diagram

```
User (1) ──────< (N) Workplace
                      │
          ┌───────────┼───────────┬──────────┬──────────┬──────────┐
          │           │           │          │          │          │
    UnitOfWork    Pipeline     Agent     Asset     Channel    MemoryEntry
       │              │                                         Event
       │              │
     Step        PipelineStep
       │
    Execution ───< StepResult
```

---

## Tables

### User

Authentication entity.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | Unique identifier |
| username | String(255) | Unique, Not Null, Indexed | Login username |
| password_hash | String(255) | Not Null | bcrypt hash |
| created_at | DateTime | Default: now | Account creation time |

---

### Workplace

Top-level container. All other entities belong to a workplace.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| name | String(255) | Not Null | Workspace name |
| description | Text | Default: "" | Purpose/description |
| owner_id | String(36) | FK → users.id, Not Null | Owner user |
| status | String(20) | Default: "active" | active, paused, archived |
| config | JSON | Default: {} | Workspace-level settings |
| created_at | DateTime | Default: now | |
| updated_at | DateTime | Default: now, auto-update | |

**Relationships:** units (cascade), pipelines (cascade), agents (cascade), assets (cascade), channels (cascade), memory_entries (cascade), events (cascade), executions (cascade)

---

### UnitOfWork

A job/task container. Contains Steps.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | Parent workspace |
| name | String(255) | Not Null | Unit name |
| description | Text | Default: "" | What this unit does |
| type | String(50) | Default: "script" | script, http_request, llm_call, transform, condition |
| config | JSON | Default: {} | Type-specific configuration |
| retry_policy | JSON | Default: {} | {max_retries, delay, backoff_multiplier} |
| enabled | Boolean | Default: true | Active/inactive |
| order | Integer | Default: 0 | Position in default sequence |
| created_at | DateTime | Default: now | |
| updated_at | DateTime | Default: now, auto-update | |

**Relationships:** steps (cascade, ordered by Step.order), executions

---

### Step

Individual script/task within a Unit. Executed in order.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| unit_id | String(36) | FK → units_of_work.id, Not Null | Parent unit |
| name | String(255) | Not Null | Step name |
| order | Integer | Default: 0 | Execution order |
| script | Text | Default: "" | Python source code |
| mode | String(20) | Default: "independent" | independent, chained |
| timeout | Integer | Default: 300 | Max execution time (seconds) |
| created_at | DateTime | Default: now | |

**Chained mode:** When mode="chained", the step receives the previous step's `return_value` as `INPUT_DATA` environment variable.

---

### Pipeline *(Phase 7 — placeholder)*

Multi-unit pipeline with trigger configuration.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| name | String(255) | Not Null | Pipeline name |
| description | Text | Default: "" | |
| trigger_config | JSON | Default: {} | Cron expression, webhook config, event pattern |
| enabled | Boolean | Default: true | |
| created_at | DateTime | Default: now | |

---

### PipelineStep *(Phase 7 — placeholder)*

Links Units to Pipelines with ordering and failure policy.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| pipeline_id | String(36) | FK → pipelines.id, Not Null | |
| unit_id | String(36) | FK → units_of_work.id, Not Null | |
| order | Integer | Default: 0 | Execution order in pipeline |
| condition | JSON | Nullable | Run only if previous output matches |
| on_failure | String(20) | Default: "stop" | stop, skip, retry, ask_agent |

---

### Agent

AI supervisor for a workspace. One per workspace (MVP).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| name | String(255) | Not Null | Agent display name |
| model | String(100) | Default: "claude-sonnet-4-20250514" | LLM model identifier |
| system_prompt | Text | Default: "" | Base instructions for agent |
| capabilities | JSON | Default: {} | What agent can do |
| temperature | Float | Default: 0.3 | LLM temperature |
| max_tokens | Integer | Default: 4096 | Max response tokens |
| enabled | Boolean | Default: true | Active/inactive |
| created_at | DateTime | Default: now | |

---

### Asset *(Phase 4 — placeholder)*

External service registry.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| name | String(255) | Not Null | Asset display name |
| type | String(50) | Default: "custom" | database, api, aws_service, storage, custom |
| config | JSON | Default: {} | Connection strings, endpoints |
| credentials | Text | Default: "" | Fernet-encrypted credential blob |
| health_status | String(20) | Default: "unknown" | healthy, degraded, unreachable, unknown |
| last_checked | DateTime | Nullable | Last health check timestamp |
| created_at | DateTime | Default: now | |

---

### Channel *(Phase 5 — placeholder)*

Communication pathway.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| name | String(255) | Not Null | Channel name |
| type | String(50) | Default: "log" | slack, email, webhook, queue, log |
| config | JSON | Default: {} | Webhook URL, Slack token, etc. |
| direction | String(20) | Default: "outbound" | inbound, outbound, bidirectional |
| created_at | DateTime | Default: now | |

---

### MemoryEntry

Shared context memory. Content stored here, embeddings stored in ChromaDB.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| source_type | String(50) | Default: "observation" | execution, agent_decision, user_input, observation, error_pattern |
| source_id | String(255) | Default: "" | FK to source entity |
| content | Text | Default: "" | Raw text content |
| metadata | JSON | Default: {} | Tags, timestamps, relevance scores |
| created_at | DateTime | Default: now | |
| expires_at | DateTime | Nullable | Optional TTL |

**ChromaDB:** Embeddings stored separately in ChromaDB collection `workplace_{id}`. Cosine similarity search. One collection per workspace.

---

### Event

Event log. Everything emits events.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| type | String(100) | Default: "" | e.g., unit.completed, agent.decision |
| source_type | String(50) | Default: "system" | unit, channel, agent, system, user |
| source_id | String(36) | Default: "" | Source entity ID |
| payload | JSON | Default: {} | Event data |
| created_at | DateTime | Default: now | |

---

### Execution

A single run of a unit or pipeline.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| workplace_id | String(36) | FK → workplaces.id, Not Null | |
| pipeline_id | String(36) | FK → pipelines.id, Nullable | If pipeline-triggered |
| unit_id | String(36) | FK → units_of_work.id, Nullable | If single-unit run |
| agent_id | String(36) | FK → agents.id, Nullable | Supervising agent |
| trigger_type | String(20) | Default: "manual" | cron, manual, event, agent, webhook |
| status | String(20) | Default: "pending" | pending, running, completed, failed, cancelled, retrying |
| started_at | DateTime | Nullable | |
| finished_at | DateTime | Nullable | |
| retry_count | Integer | Default: 0 | Current retry attempt |
| agent_context | JSON | Nullable | What agent saw/decided |
| created_at | DateTime | Default: now | |

**Relationships:** step_results (cascade)

---

### StepResult

Execution output of a single step.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | String(36) | PK, UUID | |
| execution_id | String(36) | FK → executions.id, Not Null | Parent execution |
| unit_id | String(36) | FK → units_of_work.id, Nullable | |
| step_id | String(36) | FK → steps.id, Nullable | |
| status | String(20) | Default: "pending" | pending, running, completed, failed, skipped |
| started_at | DateTime | Nullable | |
| finished_at | DateTime | Nullable | |
| stdout | Text | Default: "" | Captured standard output |
| stderr | Text | Default: "" | Captured standard error |
| return_value | Text | Default: "" | Last line of stdout (for chaining) |
| input_data | Text | Default: "" | INPUT_DATA from previous step |
| agent_notes | Text | Default: "" | Agent's analysis of this result |
| metrics | JSON | Default: {} | {wall_time_seconds, cpu_time_seconds, peak_memory_mb} |

---

## Notes

- All tables auto-created on startup via `Base.metadata.create_all()`
- No migration framework — schema changes require DB reset: `docker-compose down -v && docker-compose up -d`
- Cascade deletes: deleting a Workplace removes all child entities
- UUID PKs generated via `uuid.uuid4()` as strings (not native PostgreSQL UUID type)
- JSON columns use PostgreSQL's native JSON type via SQLAlchemy
