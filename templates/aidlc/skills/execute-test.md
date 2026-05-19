<!-- Step: execute-test — handled by qa-engineer agent -->
# Execute Test

## Purpose
Run the test plan against the merged implementation and produce a test execution report with a tester sign-off.

## Agent
`qa-engineer`

## Inputs (provided by orchestrator)
- PRD artifact from the `plan` step (acceptance criteria drive test scenarios)
- Test plan artifact from the `test-plan` step (test cases to execute)
- Implementation handoff artifact from the `implement` step (what was built, branch/PR)
- Review approval artifact from the `review` step (known issues and flags for QA)

## Process

1. Read the PRD acceptance criteria and the test plan in full.
2. Read the review approval — pay close attention to flags and partial implementations.
3. For each acceptance criteria, execute the corresponding test scenario.
4. Run automated tests: `npm test`, `pytest`, `go test ./...`, or equivalent per `CLAUDE.md`.
5. Execute manual / UAT scenarios for flows that can't be fully automated.
6. Test edge cases and failure modes from the test plan.
7. Document each result: pass / fail / blocked, with evidence (screenshot, log, command output).
8. Issue a verdict: PASS / PASS WITH NOTES / FAIL.

## Output Artifact
`TEST-SCRIPT.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Test Execution: {EPIC_KEY} — [feature name]
## Build / Branch: [branch name or commit]
## Environment: [OS, runtime, browser, locale, date]
## Tester: [agent or human]

### Prerequisites
[Test accounts, feature flags, environment setup, test data needed]

### Scenario Results
| AC ID | Scenario | Steps | Result | Evidence |
|-------|----------|-------|--------|----------|
| {EPIC_KEY}-AC01 | [description] | [steps] | ✅ Pass / ❌ Fail / ⚠️ Partial | [log/screenshot ref] |

### Automated Test Run
- Command: [command]
- Result: PASS / FAIL
- Output: [summary or link]

### Edge Case Results
| Case | Result | Notes |
|------|--------|-------|

### Bugs Found
| # | Title | Severity | Steps to Reproduce | Expected vs Actual |
|---|-------|----------|-------------------|--------------------|

### Regression Check
| Flow | Status |
|------|--------|

### Verdict
✅ PASS / ⚠️ PASS WITH NOTES / ❌ FAIL

Reason: [one sentence]
Sign-off: [date, environment]
```

## Quality Gates
- [ ] Every AC from PRD has a documented test result
- [ ] Automated test command run and result recorded
- [ ] All bugs given a severity level
- [ ] Verdict is explicit: PASS / PASS WITH NOTES / FAIL
- [ ] Regression quick-check completed
