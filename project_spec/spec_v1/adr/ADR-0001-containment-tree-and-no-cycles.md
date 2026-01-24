# ADR-0001: Organization Containment Model = Tree (v1) + No Cycles
- **Status:** Accepted
- **Date:** 2026-01-24
- **Owners:** Engineering
- **Applies to:** `delegatic.com` (v1)
- **Related Specs:**  
  - `project_spec/spec_v1/00_MASTER_SPEC.md` (containment + governance)  
  - `project_spec/spec_v1/30_DATA_MODEL_CONVEX.md` (orgEdges, invariants, cycle checks)  
  - `project_spec/spec_v1/10_API_CONTRACTS.md` (children list, optional move)

---

## Context

Delegatic models **organizations** as nested containers that can contain:
- child organizations (recursive containment),
- attachments (initially: Agentelic `telespaceId` references; later possibly other resource refs).

Delegatic is a governance plane. Its containment model impacts:
- authorization and inheritance semantics (who can see what across an org subtree),
- correctness and performance of tree traversal,
- auditability (“why does this user have access?”),
- safety (preventing confused-deputy and privilege escalation via structural tricks).

We need a v1 containment model that is:
- simple to reason about,
- hard to misuse,
- efficient enough for typical org trees,
- compatible with future expansion (DAG-without-cycles if needed later).

---

## Decision

### 1) Containment is a **strict tree** in v1
In v1, Delegatic organization containment MUST be a **tree**:
- Each org node has **zero or one** active parent.
- A parent may have many children.
- Root orgs have no parent.
- Containment edges represent parent → child.

Implementation guidance:
- Model containment as `orgEdges` rows (preferred, even for a tree).
- Enforce “single active parent” for a child:
  - before inserting a new active edge `(parent → child)`, ensure no other active edge exists with `childOrgId = child`.

> Even if the storage uses edges, the semantic is tree, not DAG.

### 2) Cycles are forbidden (hard invariant)
Delegatic MUST reject any operation that would create a cycle.
This includes:
- direct self-edge (A → A),
- two-node cycle (A → B, then B → A),
- longer cycles (A → B, B → C, then C → A),
- re-parent/move operations that introduce indirect cycles.

Cycle prevention is enforced at write time:
- On any edge creation or org move, check reachability:
  - if `parentOrgId` is reachable from `childOrgId` via active edges, reject.

### 3) “Move org” (re-parenting) is optional and constrained
If v1 includes a move operation:
- It MUST preserve the tree invariant (single parent) and MUST NOT create cycles.
- Authorization MUST be strict:
  - recommended: caller must be `owner` on the org being moved and `admin+` on the destination parent.
- The operation MUST be audited as a containment change.

If “move” is not implemented in v1, containment can still be established at creation time (create child org under a parent) without supporting re-parenting.

---

## Rationale

### Why tree (v1) instead of DAG-without-cycles?
Tree containment provides:
- **Predictable inheritance**: “one path to root” simplifies effective policy computation and membership propagation rules.
- **Simpler authorization reasoning**: fewer “multiple parent” edge cases where permissions merge unexpectedly.
- **Simpler UI**: org charts and navigation trees are naturally tree-structured.
- **Cheaper validation**: ensuring “single parent” removes many ambiguous DAG cases.

DAG-without-cycles is attractive for “matrix orgs” but adds complexity:
- multiple ancestry paths,
- policy merge conflicts,
- visibility ambiguity,
- risk of unintended privilege widening via multiple-parent grants.

We can revisit DAG later once there is a concrete need and a tested merge model.

### Why explicit cycle checks even with “tree by design”?
Even if we expose only “create child org under parent,” future features (moves, bulk imports, API misuse) can introduce cycles accidentally. Explicit cycle checks:
- harden invariants,
- keep the model safe against later feature expansion,
- prevent infinite traversal bugs and confusing authorization outcomes.

---

## Consequences

### Positive
- Containment is easy to explain and audit.
- Effective policy computation is straightforward (unique ancestor chain).
- Safer default: reduces accidental privilege widening.
- UI implementations are simpler (tree view).

### Negative / Tradeoffs
- Cannot represent multiple-parent org relationships (matrix orgs) in v1.
- Move/re-parenting (if supported) requires cycle checks and careful auditing.
- Some future features may need migration if DAG support is introduced later.

---

## Implementation Notes (Guidance)

### Data model expectations (v1)
- Use `orgEdges` with:
  - `parentOrgId`, `childOrgId`,
  - `deletedAtMs` for soft-delete edges (recommended),
  - tenant scoping (`ownerUserId`) if using a single-owner tenancy model in v1.
- Enforce invariants:
  1. `parentOrgId !== childOrgId`
  2. single active parent for each child
  3. no cycles
  4. both orgs belong to the same tenant scope (v1)

### Cycle check algorithm (write-time)
For an attempted new edge `(P → C)`:
1. Reject if `P == C`.
2. Run a traversal from `C` following active edges to descendants:
   - if `P` is found reachable, reject (“would create cycle”).
3. Apply guardrails to avoid unbounded work:
   - max depth (e.g., 50),
   - max visited nodes (e.g., 10,000),
   - fail closed if limits exceeded.

Error semantics:
- Return `CONFLICT` or `INVALID_REQUEST` with safe message (no sensitive details).
- Optionally write an audit event indicating a rejected cycle attempt (policy choice).

### Auditing
Any successful containment mutation MUST write an append-only audit event, including:
- `type`: `org.child_attached` / `org.child_detached` / `org.moved`
- actor attribution
- parent/child org ids (safe, internal ids)
- timestamp
- bounded details

### Query patterns (expected)
- list children: `parentOrgId` indexed
- get parent: `childOrgId` indexed (optional; useful for ancestry path)
- get ancestry path: repeated parent lookups (tree makes it deterministic)

---

## Alternatives Considered

### A) DAG-without-cycles (multi-parent)
**Pros**
- Supports matrix orgs.
- Flexible modeling for cross-functional structures.

**Cons**
- Complex policy and membership inheritance semantics.
- Higher risk of unintended access grants (multiple parents).
- More complex UI and audit reasoning.

**Decision:** Rejected for v1; consider for v2 with explicit policy merge rules and strong tests.

### B) Materialized path / nested set model
**Pros**
- Fast ancestry queries.

**Cons**
- Harder writes (re-parent updates many nodes).
- More complex to keep correct with concurrent edits.
- Still requires cycle prevention logic.

**Decision:** Rejected for v1.

### C) Store only `parentOrgId` on org documents
**Pros**
- Simplest storage for strict trees.

**Cons**
- Harder to soft-delete edges and audit edge history.
- Harder to evolve to DAG if needed later.

**Decision:** Prefer edge table (`orgEdges`) even for tree semantics.

---

## Acceptance Criteria
- It is impossible to create a cycle via any supported API mutation.
- Each org has at most one active parent (tree invariant).
- Containment changes are audited.
- Traversal endpoints behave deterministically (unique ancestry chain).

---

## Follow-ups
- ADR for policy inheritance rules (member inheritance default should remain deny-by-default unless explicitly enabled).
- ADR for “move org” support (if needed) including authorization and audit semantics.
- If DAG support becomes necessary, add:
  - ADR for policy merge semantics across multiple parents,
  - migration plan and compatibility strategy.
