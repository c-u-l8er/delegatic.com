# Delegatic — Security Spec
## Policy gating, prompt injection posture, secret handling, and drive-by protections

Delegatic is the portfolio’s **multi-agent “company” orchestration agent**. Its primary risk surface is not raw computation—it's **coordination power**: deciding what other agents do, when, and with which privileges/resources.

This document defines Delegatic’s security posture and non-negotiable invariants, aligned to portfolio standards:

- `Project[&]/project_spec/standards/security-guardrails.md`
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`
- Canonical tool identifiers are namespaced as `<agent_id>/<tool_name>` via Core routing.
- Pub/sub permissions are bus-agnostic using `event:*` (A2A Traffic is the default bus implementation in-portfolio).
- Repo-first resources: `.fleetprompt/` in the repo is the source of truth; Core may cache derived indexes under `~/.opensentience/`.

---

## 0) Non-negotiable invariants

1. **No secrets in durable artifacts**
   - Delegatic must never persist secrets in:
     - mission records / step state
     - signals
     - directives
     - logs
     - company config
   - Secrets must be referenced by **id** (from a dedicated secret store), never embedded as raw values.

2. **Side effects require explicit intent**
   - Delegatic must not directly perform high-impact side effects from model-driven reasoning or chat tool calls.
   - Side-effectful operations must cross an explicit **directive boundary** (portfolio standard).

3. **Deny-by-default**
   - If Delegatic cannot prove an action is allowed (policy, permission, identity, scope), it must deny it.
   - “Best guess” behavior is prohibited.

4. **Least privilege + role constraints**
   - Orchestration must constrain each agent’s actions by role-based allowlists.
   - Broad wildcard permissions and “do anything” roles must require explicit operator approval at enable-time and be visibly labeled as high risk.

5. **Local-first / no drive-by**
   - Delegatic must not expose network listeners by default.
   - If any UI or HTTP surface is added later, it must be localhost-only and protected against drive-by actions (token + CSRF), consistent with Core requirements.

---

## 1) Threat model (what we assume will happen)

### 1.1 Prompt injection and adversarial instructions
Attackers can embed malicious instructions into:
- user prompts
- retrieved knowledge (Graphonomous)
- event payloads (event bus)
- agent outputs (“tool result injection”)

Goal: trick Delegatic into issuing dangerous directives or invoking privileged tools.

**Mitigation:**
- Treat all text inputs as untrusted.
- Require explicit directive boundaries for side effects.
- Enforce strict policy gating (roles/tools/directives/resources).
- Require human confirmation for high-impact actions (via Core UI).

### 1.2 Confused deputy / privilege escalation
A low-privileged agent tries to indirectly cause a high-privileged action by having Delegatic request it.

**Mitigation:**
- Company policies constrain allowed tool ids, directive types, event patterns, filesystem/graph scopes.
- Core enforces approved permissions at routing/runtime.
- Delegatic re-checks policies at plan-time and run-time (TOCTOU defense).

### 1.3 Secret exfiltration / persistence
Secrets might leak into durable mission state via:
- “goal” text
- tool inputs/outputs
- event payloads
- error messages

**Mitigation:**
- Enforce secret-free constraints on all persisted fields.
- Redact or block known secret keys and secret-like patterns in logs and records.
- Store secrets only in a dedicated secret store; reference by id.

### 1.4 Drive-by actions (localhost web attacks)
Even “localhost-only” endpoints can be triggered by:
- malicious websites via browser requests
- other local processes

**Mitigation:**
- Delegatic should not host a web server.
- Any future UI is Core-owned and must enforce token + CSRF and deny permissive CORS.
- Delegatic tools must be safe even if invoked unintentionally: permission/policy checks prevent side effects without explicit intent.

### 1.5 Abuse / cost explosion
Missions can recursively schedule tool calls or event wiring, causing runaway compute or expensive operations.

**Mitigation:**
- Hard bounds: max steps, max retries, max parallelism, max runtime.
- Quotas/rate limits at Core boundary for high-cost operations.
- Audit visibility and kill-switch: operator can cancel missions and disable agents/integrations quickly.

---

## 2) Policy gating model (security-critical)

Delegatic security relies on **layered gating**. All must pass.

### 2.1 Identity and context gating
Delegatic must always know:
- the caller identity (human/agent/system)
- the company context (`company_id`)
- the mission context (`mission_id`, `correlation_id`)
- the role bindings for participating agents

If any of these are missing/ambiguous: deny.

### 2.2 Company config validation gating
Before a company can be used:
- `.fleetprompt/delegatic/company.json` must validate successfully
- configuration must be safe to index (data only; no code execution)
- declared agents/roles/policies must be internally consistent

Invalid company config must:
- prevent mission start
- emit a validation failure signal (secret-free) for UI visibility

### 2.3 Role-based tool allowlists (required)
Roles must constrain tool invocations by canonical tool id:
- allowlist entries should match `<agent_id>/<tool_name>`
- wildcard patterns (if supported) must be tightly controlled

Recommended baseline rule:
- If a tool id is not explicitly allowlisted for the role, deny.

### 2.4 Directive allowlists (required)
Roles (or company policy) must constrain which directive types Delegatic is allowed to request:
- e.g., `delegatic.mission.perform_step`, `delegatic.mission.cancel`
- plus any cross-agent action directive taxonomy you adopt

Recommended baseline rule:
- If a directive type is not explicitly allowlisted, deny.

### 2.5 Resource scope allowlists (required)
Policies must constrain the scope of resources referenced by steps:
- Graph collections (Graphonomous)
- filesystem paths (workspaces)
- event patterns (publish/subscribe)
- secret identifiers (references only)

Any step that references a resource outside allowlisted scopes must be denied.

### 2.6 Plan-time and run-time enforcement
Delegatic must enforce policies:
- **Plan-time**: reject plans requiring disallowed actions.
- **Run-time**: re-check before executing each step (TOCTOU defense).

If a previously-allowed action becomes disallowed (permissions revoked, policy changed):
- fail the step
- fail or cancel the mission (default: fail, unless policy provides fallback)
- record a denial event with safe metadata

---

## 3) Directive boundaries (how Delegatic avoids unsafe side effects)

### 3.1 What counts as a side effect in Delegatic orchestration
Side effects include (non-exhaustive):
- starting/stopping/restarting agents
- running workflows/skills that write to disk, deploy, send messages, or call external services
- publishing events that trigger external effects downstream
- provisioning workspaces, DB schemas, or shared resources
- writing any data outside Delegatic’s own durable mission record store (and even that must be safe)

### 3.2 Required stance
Delegatic must not:
- perform these side effects directly as a result of untrusted text (prompt, event payload, retrieved document)

Delegatic should instead:
- request a **typed directive** for the side-effectful step
- include a stable directive idempotency key
- rely on a directive runner (Core-owned recommended) to execute under operator governance

### 3.3 Human approval points
Delegatic should classify directives into risk tiers (policy-driven), for example:
- low: read-only tool calls, internal routing changes with minimal risk
- medium: writing within a sandbox/workspace
- high: network egress, deployments, permission grants, secret access

High-impact directives should require explicit human confirmation via Core UI, regardless of model output.

---

## 4) Prompt injection posture (untrusted text everywhere)

### 4.1 Sources of untrusted instructions
Delegatic must treat the following as untrusted:
- user messages
- mission goal text (even if user-supplied)
- tool results from other agents
- Graphonomous retrieved content and citations
- event payloads and event metadata
- error messages and stack traces from other agents

### 4.2 Controls
Delegatic must ensure:
- mission planning uses strict schemas and allowlists, not “freeform” tool selection
- any “plan” generated by an LLM is treated as a proposal requiring:
  - validation against policy
  - explicit step typing
  - directive boundaries for side effects

### 4.3 Anti-exfiltration stance
Delegatic must never:
- ask other agents to reveal secrets
- include secret values in tool inputs/outputs that could be persisted
- copy raw sensitive materials into mission state

If a mission requires secrets:
- store them in a secret store, and reference by secret id
- use a directive runner with controlled access to retrieve the secret at execution time

---

## 5) Secret handling and redaction

### 5.1 “No secrets in durable artifacts” enforcement
Delegatic must enforce secret-free durability for:
- mission `goal` (reject if it contains likely secrets; or require user to remove)
- step inputs/outputs stored in mission records
- timeline entries
- signals and directives
- logs and errors

### 5.2 Best-effort detection (defense in depth)
Delegatic should block or redact:
- keys (case-insensitive): `api_key`, `apikey`, `token`, `access_token`, `refresh_token`, `authorization`, `cookie`, `set-cookie`, `password`, `secret`, `private_key`, `client_secret`
- common secret-like patterns:
  - `Bearer ...`
  - PEM blocks (`-----BEGIN ... PRIVATE KEY-----`)
  - high-entropy tokens (heuristic; be conservative to avoid false positives)

Important:
- Redaction is a last line of defense. Primary defense is: do not put secrets into mission content at all.

### 5.3 Error sanitization
Downstream agent errors may include sensitive content (paths, headers, tokens).
Delegatic must:
- sanitize errors before persisting them in mission state or emitting them as signals
- prefer error codes and short safe messages
- store full internal errors only in ephemeral, local-only debugging logs if necessary (and even then, redact secrets)

---

## 6) Event bus security (bus-agnostic `event:*`)

Delegatic may coordinate missions using events (A2A Traffic as default implementation).

### 6.1 Permissions
Delegatic must treat all publish/subscribe actions as permissioned:
- publish requires `event:publish:<topic-or-pattern>`
- subscribe requires `event:subscribe:<topic-or-pattern>`

### 6.2 Topic/pattern minimization
- Avoid broad wildcard subscriptions (e.g., `event:subscribe:*`) unless explicitly approved for an admin/system role.
- Prefer narrow patterns and explicit filters.

### 6.3 Event payload safety
- Treat event payloads as untrusted input.
- Do not persist full payloads into mission records unless they are validated as secret-free and bounded in size.
- Prefer storing:
  - event id
  - topic
  - dedupe key / message_id
  - safe metadata summary
  - correlation linkage

### 6.4 Dedupe and replay safety
- Event-driven steps must be idempotent.
- Delegatic should track “seen” events per step (by `dedupe_key` or `(source, message_id)`), so redelivery does not duplicate work.

---

## 7) Drive-by protection and network posture

### 7.1 No inbound network listeners by default
Delegatic should not run an HTTP server or accept inbound connections in MVP.

If Delegatic ever adds a UI:
- it must be Core-owned or must follow the same rules as Core:
  - bind to `127.0.0.1`
  - require an auth token for state-changing actions
  - enable CSRF protection
  - deny clickjacking (frame-ancestors 'none')
  - do not enable permissive CORS
  - audit all privileged actions

### 7.2 Outbound network calls
Delegatic should generally not require outbound network access.
If it does (future integrations):
- require explicit allowlisted egress permissions
- never log request headers containing secrets
- prefer executing network effects via directives in a runner with clear auditing

---

## 8) Operational controls (abuse prevention)

Delegatic must include bounds and kill switches.

### 8.1 Mission bounds (recommended defaults)
Configurable limits, enforced at run time:
- max steps per mission (e.g., 100)
- max retries per step (e.g., 3–5)
- max parallel steps (e.g., 5)
- max mission runtime (e.g., 1 hour)
- max “waiting” time for an event (e.g., 24 hours; then fail or cancel)

### 8.2 Rate limiting / quotas
Enforce via Core and/or Delegatic:
- mission creation rate per actor
- step execution rate
- downstream cost controls (LLM calls, network egress) at Core boundary

### 8.3 Kill switch
Operators must be able to:
- cancel a mission (best-effort cancellation)
- disable the Delegatic agent or specific companies/policies quickly
- disable event-driven triggers if they cause loops

All such actions must be audited.

---

## 9) Security-relevant audit requirements

Delegatic must ensure the unified audit timeline can answer:
- who started the mission
- which policies were applied (policy snapshot, secret-free)
- which steps were planned and executed
- which directives were requested and their outcomes
- which denials occurred and why
- what external agents/tools were involved

### 9.1 Audit linkage fields
Every emitted signal and stored record should include, where applicable:
- `correlation_id` (recommended: mission_id)
- `causation_id` (optional)
- `subject_type` / `subject_id`
  - `delegatic.mission:<mission_id>`
  - `delegatic.step:<step_id>`
  - `directive:<directive_id>` (when relevant)

---

## 10) Minimum security tests (acceptance criteria)

Delegatic security is acceptable (MVP) if:
1. **Policy gating works**
   - disallowed tool ids/directive types are denied
   - disallowed resource scopes are denied
   - denials are auditable and secret-free

2. **Directive boundaries are respected**
   - side effects are not performed directly from mission start in chat/tool calling flows
   - directives are used for side-effectful steps

3. **No secrets persist**
   - secret-like values are rejected or redacted before mission persistence
   - no secrets appear in signals, directives, or mission timeline records

4. **Drive-by posture is safe**
   - Delegatic runs with no inbound listeners by default
   - state-changing actions require Core-enforced auth and CSRF if exposed via UI

5. **Event-driven safety**
   - event subscriptions/publishes are permissioned (`event:*`)
   - event redelivery does not duplicate mission steps (dedupe)

---

## 11) Open decisions (explicit)
These should be resolved before implementing advanced orchestration:
1. Role policy language details (wildcards allowed for tool ids/event patterns? exact matcher?)
2. Which directive taxonomy is canonical for cross-agent side effects (Core-owned list vs Delegatic-defined)
3. Default redaction policy: reject-on-secret vs redact-and-continue (portfolio preference is reject for high-confidence secrets)
4. How mission storage is implemented (Core-owned vs Delegatic-owned), and the exact query API for Core UI
5. Whether Delegatic ever needs outbound network access, or whether all network side effects are always delegated to other agents via directives