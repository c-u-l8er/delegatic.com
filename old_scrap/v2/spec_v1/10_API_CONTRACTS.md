# delegatic.com — API Contracts (v1)
Version: 1.0  
Status: Draft (normative once implemented)  
Audience: Engineering (backend + frontend)  
Last updated: 2026-01-24

This document defines the **API contracts** for **Delegatic (organizations)**:
- request/response envelopes
- normalized errors
- auth/tenancy rules
- resource shapes
- endpoints for organizations, membership, containment, telespace attachments, and audit logs

Delegatic’s role in the stack:
- **Delegatic = organizations** (nested governance envelope)
- **Agentelic = telespaces** (chatrooms) that are *contained by* organizations
- **Agentromatic = workflows** that are *embedded inside* telespaces
- **WHS (WebHost.Systems) = agents** that power workflows and in-room invocations

Delegatic v1 is primarily a **governance + structure** system:
- it stores org trees (no cycles), membership, and policies
- it stores references to contained telespaces
- it emits auditable events for every mutation
- it does **not** execute workflows and does **not** deploy/invoke agents directly

Normative language:
- **MUST / MUST NOT / SHOULD / MAY** are used intentionally.

---

## 1) Principles

### 1.1 Delegatic is a governance plane (hard rule)
Delegatic:
- stores organization structure + membership + policy
- stores references to Agentelic telespaces (and optionally future resource types)

Delegatic MUST NOT:
- store plaintext secrets in org configs/policies/audit logs
- become the runtime for workflows or agents

### 1.2 Versioning and stability
- All endpoints are versioned under `/v1`.
- Additive changes are preferred:
  - new optional fields
  - new endpoints
- Breaking changes MUST be introduced under `/v2` (or explicit versioned resources).

### 1.3 Deny-by-default
If a request’s authorization is ambiguous:
- return a safe `UNAUTHORIZED` / `NOT_FOUND` (pick a consistent strategy; see §3.3)
- do not proceed with mutations

### 1.4 Pagination
List endpoints MUST support cursor pagination:
- request: `limit` + optional `cursor`
- response: `items` + optional `nextCursor`

### 1.5 Idempotency
For endpoints that create durable records or change containment, clients SHOULD send:
- `Idempotency-Key: <opaque string>`

Server MUST ensure:
- same idempotency key + same authenticated user + same endpoint semantics ⇒ returns the same result
- idempotency keys do not leak across tenants
- idempotency keys do not silently bind different payloads (conflict must be handled deterministically)

### 1.6 Time
- Timestamps are returned as epoch milliseconds (`...AtMs`).
- If ISO strings are added later, they MUST be derived and consistent.

---

## 2) Common types

### 2.1 IDs
All IDs are opaque strings.

Core Delegatic:
- `orgId`
- `orgNodeId` (optional if you model nodes separately from orgs)
- `membershipId`
- `policyId` (optional; can be `orgId`-scoped)
- `auditEventId`

Cross-product references:
- `telespaceId` (Agentelic)
- `workflowId` / `executionId` (Agentromatic) — typically referenced indirectly via telespaces in v1
- `agentId` / `deploymentId` (WHS) — typically referenced indirectly via telespaces/workflows in v1

### 2.2 Roles (v1 minimum)
`OrgRole`:
- `owner`
- `admin`
- `member`
- `viewer`

Semantics (v1 recommended baseline):
- `viewer`: read org structure and attached telespaces visible to org
- `member`: viewer + participate in org (no membership/structure changes)
- `admin`: member + manage child orgs, attach/detach telespaces, manage members (except owner transfer)
- `owner`: full control; can delete/archive org; can change org policy; can manage admins

Owner transfer is out of scope for v1 unless explicitly added.

### 2.3 Pagination
`PageCursor` is an opaque string.

Response:
```json
{
  "items": [],
  "nextCursor": "string or null"
}
```

### 2.4 Limits (recommended baseline)
Server SHOULD enforce:
- org name max: 120 chars
- description max: 2,000 chars
- max children per org: 1,000 (or lower; choose)
- max attached telespaces per org: 10,000 (or lower; choose)
- max membership per org: 10,000 (or lower; choose)
- request payload max: 256KB
- policy JSON max: 64KB (secret-free)

---

## 3) Normalized errors (REQUIRED)

### 3.1 Error envelope
All non-2xx responses MUST be:
```json
{
  "error": {
    "code": "STRING_ENUM",
    "message": "Safe, user-displayable summary",
    "requestId": "opaque string",
    "details": {
      "hint": "optional safe hint",
      "fields": {
        "fieldName": "optional field-level error"
      }
    }
  }
}
```

### 3.2 Error codes (v1)
Auth:
- `UNAUTHENTICATED`
- `UNAUTHORIZED`

Resource:
- `NOT_FOUND`
- `CONFLICT`
- `INVALID_REQUEST`

Limits:
- `RATE_LIMITED`
- `LIMIT_EXCEEDED`

Server:
- `INTERNAL_ERROR`

Integration (optional in v1, reserved):
- `UPSTREAM_ERROR` (Agentelic validation/check failed if Delegatic performs verification calls)
- `UPSTREAM_TIMEOUT`

### 3.3 Not found vs unauthorized strategy
To reduce resource existence leaks (IDOR hardening), Delegatic SHOULD:
- return `NOT_FOUND` when a resource exists but caller cannot access it
- return `UNAUTHORIZED` only when the caller is authenticated but lacks permission for a clearly-scoped action on a resource they can otherwise read

Pick one consistent approach; v1 recommended:
- `NOT_FOUND` for cross-tenant ids and forbidden-by-membership
- `UNAUTHORIZED` for within-org role denials (e.g., member tries to attach telespace)

### 3.4 Validation errors
On validation failure, `details.fields` SHOULD be populated.

Example:
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid organization payload",
    "requestId": "req_...",
    "details": {
      "fields": {
        "name": "Required",
        "parentOrgId": "Invalid format"
      }
    }
  }
}
```

---

## 4) Authentication & authorization

### 4.1 Authentication
All endpoints require an authenticated caller.

Recommended mechanism (portfolio-aligned):
- `Authorization: Bearer <JWT>` (e.g., Clerk)

### 4.2 Tenancy and visibility
Delegatic MUST be tenant-isolated:
- a caller can only read orgs they are a member of (or own)
- list endpoints must return only orgs visible to caller

### 4.3 Required authorization checks (v1)
Every endpoint MUST:
1. resolve current user identity
2. determine membership for the target org (if applicable)
3. enforce role requirements
4. apply policy constraints (deny-by-default)

---

## 5) Resource shapes

### 5.1 Organization
```json
{
  "orgId": "org_...",
  "name": "string",
  "description": "string or null",
  "status": "active | archived",
  "createdAtMs": 0,
  "updatedAtMs": 0,
  "archivedAtMs": 0,
  "root": {
    "parentOrgId": "org_... or null",
    "depth": 0
  },
  "stats": {
    "memberCount": 0,
    "childOrgCount": 0,
    "attachedTelespaceCount": 0
  }
}
```

Notes:
- `root.parentOrgId` is `null` for a top-level org.
- `depth` is optional; if included it must reflect the containment tree (and be updated on moves if moves exist).

### 5.2 Membership
```json
{
  "membershipId": "m_...",
  "orgId": "org_...",
  "user": {
    "userId": "u_...",
    "externalId": "optional external auth id",
    "email": "optional",
    "name": "optional"
  },
  "role": "owner | admin | member | viewer",
  "status": "active | invited | removed",
  "invitedByUserId": "u_... or null",
  "createdAtMs": 0,
  "updatedAtMs": 0
}
```

Notes:
- v1 MAY skip invites and allow “direct add” only; if so, `status` can be `active|removed` only.

### 5.3 Org policy (deny-by-default)
Policies are secret-free JSON objects with stable semantics.

```json
{
  "orgId": "org_...",
  "version": 1,
  "policy": {
    "inheritPolicies": true,
    "inheritMembers": "none",
    "defaultRoleForNewMembers": "member",
    "allowTelespaceAttach": true,
    "telespaceConstraints": {
      "maxAttachedTelespaces": 1000,
      "requireVerification": false
    },
    "limits": {
      "maxChildOrgs": 1000,
      "maxMembers": 10000
    }
  },
  "updatedAtMs": 0
}
```

### 5.4 Attached telespace reference
```json
{
  "orgTelespaceId": "ot_...",
  "orgId": "org_...",
  "telespaceId": "ts_...",
  "status": "attached | detached",
  "attachedAtMs": 0,
  "detachedAtMs": 0,
  "metadata": {
    "label": "optional display label",
    "notes": "optional, secret-free"
  },
  "verification": {
    "status": "unverified | verified | failed",
    "checkedAtMs": 0,
    "error": "optional safe error"
  }
}
```

Notes:
- `verification` is optional in v1. If Delegatic does not call Agentelic to verify, leave `status=unverified` and treat it as informational.

### 5.5 Audit event (append-only)
```json
{
  "auditEventId": "ae_...",
  "orgId": "org_...",
  "type": "org.created | org.updated | org.archived | member.added | member.removed | org.child_attached | telespace.attached | telespace.detached | policy.updated | ...",
  "actor": {
    "type": "user | system",
    "userId": "u_... or null"
  },
  "createdAtMs": 0,
  "summary": "string",
  "details": {
    "bounded": "object"
  }
}
```

Rules:
- MUST be secret-free
- MUST be bounded (size-limited)
- MUST be append-only

---

## 6) Endpoints (HTTP form, v1)

Base path:
- `/v1`

All requests:
- MUST include `Authorization: Bearer <JWT>`
- SHOULD include `Idempotency-Key` for create/attach/detach endpoints

All responses:
- success: 2xx with JSON body
- error: non-2xx with §3 error envelope

### 6.1 Organizations

#### 6.1.1 Create org (top-level)
`POST /v1/orgs`

Request:
```json
{
  "name": "string",
  "description": "string or null"
}
```

Response:
```json
{
  "org": { "orgId": "org_...", "name": "..." }
}
```

AuthZ:
- any authenticated user can create
- creator becomes `owner`

Idempotency:
- RECOMMENDED

#### 6.1.2 Create child org
`POST /v1/orgs/:orgId/children`

Request:
```json
{
  "name": "string",
  "description": "string or null"
}
```

Response:
```json
{
  "org": { "orgId": "org_child_...", "name": "..." }
}
```

AuthZ:
- `admin` or `owner` on parent org

Invariants:
- MUST NOT create cycles (tree by construction here)
- child org MUST record `parentOrgId = :orgId`
- policy inheritance (if enabled) SHOULD apply (see §6.4)

Idempotency:
- RECOMMENDED

#### 6.1.3 List orgs visible to current user
`GET /v1/orgs?limit=50&cursor=...`

Response:
```json
{
  "items": [
    { "orgId": "org_...", "name": "...", "status": "active" }
  ],
  "nextCursor": "string or null"
}
```

AuthZ:
- returns orgs where caller has membership (any role)

#### 6.1.4 Get org
`GET /v1/orgs/:orgId`

Response:
```json
{
  "org": { "orgId": "org_...", "name": "...", "status": "active" },
  "myRole": "owner | admin | member | viewer"
}
```

AuthZ:
- membership required

#### 6.1.5 Update org
`PATCH /v1/orgs/:orgId`

Request:
```json
{
  "name": "string (optional)",
  "description": "string or null (optional)"
}
```

Response:
```json
{ "ok": true }
```

AuthZ:
- `admin` or `owner`

#### 6.1.6 Archive org (soft-delete semantics)
`POST /v1/orgs/:orgId/archive`

Response:
```json
{ "ok": true }
```

AuthZ:
- `owner` only (recommended)

Notes:
- Archived orgs SHOULD remain readable to members as archived (read-only), but mutation endpoints must reject.

---

### 6.2 Org tree traversal / containment

#### 6.2.1 List children (direct)
`GET /v1/orgs/:orgId/children?limit=200&cursor=...`

Response:
```json
{
  "items": [
    { "orgId": "org_child_...", "name": "...", "status": "active" }
  ],
  "nextCursor": "string or null"
}
```

AuthZ:
- membership required (any role)

#### 6.2.2 Get org ancestry (path to root)
`GET /v1/orgs/:orgId/ancestors?limit=50&cursor=...`

Response:
```json
{
  "items": [
    { "orgId": "org_root_...", "name": "Root Org" },
    { "orgId": "org_parent_...", "name": "Parent Org" }
  ],
  "nextCursor": null
}
```

AuthZ:
- membership required

Notes:
- May return ordered root→parent or parent→root; document and keep consistent.

#### 6.2.3 Move org (optional v1; discouraged unless needed)
`POST /v1/orgs/:orgId/move`

Request:
```json
{
  "newParentOrgId": "org_... or null"
}
```

Response:
```json
{ "ok": true }
```

AuthZ:
- `owner` on the org being moved AND `admin+` on the destination parent (if non-null)

Invariants:
- MUST reject if move would create a cycle
- MUST update depth/path caches if stored

---

### 6.3 Membership

#### 6.3.1 List members
`GET /v1/orgs/:orgId/members?limit=200&cursor=...`

Response:
```json
{
  "items": [
    { "membershipId": "m_...", "user": { "userId": "u_..." }, "role": "member", "status": "active" }
  ],
  "nextCursor": "string or null"
}
```

AuthZ:
- membership required (recommended: any member can list; alternatively restrict to admin+)

#### 6.3.2 Add member (direct add)
`POST /v1/orgs/:orgId/members`

Request:
```json
{
  "user": {
    "externalId": "string (preferred) or null",
    "email": "string or null"
  },
  "role": "admin | member | viewer"
}
```

Response:
```json
{
  "membership": {
    "membershipId": "m_...",
    "orgId": "org_...",
    "role": "member",
    "status": "active"
  }
}
```

AuthZ:
- `admin` or `owner`

Idempotency:
- RECOMMENDED (especially when adding by email/externalId)

Notes:
- Avoid leaking whether an email corresponds to an account. If lookup fails, return a safe error:
  - either `INVALID_REQUEST` with generic message, or
  - create an invite record (if invites are implemented)

#### 6.3.3 Update member role
`PATCH /v1/orgs/:orgId/members/:membershipId`

Request:
```json
{
  "role": "admin | member | viewer"
}
```

Response:
```json
{ "ok": true }
```

AuthZ:
- `owner` (recommended) or `admin+` with restrictions
- MUST NOT allow removing last owner
- v1: if owner transfer is not supported, role cannot become `owner` via this endpoint

#### 6.3.4 Remove member
`DELETE /v1/orgs/:orgId/members/:membershipId`

Response:
```json
{ "ok": true }
```

AuthZ:
- `admin` or `owner`
- MUST NOT allow removing the last owner
- MUST record audit event

---

### 6.4 Policies

#### 6.4.1 Get policy
`GET /v1/orgs/:orgId/policy`

Response:
```json
{
  "policy": {
    "orgId": "org_...",
    "version": 1,
    "policy": {
      "inheritPolicies": true,
      "inheritMembers": "none"
    },
    "updatedAtMs": 0
  }
}
```

AuthZ:
- membership required (recommended: members can read policy; admins can edit)

#### 6.4.2 Update policy
`PUT /v1/orgs/:orgId/policy`

Request:
```json
{
  "version": 1,
  "policy": {
    "inheritPolicies": true,
    "inheritMembers": "none",
    "defaultRoleForNewMembers": "member",
    "allowTelespaceAttach": true,
    "telespaceConstraints": {
      "maxAttachedTelespaces": 1000,
      "requireVerification": false
    },
    "limits": {
      "maxChildOrgs": 1000,
      "maxMembers": 10000
    }
  }
}
```

Response:
```json
{ "ok": true }
```

AuthZ:
- `owner` only (recommended) or `admin+` (if acceptable)

Validation (required):
- policy must be JSON-safe and bounded
- MUST reject obvious secret-bearing keys/values best-effort (`token`, `secret`, `apiKey`, etc.)
- MUST ensure the new policy cannot silently widen access in a way that violates v1 constraints (see §1.3)

Inheritance semantics:
- If `inheritPolicies=true`, child orgs without explicit overrides SHOULD be interpreted as inheriting *constraints* (implementation may materialize snapshots or compute dynamically; must be consistent).
- Membership inheritance MUST follow `inheritMembers` (`none | viewers_only | all`) and MUST NOT silently widen access beyond what is explicitly configured and audited.

---

### 6.5 Telespace attachments (Agentelic references)

#### 6.5.1 Attach telespace to org
`POST /v1/orgs/:orgId/telespaces`

Request:
```json
{
  "telespaceId": "ts_...",
  "metadata": {
    "label": "optional",
    "notes": "optional, secret-free"
  }
}
```

Response:
```json
{
  "orgTelespace": {
    "orgTelespaceId": "ot_...",
    "orgId": "org_...",
    "telespaceId": "ts_...",
    "status": "attached",
    "attachedAtMs": 0
  }
}
```

AuthZ:
- `admin` or `owner`

Idempotency:
- STRONGLY recommended

Validation rules (required):
- `telespaceId` must be a non-empty opaque string
- MUST prevent duplicate attachments:
  - either by treating `(orgId, telespaceId)` as unique
  - or by returning the existing attachment on idempotent retry

Optional verification (v1 MAY):
- Delegatic MAY call Agentelic to verify the telespace exists and is attachable by the caller.
- If verification is not implemented, store `verification.status="unverified"` and rely on downstream enforcement.

#### 6.5.2 List attached telespaces
`GET /v1/orgs/:orgId/telespaces?limit=200&cursor=...`

Response:
```json
{
  "items": [
    { "orgTelespaceId": "ot_...", "telespaceId": "ts_...", "status": "attached" }
  ],
  "nextCursor": "string or null"
}
```

AuthZ:
- membership required (any role)

#### 6.5.3 Detach telespace
`DELETE /v1/orgs/:orgId/telespaces/:orgTelespaceId`

Response:
```json
{ "ok": true }
```

AuthZ:
- `admin` or `owner`

Notes:
- Detach SHOULD be soft (status to `detached` with `detachedAtMs`) to preserve auditability.

---

### 6.6 Audit log

#### 6.6.1 List audit events
`GET /v1/orgs/:orgId/audit?limit=200&cursor=...`

Optional filters (server MAY support):
- `type=org.updated`
- `sinceAtMs=...`

Response:
```json
{
  "items": [
    { "auditEventId": "ae_...", "type": "org.created", "createdAtMs": 0, "summary": "..." }
  ],
  "nextCursor": "string or null"
}
```

AuthZ:
- membership required (recommended: any role can read audit; optionally restrict to admin+)

Security notes:
- audit details MUST be secret-free and bounded
- avoid leaking PII beyond what is needed for governance UX

---

## 7) State machines (normative, minimal)

### 7.1 Org state
`Organization.status`:
- `active`
- `archived`

Transitions:
- `active -> archived` (owner only)
- `archived` is terminal in v1 (no unarchive unless explicitly added)

---

## 8) Security requirements (API-level)
Required:
- tenant isolation on every endpoint
- membership checks on every org-scoped endpoint
- role checks on every mutation
- cycle prevention on any containment mutation that can create cycles
- idempotency support for create/attach operations that can be retried

MUST NOT:
- return plaintext secrets in any response
- accept plaintext secrets in org policies (best-effort rejection)
- include auth tokens in logs/audit

Recommended:
- rate limit membership mutations and attach/detach endpoints
- return `NOT_FOUND` for cross-tenant ids to reduce probing

---

## 9) Open questions (to resolve as ADRs)
These should become ADRs in `spec_v1/adr/`:

1. **Containment model**: strict tree vs DAG-without-cycles; and whether “move org” is supported in v1.
2. **Policy inheritance**: dynamic vs materialized snapshot; how overrides are represented.
3. **Identity and invites**: direct add by externalId only vs email invites; who can see member lists.
4. **Telespace verification**: whether Delegatic calls Agentelic to verify/authorize attachments.
5. **Audit retention/export**: retention period; export format and access rules.

---

## 10) Minimal v1 contract checklist (Definition of Done for API)
Delegatic v1 API is “done” when:
- [ ] Create org works and assigns owner membership.
- [ ] Create child org works; org containment is queryable; no cycles are possible.
- [ ] List/get org endpoints enforce membership (IDOR-safe).
- [ ] Membership add/remove/role change endpoints enforce role rules and “no last owner removal”.
- [ ] Attach/detach telespace endpoints work and emit audit events.
- [ ] Audit log endpoint returns append-only events for all mutations.
- [ ] All errors use the normalized envelope with stable `code` and safe `message`.

---