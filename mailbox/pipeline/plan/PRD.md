# PRD — Pipeline CRUD (Add / Edit / Delete Pipelines)

**Feature:** Add new pipeline or workflow (CRUD)
**Epic key:** PIPE-CRUD
**Owner agent:** product-owner
**Date:** 2026-05-19

---

## Problem Statement

A developer using the AIDLC VS Code extension can read their pipelines in the Builder webview, but cannot create, rename, reorder steps in, or delete a pipeline without manually editing `.aidlc/workspace.yaml` in a text editor. This friction blocks anyone who is unfamiliar with the YAML schema, makes it easy to introduce parse-breaking typos, and means the UI is read-only for the most important configuration object in the system.

The user should be able to manage the full lifecycle of a pipeline — create, edit, delete, toggle on_failure — entirely from the Builder webview without ever touching the YAML file by hand.

---

## Target User

VS Code extension users who configure and run AIDLC pipelines. Single-developer use case; the workspace is owned by one person at a time.

---

## In Scope

- **Create pipeline** — "Add Pipeline" button opens a modal; user sets `id`, optional display name, ordered list of steps (comma- or newline-separated), and `on_failure` toggle; on submit the pipeline is appended to `.aidlc/workspace.yaml` and the UI refreshes.
- **Edit pipeline** — pencil icon on an existing pipeline card opens the same modal pre-filled; on submit the YAML block is replaced in place.
- **Delete pipeline** — delete (×) icon on a pipeline card; a confirmation prompt prevents accidental deletion; on confirm the pipeline block is removed from the YAML.
- **Toggle on_failure** — clicking the ON_FAILURE badge on a card cycles between `stop` and `continue` (already partially wired; this story completes the backend functions).
- **`human:` step prefix** — steps entered as `human:step-name` are stored as-is and displayed with a visual distinction (purple badge) in the UI.
- **Empty state** — when no pipelines exist, the Pipelines tab shows an empty-state prompt with a prominent "Add Pipeline" button.
- **Validation** — `id` must be non-empty, lowercase alphanumeric + hyphens only, and unique; at least one step required; step names trimmed of whitespace.
- **No page reload** — YAML writes are reflected in the webview without closing or reopening the panel.

### Files affected

| Layer | File |
|-------|------|
| YAML write layer | `src/utils/workspaceYamlReader.ts` |
| Message handler | `src/panels/BuilderPanel.ts` |
| UI | `src/webview/workspace/WorkspaceApp.tsx` |

---

## Out of Scope

- Drag-and-drop step reordering within a pipeline (can be a follow-up).
- Multi-pipeline execution or pipeline selection for "Start Epic" (that is a separate feature; `pipelines[0]` remains the active pipeline).
- Renaming or editing individual step definitions (steps are plain strings; the developer picks what to type).
- Agent assignment per pipeline step (agents live in the `agents:` section, not inside a pipeline).
- Undo / redo or version history of YAML edits.
- Import/export of pipelines as separate files.
- Any change to the terminal or `claude` CLI invocation logic.

---

## User Stories and Acceptance Criteria

### US-01 — Add a new pipeline

> As a developer, I want to add a new pipeline from the Builder webview, so that I can configure a custom step sequence without editing YAML by hand.

| AC ID | Given | When | Then |
|-------|-------|------|------|
| PIPE-AC01 | No pipelines exist (empty state) | I view the Pipelines tab | I see an "Add Pipeline" call-to-action button and a message such as "No pipelines yet." |
| PIPE-AC02 | The modal is open | I submit a valid `id` (e.g. `my-flow`), at least one step, and an `on_failure` value | A new pipeline block is appended to `.aidlc/workspace.yaml` with the correct `id`, `steps`, and `on_failure` fields; the modal closes; the new pipeline card appears in the UI without a panel reload |
| PIPE-AC03 | The modal is open | I submit with an empty `id` field | The form shows an inline validation error ("Pipeline ID is required") and does not submit |
| PIPE-AC04 | The modal is open | I type an `id` that already exists in the pipelines list | The form shows an inline validation error ("A pipeline with this ID already exists") and does not submit |
| PIPE-AC05 | The modal is open | I submit with zero steps entered | The form shows an inline validation error ("At least one step is required") and does not submit |
| PIPE-AC06 | The modal is open | I enter steps as a comma-separated string (e.g. `plan, design, implement`) | Each token is trimmed and stored as a separate step entry; whitespace-only tokens are dropped |

---

### US-02 — Edit an existing pipeline

> As a developer, I want to edit a pipeline's steps and on_failure setting, so that I can adjust the workflow as requirements change.

| AC ID | Given | When | Then |
|-------|-------|------|------|
| PIPE-AC07 | A pipeline card is visible | I click the edit (pencil) icon | The modal opens pre-filled with the pipeline's current `id`, steps, and `on_failure` value |
| PIPE-AC08 | The edit modal is open | I change the steps list and save | The pipeline block in `.aidlc/workspace.yaml` is updated; the card reflects the new steps immediately; no other pipeline is affected |
| PIPE-AC09 | The edit modal is open | I clear all steps and try to save | The form shows an inline validation error ("At least one step is required") and does not submit |
| PIPE-AC10 | The edit modal is open | I change the `id` to a value that conflicts with another pipeline | The form shows an inline validation error ("A pipeline with this ID already exists") and does not submit |

---

### US-03 — Delete a pipeline

> As a developer, I want to delete a pipeline I no longer need, so that the workspace stays tidy.

| AC ID | Given | When | Then |
|-------|-------|------|------|
| PIPE-AC11 | A pipeline card is visible | I click the delete (×) icon | A confirmation prompt appears (inline or VS Code modal) asking me to confirm deletion |
| PIPE-AC12 | The confirmation prompt is shown | I confirm deletion | The pipeline block is removed from `.aidlc/workspace.yaml`; the card disappears from the UI; the empty-state message is shown if no pipelines remain |
| PIPE-AC13 | The confirmation prompt is shown | I cancel | No changes are made to the YAML or the UI |

---

### US-04 — Toggle on_failure

> As a developer, I want to toggle a pipeline's on_failure setting from the card, so that I can quickly switch error-handling behaviour.

| AC ID | Given | When | Then |
|-------|-------|------|------|
| PIPE-AC14 | A pipeline card shows `ON_FAILURE: stop` | I click the badge | The YAML value changes to `continue`; the badge label updates to `ON_FAILURE: continue` without a modal |
| PIPE-AC15 | A pipeline card shows `ON_FAILURE: continue` | I click the badge | The YAML value changes to `stop`; the badge label updates to `ON_FAILURE: stop` |

---

### US-05 — Human-approval step prefix

> As a developer, I want to mark a step as requiring human approval by prefixing it with `human:`, so that the pipeline pauses at that step for my review.

| AC ID | Given | When | Then |
|-------|-------|------|------|
| PIPE-AC16 | The create or edit modal is open | I enter a step as `human:test-plan` | The step is stored verbatim as `human:test-plan` in the YAML; the pipeline card renders that step with a visual distinction (purple "HUMAN" badge) |
| PIPE-AC17 | A pipeline card has a `human:` step | I view the card | The step label shows `test-plan` and the HUMAN badge; the `human:` prefix is not displayed as raw text |

---

## Empty State

When `yaml.pipelines` is an empty array (or `workspace.yaml` does not exist):

- The Pipelines sub-tab renders: "No pipelines yet. Add one to define your AI workflow." with a prominent "Add Pipeline" button.
- No pipeline cards, no progress bar.

---

## Error States

| Scenario | Behaviour |
|----------|-----------|
| `.aidlc/workspace.yaml` does not exist when a write is attempted | `addPipeline` / `editPipeline` / `deletePipeline` call `vscode.window.showErrorMessage("workspace.yaml not found. Run AIDLC: Import Template first.")` and make no file change |
| File write fails (permissions, disk full) | Catch the error; call `vscode.window.showErrorMessage("Could not write workspace.yaml: <reason>")` |
| YAML parse returns `undefined` after write | `_sendAllData` re-reads the file; if it fails, the UI keeps its last known state and shows a VS Code warning message |
| Duplicate `id` submitted from modal | Inline validation error in the form (see PIPE-AC04, PIPE-AC10); no host-side message is sent |

---

## Validation Rules

| Field | Rule |
|-------|------|
| `id` | Required; 1–60 characters; matches `/^[a-z0-9][a-z0-9-]*$/`; unique within the current pipelines list |
| `steps` | Required; at least one non-whitespace token after splitting on commas and newlines; each step name trimmed; `human:` prefix allowed, rest must be non-empty |
| `on_failure` | Constrained to `stop` or `continue`; default is `stop` for new pipelines |

---

## Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| No page reload | YAML writes must be reflected in the webview via the existing `_sendAllData` / file-watcher path — no panel close/reopen |
| Keyboard accessibility | The modal can be submitted with Enter and dismissed with Escape; all interactive elements are reachable by Tab |
| Screen-reader labels | Modal inputs have visible labels; buttons have descriptive `aria-label` attributes where the visual label is an icon only |
| No external YAML library | Write operations use text manipulation only (the same approach as `patchPipelineOnFailure`); no new npm dependencies |
| TypeScript strict | All new code must pass `npm run compile` with zero errors |
| Performance | CRUD operations must complete (file write + webview refresh) in under 500 ms on a developer laptop |
| Regression | The pipeline status dashboard (STORY-001 — step cards, progress bar, spinner) must continue to work correctly after this change |

---

## Message Protocol (Webview → Host)

New `postMessage` commands to be handled in `BuilderPanel.ts`:

| Command | Payload | Description |
|---------|---------|-------------|
| `createPipeline` | `{ id, name?, steps: string[], onFailure }` | Append a new pipeline to workspace.yaml |
| `editPipeline` | `{ id, name?, steps: string[], onFailure, originalId? }` | Replace the pipeline block identified by `originalId` (or `id`) |
| `deletePipeline` | `{ id }` | Remove the pipeline block identified by `id` |

The existing `toggleOnFailure` command and `patchPipelineOnFailure` function remain unchanged.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| A developer can create a new pipeline from zero to card-visible in under 60 seconds | Manual QA pass |
| Zero TypeScript compile errors after implementation | `npm run compile` exit 0 |
| VSIX packages successfully | `npx vsce package` exit 0 |
| All PIPE-AC01 through PIPE-AC17 pass manual testing | QA sign-off |
