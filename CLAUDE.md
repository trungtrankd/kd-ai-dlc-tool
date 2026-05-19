# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

```bash
# Type-check (outputs to dist/ via tsc)
npm run compile

# Watch mode for development
npm run watch

# Bundle for distribution (esbuild, with source maps)
npm run bundle

# Production bundle (minified, no source maps)
npm run vscode:prepublish
```

There are no test scripts — the extension is tested manually by launching the VS Code Extension Development Host.

To launch the extension for debugging, open this repo in VS Code and press **F5** (or run the "Run Extension" launch configuration).

## Architecture Overview

This is a VS Code extension that orchestrates Claude Code agents through an AI-powered SDLC pipeline. The extension itself does **not** run AI — it drives the `claude` CLI in an integrated terminal with pre-built prompts.

### Core flow

1. User enters a story (or imports from Taiga/Story Library)
2. Extension writes a prompt file to `.aidlc/runs/prompt-<timestamp>.md`
3. Extension opens a terminal and pipes the prompt file into `claude --dangerously-skip-permissions -p`
4. Claude reads `.aidlc/workspace.yaml`, skill files in `.aidlc/skills/`, and agent definitions in `.claude/agents/` to execute the pipeline
5. Pipeline progress is written to `.task-board.json` and `.agent-log.jsonl` in the user's workspace
6. File watchers trigger UI refreshes as those files change

### Source layout

- **[src/extension.ts](src/extension.ts)** — activation entry point; registers all commands, wires file watchers, and creates the sidebar
- **[src/panels/](src/panels/)** — three `WebviewPanel` classes (`BuilderPanel`, `DashboardPanel`, `ActivityFeedPanel`). Each is a singleton (`static current`) and embeds its complete HTML/CSS/JS inline as a template literal
- **[src/providers/SidebarProvider.ts](src/providers/SidebarProvider.ts)** — `WebviewViewProvider` for the Activity Bar sidebar (compact status + quick-actions)
- **[src/commands/](src/commands/)** — one file per VS Code command; `runPipeline` is the core execution entry point; `importAidlcTemplate` copies the bundled `templates/aidlc/` scaffold into the user's workspace
- **[src/data/](src/data/)** — pure read helpers for workspace files (`taskBoardReader`, `logReader`, `agentReader`, `storyLibrary`, `mailboxReader`)
- **[src/statusBar/pipelineStatusBar.ts](src/statusBar/pipelineStatusBar.ts)** — status bar item that infers pipeline state (idle/running/done/error) from `.task-board.json`
- **[src/utils/claudeFinder.ts](src/utils/claudeFinder.ts)** — locates the `claude` CLI binary (config override → PATH → common install locations)
- **[src/utils/aidlcPrompts.ts](src/utils/aidlcPrompts.ts)** — builds the prompt strings piped to Claude for each pipeline mode (full, continue, review, single-step)
- **[src/utils/workspaceYamlReader.ts](src/utils/workspaceYamlReader.ts)** — custom line-by-line YAML parser for `.aidlc/workspace.yaml` (no external YAML library); also contains write helpers for pipeline CRUD
- **[src/utils/taigaParser.ts](src/utils/taigaParser.ts)** — fetches a Taiga user story via the Taiga REST API (browser URL → slug resolution → story fetch) and converts it to a structured markdown story file
- **[src/watchers/fileWatchers.ts](src/watchers/fileWatchers.ts)** — creates VS Code `FileSystemWatcher` instances for `.task-board.json`, `.agent-log.jsonl`, `mailbox/**/*.json`, and `.claude/agents/*.md`
- **[src/types.ts](src/types.ts)** — shared TypeScript interfaces (`Task`, `TaskBoard`, `LogEntry`, `MailMessage`, `StoryMeta`)
- **[templates/aidlc/](templates/aidlc/)** — bundled template that gets copied into the user's workspace as `.aidlc/` when they click "Load Template". Contains `workspace.yaml`, 9 skill prompt files, and 11 agent definition files

### Panel communication pattern

Panels communicate bidirectionally with their webview via `postMessage`. The host side sends an `init` command with all data; the webview renders from that. File watcher callbacks call panel static methods (e.g., `BuilderPanel.refreshAll()`) to re-push data when workspace files change.

### Pipeline steps and default models

The 9-step pipeline is defined in `BuilderPanel.ts` (`AIDLC_SKILLS`) and mirrored in `aidlcPrompts.ts`:

| Step | Model |
|------|-------|
| plan, design, review | claude-opus-4-7 |
| test-plan, implement, execute-test, release, monitor, doc-sync | claude-sonnet-4-6 |

### VS Code commands and settings

Registered commands (all prefixed `agentDashboard.`):

| Command | Title |
|---------|-------|
| `openBuilder` | AIDLC: Open Builder |
| `openDashboard` | AIDLC: Open Epics |
| `openActivityFeed` | AIDLC: Open Activity Feed |
| `runAidlcFullPipeline` | AIDLC: Start Epic |
| `continueAidlcPipeline` | AIDLC: Continue Pipeline |
| `reviewCurrentWork` | AIDLC: Review Current Work |
| `cancelPipeline` | AIDLC: Cancel Pipeline |
| `clearBoard` | AIDLC: Clear Board |
| `importAidlcTemplate` | AIDLC: Import Template |
| `importTaiga` | AIDLC: Import from Taiga |

One user-facing configuration property: `agentDashboard.claudePath` (string, default `""`) — explicit path to the `claude` binary; leave empty to auto-detect.

### Bundling

esbuild bundles `src/extension.ts` → `dist/extension.js` with `vscode` as an external. TypeScript is compiled to `dist/` separately via `tsc` for type checking; the actual extension loaded by VS Code is always the esbuild output.

### Pipeline / Workflow feature

Pipelines are defined in `.aidlc/workspace.yaml` under the `pipelines:` key. Each pipeline has:
- `id` — unique slug used as the pipeline identifier
- `steps` — ordered list of step names; a step can be prefixed with `human:` to mark it as requiring human approval (e.g. `human:test-plan`)
- `on_failure` — `stop` (default) or `continue`

**Step mode encoding** (implemented in `BuilderPanel.ts` webview JS):
- `plan` → AUTO / default mode
- `human:plan` → HUMAN mode (shown as purple badge on step boxes)

**CRUD flow:**
- **Create** — "+ Add Pipeline" button → modal → "Create pipeline" → `createPipeline` message → `addPipeline()` in `workspaceYamlReader.ts`
- **Edit** — ✏ button on pipeline card → same modal pre-filled → "Update pipeline" → `editPipeline` message → `editPipeline()` (`deletePipeline` + `addPipeline`)
- **Delete** — × button → `deletePipeline` message → `deletePipeline()` in `workspaceYamlReader.ts`
- **Toggle on_failure** — click the ON_FAILURE badge on a card → `toggleOnFailure` → `patchPipelineOnFailure()`

## After completing any task

Always run the following two commands in order before reporting done:

```bash
# 1. Type-check
npm run compile

# 2. Package as VSIX for distribution
npx vsce package
```

The output VSIX (`kd-ai-dlc-tool-<version>.vsix`) can be installed via:
```bash
code --install-extension kd-ai-dlc-tool-<version>.vsix
```
