# delegatic.com — Testing Plan & Acceptance Criteria (v1)
Version: 1.0  
Status: Normative (v1)  
Audience: Engineering (backend, frontend, infra)  
Last updated: 2026-01-24

This document defines the **minimum viable** testing strategy and **acceptance criteria** for Delegatic v1.

Delegatic context:
- **Delegatic = organizations** (AI org chart / governance envelope)
- Organizations can contain:
  - **Agentelic telespaces** (AI-enabled chatrooms)
  - nested child organizations (recursively)
- Telespaces can contain:
  - **Agentromatic workflows** (automations)
  - **WHS agents** (runtime invocations)

Delegatic is primarily a **governance + referencing** layer:
- It models containment, membership, and policy.
- It emits auditable events for changes.
- It does **not** execute workflows (Agentromatic does) and does **not** deploy/invoke agents (WHS does).

Normative language:
- **MUST / MUST NOT / SHOULD / MAY** are used intentionally.

---

## 1) Testing philosophy (what we optimize for)

### 1.1 Priorities (in order)
1. **Tenant isolation** (no cross-tenant reads/writes; no IDOR)
2. **Containment correctness** (no cycles; consistent parent/child semantics)
3. **Membership & role enforcement** (deny-by-default; role gates on every write)
4. **Policy inheritance behavior** (parent-to-child constraints are applied deterministically)
5. **Auditability** (append-only audit log records every mutating operation with attribution)
6. **Integration safety** (references to Agentelic/Agentromatic/WHS do not create confused-deputy behavior)

### 1.2 “Done” definition for v1
Delegatic v1 is “done” when:
- all required unit + integration tests in this doc pass
- all E2E flows in §5 pass in a production-like environment
- security-focused tests in §6 pass (especially IDOR + cycle prevention)
- release gates in §9 pass

### 1.3 Test pyramid (recommended)
- **Unit tests (required):** validation, policy logic, cycle detection, role checks (pure functions)
- **Integration tests (required):** database + API handlers + auth mapping + audit writes
- **E2E tests (required):** golden journey through org creation, membership, containment, and telespace attachment

---

## 2) Environments & prerequisites

### 2.1 Environments
Delegatic SHOULD operate with:
- **dev**: local iteration (may use dev-only flags)
- **staging**: production-like validation + E2E
- **prod**: hardened (no dev-only flags)

### 2.2 Identity and auth prerequisites
Delegatic assumes a stable authenticated identity (recommended: Clerk), mapped server-side to an internal `users` row.

Testing MUST validate:
- unauthenticated calls are rejected for protected endpoints
- authenticated calls are scoped to the correct tenant and org membership

### 2.3 Integration prerequisites (staging)
Delegatic references external systems:
- Agentelic telespaces (by `telespaceId` string reference, and optionally org verification)
- Agentromatic workflows (typically embedded/installed within telespaces; Delegatic may only reference)
- WHS agents (typically referenced via telespaces/workflows; Delegatic may only reference)

For staging E2E, you can choose:
- **Strategy A (preferred):** sandbox integrations exist and can validate references
- **Strategy B:** contract mocks for “verify telespace exists” or “verify workflow exists” checks (if Delegatic performs them)

Delegatic MUST remain correct even if external verification is temporarily unavailable (behavior must be defined and tested: “unverified refs allowed but cannot be enabled for enforcement-sensitive operations” or “hard reject”).

---

## 3) Unit test plan (required)

### 3.1 Validators and schema enforcement
Unit tests MUST cover:
- organization create/update validation:
  - name constraints
  - optional description constraints
  - optional metadata constraints (JSON-safe, bounded)
- membership change validation:
  - role enum constraints (`owner`, `admin`, `member`, `viewer`) or the v1 role set you adopt
  - cannot create invalid role assignments
- containment validation:
  - parentId/childId required and format-valid
  - cannot attach org to itself
- telespace attachment validation:
  - `telespaceId` is non-empty and bounded
  - optional `orgNodeType` enum validation if you model org nodes
- idempotency validation:
  - repeated “attach” operations with the same idempotency key must be stable
  - conflicts (same idempotency key, different payload) produce a stable `CONFLICT` error

### 3.2 Cycle prevention logic (MUST)
Delegatic MUST prevent containment cycles. Unit tests MUST cover:
- direct cycle:
  - attach `A -> A` rejected
- two-node cycle:
  - `A -> B` then `B -> A` rejected
- longer cycle:
  - `A -> B`, `B -> C`, then `C -> A` rejected
- “no-op” reattach:
  - attaching an already-attached child should be:
    - idempotent success OR
    - consistent “already exists” result
  (pick behavior and test it)

### 3.3 Role and permission checks (MUST)
Unit tests MUST cover authorization decisions as pure logic:
- `owner` can do everything
- `admin` can manage membership (if allowed), attach/detach, update policies
- `member` cannot modify org structure/policy
- `viewer` is read-only

You MUST encode and test at least:
- who can create child org
- who can attach telespace
- who can update policy
- who can add/remove members
- who can delete/soft-delete org

### 3.4 Policy inheritance semantics (MUST, if implemented in v1)
If v1 includes policy inheritance, unit tests MUST cover:
- parent policy restricts child operations (inherit “deny”)
- child MAY tighten restrictions
- child MUST NOT implicitly widen access unless explicitly granted

Examples to test (conceptual):
- “allowed tools” or “allowed agents” at org boundary cannot be widened by child without explicit allowlist merge rules
- retention policy cannot exceed parent’s max (if modeled)

If policy inheritance is not implemented in v1, it MUST be explicitly omitted from the code and from acceptance criteria. Do not ship “half inherited” behavior.

### 3.5 Audit event shape (MUST)
Audit events are append-only. Unit tests MUST cover:
- required fields present:
  - `type`, `orgId`, `actor`, `createdAtMs`, `summary` (bounded)
- secrets do not appear in:
  - `summary`
  - `details`
- event types are stable strings (no random concatenation from user input)

---

## 4) Integration test plan (required)

Integration tests exercise:
- persistence layer (e.g., Convex tables)
- API handlers (queries/mutations/http endpoints)
- auth + tenancy enforcement in the real runtime
- audit event writes

### 4.1 Organizations CRUD
Create two users (User A, User B). Tests MUST cover:
1. A creates org `OrgA` ⇒ A becomes owner
2. B cannot read OrgA by id
3. A can update OrgA name/description
4. delete/soft-delete semantics:
   - if soft delete: OrgA becomes non-listable/non-readable for non-admin flows
   - audit events exist for delete action

### 4.2 Membership management
Tests MUST cover:
1. A adds B as `member` to OrgA
2. B can now read OrgA
3. B cannot change policy or structure (member role)
4. A promotes B to `admin` (if supported)
5. B (as admin) can perform admin actions per role matrix
6. A removes B
7. B immediately loses access (server-side enforced)

Invariants tests:
- cannot remove the last owner (unless explicit owner-transfer flow exists and is tested)
- membership changes emit audit events

### 4.3 Containment (org ↔ org)
Tests MUST cover:
1. A creates `OrgA` and `OrgA.Child1`
2. Attach Child1 under OrgA
3. List children of OrgA returns Child1
4. Attempt to create a cycle is rejected (integration-level confirmation)
5. Detach semantics:
   - detach Child1 and ensure it no longer appears under OrgA
   - audit events exist for attach/detach

### 4.4 Telespace attachment (org ↔ telespace reference)
Given a fake or sandbox telespace id `TS1`:
1. Owner/admin attaches `TS1` to OrgA
2. List org resources returns `TS1` attached
3. Non-admin cannot attach/detach telespaces
4. If Delegatic verifies telespace existence:
   - invalid telespace id yields `INVALID_REQUEST` or `NOT_FOUND` (consistent)
5. If Delegatic does not verify existence:
   - attachment is stored as “unverified” or “opaque ref”; behavior is consistent and tested
6. Audit events exist for attach/detach

### 4.5 Policy changes + auditability
1. Owner/admin updates org policy
2. Reads show new policy
3. Audit event emitted with:
   - actor attribution
   - stable `type`
   - bounded summary/details
4. Policy changes do not leak secrets or private user data

### 4.6 Pagination and listing stability
For list endpoints (org list, members list, children list, resources list):
- `limit` bounds are enforced
- `cursor` is opaque and stable
- repeated pagination does not skip/duplicate items
- ordering is deterministic (define and test)

---

## 5) End-to-end (E2E) test plan (required)

E2E tests validate the complete user journey. At minimum, implement these flows.

### 5.1 E2E-01: Signup/login → create org → view org
Steps:
1. User A signs in
2. Create org `OrgA`
3. Navigate to org detail
4. Verify audit timeline shows `org.created`

Pass criteria:
- no 500s
- created org is visible in list and detail
- audit event exists and is rendered (or visible via API)

### 5.2 E2E-02: Add member → member access → revoke access
Steps:
1. A invites/adds B
2. B can view OrgA
3. B cannot modify policy/structure (member)
4. A removes B
5. B loses access immediately (server-side)

Pass criteria:
- membership gating works
- revocation works (no stale access)
- audit events exist for add/remove

### 5.3 E2E-03: Create child org → attach → cycle attempt rejected
Steps:
1. A creates child org `Child1`
2. A attaches Child1 under OrgA
3. Verify org tree view shows Child1 under OrgA
4. Attempt to attach OrgA under Child1 (cycle) is rejected

Pass criteria:
- tree view correct
- cycle rejection returns normalized error envelope and safe messaging
- audit event exists for the successful attach and for the rejected attempt (optional but recommended as an audit record)

### 5.4 E2E-04: Attach telespace reference → view in org resources
Steps:
1. A attaches a telespace reference `TS1` to OrgA
2. Verify OrgA resources view shows TS1
3. B (member) can view resources but cannot detach (role dependent)
4. A detaches TS1

Pass criteria:
- attach/detach works and is auditable
- role gates enforced

### 5.5 E2E-05 (optional but recommended): Nested containment access inheritance behavior
If Delegatic implements inherited access:
1. A creates OrgA → Child1 → Child2 nesting
2. A adds B at OrgA with role `member`
3. B can view child orgs per inheritance policy
4. Removing B at OrgA removes inherited access

Pass criteria:
- inheritance behavior matches spec exactly (no surprises)

---

## 6) Security-focused test suite (required)

### 6.1 Tenant isolation (IDOR) tests (MUST)
Create:
- user A with OrgA
- user B with OrgB

Verify B cannot:
- read OrgA by id
- list OrgA members
- attach/detach Child org under OrgA
- attach/detach telespace to OrgA
- read OrgA audit events

These MUST be enforced server-side and should return:
- `NOT_FOUND` for cross-tenant ids (recommended), OR
- `UNAUTHORIZED` (acceptable)  
Pick one and keep it consistent.

### 6.2 Role enforcement tests (MUST)
Within OrgA:
- `viewer` cannot mutate anything
- `member` cannot manage membership, structure, or policy
- `admin` can do the admin-allowed actions (explicit list)
- `owner` can do everything and cannot remove self if they are the last owner

### 6.3 Cycle prevention tests (MUST)
Reconfirm at integration layer:
- any attempt to create a containment cycle is rejected
- rejection is deterministic and returns normalized errors

### 6.4 Confused deputy / cross-product reference tests (MUST)
Even if Delegatic stores external references:
- attaching `telespaceId` must not grant access to that telespace by itself
- Delegatic membership changes must not be assumed as sufficient authorization by Agentelic (defense-in-depth)

Test expectations:
- Delegatic “org contains telespace TS1” is just a reference; it should not leak message contents or room lists.
- Delegatic endpoints must not proxy through to Agentelic/Agentromatic data without explicit, audited permission and checks.

### 6.5 Secrets leakage tests (MUST)
Ensure secrets never appear in:
- audit log events
- error envelopes
- org policy JSON (if policies can reference secrets, they must reference ids only)

Recommended technique:
- inject a sentinel string that looks like a secret (e.g., `sk_test_...`) in a controlled test input and assert it is:
  - rejected on input OR
  - redacted before persistence  
Pick one consistent strategy and test it.

### 6.6 Abuse / rate limit tests (SHOULD for v1)
If exposed to untrusted tenants:
- rate limit membership changes and attach/detach operations
- ensure repeated operations produce safe errors (`RATE_LIMITED`) and do not corrupt state

---

## 7) Resilience and failure-mode tests (required)

### 7.1 Partial failure during multi-step operations
If any endpoint performs multiple writes (e.g., attach child org + write audit event):
- test atomicity strategy:
  - either “all-or-nothing” in a single transaction, OR
  - a repair mechanism exists and is tested

Pass criteria:
- the system does not enter a state where:
  - containment changed but no audit event exists, OR
  - audit event exists but containment did not change
unless that behavior is explicitly allowed and explained.

### 7.2 Concurrency and races
Test concurrent attempts to:
- attach the same child to the same parent twice
- add the same member twice
- remove a member while another request promotes them
- detach while another request lists tree

Pass criteria:
- no duplicates (invariants preserved)
- errors are normalized and deterministic
- audit log is consistent and append-only

---

## 8) Performance and load testing (recommended)

### 8.1 Org tree traversal
If org tree is queried frequently:
- ensure listing children is O(children) and index-backed
- avoid full graph scans in hot paths

### 8.2 Audit log queries
Audit logs can grow quickly. Ensure:
- indexes support org-scoped audit reads
- pagination works and remains performant for large logs

---

## 9) Release gates (must-pass checklist)

Before shipping v1 to production, all of the following MUST pass:
1. Unit tests: all required suites in §3
2. Integration tests: all required suites in §4
3. E2E tests: flows in §5 on staging
4. Security suite: all tests in §6 (especially IDOR + cycles + secrets)
5. Normalized error envelope consistency:
   - errors return stable `code` + safe `message`
6. No dev-only flags enabled in prod (if any exist)
7. Audit integrity:
   - every mutating operation emits an audit event (or an allowed exception is documented and tested)

---

## 10) Acceptance criteria (system-level definition of done)

Delegatic v1 is “complete” when:

### 10.1 Core org modeling works
- A user can create an org
- A user can create and attach a child org
- The org structure has no cycles and rejects attempts to create one
- Org list/detail endpoints are stable and paginated

### 10.2 Membership and roles are enforced
- Owner/admin can add/remove members
- Members can read but cannot modify structure/policy (per role matrix)
- Access revocation is enforced server-side

### 10.3 Telespace containment works (references)
- Owner/admin can attach telespace references to an org
- Members can view references (if allowed)
- Attach/detach is idempotent or deterministically handled
- No cross-product data is leaked through references

### 10.4 Auditability is real
- Every mutating operation produces a durable, secret-free audit event with:
  - attribution (actor)
  - type string
  - timestamps
  - bounded summary/details

### 10.5 Security is proven
- Tenant isolation tests pass (no IDOR)
- Cycle prevention is enforced
- No secrets in durable artifacts and error envelopes

---

## 11) Appendix: Minimal test matrix (quick reference)

### Unit (MUST)
- org validation + patch validation
- role/permission matrix decisions
- cycle detection logic
- policy inheritance logic (if implemented)
- audit event schema + secret-free enforcement

### Integration (MUST)
- org create/list/get/update/delete (or soft delete)
- membership add/remove/promote (and invariants)
- containment attach/detach + cycle rejection
- telespace ref attach/detach
- audit log append-only + pagination

### E2E (MUST)
- create org and view detail
- add member and revoke access
- create child org and attach; cycle attempt rejected
- attach telespace reference and view resources; detach

### Security (MUST)
- cross-tenant access rejected for all endpoints
- role gates enforced
- secrets leakage checks
- concurrency/race invariants preserved

---