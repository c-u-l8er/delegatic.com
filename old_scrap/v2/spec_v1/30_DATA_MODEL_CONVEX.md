# delegatic — Data Model (Convex) & Access Control (v1)
Version: 1.0  
Status: Draft (normative once adopted)  
Audience: Engineering  
Last updated: 2026-01-24

This document defines the **Convex data model** for **Delegatic v1** (organizations), including:
- tables, fields, and indexing guidance
- invariants and validation rules (including **no-cycles** containment)
- access control requirements (tenant isolation + org membership)
- deletion and retention semantics
- cross-product reference shapes:
  - **Agentelic telespaces** (telespace ids)
  - **Agentromatic** workflows/executions (workflow ids, execution ids) — stored as references only
  - **WHS** agents/deployments (agent ids, deployment ids) — stored as references only

Delegatic stance:
- Delegatic is a **governance plane** (org chart + membership + policy + audit).
- Delegatic does **not** execute workflows or deploy agents; it stores references and emits auditable events.

Normative language:
- **MUST / MUST NOT / SHOULD / MAY** are used intentionally.

---

## 0) Design goals

### 0.1 Goals (v1)
1. **Tenant isolation**: no cross-tenant reads/writes (IDOR-safe).
2. **Durable organization model**:
   - organizations
   - membership and roles
   - nested containment (org → org; org → telespace references)
   - no cycles (recommended: strict tree, but model supports DAG-without-cycles)
3. **Policy + governance**:
   - org-scoped policy bundles (deny-by-default, inheritance rules)
4. **Auditability**:
   - append-only audit log for every mutating operation
   - stable correlation fields for cross-system linking (telespaces/workflows/agents)

### 0.2 Non-goals (v1)
- Enterprise RBAC (SCIM, custom roles editor, fine-grained permissions language).
- Perfect cross-system verification (e.g., proving an Agentelic telespace exists at attach time). v1 can store references and validate best-effort.
- Running missions/workflows (that belongs to Agentelic + Agentromatic + WHS).

---

## 1) Cross-cutting conventions

### 1.1 Identity model
Delegatic MUST map external identity (recommended: Clerk) to an internal `users` row.

- `users.externalId` (unique) stores the external auth subject.
- All membership rows reference `userId: Id<"users">`.

### 1.2 Time
All timestamps are stored in epoch milliseconds:
- `createdAtMs`
- `updatedAtMs` (on mutable records)
- `deletedAtMs` (soft delete)

### 1.3 IDs and references
- Convex `_id` is the primary key.
- Cross-product IDs are stored as opaque strings:
  - `agentelicTelespaceId: string`
  - `agentromaticWorkflowId: string`
  - `agentromaticExecutionId?: string`
  - `whsAgentId: string`
  - `whsDeploymentId?: string`

IDs MUST be treated as opaque. Do not encode meaning.

### 1.4 Soft delete (recommended)
Delegatic SHOULD use soft-delete for:
- organizations
- containment edges
- telespace links

Reason:
- preserves auditability
- avoids breaking historical references abruptly

### 1.5 Roles (v1 minimum)
`OrgRole`:
- `owner` (full control)
- `admin` (manage members/policies/attachments within allowed scope)
- `member` (read-only by default; future: limited write based on policies)
- `viewer` (read-only; lowest privilege)

v1 enforcement MUST be simple and consistent:
- Only `owner|admin` may mutate org structure, members, policies, and attachments.
- Only `owner` may delete (soft-delete) an org (recommended).
- `member|viewer` can read only what membership allows.

### 1.6 Deny-by-default policy model
Delegatic v1 policies should be interpreted as *constraints*, not grants.
- Being in an org grants only the minimal access defined by role.
- Policies MAY further restrict behavior (e.g., disallow attaching telespaces, require approvals, etc.).
- Policies MUST NOT silently widen access to children unless explicitly configured (see §6.3).

### 1.7 Payload limits (recommended baseline)
To keep audit logs and configs safe:
- `organizations.name`: <= 120 chars
- `organizations.description`: <= 2,000 chars
- `policies.policyJson`: <= 32 KB (JSON stringified)
- `auditLog.summary`: <= 2,000 chars
- `auditLog.details`: <= 8 KB (JSON stringified)

---

## 2) Tables (normative schema)

> You can rename tables/fields, but MUST preserve semantics, invariants, and access control rules.

### 2.1 `users`
Purpose: internal identity mapping.

Fields:
- `_id: Id<"users">`
- `externalId: string` (unique; e.g., Clerk user id)
- `email?: string`
- `name?: string`
- `createdAtMs: number`
- `updatedAtMs: number`

Indexes:
- by `externalId` (unique lookup)

Invariants:
- One row per external identity.

---

### 2.2 `organizations`
Purpose: org nodes (containers) in the Delegatic hierarchy.

Fields:
- `_id: Id<"organizations">`
- `name: string`
- `description?: string`
- `createdAtMs: number`
- `updatedAtMs: number`
- `deletedAtMs?: number` (soft delete)

Ownership / tenancy:
- `ownerUserId: Id<"users">` (required)

Optional governance linkage:
- `parentOrgId?: Id<"organizations">` (optional convenience; if you model strict trees)
  - If you support multi-parent DAGs, do NOT use this as the source of truth; use `orgEdges` only.

Indexes:
- by `ownerUserId + updatedAtMs desc`
- by `ownerUserId + createdAtMs desc`

Invariants:
- `ownerUserId` must exist.
- If `deletedAtMs` is set, treat org as non-mutable and non-attachable (except repair/admin flows).

Notes:
- Membership is modeled in `orgMembers`; `ownerUserId` is the “root authority” for v1 tenant isolation.

---

### 2.3 `orgMembers`
Purpose: membership + role in an organization.

Fields:
- `_id: Id<"orgMembers">`
- `orgId: Id<"organizations">`
- `userId: Id<"users">`
- `role: "owner" | "admin" | "member" | "viewer"`
- `status: "active" | "invited" | "removed"` (v1 can start with `active` only)
- `invitedByUserId?: Id<"users">`
- `createdAtMs: number`
- `updatedAtMs: number`
- `removedAtMs?: number`

Indexes:
- by `orgId + userId` (primary membership lookup)
- by `orgId + createdAtMs desc` (list members)
- by `userId + createdAtMs desc` (list orgs for user; can overscan + filter)

Invariants (MUST):
- There MUST NOT be more than one `status="active"` row for the same `(orgId, userId)`.
- Each org MUST have at least one `owner` (recommended: enforce by prohibiting removal of last owner).
- Users removed from an org MUST lose access to:
  - org details
  - org children
  - org attachments
  unless explicitly granted elsewhere (v1 has no “elsewhere” grants).

Notes:
- v1 can treat `organizations.ownerUserId` as the canonical owner and require a matching `orgMembers` row with `role="owner"` for consistency, or treat `ownerUserId` as authoritative and derive owner role. Pick one and enforce it consistently.

---

### 2.4 `orgEdges` (containment edges)
Purpose: represent nested containment (org → org).

Fields:
- `_id: Id<"orgEdges">`
- `ownerUserId: Id<"users">` (denormalized for fast tenancy scoping; MUST match both endpoints’ ownership)
- `parentOrgId: Id<"organizations">`
- `childOrgId: Id<"organizations">`
- `createdAtMs: number`
- `deletedAtMs?: number` (soft delete)

Indexes:
- by `ownerUserId + parentOrgId + createdAtMs`
- by `ownerUserId + childOrgId + createdAtMs`
- (optional) by `parentOrgId + childOrgId` for dedupe checks

Invariants (MUST):
1. **Same tenant**:
   - `organizations(parentOrgId).ownerUserId === ownerUserId`
   - `organizations(childOrgId).ownerUserId === ownerUserId`
2. **No self-edge**:
   - `parentOrgId !== childOrgId`
3. **No cycles**:
   - Adding an edge MUST be rejected if it would create a cycle.
   - This requires checking reachability: if `parentOrgId` is reachable from `childOrgId`, reject.
4. **No duplicate active edge**:
   - Only one active edge `(parentOrgId, childOrgId)` may exist at a time.

Recommended stance (v1):
- Implement strict **tree** semantics:
  - a child org has at most one active parent edge.
- If you choose tree semantics, enforce:
  - when adding `(parent → child)`, ensure child has no existing active parent.

---

### 2.5 `orgTelespaces` (attachments to Agentelic)
Purpose: attach Agentelic telespaces to an org (org contains telespaces).

Fields:
- `_id: Id<"orgTelespaces">`
- `ownerUserId: Id<"users">` (denormalized for fast tenancy scoping)
- `orgId: Id<"organizations">`
- Agentelic reference:
  - `telespaceId: string` (required; opaque Agentelic telespace id)
- Mount/metadata (optional, secret-free):
  - `label?: string` (display label inside org)
  - `notes?: string` (bounded)
  - `tags?: string[]`
- Governance controls (optional):
  - `visibilityInOrg: "inherited" | "private_to_org" | "public_to_org"` (v1 can default to `inherited`)
- `createdAtMs: number`
- `updatedAtMs: number`
- `deletedAtMs?: number`

Indexes:
- by `ownerUserId + orgId + createdAtMs desc` (list telespaces for org)
- by `ownerUserId + telespaceId` (reverse lookup; optional)
- by `orgId + telespaceId` (dedupe; optional)

Invariants (MUST):
- `organizations(orgId).ownerUserId === ownerUserId`
- Only one active attachment for `(orgId, telespaceId)` at a time.
- The attachment MUST NOT contain secrets.

Notes:
- In v1, `telespaceId` can be “unverified” unless you implement a verifier call. If you want explicit tracking, add:
  - `verificationStatus: "unverified" | "verified" | "invalid"`
  - `lastVerifiedAtMs?: number`

---

### 2.6 `orgPolicies`
Purpose: store org-level policy bundles (deny-by-default constraints + inheritance rules).

Fields:
- `_id: Id<"orgPolicies">`
- `ownerUserId: Id<"users">`
- `orgId: Id<"organizations">`
- `version: number` (monotonic; starts at 1)
- `status: "active" | "archived"` (v1 can keep only one active)
- `policyJson: object` (secret-free JSON; bounded size)
- `createdAtMs: number`
- `createdByUserId: Id<"users">`

Indexes:
- by `ownerUserId + orgId + createdAtMs desc`
- by `ownerUserId + orgId + status`

Invariants (MUST):
- `policyJson` MUST be secret-free.
- Only `owner|admin` may create/update policy bundles.
- If you allow multiple policy versions, only one can be `active` at a time per org.

Recommended v1 `policyJson` shape (minimal, aligned with master spec):
- `inheritance`:
  - `inheritPolicies: boolean` (default true; policies are constraints)
  - `inheritMembers: "none" | "viewers_only" | "all"` (default "none"; deny-by-default)
- `capabilities` (constraints; not grants):
  - `allowTelespaceAttach: boolean` (default false; only meaningful for owner/admin flows)
  - `allowCreateChildOrgs: boolean` (default false; only meaningful for owner/admin flows)
- `limits`:
  - `maxChildOrgs?: number`
  - `maxAttachedTelespaces?: number`

(Keep it small and additive.)

---

### 2.7 `auditLog` (append-only)
Purpose: durable, secret-free audit events for all mutating operations.

Fields:
- `_id: Id<"auditLog">`
- `ownerUserId: Id<"users">` (tenant scoping)
- `orgId?: Id<"organizations">` (if event is org-scoped)
- `subjectType: string` (e.g., `delegatic.org`, `delegatic.member`, `delegatic.edge`, `delegatic.telespace_link`)
- `subjectId: string` (opaque; Convex id string or external reference id)
- `action: string` (stable verb, e.g., `created`, `updated`, `deleted`, `attached`, `detached`)
- `atMs: number`
- `actor`:
  - `type: "user" | "system"`
  - `userId?: Id<"users">`
- `correlationId?: string` (opaque)
- `causationId?: string` (opaque)
- `summary: string` (bounded, secret-free)
- `details?: object` (bounded, secret-free; do NOT include secret values)

Indexes:
- by `ownerUserId + atMs desc` (tenant timeline)
- by `orgId + atMs desc` (org timeline)
- by `ownerUserId + subjectType + atMs desc` (optional)

Invariants (MUST):
- Append-only: audit log rows MUST NOT be mutated except for rare admin repair workflows.
- MUST NOT contain plaintext secrets.
- MUST be written for every mutating endpoint.

Recommended event coverage (v1 minimum):
- org created/updated/soft-deleted
- member invited/added/removed/role changed
- org edge added/removed
- telespace attached/detached
- policy activated/archived

---

## 3) Access control requirements (normative)

### 3.1 Global rules
Every query/mutation/action MUST:
1. Resolve current user from auth token → `users._id`.
2. Enforce tenant isolation by `ownerUserId`:
   - any org/resource accessed must match the caller’s tenant scope, OR
   - the caller must be a member with rights, and the org must belong to the same `ownerUserId` domain for v1.
3. Enforce org membership and role where applicable.

### 3.2 Membership check
A caller is authorized to **read** an org if:
- `organizations.ownerUserId === currentUserId`, OR
- an active `orgMembers` row exists for `(orgId, currentUserId)`.

Recommended v1 simplification:
- All orgs are owned by one `ownerUserId`.
- Membership rows exist only within that owner domain.
- This avoids “shared org across users” until Delegatic evolves to real multi-owner orgs.

### 3.3 Write permissions (v1)
Minimum required enforcement:
- Create org: any authenticated user.
- Update org: `owner|admin` (or owner only; pick and document).
- Soft-delete org: `owner` only (recommended).
- Add/remove member, change role: `owner|admin` (but only owner may assign/remove owners; recommended).
- Add/remove org edge: `owner|admin`.
- Attach/detach telespace: `owner|admin` (or gated by policy).
- Create/activate policy bundle: `owner|admin`.

### 3.4 No cycles enforcement (must)
Any mutation that creates an org edge MUST:
- load `parentOrgId` and `childOrgId` org docs
- verify tenant matches
- verify no cycle would be created
- reject if cycle would be created

Cycle check strategies (implementation guidance):
- MVP: perform bounded BFS/DFS over edges in Convex at mutation time.
- Guardrails:
  - maximum depth (e.g., 50)
  - maximum visited nodes (e.g., 10,000) to avoid runaway
- If limits exceeded, fail closed with a safe error:
  - `INVALID_REQUEST` + message “Org nesting too deep; cannot validate cycle safety.”

### 3.5 Inheritance semantics (must be explicit)
If Delegatic supports inherited membership:
- It MUST be explicitly controlled by policy (`membershipsInheritToChildren`).
- It MUST be evaluated at read time (or derived cache must be refreshable and correct).
- v1 recommended default: **no inheritance** (explicit membership per org), because it is simpler and safer.

If you later add inheritance:
- child orgs MAY tighten access, MUST NOT silently widen access without explicit grants.

---

## 4) Deletion, retention, and lifecycle semantics

### 4.1 Organizations (recommended)
Soft delete organizations by setting `deletedAtMs`.
Effects:
- org becomes read-only except for export/audit views (if implemented)
- new edges/attachments/memberships to deleted org are rejected
- existing edges/attachments remain for audit, but should be treated as inactive for UI unless explicitly viewing archived orgs

### 4.2 Edges and attachments
Edges (`orgEdges`) and attachments (`orgTelespaces`) SHOULD be soft-deleted (set `deletedAtMs`).
- Do not hard delete by default; keep for audit and historical reconstruction.

### 4.3 Audit log retention
Audit logs are typically long-lived.
v1 recommendation:
- retain indefinitely (or >= 365 days), unless cost requires tiered retention later.

If retention jobs are implemented:
- delete auditLog only after a long retention window
- ensure deletions do not break “why did access change?” debugging

---

## 5) Indexing guidance (Convex-specific)

### 5.1 Common query patterns (required)
1. **List orgs for user**
   - by `organizations.ownerUserId + updatedAtMs desc`
2. **List members for org**
   - by `orgMembers.orgId + createdAtMs desc`
3. **List child orgs**
   - by `orgEdges.ownerUserId + parentOrgId`
4. **List parent org**
   - by `orgEdges.ownerUserId + childOrgId` (if tree or DAG)
5. **List telespaces in org**
   - by `orgTelespaces.ownerUserId + orgId + createdAtMs desc`
6. **Audit timeline**
   - by `auditLog.orgId + atMs desc` (org-focused)
   - by `auditLog.ownerUserId + atMs desc` (tenant-focused)

### 5.2 Dedupe patterns (recommended)
Because Convex does not provide hard unique constraints, you must enforce uniqueness by consistent lookup-before-insert and rejecting duplicates.

Recommended dedupe keys:
- `orgEdges`: `(parentOrgId, childOrgId)` active uniqueness
- `orgTelespaces`: `(orgId, agentelicTelespaceId)` active uniqueness
- `orgMembers`: `(orgId, userId)` active uniqueness

---

## 6) Validation requirements (must)

### 6.1 Schema validation
All mutations MUST validate:
- required fields present
- max length bounds (name, description, summaries)
- enum values
- unknown fields rejected where feasible

### 6.2 Cross-table invariants
On writes, enforce:
- `ownerUserId` matches across related docs (orgs, edges, attachments)
- membership exists (or owner) when mutating org-scoped resources
- cannot attach to deleted org
- cannot create edge involving deleted org

### 6.3 Policy validation (deny-by-default)
When policies exist:
- Policy changes MUST be audited.
- Policy JSON must be secret-free and bounded.
- Policy evaluation MUST be consistent:
  - do not allow a child to gain more rights unless explicitly granted

v1 recommendation:
- Treat policies as constraints for write operations and UI affordances.
- Keep the policy language simple until you have strong tests.

---

## 7) Cross-product reference conventions (Agentelic, Agentromatic, WHS)

### 7.1 Agentelic telespaces
Delegatic stores only `agentelicTelespaceId: string` in `orgTelespaces`.
- Delegatic MUST NOT store Agentelic message content or membership artifacts.
- Delegatic MAY store secret-free metadata like labels/tags.

### 7.2 Agentromatic workflows and executions
Delegatic v1 typically does not need to store workflow ids directly; workflows belong inside telespaces.
If needed for org-level catalogs, store references only:
- `agentromaticWorkflowId: string`
- `agentromaticExecutionId?: string`

Do not copy workflow definitions or logs.

### 7.3 WHS agents and deployments
Delegatic v1 typically does not need to store WHS agent ids directly; WHS agents are installed into telespaces.
If you add org-level “approved agents” lists later, store:
- `whsAgentId: string`
- `whsDeploymentId?: string`

Do not store secrets or runtime configs that belong to WHS control plane.

---

## 8) Minimal v1 schema checklist (Definition of Done for data model)

You have a v1-capable Delegatic data model when:
- [ ] You can create an organization and list organizations for a user.
- [ ] You can add/remove members and enforce role-based write permissions.
- [ ] You can create child orgs via edges and list children.
- [ ] You prevent cycles in org containment (reject cycle-creating edges).
- [ ] You can attach an Agentelic telespace reference to an org and list attachments.
- [ ] Every mutation writes an append-only audit log event (secret-free).
- [ ] You have at least 3 IDOR tests validating:
  - cannot read org by id without membership/ownership
  - cannot mutate members without admin/owner
  - cannot attach telespace without admin/owner

---

## 9) Open decisions (should become ADRs)

1. **Tree vs DAG**: Is org containment strictly a tree (single parent) or DAG-without-cycles?
2. **Inheritance**: Do memberships inherit to children? (v1 recommendation: no)
3. **Shared orgs across multiple owners**: When/if orgs become multi-tenant entities not owned by a single user.
4. **Verification**: Whether Delegatic verifies Agentelic telespace existence/ownership at attach time, and how (direct call vs cached registry).
5. **Policy language**: Whether policies remain JSON flags or evolve to a declarative permission language.

---