# Delegatic Interfaces (as an OpenSentience Agent)

This document defines the stable **interface surface** for **Delegatic** when running as an OpenSentience Agent.

It specifies:
- canonical tool identifiers (namespaced as `<agent_id>/<tool_name>`)
- tool request/response schemas (JSON-ish, JSON Schema-like)
- emitted signals (facts)
- requested directives (intent / side effects)
- error contracts and safety requirements (secret-free durable records)

Portfolio alignment:
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`
- `Project[&]/project_spec/standards/security-guardrails.md`

---

## 0) Naming, IDs, and compatibility

### 0.1 Canonical tool IDs (namespaced)
OpenSentience Core exposes tools globally as:

- `<agent_id>/<tool_name>`

For Delegatic, assume:

- `agent_id = "com.delegatic.core"`

Canonical tool IDs (v1):
- `com.delegatic.core/delegatic_list_companies`
- `com.delegatic.core/delegatic_describe_company`
- `com.delegatic.core/delegatic_start_mission`
- `com.delegatic.core/delegatic_status`
- `com.delegatic.core/delegatic_cancel_mission`

(Agent-local handler names may omit the prefix; the canonical identifiers are namespaced.)

### 0.2 Correlation and audit linkage fields
Where possible, Delegatic must include portfolio-standard linking fields in signals and durable records:

- `correlation_id` (tie to upstream user request / workflow / mission)
- `causation_id` (optional; immediate upstream cause, e.g., a directive id or event id)
- `subject_type` / `subject_id` (e.g., `delegatic.company`, `delegatic.mission`, `delegatic.mission_step`)

### 0.3 Versioning
- This interface is **v1**.
- Prefer additive changes (new optional fields) over breaking schema changes.
- Breaking changes should use a new tool name (e.g., `delegatic_start_mission_v2`) unless Core supports schema version negotiation.

---

## 1) Tools (Core-routed API)

All tool inputs/outputs MUST be **secret-free** and safe to persist in logs/audit.

### 1.1 `com.delegatic.core/delegatic_list_companies`

List known companies available in the current project context.

#### Input
```json
{ }
```

#### Output
```json
{
  "companies": [
    {
      "company_id": "string",
      "name": "string?",
      "description": "string?",
      "source": {
        "type": "fleetprompt_resource",
        "path": ".fleetprompt/delegatic/company.json"
      },
      "status": "available|invalid_config|disabled",
      "last_validated_at": "string?"
    }
  ]
}
```

#### Semantics
- Companies are discovered from repo-local `.fleetprompt/delegatic/` resources (Core may provide a project context).
- If a company config is invalid, include it with `status = "invalid_config"` and a reason via warnings in tool output or via signals.

---

### 1.2 `com.delegatic.core/delegatic_describe_company`

Describe a specific company configuration and policy constraints.

#### Input
```json
{
  "company_id": "string"
}
```

#### Output
```json
{
  "company": {
    "company_id": "string",
    "name": "string?",
    "description": "string?",
    "agents": [
      {
        "agent_id": "string",
        "role": "string",
        "permissions_override": ["string"]   // optional; subset or overrides as configured
      }
    ],
    "shared_resources": {
      "graphonomous_collections": ["string"],
      "filesystem_paths": ["string"],
      "secrets": ["string"]                 // secret identifiers only; no secret values
    },
    "policies": {
      "max_agents": 10,
      "health_check_interval_ms": 30000,
      "restart_policy": "none|exponential_backoff",
      "tool_allowlist": ["string"],         // canonical tool ids or patterns (policy choice)
      "directive_allowlist": ["string"]     // directive types or patterns
    },
    "source": {
      "type": "fleetprompt_resource",
      "path": ".fleetprompt/delegatic/company.json"
    }
  },
  "validation": {
    "status": "valid|invalid",
    "errors": ["string"],
    "warnings": ["string"]
  }
}
```

#### Semantics
- This tool is read-only.
- It should validate and return actionable errors/warnings (no secrets).

---

### 1.3 `com.delegatic.core/delegatic_start_mission`

Start a mission under a company. A mission is a durable orchestration plan executed as discrete steps.

#### Input
```json
{
  "company_id": "string",
  "goal": "string",
  "idempotency_key": "string?"
}
```

#### Output
```json
{
  "mission_id": "string",
  "company_id": "string",
  "status": "queued|running|succeeded|failed|canceled",
  "created_at": "string",
  "idempotency_key": "string?",
  "correlation_id": "string?",
  "next": {
    "type": "directive_requested|running",
    "directive_id": "string?"
  }
}
```

#### Semantics
- Missions must be **durable** and **auditable**.
- Idempotency:
  - If `idempotency_key` matches a prior mission for the same `company_id` and `goal`, return the existing mission reference.
  - If a matching idempotency key exists with a different goal, return a structured error (`delegatic.idempotency_conflict`).
- Delegatic must not directly perform high-impact side effects from this tool call; instead, it should request directives for steps that cause side effects (see §3).

---

### 1.4 `com.delegatic.core/delegatic_status`

Fetch mission status and a safe, auditable timeline summary.

#### Input
```json
{
  "mission_id": "string"
}
```

#### Output
```json
{
  "mission": {
    "mission_id": "string",
    "company_id": "string",
    "goal": "string",
    "status": "queued|running|succeeded|failed|canceled",
    "created_at": "string",
    "started_at": "string?",
    "finished_at": "string?",
    "idempotency_key": "string?",
    "correlation_id": "string?",
    "error": {
      "code": "string",
      "message": "string",
      "details": { }
    }?
  },
  "timeline": [
    {
      "at": "string",
      "type": "signal|directive|note",
      "name": "string",
      "subject_type": "string?",
      "subject_id": "string?",
      "summary": "string"
    }
  ],
  "steps": [
    {
      "step_id": "string",
      "index": 0,
      "name": "string",
      "status": "pending|running|succeeded|failed|skipped|canceled",
      "started_at": "string?",
      "finished_at": "string?",
      "attempts": 1,
      "last_error": {
        "code": "string",
        "message": "string",
        "details": { }
      }?
    }
  ]
}
```

#### Semantics
- Output must remain secret-free.
- `timeline` is a merged, UI-friendly summary; it should be derivable from emitted signals/directives and internal execution records.

---

### 1.5 `com.delegatic.core/delegatic_cancel_mission`

Request cancellation of a mission.

#### Input
```json
{
  "mission_id": "string"
}
```

#### Output
```json
{
  "mission_id": "string",
  "status": "cancel_requested|canceled|not_cancelable",
  "directive_id": "string?"
}
```

#### Semantics
- Cancellation is best-effort.
- If cancellation requires stopping agents or canceling in-flight executions, Delegatic should request a cancellation directive (see §3).

---

## 2) Signals (facts) emitted by Delegatic

Signals are immutable facts, durable, replayable, and **secret-free**.

### 2.1 `delegatic.company.discovered`
Emitted when a company config is discovered and indexed.

Fields (recommended):
- `company_id`
- `source_path` (repo-relative, e.g. `.fleetprompt/delegatic/company.json`)
- `validation_status` (`valid|invalid`)
- `errors` / `warnings` (safe text)
- `subject_type = "delegatic.company"`, `subject_id = company_id`

### 2.2 `delegatic.mission.created`
Emitted when a mission is created (including idempotent reuse).

Fields:
- `mission_id`
- `company_id`
- `goal` (safe)
- `idempotency_key` (if provided)
- `correlation_id` / `causation_id`
- `subject_type = "delegatic.mission"`, `subject_id = mission_id`

### 2.3 `delegatic.mission.started`
Fields:
- `mission_id`
- `company_id`
- `started_at`
- `correlation_id` / `causation_id`

### 2.4 `delegatic.mission.step.started`
Fields:
- `mission_id`
- `step_id`
- `index`
- `name`
- `attempt`
- `correlation_id` / `causation_id`
- `subject_type = "delegatic.mission_step"`, `subject_id = step_id`

### 2.5 `delegatic.mission.step.succeeded`
Fields:
- `mission_id`
- `step_id`
- `finished_at`
- `outputs_summary` (safe)
- `correlation_id` / `causation_id`

### 2.6 `delegatic.mission.step.failed`
Fields:
- `mission_id`
- `step_id`
- `finished_at`
- `error` (structured, secret-free)
- `will_retry` (boolean)
- `correlation_id` / `causation_id`

### 2.7 `delegatic.mission.succeeded`
Fields:
- `mission_id`
- `company_id`
- `finished_at`
- `correlation_id` / `causation_id`

### 2.8 `delegatic.mission.failed`
Fields:
- `mission_id`
- `company_id`
- `finished_at`
- `error` (structured, secret-free)
- `correlation_id` / `causation_id`

### 2.9 `delegatic.mission.canceled`
Fields:
- `mission_id`
- `company_id`
- `finished_at`
- `correlation_id` / `causation_id`

### 2.10 `delegatic.policy.denied`
Emitted when a requested mission step/action is blocked by policy.

Fields:
- `mission_id` (if applicable)
- `company_id`
- `role` (if applicable)
- `action` (e.g., tool id or directive type)
- `reason` (safe)
- `correlation_id` / `causation_id`

---

## 3) Directives (intent) requested by Delegatic

Delegatic’s core job is orchestration. Orchestration steps often imply side effects (starting agents, invoking tools, writing files, publishing events). Those side effects must be **explicit directives** per portfolio standards.

Delegatic may request directives such as:

### 3.1 `delegatic.mission.perform_step` (recommended baseline)
Requested to perform a concrete mission step that may involve side effects.

Directive payload (secret-free):
- `mission_id`
- `step_id`
- `index`
- `action` (one of):
  - tool invocation request:
    - `tool_id` (namespaced, e.g. `com.fleetprompt.core/fp_run_workflow`)
    - `inputs` (secret-free)
  - event publish request:
    - `topic`
    - `payload` (secret-free)
  - agent lifecycle request (if Delegatic is allowed to control it; often Core-owned):
    - `agent_id`
    - `operation` (`start|stop|restart`)
- `correlation_id` / `causation_id`

Notes:
- Even if Core already audits tool invocations, representing mission step execution as directives preserves a clear “intent boundary” and allows retry/cancellation semantics.

### 3.2 `delegatic.mission.cancel` (recommended)
Requested when cancellation requires external effects (cancel executions, stop agent processes).

Payload:
- `mission_id`
- `reason` (safe)
- `correlation_id` / `causation_id`

### 3.3 `delegatic.company.provision` (future)
If company provisioning includes allocating workspaces, DB schemas, or shared resources, it must be directive-backed.

Payload:
- `company_id`
- requested resources (ids only; no secrets)

---

## 4) Error contract (tools)

All tools should return structured errors with:
- stable machine-readable `code`
- safe human-readable `message` (no secrets)
- optional structured `details` (safe)

### 4.1 Standard error shape
```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": { }
  }
}
```

### 4.2 Error codes (v1)
- `delegatic.invalid_input`
  - schema validation failed (missing fields, wrong types, invalid sizes)
- `delegatic.company_not_found`
  - unknown `company_id`
- `delegatic.company_invalid_config`
  - company config exists but failed validation
- `delegatic.permission_denied`
  - caller lacks required permission (as enforced by Core and/or Delegatic)
- `delegatic.policy_denied`
  - action not allowed by company policy (tool/directive allowlists, role constraints)
- `delegatic.mission_not_found`
  - unknown `mission_id`
- `delegatic.mission_not_cancelable`
  - mission is terminal or cannot be canceled
- `delegatic.idempotency_conflict`
  - `idempotency_key` reused with incompatible parameters
- `delegatic.rate_limited`
  - mission creation or step execution denied due to quotas
- `delegatic.internal_error`
  - unexpected failure (must not leak internals)

---

## 5) Safety defaults (recommended)

### 5.1 Deny-by-default policies
- If a company policy does not explicitly allow a tool/directive, deny it.
- If a role binding is missing or ambiguous, deny it.
- If a permission scope is broad (e.g., `*`), require explicit admin approval (Core policy).

### 5.2 Mission bounds
To prevent runaway orchestration:
- max steps per mission (configurable; e.g., 100)
- max retries per step (configurable; e.g., 5)
- max parallelism per mission (configurable; e.g., 5 concurrent steps)
- max mission runtime (configurable; e.g., 1 hour), after which cancellation is attempted

### 5.3 Secret handling
- Never store secrets in mission state, step inputs/outputs, or timelines.
- If a mission requires secrets (API keys), reference them by secret id, and require a directive runner with access to the secret store.

---

## 6) Capabilities (streaming and cancellation)

If supported by the runtime protocol and Core UI:
- `delegatic_status` should provide incremental progress (streaming) for long missions.
- `delegatic_cancel_mission` should propagate cancellation to in-flight directives/tool executions.
- Delegatic should emit `delegatic.mission.step.*` signals to enable a unified timeline view.

---