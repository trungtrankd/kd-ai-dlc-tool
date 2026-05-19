# DOC-SYNC — Pipeline Status Dashboard Reverse-Sync

**Owner agent:** developer
**Upstream:** all prior pipeline artifacts under `mailbox/pipeline/**`
**Epic key:** STORY-001

## Plan vs. Reality

| Aspect | Plan (PRD / Tech-Design) | Reality (shipped code) | Delta |
|--------|--------------------------|------------------------|-------|
| Files touched | `src/webview/workspace/WorkspaceApp.tsx` only | `WorkspaceApp.tsx` **and** `src/webview/workspace/workspace.css` | +1 file (CSS spinner keyframe) — minor; doc-sync below records it |
| New components | `PipelineDashboard`, `PipelineStepCard`, `PipelineProgressBar` | Same | none |
| Helper functions | `formatElapsed`, `latestLogFor`, `stepStatus` | Same plus `taskForStep`, `statusMeta`, `isStepStatus` (private helpers) | additive |
| Data sources | `state.board`, `state.logs` | Same | none |
| No polling | Required | 0 `setInterval` / `setTimeout` in webview source | met |

## Docs Reviewed

| Doc | Status | Action |
|-----|--------|--------|
| `CLAUDE.md` — "Architecture Overview" → core flow | Still accurate (PRD prompt → claude CLI → task-board.json → file watchers → UI refresh). | No change. |
| `CLAUDE.md` — "Source layout" → `src/panels/` | Says "embeds its complete HTML/CSS/JS inline as a template literal". This is **stale**: `BuilderPanel.ts` now loads a Vite-built React webview from `out/webviews/workspace.{js,css}`. **Not a STORY-001 regression — it predates this story.** Flagged but intentionally out of scope. |
| `CLAUDE.md` — Pipeline steps and default models | Still accurate. | No change. |
| `CLAUDE.md` — VS Code commands and settings | No new command or setting added by this story. | No change. |
| `package.json` description | "Run a full AI-powered SDLC pipeline … inside VS Code". Still accurate. | No change. |
| `CHANGELOG.md` | None exists in the repo. | Not created (out of scope; this is a single-developer extension without a changelog convention). |

## Files Edited By This Doc-Sync Phase

None. The PRD and TECH-DESIGN already reflect what was built. The minor "implementation also touched CSS" delta is captured in:
- `mailbox/pipeline/implement/HANDOFF.md` — File Impact table.
- `mailbox/pipeline/review/APPROVAL.md` — Tech Design Conformance row.
- This document.

## Follow-ups (Out of Scope, Logged)

These are pre-existing doc gaps surfaced during the sync but NOT caused by STORY-001:

1. `CLAUDE.md` "Panel communication pattern" paragraph describes inline HTML/CSS/JS, but BuilderPanel was migrated to React webview build artifacts. A future doc-sync pass should rewrite that paragraph.
2. `CLAUDE.md` does not yet document the `src/webview/` directory, the Vite build pipeline, or `npm run build:webview`. Future doc-sync.
3. `CLAUDE.md` does not list `addAgent`, `addSkill`, or `showWorkspaceConfig` in the commands table (these exist in `package.json` and `src/commands/`). Future doc-sync.

## Sign-Off

| Check | Status |
|-------|--------|
| Every area in epic's "Affected Areas" reviewed | yes — only the Builder Pipeline tab was affected |
| Only sections affected by this epic modified | yes — zero doc edits required because plan already matched reality |
| No speculation about future changes | yes |
| Scope-cut features removed | n/a — no scope cuts |
| Breaking changes get migration note | n/a — no breaking changes |
| Cross-references resolve | yes |

Reverse-sync complete.
