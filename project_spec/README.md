# Delegatic — Component Project Spec

Delegatic is the portfolio’s **multi-agent “company” orchestration agent**.

Canonical portfolio context: `opensentience.org/project_spec/portfolio-integration.md`.

## Responsibilities

- Define “companies” (groups of agents) and their roles
- Orchestrate work across agents as explicit directives
- Maintain policy constraints (what roles can do)
- Integrate with A2A Traffic for event-driven workflows

## Config surface

- Per-project config in `.fleetprompt/delegatic/company.json`

Minimum viable schema:

- `company_id`
- `teams` / `roles`
- `agents` (agent ids + role bindings)
- `policies` (tool allowlists / directive allowlists)

## Tools (as OpenSentience Agent)

- `delegatic_list_companies({})`
- `delegatic_describe_company({"company_id": string})`
- `delegatic_start_mission({"company_id": string, "goal": string, "idempotency_key"?: string})`
- `delegatic_status({"mission_id": string})`
- `delegatic_cancel_mission({"mission_id": string})`

## Execution model

- Missions should be represented as directives and produce durable signals.
- Orchestration steps that cause side effects must remain directive-backed.

## Security

- Strict policy gating: roles constrain what tools/directives can be used.
- No secrets in mission state.
- Dedupe/idempotency required.

## MVP slice

1. Load/validate `company.json`
2. Start a mission that coordinates a small, fixed set of agents (e.g. FleetPrompt + Graphonomous)
3. Produce an auditable timeline of mission steps
