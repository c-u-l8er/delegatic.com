# Delegatic — Component Project Spec

Delegatic is the portfolio’s **multi-agent “company” orchestration agent**.

Canonical portfolio context: `opensentience.org/project_spec/portfolio-integration.md`.

## Read this spec in order

1. `ARCHITECTURE.md` — component boundaries + responsibilities
2. `RESOURCE_SURFACES.md` — `.fleetprompt/delegatic/` file formats and schemas
3. `INTERFACES.md` — stable tool/signal/directive surface (Core-routed)
4. `EXECUTION_MODEL.md` — missions, state machine, idempotency, cancellation, audit linkage
5. `PERMISSIONS.md` — permissions model and enforcement points
6. `SECURITY.md` — guardrails (prompt injection, secrets, drive-by actions)
7. `TEST_PLAN.md` — what to test to avoid regressions

## Responsibilities

- Define “companies” (groups of agents) and their roles/policies
- Orchestrate work across agents as explicit, auditable missions (signals + directives)
- Enforce policy constraints (role-based allowlists for tools/directives/resources; deny-by-default)
- Integrate with the portfolio event bus (A2A Traffic is the default implementation) using bus-agnostic permissions:
  - `event:publish:<topic-or-pattern>`
  - `event:subscribe:<topic-or-pattern>`

## Config surface

- Per-project config in `.fleetprompt/delegatic/company.json`

Minimum viable schema (see `RESOURCE_SURFACES.md` for the v1 shape):

- `version`
- `company_id`
- `agents` (agent ids + role bindings)
- `roles` (role definitions: tool/directive allowlists + resource scopes)
- `shared_resources` (graph collections, filesystem paths, secret ids)
- `policies` (bounds: max missions/steps/retries/concurrency, etc.)

## Tools (as OpenSentience Agent)

Canonical tool identifiers (as exposed via OpenSentience Core ToolRouter) are namespaced as `<agent_id>/<tool_name>`. For Delegatic:

- `com.delegatic.core/delegatic_list_companies({})`
- `com.delegatic.core/delegatic_describe_company({"company_id": string})`
- `com.delegatic.core/delegatic_start_mission({"company_id": string, "goal": string, "idempotency_key"?: string})`
- `com.delegatic.core/delegatic_status({"mission_id": string})`
- `com.delegatic.core/delegatic_cancel_mission({"mission_id": string})`

## Execution model

- Missions should be represented as directives and produce durable signals.
- Orchestration steps that cause side effects must remain directive-backed.

## Security

- Strict policy gating: roles constrain what tools/directives/resources can be used (deny-by-default).
- No secrets in company configs, mission state, signals, directives, or logs (reference secrets by id only).
- Idempotency required (mission `idempotency_key`, directive/step idempotency to prevent duplicate side effects).
- Event-driven orchestration uses bus-agnostic permission scopes: `event:publish:*` and `event:subscribe:*` (appropriately narrowed).

## MVP slice

1. Load/validate `company.json`
2. Start a mission that coordinates a small, fixed set of agents (e.g. FleetPrompt + Graphonomous)
3. Produce an auditable timeline of mission steps
