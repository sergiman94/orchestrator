# Orchestrator — Technical Specifications

## 1. Data Model

### 1.1 Core Entities

#### User
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| username | VARCHAR(255) | Unique, indexed |
| password_hash | VARCHAR(255) | bcrypt |
| created_at | DATETIME | |

#### Workplace
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR(255) | |
| description | TEXT | |
| owner_id | FK -> User | |
| status | ENUM | active, paused, archived |
| config | JSONB | Workspace-level settings |
| created_at | DATETIME | |
| updated_at | DATETIME | |

#### UnitOfWork
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| name | VARCHAR(255) | |
| description | TEXT | |
| type | ENUM | script, http_request, llm_call, transform, condition |
| script | TEXT | Python code (for script type) |
| config | JSONB | Type-specific config |
| timeout | INT | Seconds, default 300 |
| retry_policy | JSONB | {max_retries, delay, backoff_multiplier} |
| enabled | BOOLEAN | |
| order | INT | Position in default sequence |
| mode | ENUM | independent, chained |
| created_at | DATETIME | |
| updated_at | DATETIME | |

#### Pipeline
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| name | VARCHAR(255) | |
| description | TEXT | |
| trigger_config | JSONB | Cron expression, webhook config, event pattern |
| enabled | BOOLEAN | |
| created_at | DATETIME | |

#### PipelineStep
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| pipeline_id | FK -> Pipeline | |
| unit_id | FK -> UnitOfWork | |
| order | INT | |
| condition | JSONB | Optional: run only if previous output matches |
| on_failure | ENUM | stop, skip, retry, ask_agent |

#### Agent
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | One-to-one in MVP |
| name | VARCHAR(255) | |
| model | VARCHAR(100) | e.g., "claude-sonnet-4-20250514" |
| system_prompt | TEXT | Base instructions |
| capabilities | JSONB | What agent can do |
| temperature | FLOAT | |
| max_tokens | INT | |
| enabled | BOOLEAN | |
| created_at | DATETIME | |

#### Asset
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| name | VARCHAR(255) | |
| type | ENUM | database, api, aws_service, storage, custom |
| config | JSONB | Connection strings, endpoints |
| credentials | TEXT | Fernet-encrypted |
| health_status | ENUM | healthy, degraded, unreachable, unknown |
| last_checked | DATETIME | |
| created_at | DATETIME | |

#### Channel
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| name | VARCHAR(255) | |
| type | ENUM | slack, email, webhook, queue, log |
| config | JSONB | Webhook URL, Slack token, etc. |
| direction | ENUM | inbound, outbound, bidirectional |
| created_at | DATETIME | |

#### MemoryEntry
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| source_type | ENUM | execution, agent_decision, user_input, observation, error_pattern |
| source_id | VARCHAR(255) | FK to source entity |
| content | TEXT | Raw text |
| metadata | JSONB | Tags, relevance scores |
| created_at | DATETIME | |
| expires_at | DATETIME | Optional TTL |

*Note: Embeddings stored in ChromaDB, not in PostgreSQL.*

#### Event
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| type | VARCHAR(100) | e.g., "unit.completed", "agent.decision" |
| source_type | ENUM | unit, channel, agent, system, user |
| source_id | UUID | |
| payload | JSONB | |
| created_at | DATETIME | |

#### Execution
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| workplace_id | FK -> Workplace | |
| pipeline_id | FK -> Pipeline | Nullable |
| unit_id | FK -> UnitOfWork | Nullable (if single unit run) |
| agent_id | FK -> Agent | Nullable |
| trigger_type | ENUM | cron, manual, event, agent, webhook |
| status | ENUM | pending, running, completed, failed, cancelled, retrying |
| started_at | DATETIME | |
| finished_at | DATETIME | |
| retry_count | INT | |
| agent_context | JSONB | What agent saw/decided |
| created_at | DATETIME | |

#### StepResult
| Field | Type | Notes |
|---|---|---|
| id | UUID | Primary key |
| execution_id | FK -> Execution | |
| unit_id | FK -> UnitOfWork | |
| status | ENUM | pending, running, completed, failed, skipped |
| started_at | DATETIME | |
| finished_at | DATETIME | |
| stdout | TEXT | |
| stderr | TEXT | |
| return_value | TEXT | |
| input_data | TEXT | For chained units |
| agent_notes | TEXT | Agent's analysis |
| metrics | JSONB | Duration, memory, CPU |

### 1.2 Relationships

```
User (1) ----< (N) Workplace
Workplace (1) ----< (N) UnitOfWork
Workplace (1) ----< (N) Pipeline
Workplace (1) ---- (1) Agent         [MVP, later 1:N]
Workplace (1) ----< (N) Asset
Workplace (1) ----< (N) Channel
Workplace (1) ----< (N) MemoryEntry
Workplace (1) ----< (N) Event
Workplace (1) ----< (N) Execution
Pipeline (1) ----< (N) PipelineStep >---- (1) UnitOfWork
Execution (1) ----< (N) StepResult >---- (1) UnitOfWork
```

## 2. AI Agent Specification

### 2.1 Invocation Pattern

The agent is a **supervisory controller** using Claude's tool_use feature. It is NOT a chatbot (though it can chat). It receives structured context and responds with tool calls.

### 2.2 Trigger Events

| Event | Agent Action |
|---|---|
| unit.failed | Analyze error, check memory for patterns, decide: retry/skip/alert |
| unit.completed (anomaly) | Check if output deviates from historical norm |
| channel.inbound | Process incoming message, decide action |
| schedule (periodic) | Review workplace health, summarize patterns |
| user.request | Respond to user question about the workplace |

### 2.3 Context Assembly (~50K tokens)

```
1. System prompt                          ~2K tokens
2. Workplace config + description         ~1K tokens
3. Current event/trigger                  ~2K tokens
4. RAG: top 5 relevant memory entries     ~5K tokens
5. Recent execution history (last 5)      ~5K tokens
6. Assets/channels summary               ~1K tokens
7. Tool definitions                       ~3K tokens
8. Reasoning budget                       ~31K tokens
```

### 2.4 Agent Tools

| Tool | Parameters | Description |
|---|---|---|
| execute_unit | unit_id, params_override? | Run a unit of work |
| retry_unit | execution_id, step_index, modified_params? | Retry a failed step |
| skip_step | execution_id, step_index, reason | Skip and continue |
| send_to_channel | channel_id, message, severity? | Send to channel |
| query_memory | query, top_k?, time_range? | RAG search |
| store_observation | content, tags[] | Add to memory |
| check_asset | asset_id | Health check |
| modify_unit_config | unit_id, config_changes | Temp config change |
| get_execution_history | unit_id?, last_n?, status? | Get history |
| alert_user | message, severity, actions[] | Escalate to human |

### 2.5 Safety Constraints

- Max retry count enforced (prevent infinite loops)
- All agent actions logged and auditable
- Destructive actions require human approval in MVP
- Rate limit: max N agent invocations per hour per workplace
- Token budget enforced per invocation

## 3. Shared Memory Specification

### 3.1 Storage

- **ChromaDB** in embedded mode (no separate server for MVP)
- One collection per workplace: `workplace_{id}`
- Cosine similarity for retrieval
- Default embedding: sentence-transformers (local, no API cost)

### 3.2 Auto-Ingestion Rules

| Trigger | Memory Content |
|---|---|
| Execution completes | "{unit_name} completed in {duration}s. Output: {first_200_chars}" |
| Execution fails | "{unit_name} failed: {error_type}: {error_message}. Context: {relevant_config}" |
| Agent makes decision | "Agent decided to {action} because {reasoning}. Result: {outcome}" |
| Schema change detected | "Output of {unit_name} changed: {field} type {old} -> {new}" |
| User adds annotation | User text stored directly |

### 3.3 Retrieval

Before every agent invocation:
1. Build query from current event context
2. Retrieve top-5 relevant memories (cosine similarity)
3. Include in agent prompt under "Relevant History"

### 3.4 Lifecycle

- **Creation**: Automatic on events, manual via API
- **TTL**: Optional `expires_at` for ephemeral entries
- **Compaction** (future): Summarize old entries into patterns

## 4. Event System Specification

### 4.1 Event Types

```
system.startup
workplace.created | .updated | .paused
unit.started | .completed | .failed | .skipped | .retrying
pipeline.started | .completed | .failed
agent.invoked | .decision | .error
channel.inbound | .outbound
asset.health_changed
memory.stored | .pruned
cron.tick
```

### 4.2 Event Bus

- Redis pub/sub
- Channels: `workplace:{id}:events`, `workplace:{id}:agent`, `workplace:{id}:ui`
- Events persisted to PostgreSQL (Event table) for audit

### 4.3 Event Flow

```
Source emits event
  -> Stored in Event table
  -> Published to Redis
  -> Subscribers:
     1. Agent service (evaluate, maybe invoke)
     2. Channel dispatcher (route to configured channels)
     3. UI streamer (push to frontend via SSE/WebSocket)
     4. Memory service (store execution summaries)
```

## 5. API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Workplaces
- `GET/POST /api/workplaces`
- `GET/PUT/DELETE /api/workplaces/{id}`
- `GET /api/workplaces/{id}/dashboard`

### Units of Work
- `GET/POST /api/workplaces/{id}/units`
- `GET/PUT/DELETE /api/workplaces/{id}/units/{uid}`
- `POST /api/workplaces/{id}/units/{uid}/run`
- `POST /api/workplaces/{id}/units/{uid}/test`

### Pipelines
- `GET/POST /api/workplaces/{id}/pipelines`
- `GET/PUT/DELETE /api/workplaces/{id}/pipelines/{pid}`
- `POST /api/workplaces/{id}/pipelines/{pid}/run`

### Agent
- `GET/PUT /api/workplaces/{id}/agent`
- `POST /api/workplaces/{id}/agent/invoke`
- `GET /api/workplaces/{id}/agent/history`
- `WS /api/workplaces/{id}/agent/chat`

### Assets
- `GET/POST /api/workplaces/{id}/assets`
- `PUT/DELETE /api/workplaces/{id}/assets/{aid}`
- `POST /api/workplaces/{id}/assets/{aid}/check`

### Channels
- `GET/POST /api/workplaces/{id}/channels`
- `PUT/DELETE /api/workplaces/{id}/channels/{cid}`
- `POST /api/workplaces/{id}/channels/{cid}/test`

### Memory
- `GET /api/workplaces/{id}/memory`
- `GET /api/workplaces/{id}/memory/search?q=...`
- `POST /api/workplaces/{id}/memory`
- `DELETE /api/workplaces/{id}/memory/{mid}`

### Executions
- `GET /api/workplaces/{id}/executions`
- `GET /api/workplaces/{id}/executions/active`
- `GET /api/executions/{eid}`
- `GET /api/executions/{eid}/stream`

### Events
- `GET /api/workplaces/{id}/events`
- `GET /api/workplaces/{id}/events/stream`

## 6. Configuration

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/orchestrator

# Redis
REDIS_URL=redis://localhost:6379/0

# Auth
JWT_SECRET=change-me
JWT_EXPIRATION_HOURS=24

# AI Agent
ANTHROPIC_API_KEY=sk-ant-...
AGENT_MODEL=claude-sonnet-4-20250514
AGENT_MAX_TOKENS=4096
AGENT_TEMPERATURE=0.3

# Memory
CHROMADB_PATH=./data/chromadb

# Executor
SANDBOX_MODE=false
MAX_MEMORY_MB=512

# Notifications
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# App
TIMEZONE=UTC
OUTPUT_DIR=./data/outputs
```
