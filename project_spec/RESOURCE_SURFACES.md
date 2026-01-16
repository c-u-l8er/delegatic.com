# Delegatic Resource Surfaces (`.fleetprompt/delegatic/`)
## Company configuration (`company.json`), schemas, and validation rules

This document defines the **repo-local**, safe-to-index resource formats that Delegatic consumes (directly or via OpenSentience Core indexing) to configure multi-agent “companies”.

It is designed to align with portfolio standards:

- **Repo-first resources**: `.fleetprompt/` in the project repo is the **source of truth**.
- **Safe indexing**: OpenSentience Core can index/validate these resources **without executing code**.
- **No secrets in durable artifacts**: configs must not contain secret values; only references/ids.
- **Namespaced tool identifiers**: canonical tool ids are `<agent_id>/<tool_name>` when routed by Core.
- **Bus-agnostic event permissions**: pub/sub use `event:publish:<pattern>` / `event:subscribe:<pattern>`.

Related specs:
- `Project[&]/delegatic.com/project_spec/ARCHITECTURE.md`
- `Project[&]/delegatic.com/project_spec/INTERFACES.md`
- `Project[&]/delegatic.com/project_spec/EXECUTION_MODEL.md`
- `Project[&]/project_spec/standards/agent-manifest.md`
- `Project[&]/project_spec/standards/security-guardrails.md`
- `Project[&]/project_spec/standards/signals-and-directives.md`
- `Project[&]/project_spec/standards/tool-calling-and-execution.md`

---

## 0) Scope and non-goals

### In scope
- Directory layout under `.fleetprompt/delegatic/`
- `company.json` schema (v1): company, agents, roles, policies, shared resources
- Validation rules: what Core/Delegatic must reject (and why)

### Out of scope
- Runtime protocol details
- Exact directive taxonomy across the portfolio (only referenced here)
- Secrets storage format (handled by a secret store; this config only references ids)

---

## 1) Directory layout

Delegatic configuration lives under:

- `.fleetprompt/delegatic/`

Minimum viable layout:

- `.fleetprompt/delegatic/company.json` (required if using Delegatic for this project)
- `.fleetprompt/delegatic/README.md` (optional human notes)

Future (optional) extensions (version-gated):
- `.fleetprompt/delegatic/roles/*.json` (split roles/policies into multiple files)
- `.fleetprompt/delegatic/templates/*.json` (mission templates)
- `.fleetprompt/delegatic/policies.json` (shared policy bundles)

Rule: Indexing these files must require **no code execution** and **no network calls**.

---

## 2) `company.json` (v1)

### 2.1 Purpose
`company.json` defines a “company”:
- which agents participate
- what roles they play
- what they are allowed to do (tool/directive allowlists)
- what shared resources exist (collections, filesystem paths, secret ids)
- global policy limits (max agents, concurrency, budgets, etc.)

### 2.2 Canonical location
- `.fleetprompt/delegatic/company.json`

### 2.3 Top-level schema (v1)

Top-level object fields:

Required:
- `version` (integer): must be `1`
- `company_id` (string): stable identifier
- `agents` (array): participating agents with role bindings
- `roles` (array): role definitions used by `agents[*].role`

Optional:
- `name` (string)
- `description` (string)
- `shared_resources` (object)
- `policies` (object)
- `tags` (array of strings)
- `metadata` (object): arbitrary secret-free metadata for UI grouping (must be JSON-safe and small)

#### Example (v1)

```Project[&]/delegatic.com/project_spec/RESOURCE_SURFACES.md#L63-155
{
  "version": 1,
  "company_id": "marketing-automation-co",
  "name": "Marketing Automation Company",
  "description": "AI company that runs marketing campaigns",
  "tags": ["marketing", "automation"],
  "agents": [
    {
      "agent_id": "com.fleetprompt.core",
      "role": "worker",
      "permissions_override": [
        "filesystem:read:~/Projects/**",
        "filesystem:write:~/Projects/**"
      ]
    },
    {
      "agent_id": "com.graphonomous.core",
      "role": "knowledge",
      "permissions_override": [
        "graph:read:project:my_project:customer_docs",
        "graph:write:project:my_project:customer_docs"
      ]
    },
    {
      "agent_id": "com.a2atraffic.core",
      "role": "event_bus",
      "permissions_override": [
        "event:publish:campaign.*",
        "event:subscribe:campaign.*"
      ]
    }
  ],
  "roles": [
    {
      "role_id": "worker",
      "description": "Runs FleetPrompt workflows and reads repo resources",
      "tool_allowlist": [
        "com.fleetprompt.core/fp_run_workflow",
        "com.fleetprompt.core/fp_run_skill",
        "com.fleetprompt.core/fp_validate_project_resources"
      ],
      "directive_allowlist": [
        "fleetprompt.execution.run",
        "fleetprompt.execution.cancel"
      ],
      "resource_scopes": {
        "filesystem": [
          { "read": ["~/Projects/**"], "write": ["~/Projects/**"] }
        ],
        "graph": [
          { "read": ["project:my_project:*"], "write": [] }
        ],
        "events": [
          { "publish": ["campaign.*"], "subscribe": ["campaign.*"] }
        ],
        "secrets": []
      }
    },
    {
      "role_id": "knowledge",
      "description": "Reads and writes to Graphonomous collections",
      "tool_allowlist": [
        "com.graphonomous.core/graph_search",
        "com.graphonomous.core/graph_ingest",
        "com.graphonomous.core/graph_list_collections"
      ],
      "directive_allowlist": [
        "graphonomous.ingest.perform"
      ],
      "resource_scopes": {
        "graph": [
          { "read": ["project:my_project:customer_docs"], "write": ["project:my_project:customer_docs"] }
        ]
      }
    },
    {
      "role_id": "event_bus",
      "description": "Routes events for the company (A2A Traffic agent)",
      "tool_allowlist": [
        "com.a2atraffic.core/a2a_publish",
        "com.a2atraffic.core/a2a_subscribe",
        "com.a2atraffic.core/a2a_list_subscriptions",
        "com.a2atraffic.core/a2a_unsubscribe"
      ],
      "resource_scopes": {
        "events": [
          { "publish": ["campaign.*"], "subscribe": ["campaign.*"] }
        ]
      }
    }
  ],
  "shared_resources": {
    "graphonomous_collections": ["project:my_project:customer_docs"],
    "filesystem_paths": ["~/Projects/my_project/**"],
    "secrets": ["SOCIAL_API_KEY_ID", "ANALYTICS_TOKEN_ID"]
  },
  "policies": {
    "max_agents": 10,
    "max_missions_running": 3,
    "max_steps_per_mission": 100,
    "max_parallel_steps_per_mission": 5,
    "default_step_max_attempts": 3,
    "health_check_interval_ms": 30000
  }
}
```

Notes:
- `permissions_override` entries are permission strings to be reconciled with Core approvals; they must not include secrets.
- `shared_resources.secrets` contains secret **identifiers**, not values.

---

## 3) Detailed schema definitions

### 3.1 `company_id` rules
`company_id` must be:
- stable (treat as part of audit history; avoid renames)
- safe for filesystem/database labels

Recommended constraints:
- length: 1–64
- allowed: lowercase letters, digits, `-`, `_`
- must start with a letter

Invalid examples:
- `../prod`
- `MarketingCo`
- `marketing co`

### 3.2 `agents[]` schema
Each entry in `agents`:

Required:
- `agent_id` (string): stable reverse-DNS agent id (matches `opensentience.agent.json` `id`)
- `role` (string): must refer to a defined `roles[*].role_id`

Optional:
- `permissions_override` (array of strings): requested/declared permissions for this company context
- `enabled` (boolean): default `true`
- `notes` (string): human notes, secret-free

Rules:
- `permissions_override` MUST NOT grant permissions by itself.
- Core must reconcile:
  - agent manifest requested permissions
  - approved permissions (enable-time)
  - company role policies/resource scopes
  - `permissions_override` (if used)
- If `permissions_override` contains permission strings not present in the agent manifest, treat as invalid (recommended) or warn-and-ignore (acceptable but must be consistent).

### 3.3 `roles[]` schema
Each role object:

Required:
- `role_id` (string): stable identifier (same constraints as `company_id`, but may be shorter)
Optional:
- `description` (string)
- `tool_allowlist` (array of strings): canonical tool ids and/or patterns
- `directive_allowlist` (array of strings): allowed directive types and/or patterns
- `resource_scopes` (object): fine-grained scope intent for filesystem, graph, events, secrets
- `limits` (object): optional per-role operational limits

#### 3.3.1 Tool allowlist format
`tool_allowlist` entries must use canonical namespaced tool ids:
- `<agent_id>/<tool_name>`
Examples:
- `com.fleetprompt.core/fp_run_workflow`
- `com.graphonomous.core/graph_search`

Patterns (optional, higher risk) may be allowed if explicitly supported:
- `com.fleetprompt.core/*`
- `*/fp_validate_project_resources`

If pattern matching is not implemented, reject patterns and require exact ids.

#### 3.3.2 Directive allowlist format
Delegatic orchestrates via directives. `directive_allowlist` entries are strings identifying directive types, such as:
- `fleetprompt.execution.run`
- `graphonomous.ingest.perform`
- `a2a.delivery.perform`
- `delegatic.mission.perform_step`

Directive type naming should be stable and documented; unknown directive types should be rejected (preferred) or warned (acceptable for MVP).

### 3.4 `resource_scopes` schema (role-level, optional)
`resource_scopes` is a declarative constraint set. It should be interpreted as **role policy intent** that must match (be a subset of) Core-approved permissions.

Allowed keys:
- `filesystem` (array)
- `graph` (array)
- `events` (array)
- `secrets` (array of strings)

#### 3.4.1 Filesystem scopes
Each filesystem scope entry:
- `{ "read": [glob...], "write": [glob...] }`
Where globs follow the portfolio filesystem permission convention.

Example:
- `"filesystem": [{ "read": ["~/Projects/**"], "write": ["~/Projects/my_project/**"] }]`

#### 3.4.2 Graph scopes
Each graph scope entry:
- `{ "read": [collection_scope...], "write": [collection_scope...] }`

Example:
- `"graph": [{ "read": ["project:my_project:*"], "write": ["project:my_project:customer_docs"] }]`

#### 3.4.3 Event scopes (bus-agnostic)
Each event scope entry:
- `{ "publish": [pattern...], "subscribe": [pattern...] }`

Example:
- `"events": [{ "publish": ["campaign.*"], "subscribe": ["campaign.*"] }]`

Patterns must follow the portfolio event pattern matcher rules (at minimum dot-separated with `*` single-segment wildcard).

#### 3.4.4 Secrets scopes
`secrets` is an array of secret identifiers (strings) that this role may reference.
- Secret **values** must not appear anywhere in config.
- Secret ids must be opaque strings (e.g., `STRIPE_API_KEY_ID`, `secret:company:marketing:stripe`).

### 3.5 `shared_resources` schema (company-level, optional)
`shared_resources` declares intended shared resources for the company context.

Fields (all optional):
- `graphonomous_collections` (array of strings)
- `filesystem_paths` (array of strings)
- `secrets` (array of strings)

Rules:
- These declarations do not grant permissions; they are validated against:
  - role resource scopes
  - agent manifest permissions + Core approvals
- Core may use `shared_resources` to provision resources (recommended Core-owned provisioning) via directives.

### 3.6 `policies` schema (company-level, optional)
`policies` contains operational limits and guardrails.

Recommended fields (all optional):
- `max_agents` (integer)
- `max_missions_running` (integer)
- `max_steps_per_mission` (integer)
- `max_parallel_steps_per_mission` (integer)
- `default_step_max_attempts` (integer)
- `health_check_interval_ms` (integer)
- `mission_timeout_ms` (integer)
- `rate_limits` (object):
  - `missions_per_hour` (integer)
  - `tool_calls_per_minute` (integer)
- `kill_switch` (object):
  - `enabled` (boolean)
  - `reason` (string; secret-free)

Validation notes:
- Integers must be positive and within reasonable bounds (avoid extreme values).
- If `kill_switch.enabled = true`, Delegatic should refuse to start new missions for the company and emit an auditable signal.

---

## 4) Validation rules (Core indexer + Delegatic runtime)

### 4.1 Safe indexing requirement (non-negotiable)
OpenSentience Core must be able to parse and validate `company.json` without:
- executing code
- performing network calls
- reading arbitrary filesystem paths outside the repo (except to locate the file itself)

### 4.2 Validation checklist (v1)

A `company.json` is valid if:

**File-level**
- parses as JSON object
- `version == 1`

**Identifiers**
- `company_id` passes naming rules (§3.1)
- all `roles[*].role_id` are unique and pass naming rules
- all `agents[*].agent_id` are unique (recommended)

**Role references**
- every `agents[*].role` references an existing `roles[*].role_id`

**Tool allowlists**
- if `tool_allowlist` present:
  - entries are strings
  - entries are canonical tool ids (`<agent_id>/<tool_name>`) unless patterns are explicitly supported
  - no whitespace
  - max length enforced (recommend 256)

**Directive allowlists**
- if `directive_allowlist` present:
  - entries are strings
  - no whitespace
  - max length enforced (recommend 256)

**Resource scopes**
- filesystem globs are strings and do not contain path traversal sequences (`../`, `..\\`)
- graph scopes are strings and match the portfolio collection id/scoping convention used in your deployment
- event patterns are strings and match the portfolio matcher grammar (dot-separated with `*` single segment wildcard)
- `secrets` are identifiers only (strings) and do not contain secret values (best-effort checks)

**Policies**
- numeric limits are integers >= 1 (or >= 0 where sensible), and within sane bounds

### 4.3 Cross-validation (recommended; may require Core context)
Some validations require information beyond the file itself (e.g., installed agents, approved permissions). Core/Delegatic should perform these as “validation warnings/errors” surfaced in UI:

- Each `agents[*].agent_id` exists in catalog (installed/available).
- Each agent is enabled with permissions that can satisfy:
  - role `resource_scopes`
  - role `tool_allowlist` (via Core tool routing permissions)
  - any `permissions_override` (must be subset of manifest + approvals)
- Shared resources are consistent:
  - `shared_resources.graphonomous_collections` are within role graph scopes
  - `shared_resources.filesystem_paths` are within role filesystem scopes
  - `shared_resources.secrets` are included in role `secrets` scopes for roles that need them

### 4.4 Failure behavior (normative)
- If `company.json` is invalid at file/schema level:
  - Delegatic must treat the company as unusable and refuse mission start
  - Core UI should show errors with actionable messages
  - Delegatic should emit a `delegatic.company.discovered` (or validation) signal with `validation_status=invalid`
- If file is valid but cross-validation fails (e.g., missing permissions/agents):
  - prefer refusing mission start until fixed (deny-by-default)
  - optionally allow “degraded” mode only if explicitly configured and safe

---

## 5) Security requirements for resource files

### 5.1 No secrets in config
`company.json` must never include:
- API keys, tokens, passwords, cookies
- auth headers
- private keys or PEM blocks
- URLs with embedded credentials

If such content is detected:
- treat as invalid (preferred) or redact and warn (riskier; generally avoid silently rewriting config)

### 5.2 Size and complexity limits (recommended)
To prevent abusive configs:
- max file size (recommend 256KB for MVP)
- max agents per company (e.g., 100)
- max roles per company (e.g., 100)
- max allowlist entries (e.g., 500 tools/directives combined)
- max nesting depth (e.g., 20)

---

## 6) Notes on permissions and enforcement (important)
This file declares **intent**, not authority.

Actual authority comes from:
1. Each agent’s `opensentience.agent.json` requested permissions
2. User-approved permissions (Enable step) in OpenSentience Core
3. Delegatic company policies (roles, allowlists, resource scopes)
4. Core ToolRouter enforcement at runtime

Rule: effective permissions must satisfy:
- **agent requested** ⊇ **agent approved** ⊇ **company policy scopes required**
and Delegatic must fail closed if the chain cannot be proven.

---

## 7) Future extensions (version-gated)
Potential v2 additions:
- multiple companies per project (`companies/` directory)
- role inheritance (role extends role)
- explicit per-role budgets (LLM tokens, network calls, filesystem writes)
- event-driven mission templates (declarative step graphs)
- policy language enhancements (still safe-to-index; no scripting)

When extending:
- bump `version`
- preserve v1 parsing behavior
- keep safe indexing and “no secrets” invariants intact