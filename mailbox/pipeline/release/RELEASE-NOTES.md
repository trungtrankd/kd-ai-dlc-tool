# RELEASE — KD AIDLC v1.0.0 (STORY-001 cut)

**Owner agent:** developer-devops
**Upstream:** `mailbox/pipeline/execute-test/TEST-SCRIPT.md`

## Artifact

- VSIX: `/Users/nb230601/Documents/kd-ai-dlc-tool/kd-ai-dlc-tool-1.0.0.vsix` (159 files, 1.82 MB)
- Engine: `vscode ^1.85.0`
- Publisher: `trungtrankd`
- Bundled webview asset: `out/webviews/workspace.js` (22.17 kB, +2 kB vs. previous build — accounts for the new pipeline-dashboard components)

## What's New

- **Pipeline Status Dashboard** — the Builder → Pipeline sub-tab now renders each pipeline step as a live status card:
  - Pending steps show a hollow circle.
  - In-progress steps show a rotating spinner plus the latest log line from that step's agent.
  - Done steps show a green check plus elapsed time (`Ns` or `Nm Ss`).
  - Failed steps show a red ✗ plus the failure reason from `.task-board.json`.
  - A progress bar above the cards shows `Done N/M` (green) or `Failed at <step> (i/M)` (red).
- All updates are watcher-driven — no polling.

## Technical Changelog

### New
- **STORY-001**: Pipeline Status Dashboard with Real-time Progress.
  - Added `PipelineDashboard`, `PipelineProgressBar`, `PipelineStepCard` to `src/webview/workspace/WorkspaceApp.tsx`.
  - Added helpers `taskForStep`, `stepStatus`, `latestLogFor`, `formatElapsed`, `statusMeta` (pure functions).
  - Added `@keyframes aidlc-spin` + `.aidlc-spin` to `src/webview/workspace/workspace.css`.

### Internal
- No changes to host-side TypeScript, no new dependencies, no new VS Code commands or settings.

### Migration
- None. The change is additive and only affects one tab.

## Install

```bash
code --install-extension kd-ai-dlc-tool-1.0.0.vsix
```

## Rollback Path

`git revert` the two webview files and re-run `npm run vscode:prepublish && npx vsce package`. No persisted state to undo.

## Pre-Flight Gate Status

| Gate | Status |
|------|--------|
| `npm run compile` exit 0 | PASS |
| Webview type-check exit 0 | PASS |
| Vite build produced `out/webviews/workspace.js` | PASS |
| esbuild produced `dist/extension.js` (via vsce prepublish hook) | PASS |
| VSIX packaged | PASS |
| Code review verdict | APPROVE |
| Automated test gates | PASS |
| Manual UI smoke | PENDING (operator) |

**GO** for the automated portion. Manual smoke deferred to operator before public install.
