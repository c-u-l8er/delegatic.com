# Delegatic Architecture (as an OpenSentience Agent)

Delegatic is the portfolio’s **multi-agent “company” orchestration agent**. It defines and runs *companies* (groups of cooperating agents with roles and policies) and orchestrates work as explicit, auditable intent.

This document defines:
- component boundaries (what OpenSentience Core owns vs what Delegatic owns)
- the company model (roles, policies, shared resources)
- mission orchestration semantics at a high level
- integration points with FleetPrompt, Graphonomous, and the event bus

Portfolio-aligned decisions assumed here:
- **Canonical tool identifiers are namespaced** as `<agent_id>/<tool_name>` via OpenSentience Core routing.
- **Pub/sub permissions are bus-agnostic** using `event:*` (A2A Traffic is the default bus implementation in-portfolio).
- **Repo-first resources**: `.fleetprompt/` in the repo is the source of truth; Core may cache derived indexes under `~/.opensentience/`.

Relevant portfolio standards/specs:
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/security-guardrails.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`
- `Project[&]/project_spec/standards/agent-manifest.md`
- `Project[&]/opensentience.org/project_spec/agent_marketplace.md`
- `Project[&]/opensentience.org/project_spec/portfolio-integration.md`

---

## 1) Component boundaries

### 1.1 OpenSentience Core owns (authoritative)
OpenSentience Core is the **policy enforcement and audit authority**. Core must:

- Install/enable/run/stop Delegatic as a separate agent process.
- Enforce agent permission approvals and tool-call permissions at the ToolRouter boundary.
- Own the system-wide audit log and merge a unified timeline across:
  - signals (facts)
  - directives (intent)
  - executions (work performed)
- Index repo-local `.fleetprompt/delegatic/` resources **without executing code**.
- Provide admin UI visibility and safe controls for:
  - company config validation results
  - company lifecycle (enabled/running/healthy)
  - mission status and history
  - permission approvals / policy mismatches

**Provisioning boundary (recommended):** Core should own high-impact provisioning operations (DB schemas, filesystem sandboxes, secret store setup), because those are privileged system actions. Delegatic should request these as directives rather than performing them directly.

### 1.2 Delegatic agent owns (orchestration plane)
Delegatic is responsible for the **coordination and policy plane**:

- Load/validate company definitions (data-only config).
- Represent missions as durable orchestration state (ideally directives + signals).
- Translate a mission goal into a sequence of explicit actions:
  - tool calls (routed via Core)
  - event bus publish/subscribe setup (if used)
  - FleetPrompt workflow invocations (common path)
  - Graphonomous reads/writes (via Core routing and permissions)
- Enforce company policy constraints (deny-by-default):
  - role → allowed tools
  - role → allowed directive types
  - role → allowed resource scopes (collections, filesystem paths, secrets)
- Emit sufficient facts (signals) to make missions observable and auditable.

Delegatic must not:
- Persist secrets in mission state, signals, directives, or logs.
- Bypass Core enforcement (it should treat Core as authoritative).
- Open inbound network listeners by default.

---

## 2) Core domain model

### 2.1 Company
A **company** is a named coordination unit:
- `company_id` (stable id)
- `agents[]` (agent ids bound to roles)
- `roles[]` (capability constraints)
- `policies` (global constraints and safety bounds)
- `shared_resources` (declared intended shared access)

Companies are declared repo-locally:
- `.fleetprompt/delegatic/company.json` (source of truth)
Core may cache indexed/validated views under `~/.opensentience/`.

### 2.2 Role
A **role** is a policy boundary describing what a member agent is allowed to do within the company context:
- allowed tool identifiers (namespaced `<agent_id>/<tool_name>`, with optional wildcards by policy)
- allowed directives (typed intent identifiers)
- allowed resource scopes (graph collections, filesystem paths, event topic patterns)
- optional limits (max concurrency, max cost per hour/day, etc.)

Roles exist to prevent “confused deputy” behavior during orchestration.

### 2.3 Shared resources
A company can declare shared resources it intends to use:
- Graphonomous collections (by id / scope)
- filesystem sandbox paths (company workspace)
- secret identifiers (references only; no values)
- optional event patterns used for internal coordination

Important: declaring shared resources does not grant permission by itself. It is a configuration intent that must be validated against:
- agent manifests (requested permissions)
- Core-approved permissions (enable-time)
- Delegatic role policies

### 2.4 Mission
A **mission** is a durable orchestration instance:
- `mission_id` (stable id)
- `company_id`
- `goal` (human-readable, secret-free)
- `status`: `pending | running | succeeded | failed | canceled`
- `idempotency_key` (optional; required for safe retries)
- `timeline` (facts + directives + executions linked by correlation fields)

Missions must be representable in the unified audit timeline via:
- `correlation_id` (recommended: use `mission_id` as correlation_id)
- `causation_id` (optional, ties step-to-step)
- `subject_type` / `subject_id` (e.g., `delegatic.mission`, `delegatic.step`)

---

## 3) Delegatic orchestration stance: signals vs directives

Delegatic must preserve the portfolio mental model:

- **Signals (facts)**: immutable records of what happened (validation results, mission state transitions, step outcomes).
- **Directives (intent)**: controlled, typed actions that may have side effects (provision workspace, run workflow, publish event, ingest docs, write files, deploy).

**Rule:** Any step that can cause side effects must cross an explicit directive boundary. Delegatic should:
- request directives rather than performing high-impact actions directly
- return stable references (`directive_id`, `mission_id`) from tools
- emit signals describing outcomes

This provides:
- auditability
- replay safety
- human approval points for high-impact actions
- rate limiting / quota enforcement at Core

---

## 4) Integration points (portfolio)

### 4.1 FleetPrompt (work execution)
Delegatic commonly orchestrates work by invoking FleetPrompt workflows/skills via Core tool routing.

Examples (conceptual):
- Delegatic issues a directive: “run workflow X with inputs Y”
- Core routes to FleetPrompt tool: `com.fleetprompt.core/fp_run_workflow`
- FleetPrompt emits execution lifecycle signals
- Delegatic consumes those signals (or tool results) to decide next steps

Delegatic must not embed FleetPrompt internals; it should treat FleetPrompt as an external agent behind stable interfaces.

### 4.2 Graphonomous (knowledge)
Delegatic can coordinate knowledge access across agents by:
- mapping roles to allowed Graphonomous collection scopes
- ensuring missions only request graph reads/writes consistent with:
  - company shared_resources
  - role policies
  - Core-approved permissions

Graph writes (ingestion, entity changes) remain directive-backed per portfolio stance.

### 4.3 Event bus (A2A Traffic as default implementation)
Delegatic may use an event bus to coordinate asynchronous work:
- publish events for step completion
- subscribe to events to trigger downstream steps

Permissions are bus-agnostic:
- `event:publish:<topic-or-pattern>`
- `event:subscribe:<topic-or-pattern>`

Delegatic should treat event wiring as part of mission intent:
- create subscriptions and publishes explicitly (audited)
- avoid broad wildcard patterns unless explicitly approved by policy

### 4.4 OpenSentience Core (provisioning and governance)
Where provisioning is required (recommended Core-owned):
- workspace directory creation and access grants
- tenant DB schema creation (if used)
- secret store entries and access policies
- quota budgets and kill-switch policies

Delegatic should request these as directives (typed), and Core executes them under operator control and audit.

---

## 5) Security posture (architecture-level)

### 5.1 No secrets in durable artifacts
Delegatic must ensure mission state, logs, directives, and signals remain secret-free.
- Secrets must be referenced by id (from a secret store), not embedded as values.
- Tool inputs/outputs persisted by Core must be redacted best-effort.

### 5.2 Deny-by-default orchestration
If there is ambiguity about permissions, policies, or identity:
- do not proceed
- emit a failure signal with a safe error code
- require explicit operator intervention

### 5.3 Prompt injection posture
Delegatic is a coordination agent and will often be driven by LLM outputs. Defense is architectural:
- no direct side effects without directives
- strict role-based allowlists for tools and directives
- explicit human approval for high-impact directives (Core UI)

### 5.4 Drive-by action protection
Delegatic should not expose network endpoints by default. Any UI surface would be localhost-only and protected (token + CSRF), consistent with Core standards.

---

## 6) Observability and audit timeline requirements

Delegatic must make missions explainable and debuggable:

- emit signals for:
  - company config validated (success/failure)
  - mission created / started / progressed / finished
  - step planned / step dispatched / step completed / step failed
  - policy denials and permission mismatches
- include linking fields:
  - `correlation_id` (mission id)
  - `causation_id` (prior step id, directive id, or triggering event id)
  - `subject_type`/`subject_id` for missions and steps
- provide stable references to:
  - directives created
  - external executions (FleetPrompt execution ids)
  - event ids (from the bus implementation)

---

## 7) MVP boundaries (recommended)

MVP should minimize moving parts while preserving safety boundaries:

1. Load and validate `.fleetprompt/delegatic/company.json`.
2. Start a mission for a company with a small fixed orchestration template:
   - run a FleetPrompt workflow
   - optionally read from Graphonomous
   - optionally publish one event on completion
3. Produce an auditable mission timeline:
   - explicit directives for each side-effectful step
   - signals for all state transitions and outcomes
4. Enforce role-based allowlists (deny-by-default) for tools and directives.

---

## 8) Open decisions (explicit)
These should be resolved before full implementation details:

1. **Provisioning authority:** confirm Core owns provisioning as directives (recommended) vs Delegatic doing it directly (higher risk).
2. **Company schema versioning:** how `company.json` evolves and is validated (version field, migration strategy).
3. **Mission storage location:** Core-owned vs Delegatic-owned storage; preference is Core-owned or Core-queryable for unified audit.
4. **Role policy language:** exact matching rules for tool identifiers and event patterns (wildcards allowed?).
5. **Step execution model:** does Delegatic directly call tools via Core, or always request directives that trigger tool calls?
6. **Concurrency controls:** per-mission and per-company limits, and default quotas.