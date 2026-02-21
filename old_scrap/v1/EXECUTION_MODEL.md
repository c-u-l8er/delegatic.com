# Delegatic Execution Model
## Missions, state machine, idempotency, cancellation, and audit linkage

Delegatic is the portfolio’s **multi-agent “company” orchestration agent**. This document defines how Delegatic missions execute in a way that is:

- permissioned (roles constrain what can be done)
- auditable (timeline can be merged in OpenSentience Core)
- idempotent (safe retries and “double click”)
- cancelable (long-running orchestrations can be stopped)
- compatible with portfolio standards (signals vs directives)

Portfolio alignment:
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`
- `Project[&]/project_spec/standards/security-guardrails.md`
- Canonical tool IDs are namespaced as `<agent_id>/<tool_name>` via Core routing.
- Pub/sub permissions are bus-agnostic: `event:*` (A2A Traffic is one implementation).

---

## 0) Definitions

### 0.1 Mission
A **mission** is a durable orchestration intent that coordinates a set of agents to achieve a goal, under a declared company policy.

A mission is represented as:
- a durable record (mission state + timeline)
- a sequence/graph of **steps** (planned and/or discovered during execution)
- a set of issued **directives** and observed **signals**

### 0.2 Step
A **step** is a unit of orchestration within a mission. Steps may include:
- calling an agent tool (read-only or side-effectful)
- requesting a directive (for side effects)
- waiting for an event/signal (event-driven gating)
- evaluating a condition/policy check

Each step has:
- `step_id` (stable within mission)
- `type` (`tool_call | directive_request | wait_event | evaluate | noop`)
- `status` (`pending | running | succeeded | failed | canceled | skipped`)
- `attempts` (>= 0)
- linking fields to audit timeline (see §6)

### 0.3 Signals and directives (portfolio mental model)
- **Signal** = immutable fact (“what happened”), durable and replayable.
- **Directive** = explicit intent (“do this”), durable, auditable, retryable.

Delegatic must:
- model missions as durable, auditable objects
- ensure side effects occur only via explicit directives (or via Core-wrapped directive boundaries)

---

## 1) Mission record (durable) and required fields

Every mission must produce and maintain a mission record containing (minimum):

- `mission_id` (string; globally unique)
- `company_id` (string)
- `goal` (string; secret-free)
- `created_at` (timestamp)
- `started_at` (timestamp?)
- `finished_at` (timestamp?)
- `status`:
  - `created | planning | running | waiting | succeeded | failed | canceled`
- `actor` (object; best-effort)
  - `type`: `human | agent | system`
  - `id`: stable identity string
- `idempotency_key` (string?; see §4)
- `correlation_id` (string?; tie to upstream user request/session)
- `causation_id` (string?; tie to parent mission/event/directive)
- `policy_snapshot` (object; secret-free)
  - contains the effective policies/role constraints at mission start
- `team_snapshot` (object; secret-free)
  - participating agents and role bindings at mission start
- `timeline` (array of timeline entries; see §6)
- `result` (object?; secret-free summary)
- `error` (object?; structured, secret-free)

Storage location is an implementation decision, but the record must be queryable and mergeable into OpenSentience Core’s unified audit timeline.

---

## 2) Mission state machine (normative)

### 2.1 States
A mission’s lifecycle states are:

- `created`: mission exists, not yet planned or started
- `planning`: Delegatic is creating/validating a plan/step graph
- `running`: Delegatic is executing steps
- `waiting`: mission is blocked waiting for external signals/events (e.g., A2A topics, tool completion)
- `succeeded`: terminal success
- `failed`: terminal failure
- `canceled`: terminal cancellation (user/system requested)

### 2.2 Allowed transitions
Allowed transitions are:

- `created -> planning`
- `planning -> running`
- `planning -> failed` (invalid company config, policy violation, plan cannot be created)
- `running -> waiting` (blocked on events or long-running external work)
- `waiting -> running` (event arrived or condition satisfied)
- `running -> succeeded`
- `running -> failed`
- `waiting -> failed` (timeout exceeded or non-recoverable error)
- `created|planning|running|waiting -> canceled` (cancellation requested)
- `canceled|failed|succeeded` are terminal (no transitions out)

### 2.3 Terminal semantics
Once a mission reaches a terminal state (`succeeded|failed|canceled`):
- no further side effects may be initiated for that mission
- attempts to “resume” must create a new mission (or explicitly use a “rerun” tool that creates a new mission record with a causal link)

---

## 3) Steps, retries, and backoff

### 3.1 Step status model
Each step has a status:

- `pending`: not started
- `running`: in progress
- `succeeded`: completed successfully
- `failed`: completed unsuccessfully (may be retryable based on policy/type)
- `canceled`: aborted due to mission cancellation
- `skipped`: intentionally not executed (policy gating, condition false)

### 3.2 Retry policy (recommended baseline)
Delegatic should support bounded retries for certain step types:

- `tool_call` steps may be retried if:
  - the tool is safe to retry (idempotent or read-only), AND
  - permission checks still pass at run time
- `directive_request` steps should generally not “retry” by duplicating directives.
  - Instead, the directive runner handles retries of execution attempts.
  - Delegatic may re-check directive status and proceed accordingly.

Recommended default parameters (configurable):
- `max_step_attempts`: 3
- backoff: exponential with jitter
  - base 1s, multiplier 2.0, max 30s, jitter ±20%

Non-retryable step failures include:
- permission denied
- policy violation
- schema validation errors in inputs
- explicit “non-retryable” tool error code (if provided)

### 3.3 Step idempotency
Steps must have stable `step_id` values within a mission so:
- restarts can resume
- retries can be tracked
- audit entries can refer to the same step deterministically

---

## 4) Mission idempotency (normative)

### 4.1 Idempotency keys
Mission creation should accept an optional `idempotency_key` (string) provided by the caller.

Rules:
- If a mission is created with the same `company_id` + `idempotency_key` and an existing mission is:
  - **terminal**: return the existing mission reference and result
  - **non-terminal**: return the existing mission reference (do not create duplicate missions)

### 4.2 Conflict rules
If a caller attempts to reuse an `idempotency_key` with materially different inputs, Delegatic must define behavior.

Recommended rule:
- Treat `(company_id, idempotency_key)` as a unique mission identity.
- If an existing mission with that key has a different `goal` (or different declared inputs), return a structured error:
  - `delegatic.idempotency_conflict`
This prevents silent mis-association.

### 4.3 Idempotency propagation to side effects
Delegatic must avoid duplicated side effects via:
- stable step ids
- stable directive idempotency keys for side-effectful actions

For any directive Delegatic requests, it should include a directive-level idempotency key derived from:
- `mission_id`
- `step_id`
- directive type + target

Example (conceptual):
- `directive_idempotency_key = "delegatic:<mission_id>:<step_id>:<directive_type>"`

This ensures retries/restarts do not create duplicate directives.

---

## 5) Cancellation model (normative)

### 5.1 Cancellation request semantics
Cancellation is a first-class capability. A cancellation request:
- is durable and auditable
- transitions mission to `canceled` as soon as possible
- is best-effort for in-flight operations

Cancellation must:
- set `status = canceled`
- set `finished_at`
- record who canceled (`actor`)
- record which steps were canceled vs completed

### 5.2 In-flight work
When cancellation occurs while steps are running:
- `tool_call` steps:
  - attempt to cancel via Core/agent cancellation if supported
  - otherwise mark as “cancel requested” and stop issuing further actions
- `directive_request` steps:
  - if the directive runner supports cancellation, request cancellation
  - otherwise record that directive may still complete, but Delegatic must not act on its completion for this mission

### 5.3 Post-cancel invariants
After mission cancellation:
- no new directives may be created for that mission
- no new tool calls may be initiated under that mission context
- timeline must record final states for all steps (succeeded/failed/canceled/skipped)

---

## 6) Audit linkage and timeline model (normative)

Delegatic must produce a timeline that can be merged with Core’s unified timeline (signals + directives + executions).

### 6.1 Required linking fields
All timeline entries should include:
- `mission_id`
- `company_id`
- `timestamp`
- `event_type` (string)
- `correlation_id` (if known)
- `causation_id` (if known)
- `subject_type` / `subject_id` (recommended)
  - `subject_type = "delegatic.mission"`; `subject_id = mission_id`
  - `subject_type = "delegatic.step"`; `subject_id = step_id`
  - `subject_type = "directive"`; `subject_id = directive_id` (when relevant)

### 6.2 Timeline entry types (recommended)
At minimum, record these entry types (all secret-free):

- `delegatic.mission.created`
- `delegatic.mission.planning.started`
- `delegatic.mission.planning.completed`
- `delegatic.mission.started`
- `delegatic.mission.waiting` (include what it is waiting for, e.g. topic/predicate)
- `delegatic.mission.succeeded`
- `delegatic.mission.failed`
- `delegatic.mission.canceled`

Step-level:
- `delegatic.step.created`
- `delegatic.step.started`
- `delegatic.step.succeeded`
- `delegatic.step.failed` (include safe error code)
- `delegatic.step.canceled`
- `delegatic.step.skipped`

External linkage:
- `delegatic.directive.requested` (include directive type + idempotency key)
- `delegatic.directive.acknowledged` (directive id assigned)
- `delegatic.directive.succeeded|failed|canceled` (observed outcomes)

Tool call linkage (if Delegatic directly invokes tools during orchestration):
- `delegatic.tool_call.started`
- `delegatic.tool_call.succeeded|failed`

### 6.3 Signals vs directives usage within Delegatic
Delegatic should:
- emit signals for facts (mission/step state transitions)
- request directives for side effects (creating runs, writes, deployments, external calls)

Important: even if a downstream tool *appears* to perform a mutation, Delegatic should prefer directive-backed actions, or rely on Core to wrap mutating tool calls in directive boundaries.

---

## 7) Policy enforcement points (execution-time requirements)

Delegatic must enforce policy at multiple times:

### 7.1 Plan-time checks (planning state)
During `planning`, validate:
- company exists and is well-formed
- agents listed are installed/enabled (or at least eligible to run)
- role bindings are valid
- the plan does not require tools/directives disallowed by company policy

Plan-time failures:
- transition mission to `failed` with a structured error and a timeline entry

### 7.2 Run-time checks (running/waiting states)
Before executing a step that causes side effects:
- re-check permissions and policies at run time (TOCTOU safety)
- ensure the tool/directive is still allowed under:
  - company policy
  - agent role constraints
  - Core-approved permissions

Run-time policy failures:
- fail the step
- fail the mission (default) unless policy allows partial success or fallback
- record a clear, secret-free reason

---

## 8) Interaction with A2A (event-driven missions)

Delegatic missions may:
- publish events (bus-agnostic `event:publish:*`)
- subscribe/wait for events (`event:subscribe:*`)

Execution rules:
- Waiting for events transitions mission to `waiting`.
- Event handlers that cause side effects must still be directive-backed.
- Event-driven triggers must be deduped (event `dedupe_key` or `(source, message_id)`), so a redelivered event does not restart or duplicate mission steps.

Recommended approach:
- Treat events as signals (facts) that unblock steps.
- Keep a “seen event ids/dedupe keys” set scoped to `(mission_id, step_id)`.

---

## 9) Error model (structured, secret-free)

Delegatic must use structured errors with:
- stable machine-readable `code`
- safe human-readable `message`
- optional safe `details` object

Recommended error codes (v1):
- `delegatic.company_not_found`
- `delegatic.invalid_company_config`
- `delegatic.policy_violation`
- `delegatic.permission_denied`
- `delegatic.idempotency_conflict`
- `delegatic.mission_not_found`
- `delegatic.mission_already_terminal`
- `delegatic.step_failed`
- `delegatic.timeout`
- `delegatic.canceled`
- `delegatic.internal_error`

Errors must never include secrets (tokens, credentials, cookies, raw auth headers). If errors arise from downstream tools, sanitize them before storing in the mission record/timeline.

---

## 10) Recovery and restart semantics

Delegatic must be restart-safe:
- missions are durable
- steps are durable with stable ids
- after restart, Delegatic can:
  - resume `running` missions by inspecting step state
  - remain in `waiting` until awaited conditions are met
  - avoid duplicate directives/tool calls via idempotency keys

Recovery algorithm (conceptual):
1. Load non-terminal missions (`planning|running|waiting`).
2. For each mission:
   - rehydrate policy snapshot and team snapshot
   - re-check whether any pending directives have completed
   - determine next runnable steps
3. Execute next steps with run-time policy checks.
4. Continue until mission reaches terminal state.

---

## 11) MVP recommendations (to reduce ambiguity)
For the first implementation slice:
- Mission state machine as defined in §2.
- Idempotency keyed by `(company_id, idempotency_key)` as defined in §4.
- Step graph can be a simple ordered list (no branching) in MVP; keep `step_id` stable.
- Side effects are always directive-backed (either Delegatic requests directives or Core wraps mutating actions).
- Cancellation supported for missions and best-effort for in-flight work.
- Timeline entries are emitted for all state transitions and directive linkage.

---

## 12) Open questions (explicit)
1. Does Delegatic itself invoke other agents’ tools directly, or does it only create directives that a Core runner executes?
2. What is the canonical directive type taxonomy for cross-agent actions (e.g., “run FleetPrompt workflow”, “ingest Graphonomous doc”, “publish event”)?
3. How does Delegatic represent “waiting for event” conditions:
   - topic pattern only, or topic + filters, or arbitrary predicates (recommend topic+filters only for MVP)?
4. What is the persistence location and API surface for querying mission timelines from Core UI?
