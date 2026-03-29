# Delegatic Documentation

> **Structure first. Then delegate.**

Welcome to the documentation hub for **Delegatic** — the governance and
orchestration layer for multi-agent AI systems. Delegatic defines who can do what,
enforces policy boundaries, manages organizational hierarchy, and provides
immutable audit trails for every decision.

Delegatic does not execute tasks, host agents, or run workflows — it defines the
structure within which all other [&] products operate.

---

## Core Concepts

### Containment Trees

Organizations nest in a strict tree. No cycles. No DAGs. Structure IS the
authorization model. Each org is a GenServer process supervised by its parent.

### Monotonic Policy Inheritance

Children can tighten but never widen parent restrictions:
- **Booleans** → AND (child can only disable)
- **Numerics** → MIN (child can only lower limits)
- **Allow-lists** → INTERSECTION (child can only narrow)
- **Deny-lists** → UNION (child can only add)

Privilege escalation is impossible by design.

### Append-Only Audit

Every mutation is logged immutably with actor, timestamp, and provenance.
Audit events are processed through a Broadway pipeline for guaranteed delivery.

### Goal-Aware Governance

Delegatic stores references to Graphonomous GoalGraph `goal_id`s so that task
requests, workflow runs, and sensitive mutations can be authorized and audited
in the context of an explicit goal.

---

## Documentation Map


```{toctree}
:maxdepth: 1
:caption: Homepages

[&] Ampersand Box <https://ampersandboxdesign.com>
Graphonomous <https://graphonomous.com>
BendScript <https://bendscript.com>
WebHost.Systems <https://webhost.systems>
Agentelic <https://agentelic.com>
AgenTroMatic <https://agentromatic.com>
Delegatic <https://delegatic.com>
Deliberatic <https://deliberatic.com>
FleetPrompt <https://fleetprompt.com>
GeoFleetic <https://geofleetic.com>
OpenSentience <https://opensentience.org>
SpecPrompt <https://specprompt.com>
TickTickClock <https://ticktickclock.com>
```

```{toctree}
:maxdepth: 1
:caption: Root Docs

[&] Protocol Docs <https://docs.ampersandboxdesign.com>
Graphonomous Docs <https://docs.graphonomous.com>
BendScript Docs <https://docs.bendscript.com>
WebHost.Systems Docs <https://docs.webhost.systems>
Agentelic Docs <https://docs.agentelic.com>
AgenTroMatic Docs <https://docs.agentromatic.com>
Delegatic Docs <https://docs.delegatic.com>
Deliberatic Docs <https://docs.deliberatic.com>
FleetPrompt Docs <https://docs.fleetprompt.com>
GeoFleetic Docs <https://docs.geofleetic.com>
OpenSentience Docs <https://docs.opensentience.org>
SpecPrompt Docs <https://docs.specprompt.com>
TickTickClock Docs <https://docs.ticktickclock.com>
```

```{toctree}
:maxdepth: 2
:caption: Delegatic Docs

spec/README
```

---

## Architecture at a Glance

| Component | Role | OTP Pattern |
|-----------|------|-------------|
| **OrgNode** | One org. Holds local policy, caches effective policy. | GenServer |
| **PolicyEngine** | Computes effective policies, enforces monotonic inheritance. | GenServer + ETS |
| **AuditWriter** | Batched, append-only audit event writes. | Broadway pipeline |
| **OrgTreeCache** | In-memory tree for cycle detection and path lookups. | GenServer + ETS |
| **Dashboard** | Real-time org tree, policy editor, audit log viewer. | Phoenix LiveView |

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Effective policy lookup (ETS hot) | < 5us p99 |
| Effective policy computation (cold) | < 20ms p99 |
| Cycle detection (depth-50 tree) | < 1ms |
| Audit write throughput (Broadway) | > 10K events/sec |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | Elixir 1.17+ |
| Framework | Phoenix 1.8+ (LiveView for dashboard) |
| Database | PostgreSQL 16+ via Ecto |
| Hot Cache | ETS (effective policies, org tree, memberships) |
| Audit Pipeline | Broadway (batched inserts, back-pressure) |
| Background Jobs | Oban (webhooks, compliance exports) |
| Telemetry | :telemetry + Prometheus |

---

## Ecosystem Role

Delegatic is the **governance layer** of the [&] stack:

| Product | Relationship |
|---------|-------------|
| **Agentelic** | Telespace attachments — agents registered under orgs |
| **AgenTroMatic** | Policy check API — deliberations respect governance |
| **WebHost.Systems** | Deployment gates — deploy requires policy approval |
| **FleetPrompt** | Install authorization — marketplace installs need org permission |
| **Graphonomous** | Goal references — actions scoped to durable intent |

---

## Project Links

- **Spec:** [Technical Specification](spec/README.md)
- **[&] Protocol ecosystem:** `AmpersandBoxDesign/`

---

*[&] Ampersand Box Design — delegatic.com*
