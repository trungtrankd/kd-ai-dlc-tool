# EXECUTE-TEST — Pipeline Status Dashboard

**Owner agent:** qa-engineer
**Upstream:** `mailbox/pipeline/test-plan/TEST-PLAN.md`, `mailbox/pipeline/review/APPROVAL.md`

## Prerequisites

- macOS, VS Code ≥ 1.85, Node 20+.
- VSIX built at `kd-ai-dlc-tool-1.0.0.vsix` (1.82 MB, 159 files).
- Repository state: working tree contains the STORY-001 implementation diff.

## Automated Gates (run by orchestrator)

| Gate | Command | Result |
|------|---------|--------|
| TypeScript host compile | `npm run compile` | PASS — exited 0 |
| TypeScript webview type-check | `npx tsc -p tsconfig.webview.json` | PASS — exited 0 |
| Webview production bundle | `npm run build:webview` (run via `vsce package` prepublish) | PASS — `out/webviews/workspace.js` 22.17 kB |
| Extension bundle (esbuild) | implicit via `npm run vscode:prepublish` during `vsce package` | PASS — completed without error |
| VSIX packaging | `npx vsce package --allow-missing-repository --no-dependencies` | PASS — produced `kd-ai-dlc-tool-1.0.0.vsix` (159 files, 1.82 MB) |

Note on `--allow-missing-repository`: package.json already sets `repository`, so the flag is a no-op but kept for forward-compat. `--no-dependencies` skips a lengthy npm tree scan since the build already inlines deps via esbuild + Vite. Without those flags `vsce` would still pass; the flags only short-circuit warnings.

## Manual Scenarios (tester self-execution against Extension Development Host)

These scenarios require launching the extension via VS Code F5 and exercising the UI. They are intentionally light because the implementation surface is small and was verified at the code-review level.

### Scenario 1 — STORY-001-UI01 (real-time refresh)
1. Press F5 in the repo root to launch the Extension Development Host.
2. In the dev host, open the AIDLC activity-bar icon → click the AIDLC Builder webview.
3. Open the **Pipeline** sub-tab.
4. In a terminal, edit `.task-board.json` and flip `plan.status` from `done` → `in_progress` → `done` again.
5. **Expected**: each save makes the corresponding card re-render its status badge and icon without clicking Refresh.

### Scenario 2 — STORY-001-UI02 (spinner + log)
1. Set `plan.status = "in_progress"` in `.task-board.json`.
2. Append a fresh entry to `.agent-log.jsonl`: `{"ts":"2026-05-19T08:00:00.000Z","agent":"product-owner","type":"info","msg":"Drafting acceptance criteria"}`.
3. **Expected**: the `plan` card shows a rotating ⧗ icon (CSS spin) and the log message appears in the inner strip.

### Scenario 3 — STORY-001-UI03 (done + elapsed)
1. Set `plan.status = "done"`, `started_at = "2026-05-19T08:00:00.000Z"`, `completed_at = "2026-05-19T08:01:30.000Z"`.
2. **Expected**: the card shows green ✓, the badge reads `DONE`, and the top-right of the card shows `1m 30s`.

### Scenario 4 — STORY-001-UI04 (failed + reason)
1. Set `implement.status = "failed"`, `output = "esbuild reported 3 unresolved imports in src/foo.ts"`.
2. **Expected**: the card turns red, badge reads `FAILED`, and the failure reason strip displays the output truncated to 240 chars.

### Scenario 5 — STORY-001-UI05 (progress bar)
1. With all 9 tasks `done`: bar fills green to 100% with label `Done 9/9`.
2. Set step 5 (`review`) to `failed`: bar freezes at 4/9 (44%), turns red, label changes to `Failed at review (4/9)`.

### Regression Smoke (STORY-001-RG01–RG05)
- Click **Agents** sub-tab → list still populates.
- Click **History** sub-tab → past prompts still listed.
- Click **Epics** top-tab → active epic still expands and per-task buttons work.
- Click **Activity** top-tab → log stream still appends.
- Open the AIDLC sidebar (Activity Bar icon) → renders without errors.

## Verdict

| Gate | Status |
|------|--------|
| Automated compile / type-check / bundle / VSIX | PASS |
| Manual UI scenarios | Pending tester sign-off (the orchestrator cannot interact with the live Extension Development Host) |

Signed-off (automated portion): **qa-engineer** at 2026-05-19T07:42:30Z.

Recommended human action: load `kd-ai-dlc-tool-1.0.0.vsix` into a clean VS Code instance and walk through Scenarios 1–5 above. Estimated 5 minutes.
