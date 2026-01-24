# delegatic — Security, Secrets, and Compliance (v1)
Version: 1.0  
Status: Normative draft  
Audience: Engineering  
Last updated: 2026-01-24

This document defines the **security, secrets, and compliance requirements** for **Delegatic** (the organization/governance layer).

Delegatic context (canonical):
- **Delegatic = organizations** (AI org chart / governance envelope)
- Organizations can **contain Agentelic telespaces**, recursively
- Telespaces can **contain Agentromatic workflows** and **WHS agents** (via references)

Delegatic is primarily a **governance and orchestration plane**. It must be secure even when:
- it is driven by untrusted inputs (messages, LLM outputs),
- it triggers side effects (via directives and tool routing),
- it integrates across multiple portfolio systems.

Normative language:
- **MUST / MUST NOT / SHOULD / MAY** are used intentionally.

---

## 1) Security objectives (what we protect)

### 1.1 Primary assets
Delegatic MUST protect:
1. **Org structure integrity**
   - org nodes, parent/child links, containment rules, cycle prevention
2. **Membership and role assignments**
   - who can see/use what inside an org tree
3. **Policy and governance configuration**
   - role policies, inheritance rules, allowlists/denylists, limits
4. **Auditability**
   - durable, explainable evidence of “who changed what” and “why”
5. **Cross-system references**
   - references to Agentelic telespaces, Agentromatic workflows/executions, WHS agents/deployments
6. **Secrets (reference-only)**
   - secret ids and secret scopes, never secret values

### 1.2 Security goals (v1)
Delegatic v1 MUST:
- Prevent cross-tenant access (no IDOR on org/telespace/workflow references)
- Enforce org membership and role constraints on every read/write
- Prevent “confused deputy” behavior during orchestration
- Ensure side effects are **explicit**, **permissioned**, **idempotent**, and **audited**
- Never store or emit plaintext secrets in durable artifacts
- Provide a consistent and safe error envelope (no leakage of internals or secrets)

### 1.3 Explicit security boundaries
Delegatic MUST treat these as separate subsystems with their own enforcement:
- **Agentelic** (telespaces): enforces room/message membership; Delegatic governs access by reference
- **Agentromatic** (workflows): enforces workflow ownership and execution; Delegatic governs access and wiring
- **WHS (WebHost.Systems)** (agents): enforces deployment/invoke/telemetry/billing; Delegatic references and constrains usage

Delegatic MUST NOT assume those systems will enforce Delegatic-specific rules. Delegatic must enforce its own policy and pass sufficient context for defense-in-depth.

---

## 2) Threat model (practical)

### 2.1 Actors
- **Org owner/admin** (legitimate)
- **Org member** (legitimate, but may attempt escalation)
- **Malicious tenant user** (attempts cross-org access or privilege escalation)
- **External attacker** (unauthenticated)
- **Compromised client** (token theft; replay)
- **Prompt-injection attacker** (untrusted text instructs LLM to perform actions)
- **Compromised downstream runtime** (WHS data plane compromise risk)
- **Compromised integration** (webhook/event-bus spoofing)

### 2.2 Attack surfaces (non-exhaustive)
- Org APIs: create/update/delete, membership changes, policy changes
- Containment APIs: attach/detach org children, attach/detach telespace references
- Orchestration surfaces: mission start/status/cancel, step execution, directive requests
- Event bus: publish/subscribe scopes and message authenticity
- Audit/event logs: leaking secrets or sensitive metadata
- UI: unsafe rendering of user-controlled strings (XSS), unsafe deep links
- Idempotency keys: replay attacks, collision/abuse
- Policy language: wildcard allowlists granting unintended power

### 2.3 Required mitigations (v1)
Delegatic MUST implement mitigations for:

#### T1: Cross-tenant access (IDOR)
- Every read/write MUST verify membership/ownership of the relevant org node.
- IDs MUST NOT be treated as authorization.
- For cross-system references, Delegatic MUST ensure references are not usable to access another tenant’s resource by proxy.

#### T2: Privilege escalation via org role changes
- Role changes MUST require elevated permissions (owner/admin), and MUST be audited.
- Removing the last owner MUST be disallowed (or require an explicit “transfer ownership” flow).

#### T3: Confused deputy orchestration
- Side-effectful actions MUST cross an explicit directive boundary (see §6).
- Delegatic MUST apply deny-by-default role policies for tools, directives, and resources.
- Delegatic MUST attribute every side effect to an actor context and org scope.

#### T4: Secret leakage
- No secret values in:
  - org policy configs,
  - mission/step records,
  - tool inputs/outputs persisted to logs,
  - audit logs,
  - errors.
- Redaction MUST be applied best-effort before persistence and before responses.

#### T5: Event bus spoofing / unauthorized subscriptions
- Event publish/subscribe MUST be scoped and permissioned using bus-agnostic permissions:
  - `event:publish:<pattern>`
  - `event:subscribe:<pattern>`
- If the event bus supports auth/signatures, Delegatic MUST enforce verification.

#### T6: Abuse / DoS (API or orchestration storms)
- Rate limit:
  - mission starts
  - membership/policy mutations
  - event-driven orchestration triggers
- Enforce bounded payload sizes and bounded concurrency.

#### T7: XSS / unsafe rendering
- Any user-provided strings rendered in UI MUST be escaped or sanitized.
- Policy and audit fields that may include arbitrary strings MUST be treated as untrusted and rendered safely.

---

## 3) Authentication and identity

### 3.1 Auth provider (recommended)
Delegatic SHOULD use the same identity provider as the rest of the stack (recommended: Clerk), but the requirement is:
- requests MUST map to a stable authenticated identity (`externalId`)
- the server MUST map that identity to an internal `users` row (or equivalent) for consistent access control

### 3.2 Authentication requirements
- All endpoints MUST reject unauthenticated requests with `UNAUTHENTICATED`.
- Auth tokens MUST NOT be logged.
- If service-to-service calls exist (e.g., Delegatic verifying Agentelic ownership), they MUST use server-side credentials and MUST NOT be callable from browsers without auth.

### 3.3 Session security
- Tokens MUST NOT be stored in org records, mission records, or audit logs.
- Any correlation identifiers must be opaque and non-sensitive.

---

## 4) Authorization and access control (tenant isolation)

### 4.1 Tenant model (v1 baseline)
Delegatic v1 SHOULD start with a **single-owner-per-org** model:
- An organization has exactly one owner (or at minimum “must always have ≥1 owner”).
- Membership is managed within the org boundary.
- Team/org-wide external RBAC (enterprise) is out of scope for v1.

### 4.2 Roles (v1 minimum)
Delegatic MUST support at least:
- `owner`
- `admin`
- `member`
- `viewer`

Roles MUST gate:
- org creation/deletion/archival
- membership changes
- policy changes
- containment changes (org children and telespace attachments)
- mission/orchestration actions (start/cancel)

### 4.3 Inheritance and containment rules (security-critical)
Delegatic MUST define and enforce **policy inheritance** rules:
- Parent org MAY grant access to child orgs by inheritance.
- Child org MAY tighten access further.
- Child org MUST NOT silently widen access beyond what is explicitly granted.

Recommended v1 rule (simple and safe):
- Effective access to a node is the intersection of:
  - explicit membership grants at that node, plus
  - inherited grants from ancestors (if enabled by policy),
  - with child-level restrictions applied last.

### 4.4 Cycle prevention
- Org containment MUST NOT allow cycles.
- Attempts to create a cycle MUST be rejected deterministically (`CONFLICT` or `INVALID_REQUEST`) and audited.

### 4.5 “Attach” operations (org ↔ telespace / workflow / agent references)
For attaching a resource reference under an org:
- Caller MUST have permission to modify the org node (owner/admin).
- Delegatic SHOULD verify (best-effort) that the caller has access to the referenced resource in its owning system:
  - telespace: Agentelic membership / ownership
  - workflow: Agentromatic ownership / access
  - agent: WHS ownership / entitlement
- If verification is not available, the reference MUST be marked “unverified” and MUST NOT be used for automatic orchestration until verified.

---

## 5) Secrets strategy (normative)

### 5.1 Core rule (MUST)
Delegatic MUST NOT store plaintext secret values in any durable artifact, including:
- org configs / policies
- mission and step state
- directives
- signals
- audit logs
- API errors

### 5.2 Secret references only
Delegatic MAY store **secret identifiers** only (reference semantics), such as:
- `secretId: "SLACK_BOT_TOKEN_ID"`
- `secretRef: { provider: "vault", id: "..." }`

Rules:
- Secret references are sensitive metadata and MUST be access-controlled (not necessarily visible to all members).
- Secret references MUST NOT be embedded into prompts or tool calls as raw values.

### 5.3 Secret injection and use (server-side only)
If Delegatic orchestrates steps that require secrets:
- Secrets MUST be injected server-side into the execution environment (e.g., WHS provider injection or a Core directive runner).
- The client MUST NOT receive secret values.
- Logs and audit artifacts MUST remain secret-free (apply redaction best-effort).

### 5.4 Redaction requirements (best-effort, deterministic)
Delegatic MUST apply redaction before persisting or returning:
- known secret ids (mask values if they appear)
- common token patterns (API keys, bearer tokens, private keys)
- any config keys with high-risk names (e.g., `token`, `secret`, `apiKey`) if accidentally included

---

## 6) Orchestration safety model (signals vs directives)

Delegatic is often driven by LLM outputs; therefore, the architecture MUST prevent “drive-by side effects”.

### 6.1 Side effects require directives (MUST)
Any operation that can cause side effects MUST cross an explicit directive boundary, such as:
- publishing events
- subscribing/unsubscribing
- invoking other agents/tools with side effects
- writing to filesystem
- deploying or invoking WHS agents
- creating/modifying Agentromatic workflows or triggering runs (unless explicitly allowed)

Delegatic SHOULD:
- plan steps as “intent” first
- request directives for execution
- record the directive id and outcome as signals/audit events

### 6.2 Deny-by-default allowlists (MUST)
Delegatic MUST enforce role-based allowlists for:
- tool identifiers (namespaced `<agent_id>/<tool_name>`)
- directive types
- resource scopes:
  - graph collections
  - filesystem paths
  - event topic patterns
  - secret id scopes

Wildcards (`*`) MUST be treated as high-risk and SHOULD require owner-level approval and explicit justification in audit logs.

### 6.3 Confused deputy prevention (MUST)
When Delegatic triggers actions “on behalf of” a role or a company:
- It MUST ensure the requested tool/directive is allowed by:
  1) org policy,
  2) the role policy,
  3) the execution runner’s own permission approvals (authoritative boundary).
- It MUST attach an explicit actor + scope context:
  - `orgId`, `orgNodeId`
  - initiating user (if any)
  - mission id / step id / correlation id

Delegatic MUST NOT implicitly run actions with “owner privileges” unless explicitly configured and approved.

### 6.4 Idempotency for side effects (MUST)
- Missions MUST support `idempotency_key`.
- Side-effectful directives MUST have directive-level idempotency derived from:
  - `missionId`, `stepId`, directive type, and target reference.
- Retrying a mission MUST NOT duplicate side effects.

---

## 7) Data handling, privacy, and retention

### 7.1 Data minimization (required)
Delegatic MUST:
- store references to external resources, not their full contents (unless necessary for governance)
- avoid persisting raw prompts, raw tool outputs, or large payloads in mission state
- keep audit events bounded and secret-free

### 7.2 PII handling (assume it exists)
Org and mission artifacts may include user names/emails. Delegatic MUST:
- avoid sending PII to third-party analytics by default
- restrict audit/event exports to authorized roles

### 7.3 Retention (v1 defaults)
Delegatic SHOULD define retention policies (exact values may be configured later):
- org structure + membership audit: 365 days (or “indefinite until delete” if storage permits)
- mission records: 90–180 days
- step records: 90–180 days
- event-bus subscription records (if stored): 90 days after unsubscribed

If deletion is supported, it MUST be consistent with auditability:
- prefer soft delete for org nodes to preserve audit history.

---

## 8) Logging, auditability, and evidence

### 8.1 Audit events (MUST)
Delegatic MUST record append-only, secret-free audit events for:
- org create/update/archive/delete (or soft-delete)
- membership changes
- policy changes
- containment changes (org↔org, org↔telespace)
- mission start/cancel and terminal outcomes
- directive requests and outcomes (at least references)

Each audit event MUST include:
- timestamp
- actor (user/system)
- org scope (orgId / nodeId)
- stable type string
- correlation fields (missionId/stepId/directiveId if applicable)
- bounded details (redacted)

### 8.2 Evidence and explainability
Delegatic MUST make it possible to answer:
- Who initiated this mission?
- What policy allowed/denied each action?
- What side effects were requested and did they occur?
- What references to external systems were produced?

### 8.3 Error logging (MUST be safe)
Errors may contain sensitive details. Delegatic MUST:
- log only safe summaries and stable error codes
- never log auth tokens or secret values
- bound upstream error body snippets (if recorded at all)

---

## 9) Transport security and API hardening

### 9.1 TLS
All traffic MUST use TLS in production.

### 9.2 CORS
Browser clients MUST be limited to known origins.

### 9.3 Input validation
All endpoints MUST validate:
- required fields and types
- maximum lengths / payload sizes
- enums and allowed patterns
- unknown fields SHOULD be rejected where feasible

### 9.4 Normalized errors
Errors returned to clients MUST be normalized:
- stable `code`
- safe, user-displayable `message`
- optional `details` that MUST NOT contain secrets

Recommended error codes:
- `UNAUTHENTICATED`
- `UNAUTHORIZED`
- `NOT_FOUND`
- `INVALID_REQUEST`
- `CONFLICT`
- `RATE_LIMITED`
- `LIMIT_EXCEEDED`
- `UPSTREAM_ERROR`
- `INTERNAL_ERROR`

---

## 10) Compliance posture (v1)
Delegatic v1 is not “certified,” but MUST NOT block a SOC2-style future posture.

Delegatic SHOULD support:
- role-based access enforcement (testable)
- append-only audit logs for privileged changes
- least-privilege secret handling (references only)
- export capability for audit logs (authorized roles only)
- documented retention and deletion semantics

---

## 11) Security testing checklist (v1)

### 11.1 Tenant isolation / IDOR (MUST)
Add tests for:
- cannot read org by id without membership
- cannot list children or attachments of an org without membership
- cannot attach/detach telespaces without org admin permission
- cannot modify policies without org admin permission

### 11.2 Role enforcement (MUST)
Tests:
- member cannot add/remove members
- viewer cannot start missions (if restricted)
- only owner can perform owner-only operations (e.g., archive/delete, wildcard policy grants)

### 11.3 Cycle prevention (MUST)
Tests:
- cannot attach an org as a child of itself
- cannot create an indirect cycle via multi-step updates

### 11.4 Orchestration safety (MUST)
Tests:
- side-effectful operations require directives (no direct tool side effects)
- deny-by-default role allowlists are enforced
- idempotency keys prevent duplicate directives/side effects

### 11.5 Secrets leakage (MUST)
Tests:
- ensure secrets never appear in:
  - org policy records
  - mission state
  - audit logs
  - error envelopes
- sentinel secret string does not appear in persisted artifacts

### 11.6 Event bus security (SHOULD if event bus is part of v1)
Tests:
- publish/subscribe requires explicit permission scopes
- spoofed events are rejected if signatures/auth are supported

---

## 12) Security acceptance criteria (Definition of Done)
Delegatic security is “v1 complete” when:

1. **Tenant isolation**
   - All endpoints enforce org membership/role checks.
   - IDOR tests pass for org reads/writes and attachments.

2. **Governance correctness**
   - Role changes and policy changes are permissioned and audited.
   - No-cycle containment enforcement is correct and tested.

3. **Orchestration safety**
   - Side effects occur only via explicit directives.
   - Deny-by-default allowlists are enforced at plan time and run time.
   - Idempotency prevents duplicate side effects.

4. **Secrets**
   - No plaintext secrets are stored or returned.
   - Redaction is applied best-effort before persistence and before responses.

5. **Auditability**
   - Every mutating operation writes an append-only, secret-free audit event with attribution and correlation fields.

---