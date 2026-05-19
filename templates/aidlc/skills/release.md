<!-- Step: release — handled by developer-devops agent -->
# Release

## Purpose
Cut the release: verify all gates, generate release notes, tag the version, and guide the deployment.

## Agent
`developer-devops`

## Inputs (provided by orchestrator)
- Test execution artifact from the `execute-test` step (UAT sign-off)
- Review approval artifact from the `review` step
- Git log since last tag (run `git log $(git describe --tags --abbrev=0)..HEAD --oneline --no-merges`)
- `CLAUDE.md` for project release tooling and conventions

## Process

1. Identify the version number (semver: MAJOR.MINOR.PATCH based on changes).
2. Gather all commits since the last tag; group by epic key.
3. For each epic in this release, verify: UAT signed off, no P0/P1 bugs open.
4. Check pre-release gates (see Quality Gates below).
5. Generate user-facing release notes (plain language, value-focused, no epic keys).
6. Generate technical changelog (grouped by epic key, breaking changes called out).
7. Bump the version in project files (package.json, pubspec.yaml, etc.).
8. Tag the release: `git tag vX.Y.Z`.
9. Identify feature flags for risky changes — confirm they are configured.
10. Define staged rollout plan if the platform supports it.

## Output Artifact
`RELEASE-NOTES.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Release vX.Y.Z — YYYY-MM-DD

### Pre-Release Gate Check
- [ ] CI green on release branch
- [ ] No P0/P1 bugs open
- [ ] UAT signed off for all epics in scope
- [ ] Version bumped in project files
- [ ] Feature flags configured for risky changes
- [ ] Rollback path verified

### Epics in This Release
| Epic Key | Description | UAT Status |
|----------|-------------|------------|

### User-Facing Release Notes
What's New in vX.Y.Z:
- [Feature benefit in plain language]
- [Improvement benefit]
- Bug fixes and performance improvements

### Technical Changelog
#### New
- {EPIC_KEY}: [summary]

#### Improved
- {EPIC_KEY}: [summary]

#### Fixed
- [description]

#### Breaking
- [description]. Migration: [link]

#### Notes
- New config / env vars: ...
- New dependencies: ...
- DB migrations: ...
- Feature flags: ...

### Rollout Plan
[Staged %, flag lifecycle, halt signal]

### Tag
`git tag vX.Y.Z` — [status: done / pending]
```

## Quality Gates
- [ ] UAT signed off for every epic in scope
- [ ] No P0/P1 bugs open
- [ ] CI green
- [ ] User-facing notes written in plain language (no epic keys, no jargon)
- [ ] Breaking changes called out with migration guidance
- [ ] Rollback path stated
