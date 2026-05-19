<!-- Step: implement — handled by tech-lead agent (dispatches to developer-* specialists) -->
# Implement

## Purpose
Build the feature on a feature branch, following the tech design exactly and writing tests as specified in the test plan.

## Agent
`tech-lead` — decomposes into tasks and dispatches to `developer-frontend`, `developer-backend`, `developer-database`, `developer-devops`, `developer-security` as needed.

## Inputs (provided by orchestrator)
- Tech design artifact from the `design` step
- PRD artifact from the `plan` step (acceptance criteria to satisfy)
- Test plan artifact from the `test-plan` step (tests to write)
- `CLAUDE.md` for project conventions, frameworks, lint/test commands

## Process

1. Read the tech design in full — the File Impact section is the implementation scope.
2. Read the PRD acceptance criteria — these are the definition of done.
3. Read the test plan — write the specified tests alongside the code.
4. Create a feature branch: `feature/{EPIC_KEY}-{short-slug}` from the default branch.
5. Implement files listed in the tech design's File Impact section — no more, no less.
6. Write unit tests and integration tests as called out in the test plan.
7. Update dependency wiring / registration as specified in the tech design.
8. Run lint + typecheck + test commands before handing off.
9. Open a PR with title referencing the epic key.

## Output Artifact
`HANDOFF.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Feature: [name]
## Branch: feature/{EPIC_KEY}-{slug}
## PR: [link if opened]

## What Was Built
[One paragraph: what was implemented]

## Files Changed
| File | Change | Notes |
|------|--------|-------|

## Tests Written
| Test ID | File | Description |
|---------|------|-------------|

## Verification
- Lint: PASS / FAIL
- Typecheck: PASS / FAIL
- Tests: PASS / FAIL (N passed, N failed)

## Flags for Review
[Anything diverging from tech design, risky decisions, areas needing close review]

## Flags for QA
[Edge cases to pay attention to, known gaps, environment-specific behavior]
```

## Quality Gates
- [ ] All files in tech design's File Impact section are implemented
- [ ] No files modified outside the File Impact list without documentation
- [ ] Tests written for all test plan items marked for this phase
- [ ] Lint and typecheck pass
- [ ] No hardcoded secrets, API keys, or absolute paths
- [ ] No speculative code beyond the epic scope
