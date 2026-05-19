<!-- Step: doc-sync — handled by developer agent -->
# Doc Sync

## Purpose
Reverse-sync documentation to match what was actually built — reality wins over plan.

## Agent
`developer`

## Inputs (provided by orchestrator)
- PRD artifact from the `plan` step (planned behavior)
- Tech design artifact from the `design` step (planned architecture)
- Implementation handoff artifact from the `implement` step (what was actually built)
- Health report artifact from the `monitor` step (scope-cut features, post-release decisions)
- Git diff: `git diff $(git describe --tags --abbrev=0)..HEAD` to see exactly what changed
- Existing docs in `docs/` (use Glob to find architecture, API, changelog docs)

## Process

1. Read the tech design's File Impact list and the git diff to determine what actually changed.
2. Compare planned behavior (PRD) vs implemented behavior (handoff + diff). Note divergences.
3. For each divergence, update the relevant reference doc to reflect reality.
4. Update architecture docs if new layers, services, patterns, or significant file changes were made.
5. Update API docs if endpoints, IPC messages, or interface contracts changed.
6. Add a changelog entry for user-visible changes.
7. Write a migration guide if there were breaking changes (`docs/migrations/vX.Y.Z.md`).
8. Remove "coming soon" references for any features that were scope-cut.
9. Verify cross-references in updated docs still resolve.

## Output Artifact
`DOC-REVERSE-SYNC.md` — write to the path specified by the orchestrator's output contract.

Structure:

```markdown
## Doc Reverse Sync: {EPIC_KEY} — [feature name]

### Divergences Found (Plan vs Reality)
| Area | Planned | Actual | Doc Action Taken |
|------|---------|--------|-----------------|

### Docs Updated
| Doc File | Change | Reason |
|----------|--------|--------|

### Changelog Entry
[Added to CHANGELOG.md or equivalent]

### Migration Guide
[Path: docs/migrations/vX.Y.Z.md — or "N/A — no breaking changes"]

### Scope-Cut Items Removed
[Docs / sections removed because features were cut]

### Checklist
- [ ] Architecture docs reflect actual implementation
- [ ] API / interface docs match actual contracts
- [ ] Changelog entry written
- [ ] Migration guide written (if breaking changes)
- [ ] Scope-cut items removed from docs
- [ ] Cross-references verified
- [ ] Code examples in updated sections still work
```

## Quality Gates
- [ ] Every divergence (plan vs reality) documented and resolved
- [ ] No "coming soon" or planned-but-not-built content left in docs
- [ ] Breaking changes have a migration note
- [ ] Changelog entry is user-facing language (not epic keys)
- [ ] Cross-references in updated docs still resolve
