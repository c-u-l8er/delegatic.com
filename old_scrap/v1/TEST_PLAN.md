# Delegatic — Test Plan
## Focus: config validation, policy enforcement, idempotency, cancellation, and audit integrity

This test plan defines the minimum test coverage for **Delegatic**, the portfolio’s multi-agent “company” orchestration agent.

Primary themes:
- **Config validation** (safe indexing, schema correctness, no secrets)
- **Policy enforcement** (deny-by-default; roles constrain tools/directives/resources)
- **Idempotency** (mission idempotency, step idempotency, directive idempotency)
- **Cancellation** (best-effort cancel with correct terminal mission state)
- **Audit integrity** (signals/directives/executions link into a unified, secret-free timeline)

Portfolio alignment:
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`
- `Project[&]/project_spec/standards/security-guardrails.md`
- Tool naming: canonical tool IDs are namespaced as `<agent_id>/<tool_name>`
- Event permissions are bus-agnostic: `event:publish:*`, `event:subscribe:*`
- Repo-first resources: `.fleetprompt/` in the repo is the source of truth (Core may cache derived indexes under `~/.opensentience/`)

Related Delegatic specs:
- `Project[&]/delegatic.com/project_spec/ARCHITECTURE.md`
- `Project[&]/delegatic.com/project_spec/INTERFACES.md`
- `Project[&]/delegatic.com/project_spec/EXECUTION_MODEL.md`
- (If present) `Project[&]/delegatic.com/project_spec/PERMISSIONS.md`
- (If present) `Project[&]/delegatic.com/project_spec/SECURITY.md`
- (If present) `Project[&]/delegatic.com/project_spec/RESOURCE_SURFACES.md`

---

## 0) Assumptions and invariants

### 0.1 Canonical tool IDs (namespaced)
Delegatic’s tools are routed by OpenSentience Core as namespaced identifiers:
- `com.delegatic.core/delegatic_list_companies`
- `com.delegatic.core/delegatic_describe_company`
- `com.delegatic.core/delegatic_start_mission`
- `com.delegatic.core/delegatic_status`
- `com.delegatic.core/delegatic_cancel_mission`

Downstream tools referenced by Delegatic policies/steps must also be namespaced, e.g.:
- `com.fleetprompt.core/fp_run_workflow`
- `com.graphonomous.core/graph_search`
- `com.a2atraffic.core/a2a_publish` (implementation detail; permissions are `event:*`)

### 0.2 Durable artifacts must be secret-free
Delegatic must never persist secrets in:
- company config caches
- mission records
- mission step state
- emitted signals
- requested directives
- logs and audit-visible outputs

Secrets must be referenced by id only (e.g., `secret_id`), not embedded.

### 0.3 Deny-by-default
If any of the following are ambiguous or missing, Delegatic must fail closed:
- company config validity
- role binding and role policies
- tool/directive allowlists
- permission scopes required for the action
- tenant/project/company scoping

---

## 1) Unit tests — company config validation (`.fleetprompt/delegatic/company.json`)

These tests ensure company configs are safe-to-index (no code execution), structurally valid, and policy-relevant constraints are expressible and enforceable.

### 1.1 JSON parse and schema validation
Cases:
- Valid JSON with required fields -> `valid`.
- Invalid JSON -> `invalid` with actionable error.
- Missing required fields (`company_id`, `agents`, `policies`) -> `invalid`.
- Unknown top-level keys:
  - Decide behavior: warning or error (recommended: warning for forward-compat, error for fields that change semantics).
- Empty arrays / nulls:
  - `agents: []` should be `invalid` (no agents to orchestrate), unless explicitly permitted for “placeholder” companies.

Assertions:
- Validation errors are structured, human readable, and do not include secrets.
- Validation does not require executing any agent code.

### 1.2 Path and traversal safety
If the config includes paths (e.g., workspace paths), validate:
- Reject absolute paths unless explicitly allowed by policy.
- Reject traversal sequences: `../`, `..`, `\`, null bytes.
- Reject paths outside allowed company workspace scope.

### 1.3 Agent and role binding validation
Cases:
- Duplicate agent ids or duplicate role bindings -> invalid (or warning, but must be deterministic).
- Missing role for an agent -> invalid.
- Unknown role referenced -> invalid.

Assertions:
- `delegatic_describe_company` returns `validation.status = invalid` and includes errors.

### 1.4 Policies schema validation
Cases:
- Policy fields like `max_agents`, `health_check_interval_ms`, `restart_policy`:
  - invalid types (string for int) rejected
  - invalid enum values rejected
- tool allowlist syntax:
  - Ensure namespaced tool ids match an expected pattern (must contain `/` and non-empty segments).
  - Reject whitespace and traversal characters.

### 1.5 Shared resources schema validation
Cases:
- Graphonomous collections list contains invalid ids -> invalid.
- `secrets` list contains values that look like secrets (e.g., starts with `sk-`) rather than secret identifiers -> invalid or warning (recommend invalid).
- `filesystem_paths` not within allowed workspace -> invalid.

### 1.6 “No secrets in config” checks
Cases:
- Insert known secret-like keys anywhere in config (case-insensitive):
  - `api_key`, `token`, `authorization`, `cookie`, `password`, `private_key`, `client_secret`
Expected:
- Validation fails (recommended) or redacts and warns (riskier). Prefer fail-fast for config files.

Assertions:
- No secret-like values are echoed in error messages.

---

## 2) Integration tests — policy enforcement (roles, allowlists, resource scopes)

These tests ensure Delegatic can never be used as a confused deputy.

### 2.1 Deny-by-default tool allowlist
Setup:
- Company policy tool allowlist includes only:
  - `com.fleetprompt.core/fp_run_workflow`
Scenario:
- Mission plan attempts to call:
  - `com.graphonomous.core/graph_ingest` (not allowlisted)
Expected:
- Delegatic blocks the action.
- Emits a signal (or timeline entry) equivalent to `delegatic.policy.denied` with safe reason.
- Mission either fails or skips step based on policy (MVP recommendation: fail mission).

### 2.2 Role-based tool restrictions
Setup:
- Role `content_creator` can call FleetPrompt workflows only.
- Role `analyst` can call Graphonomous read tools only.
Scenario:
- Agent bound to `analyst` attempts to run a write tool:
  - `com.graphonomous.core/graph_ingest`
Expected:
- Denied (policy + permissions).
- Denial is auditable.

### 2.3 Directive allowlist enforcement
Setup:
- Company directive allowlist does not include `delegatic.company.provision`.
Scenario:
- Mission attempts to request that directive.
Expected:
- Denied, with structured error code.
- No directive created.

### 2.4 Resource scope enforcement (graph collections)
Setup:
- `shared_resources.graphonomous_collections = ["project:alpha:customer_docs"]`
- Role allows graph reads only within that set.
Scenario:
- Mission step requests `graph_search` across an out-of-scope collection.
Expected:
- Denied (policy and/or permission mismatch).
- Ensure “partial success” behavior is explicit:
  - recommended: reject the step if any requested collection is unauthorized.

### 2.5 Resource scope enforcement (filesystem paths)
Setup:
- Shared filesystem paths are restricted to `/companies/company-123/**`.
Scenario:
- Step attempts to write outside the allowed scope (even via a downstream tool).
Expected:
- Denied at orchestration time if possible (Delegatic policy).
- Denied at execution time by Core permissions as well (defense-in-depth).
- Mission records reflect denial without revealing target sensitive paths beyond safe summary.

### 2.6 Event bus policy enforcement (bus-agnostic)
Setup:
- Role permits publishing only to `event:publish:campaign.*`
Scenario:
- Step attempts publish to `billing.invoice.paid`
Expected:
- Denied, auditable.

---

## 3) Integration tests — mission idempotency and step idempotency

### 3.1 `idempotency_key` reuse returns existing mission (terminal)
Scenario:
1. Start mission with `company_id=X`, `goal=G`, `idempotency_key=K` -> returns `mission_id=M1`.
2. Wait until mission completes (succeeded/failed/canceled).
3. Start mission again with same `company_id=X`, `goal=G`, `idempotency_key=K`.
Expected:
- Returns `mission_id=M1` (or a stable reference to the original).
- No new side effects initiated.
- Timeline includes a record indicating idempotent reuse.

### 3.2 `idempotency_key` reuse returns existing mission (non-terminal)
Scenario:
1. Start mission with K -> mission is running.
2. Start again with same K.
Expected:
- Returns same mission reference; does not spawn duplicates.
- No duplicate directives or tool calls are issued.

### 3.3 Idempotency conflict detection
Scenario:
1. Start mission with `idempotency_key=K`, `goal=G1`.
2. Start mission with same `idempotency_key=K`, `goal=G2` (different).
Expected:
- Error `delegatic.idempotency_conflict`.
- No new mission created.

### 3.4 Step idempotency and restart safety
Scenario:
- Start mission that creates deterministic step ids.
- Simulate Delegatic restart mid-run (or reload mission state).
Expected:
- Delegatic resumes without creating duplicate steps.
- Step ids remain stable.
- No duplicate directives for the same step are created.

### 3.5 Directive idempotency per step
Scenario:
- A side-effectful step requests a directive with derived idempotency key.
- Simulate retry or restart.
Expected:
- Only one directive is created for that step.
- Retries observe existing directive status rather than creating a new one.

---

## 4) Cancellation tests (mission and in-flight work)

### 4.1 Cancel queued mission
Scenario:
- Create mission, keep it in `created|planning|queued` state.
- Call `delegatic_cancel_mission`.
Expected:
- Mission transitions to `canceled`.
- No directives are created.
- Timeline includes cancellation request and final cancellation state.

### 4.2 Cancel running mission with in-flight tool calls
Scenario:
- Mission has a running step that involves a long-running downstream execution.
- Cancel mission.
Expected:
- Delegatic:
  - stops scheduling new steps
  - requests cancellation for in-flight work (if supported) via a cancellation directive or downstream cancel tool
- Mission becomes terminal `canceled` with `finished_at`.
- Timeline includes:
  - cancel requested
  - cancellation propagated (best effort)
  - mission canceled

### 4.3 Cancel while waiting for event
Scenario:
- Mission is in `waiting` state for an event/topic.
- Cancel mission.
Expected:
- Mission transitions to `canceled`.
- Subscriptions (if created specifically for this mission) are cleaned up or at least ignored, with auditable record of cleanup.

### 4.4 Cancellation idempotency
Scenario:
- Cancel the same mission multiple times.
Expected:
- Stable response (`already_canceled` or same terminal state).
- No repeated side effects.
- Timeline does not grow unbounded (avoid spamming identical entries).

---

## 5) Audit integrity tests (signals/directives/executions linkage)

These tests ensure Delegatic produces a coherent, mergeable timeline without leaking secrets.

### 5.1 Timeline completeness
Scenario:
- Run a mission with multiple steps including at least:
  - one tool call (read-only)
  - one directive-backed step (side effect)
Expected:
- Timeline includes:
  - mission created
  - mission started
  - each step started
  - each step finished (succeeded/failed/skipped/canceled)
  - mission finished (terminal)
- Every entry includes:
  - timestamp
  - mission_id
  - subject_type/subject_id (recommended)
  - correlation_id (recommended; mission_id is acceptable as correlation_id)

### 5.2 Correlation and causation linkage
Scenario:
- A step triggers a directive, then a downstream execution emits signals.
Expected:
- Causation links exist to tie:
  - step -> directive_id
  - directive -> downstream execution id (e.g., FleetPrompt execution_id) where available
- This linkage is sufficient for Core UI to render an end-to-end chain.

### 5.3 Secret-free audit invariants
Scenario:
- Provide mission goal/inputs that include secret-like strings (user error).
Expected:
- Delegatic refuses the mission or redacts/blocks persistence of secret material.
- No secret-like values appear in:
  - mission record
  - step record
  - timeline entries
  - emitted signals
  - directive payloads
- Error messages do not echo secrets back.

### 5.4 Policy denial auditability
Scenario:
- Attempt a disallowed tool/directive.
Expected:
- A policy denial fact exists (signal and/or timeline entry) with:
  - what was denied (tool_id or directive type)
  - why (safe reason)
  - under which policy/role (safe identifiers)
- No denied action is executed.

---

## 6) Failure mode tests (robustness, retries, and bounds)

### 6.1 Downstream tool failure classification
Scenario:
- A downstream tool call fails with:
  - retryable transient error
  - non-retryable validation error
Expected:
- Delegatic retry behavior matches policy:
  - tool_call steps: bounded retries for retryable failures only
  - directive-backed steps: do not duplicate directives; observe directive retry attempts instead
- Mission ends in correct state:
  - succeeded if recovery occurs
  - failed if non-recoverable

### 6.2 Rate limits / quotas (if implemented)
Scenario:
- Create missions in a tight loop to exceed configured limits.
Expected:
- Delegatic rejects new missions with `delegatic.rate_limited` (or equivalent).
- Rejections are auditable.

### 6.3 Step and mission bounds
Scenario:
- Provide a mission plan that would exceed:
  - max steps
  - max runtime
  - max parallelism
Expected:
- Delegatic denies or truncates in a deterministic, auditable way.
- Mission fails with a clear, secret-free error code (e.g., `delegatic.policy_violation` or `delegatic.timeout`).

---

## 7) Event-driven orchestration tests (optional / if used in MVP)

### 7.1 Wait-for-event gating
Scenario:
- Mission step waits for topic `deploy.*.success` with filters.
- Publish matching event.
Expected:
- Mission transitions `waiting -> running`.
- The event unblocks exactly one step (deduped by event dedupe key/message id).

### 7.2 Event redelivery dedupe safety
Scenario:
- Same event redelivered (same dedupe key).
Expected:
- Mission does not execute the unblocked step twice.
- Deduped receipt is auditable (optional but recommended).

---

## 8) Acceptance criteria (MVP)
Delegatic MVP passes if:

1. **Config validation**
   - Invalid company configs are rejected with actionable errors.
   - Config indexing does not execute code.
   - No secrets allowed in company config.

2. **Policy enforcement**
   - Deny-by-default tool/directive allowlists are enforced.
   - Role/resource scopes constrain actions; no confused deputy behavior.

3. **Idempotency**
   - Mission idempotency works for both terminal and running missions.
   - Step/directive idempotency prevents duplicate side effects on retries/restarts.

4. **Cancellation**
   - Cancellation transitions missions to terminal `canceled` and stops new work.
   - Best-effort propagation of cancellation is recorded.

5. **Audit integrity**
   - Mission timelines are complete, linkable (correlation/causation), and secret-free.
   - Denials and failures are visible and explainable without leaking sensitive data.

---

## 9) Open questions (tests to add once decided)
- Exact `company.json` schema versioning and migration behavior (test backward/forward compatibility).
- Whether Delegatic directly invokes tools vs only requests directives for step execution (test both paths if both supported).
- Formal permission taxonomy for company provisioning and shared resource access (add coverage once stabilized).
- Standardized handler/tool naming for event-driven callbacks (if used).