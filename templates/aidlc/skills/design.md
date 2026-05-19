<!-- Step: design — handled by tech-lead agent -->
# Design

## Purpose
Translate the PRD into a technical blueprint that developers can implement and reviewers can validate against.

## Agent
`tech-lead`

## Inputs (provided by orchestrator)
- PRD artifact from the `plan` step
- Project architecture docs (`CLAUDE.md`, `docs/architecture.md`, or equivalent)
- Dependency wiring / service registration config
- Existing source files in affected areas (use Glob/Grep)
- Related ADRs if the project uses them

## Process

1. Read the PRD in full. Identify all acceptance criteria and affected surfaces.
2. Survey the codebase: architecture overview, layering, existing patterns in affected areas, dependency wiring.
3. Produce the tech design sections below.
4. List every file that will be new, modified, or deleted — this becomes the implementation contract.
5. Write an ADR for any irreversible or widely-impactful architectural decision.

## Output Artifact
`TECH-DESIGN.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Summary
[One paragraph: what is being built and the chosen approach]

## Architecture
[Component / layer diagram using the project's layering — reference CLAUDE.md for which model applies]
[Layer mapping: for each layer, new/modified modules and their responsibilities]
[Key design choices with rationale]

## API / Interface Contract
[New / modified endpoints, RPC methods, IPC messages, SDK functions, or module interfaces]
[Request/response shapes, error cases, versioning strategy, idempotency]

## Data Model
[New / modified schemas, migrations, indexes, invariants]

## State Management
[Where state lives, lifecycle, invalidation strategy]

## Sequence / Flow
[Key interaction across layers — include error and retry paths]

## Dependency Wiring
[How new components plug into the project's DI / composition mechanism, lifetimes]

## Non-Functional Design
- Performance budget (latency p50/p95, memory, bundle size)
- Reliability (retry, timeout, fallback, circuit breaking)
- Security & privacy (threat model, authz, input validation, PII)
- Observability (logs, metrics, traces this change adds)
- Accessibility (if UI work)
- Compatibility (minimum supported platforms / runtimes)

## Rollout & Reversibility
[Feature flag(s), staged rollout plan, rollback path]

## File / Module Impact
| File | New / Modified / Deleted | Reason |
|------|--------------------------|--------|

## Risks & Open Questions
```

## Quality Gates
- [ ] Every AC from PRD maps to at least one design decision
- [ ] API / interface contract fully specified (request/response shapes, error codes)
- [ ] File impact list complete — no "etc."
- [ ] Dependency wiring changes listed
- [ ] Performance budget stated with numbers
- [ ] Rollout and rollback path defined
- [ ] No `{{` placeholder markers remain in the output
