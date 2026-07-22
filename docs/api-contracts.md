# API Contracts — Orchestrator

Base URL: `http://localhost:8005/api`

All endpoints require JWT auth (`Authorization: Bearer <token>`) except where noted.

---

## Authentication (no auth required)

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| POST | `/auth/register` | Register new user | `{username, password}` | `{access_token, token_type}` |
| POST | `/auth/login` | Login | `{username, password}` | `{access_token, token_type}` |
| GET | `/auth/me` | Get current user | — | `{id, username, created_at}` |

---

## Health

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/health` | Health check | `{status: "ok"}` |

---

## Workplaces

Prefix: `/workplaces`

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| POST | `/workplaces` | Create workplace | `{name, description?}` | WorkplaceResponse |
| GET | `/workplaces` | List user's workplaces | — | WorkplaceResponse[] |
| GET | `/workplaces/{id}` | Get workplace detail | — | WorkplaceResponse |
| PUT | `/workplaces/{id}` | Update workplace | `{name?, description?, status?, config?}` | WorkplaceResponse |
| DELETE | `/workplaces/{id}` | Delete workplace | — | 204 |
| GET | `/workplaces/{id}/dashboard` | Dashboard stats | — | DashboardResponse |

**WorkplaceResponse:** `{id, name, description, owner_id, status, config, created_at, updated_at}`

**DashboardResponse:** `{workplace_id, workplace_name, unit_count, execution_count, last_run, status_summary}`

---

## Units of Work

Prefix: `/workplaces/{workplace_id}/units`

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| POST | `/units` | Create unit | `{name, description?, type?, config?, retry_policy?, enabled?}` | UnitResponse |
| GET | `/units` | List units | — | UnitResponse[] |
| GET | `/units/{uid}` | Get unit detail | — | UnitResponse (with steps) |
| PUT | `/units/{uid}` | Update unit | `{name?, description?, type?, config?, retry_policy?, enabled?}` | UnitResponse |
| DELETE | `/units/{uid}` | Delete unit | — | 204 |
| POST | `/units/{uid}/run` | Run unit (background) | — | `{id, status: "pending", ...}` |
| POST | `/units/{uid}/test` | Test run (synchronous) | — | `{execution, results[]}` |

**UnitResponse:** `{id, workplace_id, name, description, type, config, retry_policy, enabled, order, step_count, steps[], created_at, updated_at}`

### Steps

Prefix: `/workplaces/{workplace_id}/units/{unit_id}/steps`

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| GET | `/steps` | List steps | — | StepResponse[] |
| POST | `/steps` | Create step | `{name, order?, script?, mode?, timeout?}` | StepResponse |
| POST | `/steps/suggest-snippets` | AI snippet suggestions | `{name, mode?, order?}` | `{snippets: [{title, description, code}]}` |
| PUT | `/steps/reorder` | Reorder steps | `{step_ids: [id, id, ...]}` | `{ok: true}` |
| PUT | `/steps/{sid}` | Update step | `{name?, script?, mode?, timeout?}` | StepResponse |
| DELETE | `/steps/{sid}` | Delete step | — | 204 |

**StepResponse:** `{id, unit_id, name, order, script, mode, timeout, created_at}`

**Route ordering:** `/steps/suggest-snippets` and `/steps/reorder` must be registered before `/steps/{sid}`

---

## Executions

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| GET | `/workplaces/{id}/executions` | List executions (workspace-scoped) | ExecutionSummary[] |
| GET | `/workplaces/{id}/executions/active` | List running executions | ExecutionSummary[] |
| GET | `/executions/{eid}` | Get execution detail | ExecutionDetail |

**ExecutionSummary:** `{id, workplace_id, unit_id, unit_name, pipeline_id, agent_id, trigger_type, status, started_at, finished_at, retry_count, created_at}`

**ExecutionDetail:** ExecutionSummary + `{step_results: StepResultResponse[], agent_context}`

**StepResultResponse:** `{id, step_id, step_name, status, started_at, finished_at, stdout, stderr, return_value, input_data, agent_notes, metrics}`

**Route ordering:** `/executions/active` must be registered before `/executions/{eid}`

---

## Agent

Prefix: `/workplaces/{workplace_id}/agent`

| Method | Endpoint | Description | Request Body | Response |
|--------|----------|-------------|-------------|----------|
| GET | `/agent` | Get agent config | — | AgentConfig |
| PUT | `/agent` | Update agent config | `{name?, system_prompt?, model?, temperature?, max_tokens?, enabled?}` | AgentConfig |
| POST | `/agent/invoke` | Manually invoke agent | `{event_type?, payload?}` | AgentResponse |
| GET | `/agent/history` | Agent decision history | — | `{decisions: MemoryEntry[], count}` |
| POST | `/agent/chat` | Chat with agent | `{message}` | AgentResponse |

**AgentConfig:** `{id, workplace_id, name, model, system_prompt, capabilities, temperature, max_tokens, enabled, created_at}`

**AgentResponse:** `{response, actions_taken: [{tool, arguments, result}], iterations, error}`

---

## Memory

Prefix: `/workplaces/{workplace_id}/memory`

| Method | Endpoint | Description | Query Params | Request Body | Response |
|--------|----------|-------------|-------------|-------------|----------|
| GET | `/memory/search` | Semantic search | `q` (required), `top_k` (default 5) | — | `{results: MemoryEntry[]}` |
| GET | `/memory/stats` | Memory statistics | — | — | `{total, by_source_type, workplace_id}` |
| GET | `/memory` | List memories | `source_type?`, `limit?` | — | `{memories: MemoryEntry[]}` |
| POST | `/memory` | Add manual entry | `{content, source_type?, metadata?}` | MemoryEntry |
| DELETE | `/memory/{mid}` | Delete memory | — | — | 204 |

**MemoryEntry:** `{id, content, metadata: {source_type, workplace_id, ...}}`

**Route ordering:** `/memory/search` and `/memory/stats` must be registered before `/memory/{mid}`

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| Auth endpoints | 10 requests/minute |
| General API | 60 requests/minute |
| Rate limit exceeded | 429 with Retry-After header |

## Error Responses

All errors return JSON:

```json
{"detail": "Error message description"}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing/invalid token) |
| 403 | Forbidden (not workspace owner) |
| 404 | Resource not found |
| 429 | Rate limited |
| 500 | Internal server error |
