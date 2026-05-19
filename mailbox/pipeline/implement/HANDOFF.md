# IMPLEMENT — Handoff Notes

**Owner agent:** developer
**Upstream:** `mailbox/pipeline/test-plan/TEST-PLAN.md`, `mailbox/pipeline/design/TECH-DESIGN.md`

## Files Changed

| File | Change |
|------|--------|
| `src/webview/workspace/WorkspaceApp.tsx` | Added pipeline-dashboard helpers (`taskForStep`, `stepStatus`, `latestLogFor`, `formatElapsed`, `statusMeta`) and three new components (`PipelineStepCard`, `PipelineProgressBar`, `PipelineDashboard`). Replaced the static step-badge row inside the Pipeline sub-tab with `<PipelineDashboard …/>`. Threaded `board` and `logs` from `state` into `BuilderView` (already in state, just newly destructured). |
| `src/webview/workspace/workspace.css` | Added `@keyframes aidlc-spin` plus `.aidlc-spin` utility class so the in-progress icon rotates without dragging Tailwind's animation plugin in. |

## Files NOT Touched (intentionally — already correct)

- `src/types.ts` — `Task` already exposes `started_at` / `completed_at` (verified at L8–L9).
- `src/panels/BuilderPanel.ts` — `_sendAllData` already includes `logs` and `board` in the `init` message (verified at L226–L234).
- `src/extension.ts` — `onBoardChange` and `onLogChange` already call `BuilderPanel.refreshAll(workspaceRoot)` (verified at L33–L44).
- `src/watchers/fileWatchers.ts` — `.task-board.json` and `.agent-log.jsonl` watchers already exist.

This confirms STORY-001-AC06 (no polling) is met by reusing the existing watcher chain.

## Build Verification

- `npm run compile` exited 0.
- `npx tsc -p tsconfig.webview.json` exited 0 (clean webview type-check).
- `npm run build:webview` produced `out/webviews/workspace.js` (22.17 kB, up from ~21 kB pre-change — expected delta for the new components).

## AC Coverage Map

| AC | Implementation evidence (WorkspaceApp.tsx) |
|----|---------------------------------------------|
| STORY-001-AC01 (real-time refresh) | `PipelineDashboard` reads from `state.board` + `state.logs`; both arrive via the existing `init` postMessage triggered by the host's `BuilderPanel.refreshAll`. No `useEffect`/`setInterval` polling. |
| STORY-001-AC02 (spinner + log) | `PipelineStepCard`: when `status === 'in_progress'`, `statusMeta` returns `iconClass: 'aidlc-spin'`, and `latestLogFor` provides the most recent agent log. |
| STORY-001-AC03 (done + elapsed) | `formatElapsed(task.started_at, task.completed_at)` rendered in the right of the card header when `status === 'done'`. Green check icon comes from `statusMeta('done').icon`. |
| STORY-001-AC04 (failed + reason) | `failureReason` block reads `task.output`, truncated to 240 chars, rendered in red. Icon = `✗`. |
| STORY-001-AC05 (progress bar) | `PipelineProgressBar`: counts done; if any failed, freezes width at first-failed-index, switches fill colour to red, label changes to `Failed at <step>`. |
| STORY-001-AC06 (no polling) | Pure render; zero timers / intervals introduced. Verified by reading the diff. |
| STORY-001-AC07 (no regressions) | Only the Pipeline sub-tab content changed. Epics tab, Agents sub-tab, History sub-tab, Activity tab, Sidebar all read from the same `state` and are untouched. |

## Edge-case Handling Verified

- `board === null` → all steps render `pending`, progress 0%, no crash.
- Task id present but status unknown → falls through to `'pending'` via `isStepStatus` guard.
- `completed_at` without `started_at` (corrupt state) → `formatElapsed` returns `null`, elapsed not rendered.
- No log entries matching a step → `latestLogFor` returns `null`, log strip omitted.

## Branch / PR

The orchestrator is running directly on `main` per the operator's instruction. No feature branch was cut; the diff is staged in the working tree for the human operator to commit if they choose. (CLAUDE.md does not require a branch.)
