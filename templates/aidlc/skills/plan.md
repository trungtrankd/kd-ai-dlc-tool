<!-- Step: plan — handled by product-owner agent -->
# Plan

## Purpose
Scaffold the epic and produce a PRD with measurable acceptance criteria that the entire pipeline depends on.

## Agent
`product-owner`

## Inputs (provided by orchestrator)
- Story or feature description
- Relevant domain / business docs (if present in repo)
- Existing epics for overlap / dependency check (if present)

## Process

1. Analyse the story: identify the user problem, target user, and business value.
2. Define scope — explicit in-scope and out-of-scope list.
3. Write user stories using: "As a [user], I want [goal], so that [benefit]."
4. Write acceptance criteria for every story in Given/When/Then format. Assign IDs: `{EPIC_KEY}-AC01`, `{EPIC_KEY}-AC02`, etc.
5. Define error states, empty states, and recovery paths — not just happy path.
6. State non-functional requirements: performance targets, accessibility level, security/privacy, compatibility.
7. Sketch rollout strategy: flagged / phased / direct. Define success metrics and rollback trigger.
8. List dependencies (APIs, designs, other epics, legal/compliance).

## Output Artifact
`PRD.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Problem Statement
[User-focused, not solution-focused]

## Target User
[Segment, persona, or cohort]

## Scope
### In Scope
### Out of Scope

## User Stories
| ID | Story | Priority |
|----|-------|----------|

## Acceptance Criteria
### {EPIC_KEY}-US01: [story title]
- [ ] {EPIC_KEY}-AC01: Given [...], when [...], then [...]
- [ ] {EPIC_KEY}-AC02: ...

## Non-Functional Requirements
### Performance
### Accessibility
### Security & Privacy
### Compatibility

## Analytics & Observability
[Events to measure success]

## Rollout Strategy
[Flag / phased / direct + success metrics + rollback trigger]

## Dependencies
[APIs, designs, other epics, legal/compliance]

## Risks & Mitigations
```

## Quality Gates
- [ ] Problem statement is user-focused, not solution-focused
- [ ] In-scope / out-of-scope explicitly stated
- [ ] Every user story has at least one AC in Given/When/Then format
- [ ] Every AC has a unique ID
- [ ] Error states and empty states explicitly defined
- [ ] NFRs stated with measurable targets (not "should be fast")
- [ ] No `{{` placeholder markers remain in the output
