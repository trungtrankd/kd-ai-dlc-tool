<!-- Step: test-plan — handled by qa-engineer agent -->
# Test Plan

## Purpose
Design the full test strategy for the feature — from unit tests to UAT — so developers know what to write and QA knows what to verify.

## Agent
`qa-engineer`

## Inputs (provided by orchestrator)
- PRD artifact from the `plan` step (acceptance criteria are the test inputs)
- Tech design artifact from the `design` step (file impact drives unit/integration scope)
- Existing test suites and patterns in the project (use Glob/Grep)
- `CLAUDE.md` for project test framework and coverage targets

## Process

1. Read the PRD — every acceptance criteria needs at least one test case.
2. Read the tech design — file impact drives unit/integration scope; NFRs drive non-functional tests.
3. Define the environment/compatibility matrix: which OS × browser × device × locale combos are must-test vs spot-check.
4. Assign test IDs: `{EPIC_KEY}-UT01`, `{EPIC_KEY}-IT01`, `{EPIC_KEY}-E2E01`, etc.
5. Define failure-mode tests: network loss, auth expiry, permission denied, upgrade path, concurrency.
6. State performance thresholds (latency p50/p95, memory, bundle size) — numbers, not vibes.
7. Define test data strategy: factories/builders, isolation approach, seeding for integration/E2E.

## Output Artifact
`TEST-PLAN.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Test Scope
| AC ID | AC Description | Test Types Assigned |
|-------|---------------|---------------------|

## Out of Scope
[What is NOT tested and why]

## Environment / Compatibility Matrix
| Surface | Must-Test | Spot-Check | CI | Real infra |
|---------|-----------|------------|----|-----------| 

## Unit Tests — {EPIC_KEY}-UT
[Pure logic, state transitions, parsers, boundary conditions]

## Contract Tests — {EPIC_KEY}-CT (if applicable)
[API / IPC / WebSocket request-response shapes]

## Integration Tests — {EPIC_KEY}-IT
[Multi-module flows with real DB / filesystem / server fixture]

## UI / Component Tests — {EPIC_KEY}-UI (if applicable)
[Rendering, interaction, accessibility tree, states]

## End-to-End Tests — {EPIC_KEY}-E2E (if applicable)
[Full flows — keep thin; only top risks]

## Failure-Mode Tests
- Network / connectivity ({EPIC_KEY}-NET)
- Lifecycle / process ({EPIC_KEY}-LC)
- Access / permission ({EPIC_KEY}-PM)
- Upstream failure ({EPIC_KEY}-UP)
- Concurrency ({EPIC_KEY}-CC)

## Non-Functional Tests
- Performance ({EPIC_KEY}-PF) — state thresholds
- Accessibility ({EPIC_KEY}-A11Y)
- Security ({EPIC_KEY}-SEC)

## Regression Checklist
[Core flows that must still work after this change]

## Test Data Strategy
[Factories/builders, isolation per test, seeding]
```

## Quality Gates
- [ ] Every AC from PRD maps to at least one test case
- [ ] Environment matrix specified with must-test vs spot-check
- [ ] Failure-mode tests defined (network, lifecycle, permissions, upstream)
- [ ] Non-functional tests have numeric thresholds
- [ ] Test data strategy documented
- [ ] No `{EPIC_KEY}` left as literal — IDs should use the actual epic key from context
