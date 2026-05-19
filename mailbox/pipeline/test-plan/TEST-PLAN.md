# TEST-PLAN — Pipeline Status Dashboard

**Owner agent:** qa-engineer
**Upstream:** `mailbox/pipeline/plan/PRD.md`, `mailbox/pipeline/design/TECH-DESIGN.md`

## Test Scope

| AC | Test types |
|----|-----------|
| STORY-001-AC01 (real-time refresh) | UI (manual against running pipeline), UT (reducer applies `init` payload) |
| STORY-001-AC02 (in_progress + log) | UI manual, UT for `latestLogFor` |
| STORY-001-AC03 (done + elapsed) | UI manual, UT for `formatElapsed` |
| STORY-001-AC04 (failed + reason) | UI manual, UT |
| STORY-001-AC05 (progress bar end-state) | UI manual, UT for `overall()` |
| STORY-001-AC06 (no polling) | Static code review: no `setInterval`/`setTimeout` introduced in the dashboard render path |
| STORY-001-AC07 (no regressions) | Smoke test of Epics, Agents, History, Activity tabs |

Out of scope: full E2E with a live `claude` CLI — too costly relative to risk. Manual smoke is sufficient.

## Environment Matrix

| Surface | OS | Combo |
|---------|----|----|
| VS Code Extension Development Host | macOS (developer machine) | must-test |
| Webview bundle | Chromium (VS Code embeds) | must-test |

Single-developer manual harness. CI runs `npm run compile` only (no test runner configured for this repo per CLAUDE.md).

## Unit Tests — `STORY-001-UT*`

No test runner is configured in the repo (`scripts` only define `compile`, `watch`, `bundle`, `build:webview`, `build:ext`, `vscode:prepublish`). Adding a test runner is out of scope. Therefore the "unit checks" below are executed as **TypeScript-compile-time guarantees + manual review during `execute-test`**:

| ID | Subject | Check |
|----|---------|-------|
| STORY-001-UT01 | `formatElapsed(started, completed)` | Returns `null` if either missing; `"Ns"` for < 60s; `"Nm Ss"` otherwise; never throws on bad input |
| STORY-001-UT02 | `latestLogFor(step, agent, logs)` | Matches by agent OR step id; picks max `ts`; returns `null` when nothing matches |
| STORY-001-UT03 | `stepStatus(stepId, board)` | Returns `'pending'` when board null OR task missing OR status unknown |
| STORY-001-UT04 | Progress derivation | `done/total` count is correct; failure flag flips colour to red |

## UI / Component Tests — `STORY-001-UI*`

Executed manually in the Extension Development Host (`F5`).

| ID | Scenario | Steps | Expected |
|----|---------|-------|----------|
| STORY-001-UI01 | Real-time refresh (AC01) | Start a pipeline; observe Builder → Pipeline tab; do not click refresh | Each step transitions pending → in_progress → done without manual refresh |
| STORY-001-UI02 | In-progress spinner + log (AC02) | While `implement` step is running, look at its card | Spinner is animated; latest `.agent-log.jsonl` entry whose agent matches the step is visible |
| STORY-001-UI03 | Done check + elapsed (AC03) | After `plan` completes, look at its card | Green check icon; elapsed time matches `completed_at − started_at` formatted per UT01 |
| STORY-001-UI04 | Failed indicator (AC04) | Manually edit `.task-board.json` to set a step to `failed` with an `output` field | Red error icon; failure reason from `output` shown under the card |
| STORY-001-UI05 | Progress bar end-state (AC05) | Complete a full pipeline; then re-test by setting one step `failed` | Bar shows 100% on full success; bar freezes at the failed step's index and turns red on failure |

## Failure-Mode Tests

| ID | Mode | Expectation |
|----|------|-------------|
| STORY-001-LC01 | `.task-board.json` deleted mid-run | Steps render as `pending`; progress = 0; no crash |
| STORY-001-LC02 | Task id does not match any step | Ignored silently; pipeline cards unaffected |
| STORY-001-LC03 | `completed_at` set but `started_at` empty (corrupt state) | No elapsed time shown; no error |

## Regression Checklist — `STORY-001-RG*`

| ID | Surface | Check |
|----|---------|-------|
| STORY-001-RG01 | Builder → Agents sub-tab | Still lists agents and the "+ Add Agent" button works |
| STORY-001-RG02 | Builder → History sub-tab | Still lists past prompts and Rerun button works |
| STORY-001-RG03 | Epics tab | Active epic card still expands; per-task Approve/Reject/Rerun still post the right messages |
| STORY-001-RG04 | Activity tab | Log stream still appends new entries |
| STORY-001-RG05 | Sidebar | Sidebar webview still renders without errors |

## Non-Functional Tests

| ID | Subject | Check |
|----|---------|-------|
| STORY-001-PF01 | Render perf | Pipeline tab renders in < 100 ms for 9 steps (visual smoke) |
| STORY-001-A11Y01 | Colour-blindness | Status conveyed by both icon + text badge, never colour only |
| STORY-001-SEC01 | XSS through `task.output` / log `msg` | React renders strings as text — verified by reading the JSX; never `dangerouslySetInnerHTML` |

## Acceptance Gate (execute-test phase)

- `npm run compile` exits 0.
- `npm run build:webview` produces a new `out/webviews/workspace.js` whose size is non-zero.
- `npx vsce package` succeeds.
- All UI scenarios pass when exercised manually (developer self-test against the dev host).

## Flaky-Test Policy

All UI tests are deterministic: they read from a finite task-board snapshot, no clocks or randomness involved. The "real-time" tests rely on the file watcher, which is event-driven, not polled — no debouncing or sleep-and-retry patterns allowed.
