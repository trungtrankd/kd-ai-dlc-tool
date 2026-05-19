<!-- Step: review — handled by product-owner agent -->
# Review

## Purpose
Validate the implementation against the PRD acceptance criteria and tech design. Produce a structured verdict before QA begins.

## Agent
`product-owner`

## Inputs (provided by orchestrator)
- PRD artifact from the `plan` step
- Tech design artifact from the `design` step
- Test plan artifact from the `test-plan` step
- Implementation handoff artifact from the `implement` step
- Git diff: run `git diff origin/main...HEAD` or read the PR diff

## Process

1. Get the diff: `git diff origin/main...HEAD --stat` then `git diff origin/main...HEAD`.
2. For each acceptance criteria in the PRD, check whether it is implemented. Record evidence (file:line).
3. Check the file impact list from the tech design against the diff — flag missing or extra files.
4. Validate the API / interface contract matches what was designed.
5. Check that tests in the diff match the test plan.
6. Run a code quality check: layer boundaries, resource safety, security, error handling.
7. Identify any divergences from the design that need doc-sync.
8. Issue a verdict: APPROVE / APPROVE WITH COMMENTS / CHANGES REQUESTED.

## Output Artifact
`APPROVAL.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Review: {EPIC_KEY} — [feature name]

### Acceptance Criteria vs Code
| AC ID | Description | Status | Evidence |
|-------|-------------|--------|----------|
| {EPIC_KEY}-AC01 | ... | ✅ / ❌ / ⚠️ Partial | file:line |

### Tech Design vs Code
| Check | Status | Notes |
|-------|--------|-------|
| File impact matches | ✅ / ⚠️ | Extra: X / Missing: Y |
| API / interface contract | ✅ / ⚠️ | |
| Dependency wiring | ✅ / ❌ | |
| Rollout flag in place | ✅ / ⚠️ | |

### Test Coverage vs Test Plan
| Test Case | In Diff? | Notes |
|-----------|----------|-------|

### Code Quality Findings
🔴 BLOCKER — [file:line] description
🟠 MAJOR — [file:line] description
🟡 MINOR — [file:line] description

### Doc Impact
[Docs that need updating after merge]

### Verdict
✅ APPROVE / ⚠️ APPROVE WITH COMMENTS / ❌ CHANGES REQUESTED

Reason: [one sentence]
```

## Quality Gates
- [ ] Every AC checked — no AC left unreviewed
- [ ] Verdict is explicit: APPROVE / APPROVE WITH COMMENTS / CHANGES REQUESTED
- [ ] Every BLOCKER has a file:line reference
- [ ] Doc-sync items listed if any
- [ ] No `{{` placeholder markers remain in the output
