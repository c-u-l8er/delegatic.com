# Delegatic v1 — Spec-to-Implementation Realignment Plan
Version: 1.0  
Status: Actionable checklist  
Audience: Engineering  
Purpose: Ensure the **Delegatic** implementation (libs/services/UI) matches the **spec_v1** documents, and that cross-product bridges (Agentelic/WHS/Agentromatic) align with the portfolio contract.

> This plan is written to be followed even if you only have `project_spec/progress` notes and partial implementation. It identifies the known spec mismatches, the decisions that must be locked, and the concrete work items to bring code into compliance.

---

## 0) Inputs (Authoritative Specs)
Delegatic specs in scope:
- `spec_v1/00_MASTER_SPEC.md`
- `spec_v1/10_API_CONTRACTS.md`
- `spec_v1/30_DATA_MODEL_CONVEX.md`
- `spec_v1/40_SECURITY_SECRETS_COMPLIANCE.md`
- `spec_v1/60_TESTING_ACCEPTANCE.md`
- `spec_v1/adr/*` (once written/updated)

Upstream/downstream bridge references (informational but must align):
- Agentelic: telespace ids, optional verification, no auth bypass.
- WHS: delegated invocation and tenant isolation principles.
- Agentromatic: referenced workflows/executions; Delegatic stores references only.

---

## 1) Realignment Goals (Definition of Done)
Delegatic is “realigned” when:
1. **One canonical policy schema** exists and is used consistently in:
   - `00_MASTER_SPEC.md` (concepts + semantics),
   - `10_API_CONTRACTS.md` (wire shape),
   - `30_DATA_MODEL_CONVEX.md` (`policyJson` shape).
2. **One canonical telespace attachment schema** exists and is used consistently (field naming and invariants).
3. All endpoints enforce **deny-by-default** and are **IDOR-safe** (no cross-tenant existence leaks, consistent strategy).
4. Every mutation emits an **append-only audit event** with bounded, secret-free details.
5. A minimal test suite proves the above (tenant isolation, cycles, last-owner protection, audit coverage).

---

## 2) Known Spec Mismatches to Fix (as of now)
### 2.1 Policy inheritance fields inconsistent across docs
Symptoms you should eliminate:
- Master spec uses `inheritMembers: none | viewers_only | all`.
- API contracts previously used `inheritToChildren` boolean.
- Data model guidance used booleans or different naming.

**Target state (canonical)**
Policy JSON uses these canonical fields:
- `inheritPolicies: boolean` (default `true`)  
  Meaning: constraints flow down unless overridden.
- `inheritMembers: "none" | "viewers_only" | "all"` (default `"none"`)  
  Meaning: membership visibility/effective access can be inherited only if explicitly configured.

> Policies are **constraints**, not grants. “Inheriting” does not mean widening access by default.

### 2.2 Telespace attachment field naming inconsistent
Symptoms you should eliminate:
- Data model used `agentelicTelespaceId`.
- API contracts use `telespaceId`.

**Target state (canonical)**
- Use `telespaceId: string` everywhere in Delegatic for Agentelic references.
- Treat it as opaque and untrusted unless verification is implemented.

### 2.3 Identity / tenancy scoping naming confusion (`ownerUserId`)
If the codebase uses `ownerUserId` to mean “tenant scope”, it’s easy to confuse with “org owner role”.

**Target state (canonical)**
- Keep the existing schema if already implemented, but standardize naming in code via helpers:
  - `tenantScopeUserId` (internal) or `accountId` (preferred if you later decouple billing/tenant from user).
- Update comments/types to avoid conflating:
  - “tenant owner” vs “org owner role”.

---

## 3) Lock Decisions (ADRs to create or update)
If these are not already captured, create ADRs. Without these decisions locked, realignment will churn.

### ADR-A: Containment representation
Pick exactly one as the primary invariant:
- Option 1: `organizations.parentOrgId` (strict tree)
- Option 2: `orgEdges` table (tree edges)

**Recommendation:** keep `orgEdges` if you already wrote it and want future DAG support (without cycles). Enforce “tree in v1” via invariant: one parent edge max.

### ADR-B: Policy schema + merge semantics
Lock:
- canonical `policyJson` shape,
- merge function rules,
- monotonic “tightening” constraint,
- explicit widening requirements + audit requirement.

### ADR-C: Not-found vs unauthorized strategy
Lock a portfolio-consistent rule:
- Recommendation: return `NOT_FOUND` for cross-tenant ids to reduce oracle leaks. Log internally with request id.

### ADR-D: Attachment verification strategy (v1)
Lock one:
- v1 default: `verification.status="unverified"` always (no upstream call).
- optional: best-effort verify via Agentelic bridge; verification only annotates or restricts, never widens.

---

## 4) Spec-to-Implementation Mapping (What to align in code)
### 4.1 Data model (Convex / DB)
Tables (or equivalent) that MUST exist and match semantics:
- `users`: external identity mapping.
- `organizations`: org node metadata.
- `orgEdges` (if used): containment edges + no cycles.
- `orgMembers`: membership rows with role + status.
- `orgTelespaces`: telespace attachments by reference.
- `orgPolicies`: versioned policies (at least one active).
- `auditLog`: append-only audit events.

Required invariants to implement in code (not just docs):
- No cycles in containment.
- At most one parent per org (tree in v1).
- No duplicate active membership for `(orgId, userId)`.
- Cannot remove last owner.
- Only one active attachment per `(orgId, telespaceId)`.
- Policies are secret-free and bounded.

### 4.2 API surface (modules/functions/endpoints)
Logical modules that MUST exist:
- `orgs.*`
- `orgMembers.*`
- `orgPolicies.*`
- `orgAttachments.*`
- `audit.*`

Each MUST:
- authenticate user
- enforce tenant scope
- enforce role checks
- validate payload bounds
- emit audit events on mutation

### 4.3 Access control (centralize it)
You should have exactly one place in code that answers:
- “Who is the caller?”
- “What is the caller’s role in org X?”
- “Is caller allowed to perform operation Y under effective policy?”

**Work item**
- Create an `authz` module with functions like:
  - `requireTenant(ctx)`
  - `requireOrgMember(ctx, orgId)`
  - `requireOrgRole(ctx, orgId, minRole)`
  - `computeEffectivePolicy(ctx, orgId)`
  - `requirePolicyAllows(ctx, orgId, capability)`

---

## 5) Implementation Realignment Checklist (Do the work in this order)
### Phase 1 — Schema & Types (no behavior change yet)
- [ ] Confirm canonical policy fields:
  - [ ] `inheritPolicies`
  - [ ] `inheritMembers`
- [ ] Ensure `orgTelespaces` uses `telespaceId` (not `agentelicTelespaceId`) everywhere:
  - [ ] DB field
  - [ ] API request/response
  - [ ] internal types
- [ ] Standardize time fields naming (`createdAtMs`, `updatedAtMs`, etc.) consistently.

### Phase 2 — Core invariants & authz enforcement
- [ ] Implement cycle prevention (on create child org and on move org if supported).
- [ ] Enforce “tree in v1” (at most one parent).
- [ ] Enforce last-owner protection in `orgMembers.remove`.
- [ ] Enforce attachment dedupe for `(orgId, telespaceId)`.

### Phase 3 — Policy semantics (the critical correctness work)
- [ ] Implement `computeEffectivePolicy(orgId)`:
  - [ ] resolves ancestry (root → leaf)
  - [ ] merges policies deterministically
  - [ ] returns `effectivePolicy` + provenance (recommended)
- [ ] Enforce monotonicity:
  - [ ] child may tighten constraints
  - [ ] widening must be explicit and audited
- [ ] Ensure membership inheritance follows `inheritMembers` exactly.

### Phase 4 — Audit log (append-only correctness)
- [ ] Every mutation writes one audit event:
  - create org
  - update org
  - archive org
  - add/remove member
  - role change
  - attach/detach telespace
  - update policy
  - (optional) move org
- [ ] Audit event schema:
  - [ ] stable type/action naming
  - [ ] secret-free bounded details
  - [ ] correlation id (recommended)

### Phase 5 — Consistent error handling
- [ ] Normalize error envelope for all endpoints.
- [ ] Apply not-found strategy consistently.
- [ ] Ensure all validation failures return stable field errors.

---

## 6) Minimal Verification / Test Plan (must exist before declaring “realigned”)
### 6.1 Security & isolation
- [ ] User B cannot `get org` of user A (should look like `NOT_FOUND`).
- [ ] User B cannot list members, attachments, policies, or audit for org A.
- [ ] IDs are not sufficient for access (membership checks always apply).

### 6.2 Containment invariants
- [ ] Cannot create a cycle.
- [ ] Cannot create a second parent (tree constraint).
- [ ] Moving org (if supported) cannot create cycle.

### 6.3 Membership invariants
- [ ] Cannot remove last owner.
- [ ] Only owner/admin can mutate members and roles.
- [ ] Member/viewer cannot attach telespaces or edit policies.

### 6.4 Policy computation
- [ ] Effective policy computed deterministically for a leaf node.
- [ ] Child tightening works (reduces capabilities/limits).
- [ ] Widening is rejected unless explicit widening mechanism is used and audited.

### 6.5 Audit coverage
- [ ] Every mutation creates an audit event.
- [ ] Audit events are append-only (no update/delete).
- [ ] Audit details are bounded and secret-free.

---

## 7) Cross-Product Realignment Notes (Delegatic ↔ Agentelic/WHS/Agentromatic)
### 7.1 Agentelic telespace verification (optional v1)
If you implement verification:
- MUST be best-effort and non-blocking (or clearly blocking with retry/backoff).
- MUST NOT widen access; only annotate status or restrict if invalid.
- MUST never treat attachment as authorization for Agentelic membership.

### 7.2 References to Agentromatic/WHS (optional in v1)
If you add governed assets later:
- store references only (never copy execution logs or agent configs)
- define policy allowlists/constraints as bounded lists (avoid unbounded growth)

---

## 8) Deliverables (What you should produce from this plan)
1. Updated specs (already partially realigned):
   - `10_API_CONTRACTS.md` policy schema and examples
   - `30_DATA_MODEL_CONVEX.md` `telespaceId` naming and policy guidance
2. A single `policy` implementation:
   - deterministic merge + provenance
3. A centralized `authz` layer:
   - reused by all endpoints
4. A test suite mapping to §6 above

---

## 9) If the implementation diverges and you choose to realign *spec to code* instead
If you discover the libs already implement different shapes, do this:
1. Freeze current implementation as “v0”.
2. Decide whether the divergence is **better** than spec v1.
3. If yes: update spec v1 with an ADR that justifies the divergence and update all affected docs.
4. If no: follow phases 1–5 above to bring code into compliance.

> The key is avoiding a half-and-half state where API, data model, and master spec disagree. Pick one canonical truth, then propagate.

---