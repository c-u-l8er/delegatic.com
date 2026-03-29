# Delegatic — Governance for AI Agent Teams

Governance and orchestration layer for multi-agent AI systems. Containment trees, monotonic policy inheritance, and immutable audit trails.

## Source-of-truth spec

- `docs/spec/README.md` — Delegatic technical specification

## Role in [&] Ecosystem

Delegatic is the **governance layer** — it defines who can do what, enforces policy boundaries, and provides audit trails. It does not execute tasks, host agents, or run workflows.

## Core concepts

- **Containment trees** — strict org hierarchy, no cycles, no DAGs
- **Monotonic policy inheritance** — children can tighten, never widen parent restrictions
- **Deny by default** — no implicit permissions
- **Append-only audit** — every mutation logged immutably
- **Goal-aware governance** — references Graphonomous GoalGraph for durable intent

## Tech stack

Elixir/OTP, Phoenix LiveView, PostgreSQL, ETS, Broadway, Oban

## Status

This is a spec + marketing site. No implementation code yet. Implementation will be Elixir/OTP.
