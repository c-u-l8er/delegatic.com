# Delegatic — Governance for AI Agent Teams
## Technical Specification v0.2 (Elixir/OTP)

**Date:** February 21, 2026  
**Status:** Draft  
**Author:** [&] Ampersand Box Design  
**License:** MIT (open core)  
**Stack:** Elixir · OTP · Phoenix · Ecto · PostgreSQL

---

## 1. Overview

Delegatic is the **governance and orchestration layer** for multi-agent AI systems. It defines who can do what, enforces policy boundaries, manages organizational hierarchy, and provides immutable audit trails for every decision. It does not execute tasks, host agents, or run workflows — it defines the structure within which all other [&] products operate.

As the stack becomes more autonomous over time, Delegatic also becomes the place where **durable intent is referenced and governed**: it stores **references** to Graphonomous GoalGraph `goal_id`s (never the goal content itself) so that task requests, workflow runs, and sensitive mutations can be authorized and audited *in the context of an explicit goal*.

### 1.1 The Problem

As AI agent teams scale beyond a handful of agents, organizations face a governance crisis: who authorized this agent to access customer data? Why did this workflow run without approval? Which team's budget was charged? Current agent frameworks (CrewAI, LangGraph, AutoGen) have zero governance primitives. They assume a single developer controls everything. That breaks at enterprise scale.

### 1.2 Design Principles

1. **Containment trees** — Organizations nest in a strict tree. No cycles. No DAGs. Structure IS the authorization model.
2. **Monotonic policy inheritance** — Children can tighten but never widen parent restrictions. Privilege escalation is impossible by design.
3. **Deny by default** — No implicit permissions. Every capability must be explicitly granted at some level.
4. **Append-only audit** — Every mutation is logged immutably with actor, timestamp, and provenance.
5. **References, not copies** — Delegatic stores IDs to telespaces, agents, workflows, and goals. It never copies their data. Zero duplication.
6. **Goal-aware governance** — Delegatic can require that actions and workflows declare a `goal_id`, enforce policies against the goal’s context (org, horizon, status), and ensure audits remain interpretable over long horizons.
7. **Governance, not execution** — Delegatic defines boundaries. AgenTroMatic automates within them. Distinct layers.

### 1.3 Why Elixir

The containment tree maps directly to OTP supervision trees. Each organization is a GenServer process supervised by its parent org's supervisor. Policy changes propagate via message passing. The BEAM's concurrency model means effective policy lookups happen in microseconds via ETS, and real-time dashboard updates flow through Phoenix PubSub with zero additional infrastructure.

### 1.4 One-Liner

> "The platform that delegates. Organization hierarchy, policy inheritance, and audit trails for AI agent teams."

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         DELEGATIC                             │
│                    Governance Layer (Elixir/OTP)               │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   Phoenix Router                   Phoenix LiveView            │
│   ├── /api/v1/orgs/*               └── Org tree visualization  │
│   ├── /api/v1/memberships/*        └── Policy editor           │
│   ├── /api/v1/policies/*           └── Audit log viewer        │
│   ├── /api/v1/attachments/*        └── Membership manager      │
│   └── /api/v1/audit/*              └── Real-time policy diffs  │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────────────┐  ┌──────────────┐  ┌──────────────┐    │
│   │  Org Supervisor   │  │  Policy      │  │  Audit       │    │
│   │  Tree             │  │  Engine      │  │  Writer      │    │
│   │                   │  │              │  │              │    │
│   │  DynamicSupervisor│  │  GenServer   │  │  GenServer   │    │
│   │  per root org.    │  │  + ETS cache │  │  Async batch │    │
│   │  GenServer per    │  │  Effective   │  │  insert via  │    │
│   │  org node.        │  │  policy in   │  │  Broadway.   │    │
│   │  Tree topology    │  │  microsecs.  │  │  Append-only │    │
│   │  mirrors data.    │  │  PubSub on   │  │  Postgres.   │    │
│   │                   │  │  changes.    │  │              │    │
│   └──────┬───────────┘  └──────┬───────┘  └──────┬───────┘    │
│          │                     │                  │            │
│   ┌──────▼─────────────────────▼──────────────────▼───────┐    │
│   │               PostgreSQL (via Ecto)                    │    │
│   │                                                        │    │
│   │  Tables: orgs | memberships | policies | org_telespaces│    │
│   │          audit_events | invitations                    │    │
│   │  Indexes: parent_org_id, user_id, org_id, timestamp    │    │
│   └────────────────────────┬───────────────────────────────┘    │
│                            │                                   │
│   ┌────────────────────────▼───────────────────────────────┐    │
│   │               ETS (hot cache)                          │    │
│   │  :delegatic_effective_policies — org_id → policy map   │    │
│   │  :delegatic_org_tree — org_id → {parent, children}    │    │
│   │  :delegatic_memberships — {org_id, user_id} → role    │    │
│   └────────────────────────────────────────────────────────┘    │
│                                                                │
├──────────────────────────────────────────────────────────────┤
│   External References (by ID only)                             │
│   ├── Agentelic telespace IDs                                  │
│   ├── Graphonomous GoalGraph goal IDs                          │
│   ├── AgenTroMatic workflow IDs (optional)                     │
│   └── WHS agent IDs (optional)                                 │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 GoalGraph Integration (Graphonomous)

Delegatic does **not** implement goals; Graphonomous does. Delegatic integrates by **referencing** GoalGraph nodes and using them as durable routing / auditing anchors.

**Key ideas:**
- **Reference-only**: Delegatic stores `goal_id` (Graphonomous) and optional local tags, but never copies goal content, decomposition, or completion criteria.
- **Goal-aware routing boundary**: when a task/workflow request arrives with a `goal_id`, Delegatic can:
  - verify the caller/org is authorized to act under that goal reference,
  - enforce policy constraints (e.g. “long-horizon goals require admin role”, “agent deploy actions must be goal-scoped”),
  - write audit events with `goal_id` so later reviews can reconstruct intent.

**Contract expectations (cross-product):**
- Orchestrators/executors (e.g. AgenTroMatic / OpenSentience wrappers) should include `goal_id` on task requests whenever the work is part of a persistent objective.
- If `goal_id` is omitted, Delegatic treats the action as *unscoped* (stricter defaults and/or additional approvals are expected at higher layers).

### 2.2 OTP Supervision Tree

```
Delegatic.Application
├── Delegatic.Repo (Ecto/Postgres)
├── DelegaticWeb.Endpoint (Phoenix)
├── Delegatic.PolicyEngine (GenServer + ETS owner)
├── Delegatic.AuditWriter (Broadway pipeline)
├── Delegatic.OrgTreeCache (GenServer + ETS owner)
├── Delegatic.RootOrgSupervisor (DynamicSupervisor)
│   ├── Delegatic.OrgNode ("Acme Corp" — GenServer)
│   │   ├── Delegatic.OrgNode ("Engineering" — GenServer)
│   │   │   ├── Delegatic.OrgNode ("ML Team")
│   │   │   └── Delegatic.OrgNode ("Intern Team")
│   │   └── Delegatic.OrgNode ("Sales")
│   └── Delegatic.OrgNode ("Other Root Org")
└── Phoenix.PubSub (policy change broadcasts)
```

Each `Delegatic.OrgNode` GenServer holds:
- Org metadata (name, slug, status)
- Local policy rules (this org's overrides only)
- Cached effective policy (computed on startup, invalidated on parent change)
- List of child org PIDs

### 2.3 Component Summary

| Component | Responsibility | OTP Pattern |
|-----------|---------------|-------------|
| `Delegatic.OrgNode` | One organization. Holds local policy, caches effective policy, enforces tree invariants. | GenServer, supervised by parent OrgNode or RootOrgSupervisor |
| `Delegatic.PolicyEngine` | Computes effective policies, enforces monotonic inheritance, manages ETS cache. | GenServer + ETS table owner |
| `Delegatic.AuditWriter` | Batches audit events and writes to Postgres. Guarantees append-only. | Broadway pipeline |
| `Delegatic.OrgTreeCache` | In-memory tree topology for fast cycle detection and path lookups. | GenServer + ETS table owner |
| `DelegaticWeb.*` | Phoenix router, controllers, LiveView dashboards. | Phoenix conventions |

---

## 3. Data Model (Ecto Schemas)

### 3.1 Organizations

```elixir
defmodule Delegatic.Orgs.Org do
  use Ecto.Schema
  import Ecto.Changeset

  schema "orgs" do
    field :name, :string
    field :slug, :string
    field :status, Ecto.Enum, values: [:active, :suspended, :archived]
    field :metadata, :map, default: %{}

    belongs_to :parent_org, __MODULE__
    has_many :child_orgs, __MODULE__, foreign_key: :parent_org_id
    has_one :policy, Delegatic.Policies.Policy
    has_many :memberships, Delegatic.Memberships.Membership
    has_many :org_telespaces, Delegatic.Attachments.OrgTelespace
    has_many :org_goals, Delegatic.Attachments.OrgGoal

    timestamps()
  end

  def changeset(org, attrs) do
    org
    |> cast(attrs, [:name, :slug, :status, :metadata, :parent_org_id])
    |> validate_required([:name, :slug])
    |> validate_format(:slug, ~r/^[a-z0-9\-]+$/)
    |> unique_constraint(:slug)
    |> foreign_key_constraint(:parent_org_id)
  end
end
```

**Invariants (enforced in context + OrgNode GenServer):**
- `parent_org_id` must reference an existing active org or be nil (root)
- Cycle detection: on every parent change, traverse ETS tree cache — reject if current org appears in ancestor path
- Max depth: 50 levels. Max total orgs per root: 10,000
- Slug globally unique, lowercase alphanumeric + hyphens

### 3.2 Goal Attachments (GoalGraph References)

Delegatic stores goal references as attachments so orgs can:
- scope automation to explicit durable intent,
- audit actions against a goal over long time horizons,
- revoke/disable goal-linked automation without deleting goal data.

**Attachment model (reference-only):**
- `org_id` — owning org in Delegatic
- `goal_id` — Graphonomous GoalGraph node ID (opaque string)
- `tags` — optional local labels (e.g. `"customer:acme"`, `"initiative:q1"`)
- `created_by` — actor who attached the goal reference
- `created_at`

**Important:** goal status (`active/completed/failed/suspended`), decomposition, and completion criteria live in Graphonomous, not Delegatic.

#### OrgGoal Attachment Schema (Ecto)

```elixir
defmodule Delegatic.Attachments.OrgGoal do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "org_goals" do
    belongs_to :org, Delegatic.Orgs.Org, type: :binary_id

    # Opaque reference to Graphonomous GoalGraph node ID
    field :goal_id, :string

    # Local-only annotations (do not duplicate goal content)
    field :tags, {:array, :string}, default: []
    field :metadata, :map, default: %{}

    # Governance lifecycle of the attachment itself
    field :status, Ecto.Enum, values: [:active, :revoked], default: :active

    belongs_to :created_by, Delegatic.Accounts.User, type: :binary_id

    timestamps()
  end

  def changeset(org_goal, attrs) do
    org_goal
    |> cast(attrs, [:org_id, :goal_id, :tags, :metadata, :status, :created_by_id])
    |> validate_required([:org_id, :goal_id, :created_by_id])
    |> validate_length(:goal_id, min: 8)
    |> foreign_key_constraint(:org_id)
    |> foreign_key_constraint(:created_by_id)
    |> unique_constraint([:org_id, :goal_id], name: :org_goals_org_id_goal_id_index)
  end
end
```

**Invariants:**
- `goal_id` is treated as an opaque string (no parsing/semantics in Delegatic).
- Uniqueness per org: `{org_id, goal_id}` is unique.
- Revocation is soft (`status: :revoked`) so audits remain interpretable; no deletes are required.

### 3.3 Memberships

```elixir
defmodule Delegatic.Memberships.Membership do
  use Ecto.Schema

  schema "memberships" do
    field :role, Ecto.Enum, values: [:owner, :admin, :member, :viewer]

    belongs_to :org, Delegatic.Orgs.Org
    belongs_to :user, Delegatic.Accounts.User
    belongs_to :invited_by, Delegatic.Accounts.User

    timestamps()
  end
end
```

**Invariants:**
- Each org must have at least one `owner` (last-owner protection)
- Role hierarchy: owner > admin > member > viewer
- Only owners can grant owner. Only owners/admins can grant admin.

### 3.4 Policies

```elixir
defmodule Delegatic.Policies.Policy do
  use Ecto.Schema

  schema "policies" do
    belongs_to :org, Delegatic.Orgs.Org
    belongs_to :updated_by, Delegatic.Accounts.User

    # Boolean capabilities (AND down the tree)
    field :allow_telespace_attach, :boolean
    field :allow_external_api, :boolean
    field :allow_agent_deploy, :boolean
    field :allow_workflow_create, :boolean

    # Numeric limits (MIN down the tree)
    field :max_agents, :integer
    field :max_telespaces, :integer
    field :max_workflows, :integer
    field :max_members_per_org, :integer

    # List policies
    field :allowed_runtimes, {:array, :string}    # INTERSECTION
    field :allowed_models, {:array, :string}       # INTERSECTION
    field :denied_tools, {:array, :string}         # UNION

    timestamps()
  end
end
```

### 3.5 Effective Policy Computation

```elixir
defmodule Delegatic.PolicyEngine do
  use GenServer

  @ets_table :delegatic_effective_policies

  def init(_) do
    :ets.new(@ets_table, [:named_table, :set, :public, read_concurrency: true])
    {:ok, %{}}
  end

  @doc "Microsecond lookup from ETS, cold-path computes and caches."
  def compute_effective(org_id) do
    case :ets.lookup(@ets_table, org_id) do
      [{^org_id, policy}] -> {:ok, policy}
      [] -> compute_and_cache(org_id)
    end
  end

  defp compute_and_cache(org_id) do
    path = Delegatic.OrgTreeCache.ancestor_path(org_id)
    policies = Enum.map(path, &load_local_policy/1)

    effective =
      Enum.reduce(policies, %{}, &merge_policy/2)
      |> apply_deny_defaults()

    :ets.insert(@ets_table, {org_id, effective})
    {:ok, effective}
  end

  defp merge_policy(child_policy, parent_acc) do
    %{
      # Booleans: AND (child can only tighten to false)
      allow_telespace_attach: band(parent_acc, child_policy, :allow_telespace_attach),
      allow_external_api:     band(parent_acc, child_policy, :allow_external_api),
      allow_agent_deploy:     band(parent_acc, child_policy, :allow_agent_deploy),
      allow_workflow_create:  band(parent_acc, child_policy, :allow_workflow_create),
      # Numerics: MIN (child can only lower)
      max_agents:       min_non_nil(parent_acc[:max_agents], child_policy[:max_agents]),
      max_telespaces:   min_non_nil(parent_acc[:max_telespaces], child_policy[:max_telespaces]),
      max_workflows:    min_non_nil(parent_acc[:max_workflows], child_policy[:max_workflows]),
      # Allow-lists: INTERSECTION (child can only narrow)
      allowed_runtimes: intersect(parent_acc[:allowed_runtimes], child_policy[:allowed_runtimes]),
      allowed_models:   intersect(parent_acc[:allowed_models], child_policy[:allowed_models]),
      # Deny-lists: UNION (child can only add)
      denied_tools: union(parent_acc[:denied_tools], child_policy[:denied_tools]),
    }
  end

  defp apply_deny_defaults(eff) do
    Map.merge(%{
      allow_telespace_attach: false, allow_external_api: false,
      allow_agent_deploy: false, allow_workflow_create: false,
      max_agents: 0, max_telespaces: 0, max_workflows: 0,
    }, eff)
  end

  @doc "Validates proposed rules won't widen parent restrictions."
  def validate_monotonic(org_id, proposed_rules) do
    parent_id = Delegatic.OrgTreeCache.parent(org_id)
    {:ok, parent_eff} = compute_effective(parent_id)

    Enum.reduce_while(proposed_rules, :ok, fn {key, val}, _acc ->
      parent_val = Map.get(parent_eff, key)
      if is_widening?(key, parent_val, val),
        do: {:halt, {:error, {:widening, key, parent_val, val}}},
        else: {:cont, :ok}
    end)
  end

  @doc "Invalidates cache for org + all descendants. Broadcasts via PubSub."
  def invalidate(org_id) do
    :ets.delete(@ets_table, org_id)
    for d <- Delegatic.OrgTreeCache.descendants(org_id),
      do: :ets.delete(@ets_table, d)

    Phoenix.PubSub.broadcast(Delegatic.PubSub, "policy:#{org_id}", {:policy_invalidated, org_id})
  end
end
```

### 3.6 Audit Events (Append-Only)

```elixir
defmodule Delegatic.Audit.Event do
  use Ecto.Schema
  @primary_key {:id, :binary_id, autogenerate: true}

  schema "audit_events" do
    field :action, :string
    field :target_type, :string
    field :target_id, :string

    # GoalGraph context (Graphonomous goal IDs; references only)
    field :goal_id, :string
    field :goal_context, :map, default: %{}

    field :previous_value, :map
    field :new_value, :map
    field :metadata, :map, default: %{}

    belongs_to :org, Delegatic.Orgs.Org
    belongs_to :actor, Delegatic.Accounts.User

    timestamps(updated_at: false)  # INSERT ONLY
  end
end

# AuditWriter: Broadway pipeline, batch inserts, no updates/deletes ever.
```

---

## 4. Cycle Detection (ETS Tree Cache)

```elixir
defmodule Delegatic.OrgTreeCache do
  use GenServer

  @tree :delegatic_org_tree

  def init(_) do
    :ets.new(@tree, [:named_table, :set, :public, read_concurrency: true])
    load_from_db()
    {:ok, %{}}
  end

  def ancestor_path(org_id), do: do_path(org_id, [], 0)

  defp do_path(nil, acc, _), do: Enum.reverse(acc)
  defp do_path(_, _, d) when d > 50, do: {:error, :max_depth_exceeded}
  defp do_path(org_id, acc, d) do
    case :ets.lookup(@tree, org_id) do
      [{^org_id, %{parent_id: pid}}] -> do_path(pid, [org_id | acc], d + 1)
      [] -> Enum.reverse([org_id | acc])
    end
  end

  def check_cycle(org_id, proposed_parent_id) do
    cond do
      org_id == proposed_parent_id -> {:error, :cycle_detected}
      proposed_parent_id in descendants(org_id) -> {:error, :cycle_detected}
      true -> :ok
    end
  end

  def descendants(org_id) do
    children = children(org_id)
    children ++ Enum.flat_map(children, &descendants/1)
  end

  def children(org_id),
    do: :ets.match(@tree, {:"$1", %{parent_id: org_id}}) |> List.flatten()

  def parent(org_id) do
    case :ets.lookup(@tree, org_id) do
      [{^org_id, %{parent_id: pid}}] -> pid
      [] -> nil
    end
  end
end
```

---

## 5. Phoenix LiveView Dashboard

```elixir
defmodule DelegaticWeb.OrgTreeLive do
  use DelegaticWeb, :live_view

  def mount(%{"org_id" => org_id}, _session, socket) do
    if connected?(socket) do
      Phoenix.PubSub.subscribe(Delegatic.PubSub, "policy:#{org_id}")
      Phoenix.PubSub.subscribe(Delegatic.PubSub, "org:#{org_id}")
    end

    {:ok,
     socket
     |> assign(:org, Delegatic.Orgs.get_with_tree(org_id))
     |> assign(:effective_policy, Delegatic.PolicyEngine.compute_effective(org_id))}
  end

  def handle_info({:policy_invalidated, org_id}, socket) do
    {:noreply,
     assign(socket, :effective_policy,
       Delegatic.PolicyEngine.compute_effective(org_id))}
  end
end
```

---

## 6. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | Elixir 1.17+ | Unified with entire [&] portfolio. OTP supervision mirrors containment trees. |
| Framework | Phoenix 1.8+ | LiveView for real-time dashboard. PubSub for policy propagation. |
| Database | PostgreSQL 16+ | Ecto schemas, migrations, strong consistency for governance data. |
| Hot Cache | ETS | Effective policy lookups in microseconds. Read concurrency enabled. |
| Audit Pipeline | Broadway | Batched audit event writes. Back-pressure. Guaranteed delivery. |
| Background Jobs | Oban | Webhook notifications, compliance exports, scheduled cleanup. |
| Auth | Clerk → custom Plug | External ID mapped to internal user records. |
| Telemetry | :telemetry + Prometheus | Policy resolution latency, cycle detection timing, audit throughput. |
| Deployment | Mix release + Docker | Single BEAM node or clustered via libcluster. |

---

## 7. Roadmap

### Phase 1: Core Governance (Weeks 1–6)
- [ ] Ecto schemas + migrations
- [ ] OrgTreeCache GenServer with cycle detection
- [ ] PolicyEngine GenServer with monotonic validation + ETS cache
- [ ] AuditWriter Broadway pipeline
- [ ] Phoenix REST API
- [ ] Phoenix LiveView: org tree + policy editor

### Phase 2: Integration (Weeks 7–10)
- [ ] Telespace attachment flow (Delegatic ↔ Agentelic PubSub)
- [ ] Policy check API for AgenTroMatic
- [ ] WHS deployment gate
- [ ] FleetPrompt install authorization

### Phase 3: Enterprise (Weeks 11–16)
- [ ] SSO/SAML · Policy templates · Compliance exports
- [ ] Oban jobs for webhook notifications
- [ ] Bulk org import/export

### Phase 4: Federation (2027)
- [ ] Distributed Erlang clustering via libcluster
- [ ] Cross-node policy resolution
- [ ] Property-based testing with StreamData

---

## 8. Success Metrics

| Metric | Target |
|--------|--------|
| Effective policy lookup (ETS hot) | < 5μs p99 |
| Effective policy computation (cold) | < 20ms p99 |
| Cycle detection (depth-50 tree) | < 1ms |
| Audit write throughput (Broadway) | > 10K events/sec |

---

## 9. ADR Summary

### ADR-0001: Containment Tree & No Cycles
Strict tree. Cycles rejected via ETS traversal. Max depth 50, max nodes 10K.

### ADR-0002: Policy Inheritance is Monotonic
Boolean = AND. Numeric = MIN. Allow-lists = INTERSECTION. Deny-lists = UNION. Widening returns `{:error, {:widening, key, parent_val, proposed_val}}`.

### ADR-0003: OTP Topology Mirrors Data Topology
Each org is a GenServer. Parents supervise children via DynamicSupervisor. Runtime process tree mirrors containment data tree. Policy propagation, health monitoring, and lifecycle management use native OTP.

---

*Delegatic: Structure first. Then delegate.*
