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
- **[src/panels/](src/panels/)** — four `WebviewPanel` classes (`BuilderPanel`, `DashboardPanel`, `ActivityFeedPanel`, `StoryLibraryPanel`). Each is a singleton (`static current`) and embeds its complete HTML/CSS/JS inline as a template literal
- **[src/providers/SidebarProvider.ts](src/providers/SidebarProvider.ts)** — `WebviewViewProvider` for the Activity Bar sidebar (compact status + quick-actions)
- **[src/commands/](src/commands/)** — one file per VS Code command; `runPipeline` is the core execution entry point
- **[src/data/](src/data/)** — pure read helpers for workspace files (`taskBoardReader`, `logReader`, `agentReader`, `storyLibrary`, `mailboxReader`)
- **[src/utils/claudeFinder.ts](src/utils/claudeFinder.ts)** — locates the `claude` CLI binary (config override → PATH → common install locations)
- **[src/utils/aidlcPrompts.ts](src/utils/aidlcPrompts.ts)** — builds the prompt strings piped to Claude for each pipeline mode (full, continue, review, single-step)
- **[src/watchers/fileWatchers.ts](src/watchers/fileWatchers.ts)** — creates VS Code `FileSystemWatcher` instances for `.task-board.json`, `.agent-log.jsonl`, `mailbox/**/*.json`, and `.claude/agents/*.md`
- **[src/types.ts](src/types.ts)** — shared TypeScript interfaces (`Task`, `TaskBoard`, `LogEntry`, `MailMessage`, `StoryMeta`)
- **[templates/aidlc/](templates/aidlc/)** — bundled template that gets copied into the user's workspace as `.aidlc/` when they click "Load Template". Contains `workspace.yaml`, 9 skill prompt files, and 10 agent definition files

### Panel communication pattern

Panels communicate bidirectionally with their webview via `postMessage`. The host side sends an `init` command with all data; the webview renders from that. File watcher callbacks call panel static methods (e.g., `BuilderPanel.refreshAll()`) to re-push data when workspace files change.

### Pipeline steps and default models

The 9-step pipeline is defined in `BuilderPanel.ts` (`AIDLC_SKILLS`) and mirrored in `aidlcPrompts.ts`:

| Step | Model |
|------|-------|
| plan, design, review | claude-opus-4-7 |
| test-plan, implement, execute-test, release, monitor, doc-sync | claude-sonnet-4-6 |

### Bundling

esbuild bundles `src/extension.ts` → `dist/extension.js` with `vscode` as an external. TypeScript is compiled to `dist/` separately via `tsc` for type checking; the actual extension loaded by VS Code is always the esbuild output.
