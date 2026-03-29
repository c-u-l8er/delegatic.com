# Delegatic — Agent Interface

Delegatic is the governance and orchestration layer for the [&] Protocol ecosystem.

## For agents

Delegatic provides governance services. Agents interact with Delegatic for:

### Policy Checks
- Query effective policies for an org before taking action
- Validate proposed actions against governance boundaries
- Check capability allowlists, budget limits, tool denylists

### Goal-Aware Authorization
- Attach actions to Graphonomous `goal_id` for scoped governance
- Actions without a goal reference may face stricter defaults

### Audit
- All mutations logged with actor, timestamp, and provenance
- Goal-scoped audit trails for long-horizon traceability

## API Surface (planned)

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/orgs/:id/policy` | Effective policy for an org |
| `POST /api/v1/orgs/:id/check` | Validate action against policy |
| `GET /api/v1/audit` | Query audit log |
| `POST /api/v1/orgs/:id/goals` | Attach goal reference to org |

## Status

Spec complete. Implementation pending. See `docs/spec/README.md`.
