# delegatic — MASTER ENGINEERING SPEC (v1)
Version: 1.0  
Status: Draft (normative once adopted)  
Audience: Engineering  
Last updated: 2026-01-24

Delegatic is the **organization layer** in the WHS stack: an “AI org chart” that models **organizations** as nested containers of:
- **Agentelic telespaces** (AI-enabled chatrooms / collaboration spaces),
- which contain **Agentromatic workflows** (automation definitions + executions/logs),
- which run using **WHS agents** (WebHost.Systems deploy/invoke/telemetry).

Portfolio taxonomy (canonical intent):
- **WHS** = agents (deploy, invoke, telemetry, billing, runtime providers)
- **Agentromatic** = workflows (DAGs, executions, logs)
- **Agentelic** = telespaces (rooms, membership, messages, workflow embedding)
- **Delegatic** = organizations (nested governance envelope containing telespaces, recursively)

This spec defines Delegatic v1 as a governance-focused system:
- org tree + membership + policy + audit
- references to contained telespaces (Agentelic)
- optional references to workflows (Agentromatic) and agents (WHS) as “assets” governed by org policy
- strict tenant isolation and deny-by-default controls

Normative language:
- **MUST / MUST NOT / SHOULD / MAY** are used intentionally.

---

## 0) Executive summary

### 0.1 What you are building (v1)
A system that lets a signed-in user:
1. Create an **organization**
2. Invite members and assign roles
3. Create **child orgs** (nested hierarchy)
4. Attach **Agentelic telespaces** to org nodes (containment)
5. Apply org policies that inherit down the tree (tightening is allowed; widening must be explicit)
6. Produce an append-only **audit trail** for all org mutations

In practical terms: a tenant-safe org chart + governance layer that the rest of the portfolio can “hang” resources off of.

### 0.2 What you are not building (v1)
Delegatic v1 MUST NOT try to do these:
- workflow builder UI or workflow execution engine (Agentromatic owns)
- agent deployment/runtime provider adapters (WHS owns)
- complex enterprise RBAC/SCIM (start with basic roles)
- a full multi-agent orchestration runtime (the “Delegatic as orchestration agent” concept is a later module; v1 is governance + references + audit)

---

## 1) Scope, goals, non-goals

### 1.1 Goals (v1 MUST)
Delegatic v1 MUST provide:

**A) Organization hierarchy**
- create organizations
- create child orgs under a parent org
- list/get organizations visible to the current user
- attach/detach resources (at minimum: Agentelic telespaces) to orgs
- prevent cycles (org containment must remain acyclic; v1 recommends a strict tree)

**B) Membership + roles**
- add/remove members to an org
- role assignment per member
- enforce access control on every read/write

**C) Policy and inheritance**
- attach a policy bundle to an org node
- compute effective policy for a node by combining ancestors → node
- policy inheritance rules must be explicit and deterministic

**D) Auditability**
- every mutating operation must emit an append-only audit event
- audit events must be secret-free and attributable (actor + timestamp + subject)

### 1.2 Non-goals (v1 MUST NOT)
Delegatic v1 MUST NOT:
- store plaintext secrets in org configs, policies, or audit logs
- assume upstream systems will enforce Delegatic’s policies (defense-in-depth: Delegatic enforces its own rules)
- silently widen access via inheritance or attachments
- require a “superuser” for normal operation in a single-tenant setting

### 1.3 Assumptions
- A shared identity provider exists across the portfolio (recommended: Clerk).
- Delegatic runs with a backend capable of enforcing authz and writing durable audit (recommended: Convex).
- Agentelic and Agentromatic and WHS are separate systems; Delegatic stores **references**, not copies.

---

## 2) Key decisions (ADR-style summaries)
These are summarized here; full ADRs should live under `project_spec/spec_v1/adr/`.

1. **ADR-0001: Containment model = strict tree (v1)**
   - Each org has at most one parent.
   - Cycles are rejected.
   - Rationale: simplest inheritance semantics and easiest audit.

2. **ADR-0002: Deny-by-default governance**
   - Access is granted only via explicit membership or explicit inherited grants.
   - Rationale: prevents confused deputy and accidental leakage.

3. **ADR-0003: References, not copies**
   - Delegatic stores references to external resources:
     - Agentelic: `telespaceId`
     - Agentromatic: `workflowId` / `executionId` (optional in v1)
     - WHS: `agentId` / `deploymentId` (optional in v1)
   - Rationale: single source of truth per subsystem.

4. **ADR-0004: Append-only audit log**
   - All mutations emit audit events.
   - Rationale: governance must be explainable and exportable.

5. **ADR-0005: Policy inheritance is monotonic by default**
   - Child policies can tighten constraints.
   - Widening requires explicit grants (and audit).
   - Rationale: avoid silent privilege widening.

---

## 3) Glossary (canonical terms)

- **Organization (Org)**: a durable container with membership, roles, policies, and nested children.
- **Org node**: a node in the org tree (an org instance).
- **Containment**: parent/child relationship between org nodes.
- **Attachment**: a reference from an org to an external resource (e.g., a telespace).
- **Policy**: a structured, versioned set of governance rules (deny-by-default).
- **Effective policy**: the computed policy at a node after applying inheritance.
- **Audit event**: append-only, secret-free record of a mutation.
- **Actor**: the identity responsible for an operation (user/system).

---

## 4) System architecture

### 4.1 Components (high-level)
1. **Delegatic UI** (optional in v1; can be embedded in WebHost.Systems dashboard)
   - org tree view
   - membership management
   - policy management
   - resource attachments view (telespaces list per org)
   - audit timeline view

2. **Auth provider** (recommended: Clerk)

3. **Delegatic backend** (recommended: Convex)
   - schema for orgs/memberships/policies/attachments/audit
   - APIs for CRUD + attach/detach + policy resolution
   - strict tenant isolation + normalized errors

4. **External systems**
   - Agentelic (telespaces)
   - Agentromatic (workflows)
   - WHS (agents)

### 4.2 Boundaries (hard rules)
Delegatic is the source of truth for:
- org tree (containment)
- org membership + roles
- org policies + inheritance rules
- org attachments (references) and their governance metadata
- audit events for Delegatic operations

Delegatic is not the source of truth for:
- telespace membership/messages (Agentelic owns)
- workflow definitions/executions/logs (Agentromatic owns)
- agent deployments/invocations/telemetry/billing (WHS owns)

Delegatic MUST enforce its own access controls regardless of what upstream systems do.

---

## 5) Canonical data flows (v1)

### Flow A — Create org
1. User calls `orgs.create({ name, parentOrgId? })`
2. Backend creates org node (root if no parent)
3. Backend creates membership:
   - creator is `owner`
4. Backend writes audit event: `org.created`

### Flow B — Add member
1. Admin/owner calls `orgMembers.add({ orgId, invitee, role })`
2. Backend validates actor permission
3. Backend creates membership (direct to org; v1 may skip invite flow)
4. Backend writes audit event: `org.member.added`

### Flow C — Create child org
1. Owner/admin calls `orgs.create({ parentOrgId, name })`
2. Backend validates permission on parent org
3. Backend creates child org node with `parentOrgId`
4. Backend writes audit events:
   - `org.created` (child)
   - `org.child.attached` (parent → child)

### Flow D — Attach telespace
1. Owner/admin calls `orgAttachments.attachTelespace({ orgId, telespaceId })`
2. Backend validates permission on org
3. Backend optionally verifies telespace existence/visibility (best-effort)
4. Backend stores attachment record
5. Backend writes audit event: `org.attachment.added`

### Flow E — Compute effective policy
1. Client calls `orgPolicies.getEffective({ orgId })`
2. Backend walks ancestor chain root → org and merges policy layers
3. Backend returns computed policy plus provenance (which layer contributed what)

### Flow F — Remove member / detach telespace
1. Owner/admin calls `orgMembers.remove({ orgId, userId })` or `orgAttachments.detach(...)`
2. Backend validates permission and invariants (e.g., don’t remove last owner)
3. Backend updates membership/attachment state
4. Backend writes audit event

---

## 6) Product requirements (engineering-focused)

### 6.1 Org hierarchy (containment)
MUST:
- support roots and child orgs
- prevent cycles
- prevent multi-parent relationships in v1 (strict tree)
- support listing child orgs for a given org

SHOULD:
- support “move org” (re-parenting) with strict checks:
  - no cycle creation
  - audit the before/after parent relationship
  - optionally require owner-only

### 6.2 Membership and roles
MUST support roles (minimum v1):
- `owner`
- `admin`
- `member`
- `viewer`

MUST enforce:
- only `owner` can delete org (if deletion exists) and can manage owners (recommended)
- `owner|admin` can attach/detach resources and manage policies
- `member|viewer` can read org info they are a member of (subject to policy)

MUST:
- prevent removing the last owner of an org

Inheritance (v1 recommendation):
- membership does NOT automatically inherit to children unless explicitly configured by policy (see §6.3)
  - default: **no implicit inheritance** (deny-by-default)

### 6.3 Policy model and inheritance (v1)
Delegatic MUST provide a policy model that can express (at minimum):
- membership inheritance rule:
  - `inheritMembers: none | viewers_only | all` (default: `none`)
- resource visibility rule:
  - who can see attached telespaces under the org
- action constraints:
  - who can attach/detach telespaces
  - who can change policy
- optional allowlists/denylists (bounded):
  - allowed WHS agent ids (if you later allow “agents governed by org”)
  - allowed Agentromatic workflow ids (if you later allow “workflows governed by org”)

Inheritance semantics (required):
- Effective policy is computed by combining ancestor policies → node policy.
- Child policies MAY tighten restrictions.
- Child policies MUST NOT widen access unless an explicit widening grant exists and is audited.

Implementation guidance (non-normative but recommended):
- implement policy merge as a pure function returning:
  - `effectivePolicy`
  - `provenance[]` (“this field came from org X”)
- keep policy JSON schema versioned.

### 6.4 Attachments (Agentelic telespaces)
MUST:
- allow attaching telespaces by reference: `telespaceId` (opaque string)
- allow listing attachments for an org
- allow resolving attachments visible to the current user (accounting for org membership and policy)

MUST NOT:
- treat the attachment as authorization for the telespace itself
  - Agentelic must still enforce telespace membership
  - Delegatic governs visibility and intended access, but cannot bypass Agentelic’s enforcement

SHOULD:
- store attachment metadata:
  - `attachedAtMs`
  - `attachedByUserId`
  - `label` (optional)
  - `pathHint` (optional; for UI)
  - `verificationStatus: unverified | verified | failed` (optional)

### 6.5 Auditability (append-only)
MUST:
- write an audit event for every mutation
- audit event fields MUST include:
  - `type` (stable string)
  - `atMs`
  - `actorUserId` or `actorType=system`
  - `orgId`
  - `subjectType` and `subjectId` (memberId, attachmentId, policyId, etc.)
  - safe `summary`
  - bounded `details` (no secrets)

MUST NOT:
- store secret values in audit events or policy details.

---

## 7) API surface (normative pointers)
The full API contracts MUST live in:
- `project_spec/spec_v1/10_API_CONTRACTS.md`

However, Delegatic MUST provide logical modules (names may vary):
- `orgs.*`
- `orgMembers.*`
- `orgPolicies.*`
- `orgAttachments.*`
- `audit.*`

API requirements:
- normalized error envelope (`code`, safe `message`, optional safe `details`)
- idempotency for create/attach operations (recommended)
- pagination for list endpoints
- strict authz checks on every operation

---

## 8) Data model (normative pointers)
The full Convex schema and invariants MUST live in:
- `project_spec/spec_v1/30_DATA_MODEL_CONVEX.md`

Minimum entities (conceptual):
- `users` (identity mapping)
- `orgs`
- `orgMemberships`
- `orgPolicies` (or `orgPolicyVersions`)
- `orgAttachments` (at minimum: telespace attachments)
- `auditEvents` (append-only)

Required invariants:
- org containment is acyclic (tree in v1)
- no orphan attachments (attachment must reference an existing org)
- no membership duplicates for the same `(orgId, userId)` in active state
- at least one owner per org at all times
- audit events are append-only and secret-free

---

## 9) Security requirements (implementation-grade)

### 9.1 Tenant isolation (MUST)
- no cross-tenant reads/writes by ID (IDOR safe)
- every read/write must validate:
  - the caller is a member (or otherwise authorized by policy)
  - the caller’s role grants the requested operation
- list endpoints must be scoped by membership

### 9.2 Secrets (MUST)
- no plaintext secrets in:
  - org records
  - policies
  - attachments
  - audit events
  - error envelopes

### 9.3 Confused deputy prevention (MUST)
- policy inheritance MUST NOT silently widen access
- attachments MUST NOT be treated as authorization to external systems
- any “auto-inheritance” behavior must be explicit, policy-driven, and auditable

### 9.4 Abuse controls (SHOULD, minimal v1)
- rate-limit membership changes and policy updates (coarse limits acceptable)
- bound policy size and attachment count to prevent unbounded growth

Full posture must be specified in:
- `project_spec/spec_v1/40_SECURITY_SECRETS_COMPLIANCE.md`

---

## 10) Observability, retention, export (v1)
MUST:
- provide an org-scoped audit log query
- support basic filtering by time window and event type

SHOULD:
- support export of audit events for an org subtree (bounded; pagination)
- define retention defaults (even if not implemented in MVP):
  - audit events: 365 days (or “indefinite until policy exists”)
  - soft-deleted orgs: retained for audit unless hard delete is explicitly requested

If tiering exists elsewhere (WHS billing), Delegatic MAY later adopt tier-based retention, but v1 can be fixed defaults.

---

## 11) UI requirements (v1 minimum, optional)
If a Delegatic UI ships in v1, it SHOULD support:
- org tree navigation (expand/collapse)
- membership management (list/add/remove, role display)
- policy editor (structured form, not raw JSON, if feasible)
- telespace attachments list per org
- audit timeline view with filters

UI is not required for backend completeness; acceptance can be demonstrated via API calls.

---

## 12) Testing strategy (minimum viable)
Full plan MUST live in:
- `project_spec/spec_v1/60_TESTING_ACCEPTANCE.md`

Minimum tests (MUST):
1. **Tenant isolation / IDOR**
   - user B cannot read org A by id
   - user B cannot list members/attachments/audit for org A
2. **Cycle prevention**
   - cannot create cycle via parent assignment or move
3. **Role enforcement**
   - member cannot add attachments or edit policy
4. **Last-owner protection**
   - cannot remove last owner
5. **Audit coverage**
   - every mutation writes an audit event

SHOULD:
- effective policy computation tests (inheritance + tightening + explicit widening behavior)

---

## 13) Open questions (must answer before v1 sign-off)
1. Membership inheritance default:
   - keep deny-by-default (`inheritMembers=none`) or allow “view” inheritance?
2. Delegatic ↔ Agentelic integration:
   - will Delegatic verify telespace ownership/membership at attach time (best-effort), or treat as unverified references until later?
3. Org deletion semantics:
   - soft delete only in v1, or allow hard delete with export + confirmation?
4. Policy schema details:
   - exact fields and merge semantics; should be locked with ADRs.
5. Cross-product shared identity:
   - are all systems on the same Clerk instance and subject ids?

---

## 14) Acceptance criteria (Definition of Done for v1)
Delegatic v1 is “done” when you can demonstrate:

1. **Org hierarchy**
   - create root org
   - create child org
   - list org tree (or list children per org)
   - cycle creation is rejected

2. **Membership**
   - add member as owner/admin
   - member can read org details (within policy)
   - member cannot mutate protected resources
   - remove member and verify access is revoked server-side
   - cannot remove last owner

3. **Attachments**
   - attach an Agentelic telespace reference to an org
   - list attachments for an org
   - detach an attachment
   - visibility respects org membership and policy

4. **Policies**
   - set a policy on a parent org
   - set a tighter policy on a child org
   - compute effective policy for the child and verify deterministic merge

5. **Auditability**
   - all mutating operations create corresponding append-only audit events
   - audit events are secret-free and include attribution + timestamps

---