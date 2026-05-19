# MONITOR — Post-Release Health Check

**Owner agent:** developer-devops
**Upstream:** `mailbox/pipeline/release/RELEASE-NOTES.md`

> Note: this is a VS Code extension; there are no production servers to observe. "Monitoring" here means static post-build verification of invariants that AC06 ("watcher-driven, no polling") relies on, plus a smoke-pass of the packaged VSIX surface.

## Data Sources

| Source | Provided | Notes |
|--------|----------|-------|
| Build logs | yes | tsc + vite + esbuild + vsce all green |
| Static code scan | yes | grep against `setInterval` / `setTimeout` in `src/**` |
| VSIX inspection | yes | file exists, size 1.82 MB |
| Production telemetry | n/a | extension does not phone home |

## Key Indicators

| Metric | Status | Value | Threshold | Source |
|--------|--------|-------|-----------|--------|
| TypeScript compile errors | ok | 0 | 0 | `npm run compile` |
| Webview type-check errors | ok | 0 | 0 | `tsc -p tsconfig.webview.json` |
| Vite build warnings | ok | 0 functional (1 deprecation notice about Vite CJS API — upstream, unrelated) | 0 | `npm run build:webview` |
| VSIX produced | ok | `kd-ai-dlc-tool-1.0.0.vsix` 1.82 MB | exists | `npx vsce package` |
| Polling occurrences in webview render path | ok | 0 | 0 | grep |
| Polling occurrences anywhere in `src/` | ok | 1 (`taigaParser.ts:42` — network request timeout, unrelated to STORY-001) | n/a | grep |
| Watcher → `BuilderPanel.refreshAll` wiring | ok | 5 call sites in `extension.ts` (board, log, mail, agents, refreshAgents command) | ≥ 2 (board + log) | grep |
| `.task-board.json` & `.agent-log.jsonl` watcher registration | ok | both present in `src/watchers/fileWatchers.ts` (lines 21–22, 29–30) | both | grep |

## Local State

| Item | Value |
|------|-------|
| Version | 1.0.0 |
| Branch | main |
| Tag | not tagged in git (operator's choice; matches CLAUDE.md guidance not to create tags unrequested) |
| Release checklist | this file |
| Deploy time | 2026-05-19T07:43:00Z |

## Top Issues

None.

## Trend vs. Previous Release

- Webview bundle size: `out/webviews/workspace.js` 22.17 kB (previous build ~20 kB). Delta ≈ +2 kB for the new components. Within budget.
- No regressions in other tabs (Epics, Agents, History, Activity, Sidebar) — confirmed by code review (diff scope limited to two files).

## Decision

- [x] **Continue rollout** — automated checks all green; manual UI smoke is the only remaining gate and is recommended for the operator before publishing the VSIX externally.
- [ ] Pause rollout
- [ ] Roll back
- [ ] Hotfix

## Action Items

- (Operator) Walk through Scenarios 1–5 in `mailbox/pipeline/execute-test/TEST-SCRIPT.md` in the Extension Development Host.
- (Optional) Tag the release in git: `git tag v1.0.0-story-001`.
