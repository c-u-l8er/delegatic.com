# Delegatic — Permissions Model (Portfolio-aligned)
## Company orchestration, missions, tool invocation, graph, filesystem, and event scopes

This document defines the permissions model for **Delegatic**, the portfolio’s multi-agent “company” orchestration agent.

It is aligned with portfolio standards and canonical specs:

- `Project[&]/project_spec/standards/agent-manifest.md`
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/security-guardrails.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`
- `Project[&]/opensentience.org/project_spec/agent_marketplace.md`
- `Project[&]/opensentience.org/project_spec/portfolio-integration.md`
- Delegatic architecture/execution docs in this directory:
  - `ARCHITECTURE.md`
  - `EXECUTION_MODEL.md`
  - `INTERFACES.md`

---

## 0) Portfolio decisions this spec assumes (normative)

1. **Bus-agnostic pub/sub permissions**
   - Pub/sub permissions use the `event:*` namespace, regardless of the bus implementation.
   - A2A Traffic is the default in-portfolio bus, but permissions remain `event:*`.

2. **Namespaced tool identifiers**
   - Canonical tool identifiers are `<agent_id>/<tool_name>` as routed by OpenSentience Core.
   - For Delegatic, assume `agent_id = "com.delegatic.core"`, e.g.:
     - `com.delegatic.core/delegatic_start_mission`

3. **Repo-first resources**
   - Repo-local `.fleetprompt/` resources are the source of truth.
   - Core may cache derived indexes under `~/.opensentience/`, but caches are rebuildable.

4. **Core is the policy enforcement authority**
   - OpenSentience Core enforces permissions at the tool routing and directive execution boundaries.
   - Delegatic must still enforce internal policy constraints (defense-in-depth).

5. **No secrets in durable artifacts**
   - Mission state, signals, directives, logs, and tool I/O must be secret-free.
   - Secrets must be referenced by id from a secret store (never embedded as values).

---

## 1) Two permission layers: Core permissions vs Delegatic company policies

Delegatic interacts with two distinct control layers:

### 1.1 OpenSentience Core permissions (authoritative)
Core permissions are approved when an agent is enabled, and enforced when:
- a tool call is routed to an agent
- a directive is executed
- a privileged system action is performed (process spawn, filesystem writes, network egress, etc.)

Delegatic must operate within the set of Core-approved permissions for:
- Delegatic itself (what the Delegatic agent can do)
- each company member agent (what that agent can do)

### 1.2 Delegatic company policy constraints (defense-in-depth)
Within a company, Delegatic applies additional constraints that are often *stricter* than Core permissions:
- role-based tool allowlists
- directive allowlists
- shared resource scoping (collections, filesystem paths, event patterns)
- bounds (concurrency, retries, mission runtime)

**Important:** Company policies do not grant Core permissions. They only restrict what Delegatic will attempt.

---

## 2) Permission taxonomy used by Delegatic (recommended)

Delegatic itself should request only the minimum permissions needed to:
- read company configuration
- request directives
- coordinate mission execution via Core routing
- (optionally) publish/subscribe to events for orchestration

### 2.1 Delegatic domain permissions (recommended portfolio scopes)
These are Delegatic-specific capabilities. Exact taxonomy can live in Core’s permission registry; these strings are recommended:

- `company:read:<company_id_or_scope>`
- `company:create` (optional; only if Delegatic can create companies; MVP often uses repo config instead)
- `company:update:<company_id_or_scope>` (optional)
- `company:delete:<company_id_or_scope>` (optional)

- `mission:start:<company_id_or_scope>`
- `mission:read:<company_id_or_scope>`
- `mission:cancel:<company_id_or_scope>`

If you prefer a smaller surface, you can collapse to:
- `delegatic:company:read`
- `delegatic:mission:start`
- `delegatic:mission:read`
- `delegatic:mission:cancel`

…but the more explicit, scoped form is safer long-term.

### 2.2 Cross-system permissions Delegatic may need
Delegatic orchestrates work across other agents and resources. It may require:

**Tool invocation**
- `tool:invoke:<agent_id>/<tool_name>`
- `tool:invoke:*/<tool_name>` (broad; should be rare and admin-only)

**Graph (Graphonomous)**
- `graph:read:<collection_or_scope>`
- `graph:write:<collection_or_scope>`

**Filesystem**
- `filesystem:read:<glob>`
- `filesystem:write:<glob>`
- `filesystem:execute:<glob>` (high risk; avoid for Delegatic in MVP)

**Events (bus-agnostic)**
- `event:publish:<pattern>`
- `event:subscribe:<pattern>`

**Process**
- `process:spawn` (high risk; ideally Core-only or restricted admin agents)
- `process:signal:*` (high risk; avoid)

**Network**
- `network:egress:<host-or-tag>` (high risk; avoid for Delegatic in MVP unless required)

### 2.3 Secret store (reference-only)
Delegatic must never receive raw secret values in tool I/O or durable state. If a secret store exists, access should be modeled as explicit permissions such as:

- `secrets:read_ref:<scope>` (ability to reference secret ids, not values)
- `secrets:use:<scope>` (ability for a directive runner to use a secret during execution)

If the portfolio does not yet define secret-store permissions, treat this section as a placeholder and enforce “no secret values” as an invariant.

---

## 3) Required permissions per Delegatic tool (Core-routed)

Canonical tool IDs (from `INTERFACES.md`):
- `com.delegatic.core/delegatic_list_companies`
- `com.delegatic.core/delegatic_describe_company`
- `com.delegatic.core/delegatic_start_mission`
- `com.delegatic.core/delegatic_status`
- `com.delegatic.core/delegatic_cancel_mission`

### 3.1 `com.delegatic.core/delegatic_list_companies`
Purpose: list companies visible in the current project context.

Recommended Core permission requirement:
- `company:read:*` (or a project-scoped equivalent)

Notes:
- If companies are repo-local `.fleetprompt/delegatic/company.json`, Core can optionally perform indexing and supply Delegatic a filtered list.
- Tool output should be filtered to only those companies the caller is authorized to view.

### 3.2 `com.delegatic.core/delegatic_describe_company`
Purpose: show config + validation for one company.

Recommended Core permission requirement:
- `company:read:<company_id>` (or covering scope)

### 3.3 `com.delegatic.core/delegatic_start_mission`
Purpose: create a durable mission and begin orchestration.

Recommended Core permission requirement:
- `mission:start:<company_id>`

Additional constraints:
- Delegatic must validate that the company config is valid and that the plan can be executed without violating:
  - company policies
  - Core-approved permissions (at least at a coarse level)
- Any side-effectful work must cross an explicit directive boundary (see Section 5).

### 3.4 `com.delegatic.core/delegatic_status`
Purpose: read mission status and timeline summary.

Recommended Core permission requirement:
- `mission:read:<company_id>` or `mission:read:*` (admin)

MVP recommendation: allow `mission:read:<company_id>`.

### 3.5 `com.delegatic.core/delegatic_cancel_mission`
Purpose: request cancellation.

Recommended Core permission requirement:
- `mission:cancel:<company_id>`

Notes:
- Cancellation is best-effort. Delegatic may need to request cancellation directives for in-flight work.

---

## 4) Company policy constraints (role-based allowlists)

Delegatic policies are “internal guardrails” that prevent confused-deputy behavior even when Core permissions are broad.

### 4.1 Role → tool allowlist
A role should define which tools a member agent (or Delegatic acting on behalf of that role) may invoke.

Recommended representation (policy-level, not Core permission strings):
- allowlist entries should be canonical tool identifiers:
  - `com.fleetprompt.core/fp_run_workflow`
  - `com.graphonomous.core/graph_search`
- wildcard patterns may be supported, but should be treated as high-risk:
  - `com.fleetprompt.core/*` (broad)
  - `*/fp_run_workflow` (very broad; avoid)

Delegatic must deny any attempted tool invocation that is not explicitly allowed by:
- role tool allowlist
- company tool allowlist (if present)

### 4.2 Role → directive allowlist
A role should define which directive types may be requested/executed as part of missions.

Example directive types (portfolio-level, conceptual):
- `delegatic.mission.perform_step`
- `fleetprompt.execution.run`
- `graphonomous.ingest.perform`
- `event.publish`
- `workspace.provision` (Core-owned provisioning)
- `filesystem.write` (Core-owned or tightly controlled)

Delegatic should treat directive allowlists as strict:
- if not allowed, do not request the directive
- emit a `delegatic.policy.denied` signal (secret-free) and fail the mission/step unless policy allows fallback

### 4.3 Shared resource scopes
A company may declare shared resources; policy should restrict usage to these declared scopes:

- Graphonomous collections allowed for the company
- Filesystem paths allowed for the company workspace
- Event patterns allowed for publish/subscribe
- Secret ids allowed to be referenced

Delegatic must ensure planned steps do not exceed these scopes.

---

## 5) Enforcement points (who checks what, when)

### 5.1 OpenSentience Core (mandatory enforcement)
Core must enforce:
1. Agent enablement and approved permissions at tool routing time
2. Tool invocation permission (e.g., `tool:invoke:com.fleetprompt.core/fp_run_workflow`)
3. Resource permissions (filesystem/network/process/etc.) at the execution boundary
4. Directive execution permission at run time (TOCTOU safe)
5. Audit logging of all privileged actions (redacted, secret-free)

### 5.2 Delegatic (defense-in-depth enforcement)
Delegatic must enforce:
- company config validation
- role/policy allowlists for tools and directives
- company shared resource constraints
- mission bounds (max steps, retries, concurrency, runtime)
- deny-by-default when identity/authorization is ambiguous

Delegatic must also re-check policy at run time (not just plan time), because:
- policies may change between mission creation and later steps
- permissions may be revoked

### 5.3 Time-of-check vs time-of-use (TOCTOU)
For any step that triggers side effects:
- check policy + permissions at request time (when directive is created or tool call is planned)
- check again at execution time (when directive is run or tool is invoked)

If permissions are revoked mid-mission:
- the next step should fail with a structured `permission_denied` outcome
- the mission should transition to `failed` or `canceled` based on operator action/policy

---

## 6) Permissions for orchestration actions (practical guidance)

Delegatic can orchestrate in two common ways:

### 6.1 Mode A: Delegatic calls tools directly (less preferred)
Delegatic invokes other agents’ tools via Core routing.

Required Delegatic permissions:
- `tool:invoke:<target_agent>/<target_tool>` for each invoked tool
- plus any additional capabilities if Delegatic itself performs side effects (avoid)

Risks:
- Delegatic becomes a “super-agent” if it has broad tool invocation scopes.

### 6.2 Mode B: Delegatic requests directives; Core runs them (recommended)
Delegatic requests typed directives describing intended actions.
Core (or a runner) executes them with proper permission enforcement.

Required Delegatic permissions:
- ability to request mission/step directives (portfolio-specific directive permission model; if directives are Core-owned, Delegatic may only need tool invocation for its own tools)

Benefits:
- clearer intent boundaries
- centralized enforcement and audit
- easier operator approvals for high-impact actions

---

## 7) Event permissions in Delegatic missions (bus-agnostic)

If Delegatic uses events for coordination:
- publish requires `event:publish:<pattern>`
- subscribe requires `event:subscribe:<pattern>`

Guidance:
- Prefer narrow patterns (e.g., `campaign.analysis.complete`) over broad (e.g., `campaign.*`).
- Treat `event:subscribe:*` and `event:publish:*` as admin-only scopes.

Delegatic should also:
- dedupe event-driven triggers using event `dedupe_key` / `(source, message_id)`
- ensure event handlers that cause side effects remain directive-backed

---

## 8) Filesystem permissions and workspace model

Delegatic should not require broad filesystem access. Recommended approach:
- Core provisions a company workspace directory (directive-backed provisioning).
- Member agents (not Delegatic) receive restricted filesystem permissions for that workspace.

If Delegatic must read company config from the repo:
- It should rely on Core indexing, or request narrow reads:
  - `filesystem:read:<project>/.fleetprompt/delegatic/**` (exact glob depends on Core’s path conventions)

Avoid:
- `filesystem:write:**` (too broad)
- `filesystem:execute:**` (high risk)

---

## 9) Graph permissions (Graphonomous integration)

Delegatic itself typically does not need to read/write the graph unless it performs knowledge operations as part of orchestration.

Preferred approach:
- Member agents (or FleetPrompt workflows) perform graph operations with their own permissions.

If Delegatic performs graph calls directly:
- require `graph:read:<collection>` and/or `graph:write:<collection>` as needed
- writes must be directive-backed per portfolio stance

---

## 10) Manifest recommendations (`opensentience.agent.json`) for Delegatic

Delegatic should request the minimum viable permissions in its own manifest.

Recommended baseline (MVP-ish):
- `company:read:*` (or project-scoped)
- `mission:start:*`
- `mission:read:*`
- `mission:cancel:*`

Optional, only if required by your implementation:
- `event:publish:<narrow_patterns>`
- `event:subscribe:<narrow_patterns>`
- `tool:invoke:<specific_tools>` (avoid broad wildcards)

Strongly discouraged for Delegatic:
- broad filesystem write/execute
- broad network egress
- process spawning

---

## 11) Audit and secrecy requirements (permission-adjacent)

Even with correct permissions:
- do not persist secrets in mission goal, steps, inputs, outputs, or errors
- reference secrets by id only
- sanitize downstream tool errors before writing into mission timelines

Audit records should support unified timeline merging by including:
- `correlation_id` (recommended: `mission_id`)
- `causation_id` (step/directive/event linkage)
- `subject_type`/`subject_id` for missions and steps

---

## 12) Open questions (explicit)
1. What is the canonical, portfolio-wide directive type taxonomy for cross-agent actions (run workflow, ingest docs, publish event, provision workspace)?
2. How should `tool:invoke:*` wildcards be handled (allowed at all, or admin-only)?
3. Should Delegatic’s permissions be company-scoped (`mission:start:<company_id>`) or project-scoped (derived from repo context)?
4. Do we allow Delegatic to manage agent lifecycle (start/stop/restart), or is that always Core-only?
