# Delegatic — User Stories

Canonical user-story catalog. Used for Playwright tests + Claude Design input for governance dashboard.

**Scope:** OS-006 agent governance shim — org trees, policies, signed authorization, audit.
**Unit-test surface covered:** `delegatic/test/**` (42 tests — authorization kernel v0.1.0). Full org-tree + effective-policy layer still spec-only.

---

## Story 1 · Create organization hierarchy and attach policies

- **Persona:** Enterprise governance officer setting up multi-team platform
- **Goal:** Define org tree (HQ → Engineering → ML Team) with monotonic policy inheritance
- **Prerequisite:** Delegatic running; auth setup
- **Steps:**
  1. Navigate to dashboard; create root org "Acme Corp"
  2. Create "Engineering" under Acme; set policy `allow_agent_deploy: true, max_agents: 50`
  3. Create "ML Team" under Engineering; propose `max_agents: 5` (tightening)
  4. PolicyEngine validates: tighter than parent? YES. Accept.
  5. ETS cache invalidated; PubSub broadcasts change
- **Success:** Org tree visible; policy inheritance resolved in <5μs; child policies enforce tighter constraints
- **Covers:** `PolicyEngine.compute_effective`, monotonic validation, ETS cache — ~15 unit tests
- **UI status:** planned (spec-complete; kernel ships today without UI)
- **Claude Design hook:** Org tree visualization with policy badges showing inheritance chain

## Story 2 · Attach goal reference and enforce goal-aware policy

- **Persona:** Operator linking Graphonomous goals to governance decisions
- **Goal:** Attach a goal_id to org; enforce policy constraints keyed by goal context
- **Prerequisite:** Graphonomous goal exists; Delegatic org exists
- **Steps:**
  1. POST `/orgs/{org_id}/goals {goal_id, tags}`
  2. OrgGoal attachment created (reference-only; goal content NOT copied)
  3. Task arrives with `goal_id` + action `deploy_agent`
  4. PolicyEngine checks: goal attached? parent goal not suspended? action authorized under this goal?
  5. Audit event recorded with goal_id
- **Success:** Goal-scoped audit trail; policies keyed by durable intent; revocation doesn't delete goal
- **Covers:** org_goal attachment, reference storage, audit creation, goal-aware routing — ~10 unit tests
- **UI status:** planned
- **Claude Design hook:** Audit log entry with goal_id + collapsed goal context panel

## Story 3 · Enforce deny-by-default + detect violations

- **Persona:** Security team auditing access
- **Goal:** No agent can deploy unless explicitly authorized; detect violations in real-time
- **Prerequisite:** Root org `allow_agent_deploy: false`; child orgs inherit
- **Steps:**
  1. Intern Team agent attempts `deploy_agent`
  2. PolicyEngine walks ancestors: Intern Team → ML Team → Engineering → Acme
  3. Effective: `allow_agent_deploy: false` (inherited from root)
  4. Verdict: DENY
  5. Audit event logged; dashboard highlights violation; PubSub alerts
- **Success:** Policy enforced; violation auditable; no privilege escalation
- **Covers:** monotonic AND logic, ancestor traversal, deny-by-default — ~12 unit tests
- **UI status:** planned
- **Claude Design hook:** Real-time violation ticker; drill-down to policy inheritance chain

## Story 4 · Re-authorize destructive action at replay time

- **Persona:** Dark-factory operator replaying learned workflow on different machine
- **Goal:** Trace includes file deletions → each destructive step re-authorized via Delegatic
- **Prerequisite:** body-os trace recorded; Delegatic policy attached
- **Steps:**
  1. Destination agent calls `body.os.replay(Trace)` with `action: "file_delete@/ws/tmp/*"`
  2. Before executing: `check_policy(org_id, action: "file_delete", goal_id)`
  3. Delegatic verifies: actor in org? scope attached? action ≤ policy limit?
  4. If authorized: proceed; audit event with trace_id. If denied: fail-fast, emit SurpriseSignal
- **Success:** Cross-machine replay is governed; destructive actions re-authorized per environment
- **Covers:** policy check at commit time, audit emission with trace_id — ~8 unit tests (v0.1 kernel)
- **UI status:** planned
- **Claude Design hook:** Re-auth checkpoint UI — action + decision + actor approval log

## Story 5 · Export compliance report with goal-linked audit trail

- **Persona:** Compliance officer proving to auditor that agent actions were authorized
- **Goal:** Report: "All deployments under approved goals; all destructive actions policy-checked"
- **Prerequisite:** 1000+ audit events collected
- **Steps:**
  1. GET `/orgs/{root}/compliance/export?period=q1&filter=goal_scoped`
  2. AuditWriter outputs append-only event stream grouped by goal_id with causal chain
  3. Report: for each goal, actions taken, decisions, outcomes, surprises, links to Graphonomous/PRISM
  4. Cryptographic commitment: report hash stored immutably
- **Success:** Compliance team proves governance to external auditor
- **Covers:** audit export, event grouping, report generation — future phase
- **UI status:** planned (Phase 3 enterprise)
- **Claude Design hook:** Timeline view — goal with linked audit events, expandable to policy decisions + outcomes

---

**Tests to implement first (MCP-only until UI exists):** Story 3 (deny-by-default) — use MCP inspector pattern to show policy decision + audit trail; strong investor story.
