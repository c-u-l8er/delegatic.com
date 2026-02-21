# ADR-0002: Policy Inheritance Is Monotonic by Default (Delegatic v1)
- **Status:** Accepted
- **Date:** 2026-01-24
- **Owners:** Engineering
- **Scope:** Delegatic org policy model + parent→child inheritance semantics
- **Related Specs:**
  - `project_spec/spec_v1/00_MASTER_SPEC.md` (Policy + inheritance stance)
  - `project_spec/spec_v1/10_API_CONTRACTS.md` (Policy endpoints + error semantics)
  - `project_spec/spec_v1/30_DATA_MODEL_CONVEX.md` (Policy storage + access control)

---

## 1) Context

Delegatic is the portfolio’s **organization/governance layer**. An org tree can contain:
- child orgs (nested governance)
- Agentelic telespace references (attachments)
- (future) org-level catalogs of Agentromatic workflows and WHS agents

Delegatic needs an org policy system that:
- is **safe by default** (deny-by-default governance)
- is **auditable** (changes explainable; no silent privilege widening)
- is **deterministic** (effective policy is stable and computable)
- supports **inheritance** down an org tree without creating surprising permission escalation

The most dangerous class of failure is *accidental privilege widening*:
- A permissive parent policy could unintentionally grant broad access to all descendants.
- A child could override a parent in a way that widens access without explicit approval.
- “Implicit inheritance” can silently leak visibility/operations across the org.

Therefore, policy inheritance needs a hard safety property:
- child nodes must not become **more permissive** than ancestors unless an explicit, audited action grants it.

---

## 2) Decision

### 2.1 Monotonic inheritance (default rule)
**Effective policy MUST be monotonic (non-widening) by default.**

When computing the effective policy for an org node:
- Inheritance from root → leaf may only **maintain or tighten** permissions/constraints.
- Effective constraints are computed by combining all ancestor policies with the node’s policy using **monotone operators**.

In practice:
- “Permissions” become stricter (AND/intersection/min) as you go down the tree.
- “Limits” become tighter (min) as you go down the tree.
- “Allow-lists” can only shrink (intersection) unless explicitly widened via a grant.

### 2.2 Explicit widening requires an explicit grant object (not a normal override)
If the product later requires the ability to widen something at a child (e.g., allow attaching telespaces only in a specific child org):
- widening MUST NOT be expressible as a normal child policy override
- widening MUST be expressed as an explicit **grant** that is:
  - owner-approved (recommended)
  - scoped (who/what/where)
  - time-bounded if appropriate
  - audited as a privileged operation

In v1, widening is **not required**. The system should ship without widening and keep inheritance monotonic.

### 2.3 Policy inheritance flag behavior
Two distinct concepts exist:
1. **Policy inheritance** (constraints): whether a node uses ancestor policies as constraints.
2. **Membership inheritance** (visibility/access): whether memberships granted at ancestors imply membership at descendants.

This ADR governs **policy inheritance** (constraints). v1 recommended defaults:
- `policiesInheritToChildren = true` (constraints flow down)
- `membershipsInheritToChildren = false` (deny-by-default for access; membership is explicit per org unless/until a dedicated inheritance rule is added)

---

## 3) Normative policy merge semantics (v1)

### 3.1 Merge order
Policies are applied in this order:
1. root org policy
2. … each ancestor in path order …
3. target org policy (leaf)

The result is the **effective policy**.

### 3.2 Field-by-field merge operators (monotone)
For each field type, use a monotone operator:

#### A) Boolean “capability” flags
Example fields:
- `allowTelespaceAttach`
- `allowCreateChildOrgs`
- `allowPolicyEdits` (if represented as a policy capability)
- `requireVerificationForAttachments`

Rule:
- `effective = ancestor1 AND ancestor2 AND ... AND leaf`
- If any ancestor denies, descendants deny.

#### B) Numeric limits / quotas
Example fields:
- `limits.maxChildOrgs`
- `telespaceConstraints.maxAttachedTelespaces`
- `limits.maxMembers`

Rule:
- `effective = MIN(nonNullValuesAcrossPath)`
- If a node does not specify a value, it inherits the current effective value unchanged.
- If no value is ever specified, it is treated as “unbounded” at the policy layer, but SHOULD still be bounded by platform hard caps.

#### C) Allow-lists / deny-lists (sets)
Example fields (future-friendly):
- `allowedTelespaceIds[]`
- `allowedWHSAgentIds[]`
- `allowedAgentromaticWorkflowIds[]`

Rule (recommended v1):
- Allow-lists are constraints and can only shrink:
  - `effectiveAllowlist = INTERSECTION(allSpecifiedAllowlists)`
  - If no allowlist is specified anywhere, interpret as “no allowlist constraint” (i.e., allow all that the role/other constraints allow).
- Deny-lists can only grow:
  - `effectiveDenylist = UNION(allSpecifiedDenylists)`

Interpretation rule:
- Deny wins over allow (if both exist and overlap, deny takes precedence).

#### D) Default values (non-privilege-bearing)
Example fields:
- `defaultRoleForNewMembers`

Rule:
- “Nearest override wins” is acceptable because it does not widen privileges by itself.
- However, the allowed set of values must be validated (enum) and role assignment is still enforced by role-gated APIs.

### 3.3 Child tightening is always allowed
A child org MAY tighten any monotone field:
- set a capability from true → false
- reduce a limit (e.g., 1000 → 50)
- add items to deny-list
- add/replace an allowlist that intersects (shrinks) the effective allowlist

### 3.4 Child widening is rejected in v1
If the system detects a child policy change that would widen effective policy compared to the parent effective policy, the change MUST be rejected with a normalized error:
- `code: "CONFLICT"` (or `"INVALID_REQUEST"` if you treat it as invalid input)
- safe message: “Policy change would widen permissions; requires explicit grant.”
- safe details hint: “Remove widening fields or request an explicit widening grant (not supported in v1).”

---

## 4) Consequences

### 4.1 Positive
- Prevents silent privilege escalation down org trees.
- Keeps inheritance deterministic and explainable.
- Simplifies security auditing: you can trust “descendants are never more permissive than ancestors”.
- Reduces “confused deputy” risk where child orgs accidentally gain broader powers.

### 4.2 Negative / tradeoffs
- Some legitimate use cases (local exceptions) are harder until explicit grant machinery exists.
- Users may expect “child override” to work like typical config inheritance (last-write-wins); this ADR intentionally rejects that for privilege-bearing fields.
- Requires careful documentation and UI affordances so users understand “why you can’t widen here”.

---

## 5) Alternatives considered

### A) Last-write-wins (child overrides parent)
Rejected: allows accidental widening with a single child edit and is difficult to audit/justify.

### B) Parent wins (no overrides)
Rejected: too rigid; prevents legitimate tightening and local restrictions.

### C) Complex policy language (CEL/Rego)
Rejected for v1: too heavy for early-stage; increases implementation risk and review burden. A simple monotone merge is safer and faster.

### D) Membership inheritance by default
Rejected for v1: it silently widens visibility/access to descendants. If membership inheritance exists, it must be explicit, policy-driven, and audited.

---

## 6) Implementation notes (guidance)

### 6.1 Store policy as versioned, validated JSON
- `orgPolicies.policyJson` should be validated against a schema.
- Limit size (e.g., 32–64KB) and reject obvious secret-bearing keys/values best-effort.

### 6.2 Compute effective policy as a pure function
Implement:
- `computeEffectivePolicy(pathPolicies: Policy[]): { effective: Policy, provenance: ... }`

Where:
- `pathPolicies` is in ancestor→leaf order.
- `provenance` (optional but recommended) records which org contributed which final values (helps UI explainability).

### 6.3 Enforce monotonicity at write time
When updating a policy at org X:
1. Compute `effectiveBefore` at X using old policy
2. Compute `effectiveAfter` at X using proposed policy
3. If `effectiveAfter` is more permissive than `effectiveBefore` for any privilege-bearing field, reject.

“More permissive” checks by field type:
- boolean: `false -> true` is widening
- limit number: increasing the limit is widening
- allowlist: adding elements (or switching from constrained to unconstrained) is widening
- denylist: removing elements is widening

### 6.4 Audit everything
Policy updates are privileged operations:
- Always append an audit event:
  - `type: "policy.updated"`
  - actor attribution
  - org scope
  - safe summary (no secrets)
  - bounded details (e.g., “changed maxChildOrgs from 100 to 50”)

### 6.5 Keep v1 simple: avoid membership inheritance until explicitly required
This ADR does not define membership inheritance. If/when added:
- add a separate ADR
- ensure it does not violate deny-by-default posture
- consider explicit “inherit viewers only” mode rather than “inherit all”.

---

## 7) Examples

### 7.1 Tightening allowed
Parent effective:
- `allowTelespaceAttach = true`
- `maxAttachedTelespaces = 1000`

Child sets:
- `allowTelespaceAttach = false`
- `maxAttachedTelespaces = 50`

Result:
- effective is tighter; accepted.

### 7.2 Widening rejected (v1)
Parent effective:
- `allowTelespaceAttach = false`

Child sets:
- `allowTelespaceAttach = true`

Result:
- widening; reject with `CONFLICT` and hint.

### 7.3 Limits tightening
Parent:
- `maxMembers = 1000`

Child:
- `maxMembers = 200`

Effective:
- 200

### 7.4 Allowlist intersection
Parent allowlist:
- `[TS1, TS2, TS3]`

Child allowlist:
- `[TS2, TS3, TS4]`

Effective allowlist:
- `[TS2, TS3]` (intersection)

---

## 8) Follow-ups
- ADR: Membership inheritance semantics (if desired) with explicit defaults and audit posture.
- ADR: Explicit widening grants (if/when needed), including:
  - grant schema
  - approval workflow
  - audit requirements
  - expiry/revocation semantics
- UI spec: show effective policy + explain provenance; show why a change is rejected.

---