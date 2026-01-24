# delegatic.com — Spec v1 (Delegatic Organizations)
Version: 1.0  
Status: Implementation-ready draft (spec-first; code may lag)  
Audience: Engineering  
Last updated: 2026-01-24

Delegatic is the portfolio’s **organization layer**: an “AI org chart” that models **organizations** as nested containers of:
- **Agentelic telespaces** (AI-enabled chatrooms / collaboration spaces)
- which contain **Agentromatic workflows**
- which run using **WHS agents** (WebHost.Systems agents/runtimes)

In the portfolio taxonomy:
- **WHS** = agents (runtime + deploy + invoke + telemetry + billing)
- **Agentromatic** = workflows (DAGs, executions, logs)
- **Agentelic** = telespaces (rooms, threads, membership, chat + workflow embedding)
- **Delegatic** = organizations (hierarchy, policies, governance, cross-space orchestration)

This folder is the **canonical spec** for Delegatic v1 in the same “spec_v1 document set” style as the other portfolio specs: small set of normative documents + ADRs.

---

## How to use this spec (recommended reading order)

1. **Start here**
   - `00_MASTER_SPEC.md` — overall scope, glossary, invariants, flows, acceptance criteria

2. **Model and enforce access**
   - `30_DATA_MODEL_CONVEX.md` — Convex schema + indexes + invariants + access control rules

3. **Expose stable API contracts**
   - `10_API_CONTRACTS.md` — normalized request/response shapes, error envelope, idempotency, pagination

4. **Security and safety**
   - `40_SECURITY_SECRETS_COMPLIANCE.md` — threat model, secrets handling, prompt-injection posture, auditability constraints

5. **Observability and limits**
   - `50_OBSERVABILITY_BILLING_LIMITS.md` — usage metering (if any), rate limits, retention rules (minimal v1)

6. **Verify end-to-end**
   - `60_TESTING_ACCEPTANCE.md` — unit/integration/E2E test plan + release gates

If any contradictions appear:
1. `00_MASTER_SPEC.md` wins for system behavior.
2. ADRs win for invariants and “why”.
3. Older drafts outside `spec_v1/` are non-normative background.

---

## Core concepts (canonical terms)

- **Organization**: a durable container with membership, policy, and nested children.
- **Org node**: one node in an org tree; can be an org itself, a telespace reference, or (future) a team.
- **Delegatic policy**: deny-by-default governance rules applied at org boundaries (roles, permissions, limits).
- **Telespace**: an Agentelic room/chatspace that can embed workflows and connect to agents.
- **Workflow**: an Agentromatic definition (DAG) with executions/logs.
- **WHS agent**: a WebHost.Systems-managed agent deployed to a runtime provider and invoked via canonical protocols.

---

## What Delegatic v1 MUST do

### A) Organization model (nested containment)
Delegatic MUST support:
- creating an organization
- listing organizations visible to the current user
- creating hierarchical containment:
  - an org can contain other orgs (recursive)
  - an org can contain Agentelic telespaces (references)
- enforcing “no cycles” in org containment (tree or DAG-without-cycles; v1 recommends strict tree)

### B) Access control (deny-by-default)
Delegatic MUST enforce:
- membership checks for every read/write
- role-based permissions (at minimum: `owner`, `admin`, `member`, `viewer`)
- org boundary inheritance:
  - permissions granted at an org MAY apply to children (policy-controlled)
  - child orgs MAY tighten permissions; MUST NOT silently widen access without explicit grants

### C) Integration wiring (portfolio alignment)
Delegatic MUST be able to represent:
- org → telespace references (Agentelic IDs)
- telespace → embedded workflow references (Agentromatic IDs)
- workflow → agents/tools references (WHS agent IDs, or future ToolRouter IDs)

Delegatic v1 does NOT need to implement workflow execution itself. It governs and references; execution remains owned by Agentromatic + WHS.

### D) Auditable operations
All mutating operations MUST emit durable, secret-free audit events (append-only), including:
- org created/updated/deleted (or soft-deleted)
- membership changes
- policy changes
- containment changes (org ↔ org, org ↔ telespace)

---

## What Delegatic v1 MUST NOT do

- MUST NOT store plaintext secrets in org configs, policies, audit logs, or error envelopes.
- MUST NOT “execute” workflows directly (that belongs to Agentromatic execution engine + WHS invocation).
- MUST NOT bypass upstream enforcement (auth provider, Convex auth, or control-plane gating where applicable).

---

## System boundaries (how Delegatic fits with WHS / Agentelic / Agentromatic)

Delegatic is a **governance plane** for how the portfolio products compose.

Recommended boundary rules:
- **Delegatic** owns:
  - org tree, membership, policies, references to contained resources
- **Agentelic** owns:
  - telespace chat artifacts, room membership primitives, message/thread storage, embedding UI
- **Agentromatic** owns:
  - workflow definitions, executions, execution logs, condition DSL evaluation
- **WHS** owns:
  - agents, deployments, invocation gateway, telemetry, billing, runtime/provider adapters

A “Delegatic organization contains an Agentelic telespace” means:
- Delegatic stores a reference to the telespace and governs who can see/use it.
- Agentelic enforces room-level membership and message permissions (defense-in-depth).
- Shared identity is assumed (e.g., Clerk) but each system enforces its own tenancy rules.

---

## API and error conventions (normative style)

Delegatic v1 MUST follow the portfolio’s API patterns:
- consistent error envelope with stable `code`, `message`, optional `details`
- idempotency keys for create/attach operations that can be retried safely
- pagination for list endpoints
- strict input validation (reject unknown fields where feasible)

---

## Data model conventions (Convex)

Delegatic v1 SHOULD:
- use immutable audit log tables (append-only)
- use soft-delete for organizations to preserve auditability
- store `createdAtMs` / `updatedAtMs` timestamps consistently
- index by `ownerUserId` and `orgId` for fast tenancy-scoped queries

---

## ADRs (Architecture Decision Records)

ADRs live in:
- `spec_v1/adr/`

Minimum ADRs recommended for v1:
- ADR-0001: Org containment model (tree vs DAG) and cycle prevention
- ADR-0002: Identity and tenancy mapping (Clerk → Convex user row strategy)
- ADR-0003: Policy inheritance rules (parent-to-child semantics)
- ADR-0004: Audit log semantics (append-only, retention, export posture)
- ADR-0005: Cross-product references (how IDs for telespaces/workflows/agents are stored and validated)

---

## Acceptance criteria (Definition of Done for v1)

Delegatic v1 is “done” when:
1. A signed-in user can:
   - create an organization
   - add/remove members
   - create a child org
   - attach a telespace reference to an org
2. All reads/writes are tenant-scoped and enforce membership/role rules.
3. Org containment has no cycles (and rejects attempts to create one).
4. Every mutating operation writes a corresponding audit event (secret-free).
5. Basic list/detail UI flows (if delegatic.com ships UI in v1) work end-to-end against the API.

---

## Notes on older drafts

There may be earlier drafts under:
- `delegatic.com/old_scrap/`

Treat those as background only. Implementation and requirements for Delegatic v1 should follow `project_spec/spec_v1/` once the full document set is populated.