# delegatic.com — project_spec/progress — Daily Engineering Progress Logs

This folder contains **daily, append-only engineering progress logs** for the `delegatic.com` implementation effort.

- These logs are **non-normative** (they do not define requirements).
- The **normative spec** is `project_spec/spec_v1/` (and its `adr/` subfolder).
- The purpose is to record **what changed**, **why**, and **what’s next**, in a way that’s easy to audit and easy to resume from in a new prompt/session.

If a progress log conflicts with `project_spec/spec_v1/`, the spec wins.

---

## Folder structure

- `progress/README.md` — this file (index + conventions)
- `progress/YYYY-MM-DD.md` — one file per day

Recommended: create a new file for each day you do meaningful work, even if it’s short.

---

## Naming convention

Daily logs MUST be named:

- `YYYY-MM-DD.md` (UTC date recommended)

Examples:
- `2026-01-24.md`
- `2026-01-25.md`

---

## Writing rules (conventions)

### 1) Append-only
- Do **not** rewrite history.
- If you need to correct something from a prior day, add a note in today’s log under **Corrections**.

### 2) Traceability and scope
Each daily log SHOULD include:
- what shipped (high-level)
- key decisions (with references to `spec_v1/` sections or ADRs)
- files/dirs touched (short list)
- what’s still missing / follow-ups
- known issues or risks
- validation performed (typecheck/tests/manual steps)

### 3) Keep it implementation-focused
Prefer:
- “Implemented company config validation for `.fleetprompt/delegatic/company.json` (v1) and added policy-deny signals”
over:
- “Worked on company stuff”

### 4) No secrets
Never include:
- API keys, tokens, credentials
- private user data
- raw secret values (even in “examples”)

Use placeholders:
- `SECRET_ID=***`
- `https://<deployment-host>/...`

### 5) Use stable references
When referencing something, prefer stable identifiers:
- spec paths (e.g., `project_spec/spec_v1/10_API_CONTRACTS.md`)
- ADR ids (e.g., `project_spec/spec_v1/adr/ADR-0002-...`)
- tool IDs (e.g., `com.delegatic.core/delegatic_start_mission`)
- schema versions (e.g., `company.json version=1`)

---

## Daily log template

Copy/paste this into a new `YYYY-MM-DD.md` file:

---

# YYYY-MM-DD — Progress Log
Project: `delegatic.com`  
Focus: …  
Owner: Engineering

## Summary (1–3 bullets)
- …
- …

## Spec/ADR alignment notes
- ✅ Implemented: … (reference `spec_v1/...` sections and/or ADRs)
- ⚠️ Deviations: … (explain why; plan to reconcile)
- ❓ Open questions discovered: …

## What shipped today
### Config/resources
- …

### Orchestration engine
- …

### Interfaces (tools/signals/directives)
- …

### Security & policy enforcement
- …

### Observability / audit timeline
- …

## API / Interface notes
- Tools added/changed:
  - `com.delegatic.core/...`
- Signal types added/changed:
  - `delegatic.*`
- Directive types requested/changed:
  - `...`

## Data model / persistence
- Storage changes:
  - …
- Invariants enforced:
  - …

## Files touched (high-level)
- `...`
- `...`

## Validation performed
- Local run steps:
  - …
- Typecheck/tests:
  - …

## Known issues / risks
- …

## Next steps
- [ ] …
- [ ] …

## Corrections (if needed)
- …

---

## Suggested manual index (optional)

If you want this README to also act like an index, keep this list updated manually:

### Index
- `YYYY-MM-DD.md` — short title

(Keeping it manual is fine; automation can come later.)