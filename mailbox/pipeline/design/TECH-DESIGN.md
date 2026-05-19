# Tech Design — Pipeline CRUD (PIPE-CRUD)

**Feature:** Add new pipeline or workflow (CRUD)
**Author:** tech-lead
**Date:** 2026-05-19
**Depends on:** PRD at `mailbox/pipeline/plan/PRD.md`

---

## 1. Summary of Approach

The implementation stays entirely within three existing files. No new files, no new npm packages, no new VS Code commands.

The strategy mirrors the existing `patchPipelineOnFailure` text-manipulation approach: all YAML writes are done by reading the file as a raw string, making targeted text replacements, and writing the result back. The custom line-by-line parser in `readWorkspaceYaml` is left untouched because it already handles `human:` prefixes verbatim.

Three new YAML writer functions (`addPipeline`, `editPipeline`, `deletePipeline`) are added to `src/utils/workspaceYamlReader.ts`. Three new message handlers (`createPipeline`, `editPipeline`, `deletePipeline`) are added to the `onDidReceiveMessage` switch in `BuilderPanel.ts`. The modal UI and pipeline management section are added to `WorkspaceApp.tsx` inside `BuilderView`.

The webview never reloads. After every write the host calls `_sendAllData()`, which re-reads `workspace.yaml` via `readWorkspaceYaml` and posts a fresh `init` message to the webview. The reducer already handles `init` by fully replacing the `yaml` slice of state, so the pipeline list re-renders automatically.

---

## 2. Interface Contracts — New workspaceYamlReader Functions

### 2.1 `addPipeline`

```typescript
/**
 * Appends a new pipeline block to the pipelines: section of workspace.yaml.
 *
 * @param workspaceRoot  Absolute path to the workspace root directory.
 * @param pipeline       The pipeline to append. steps entries are stored verbatim
 *                       (including any human: prefix).
 * @returns              void on success.
 * @throws               Error('WORKSPACE_YAML_NOT_FOUND') if the file is missing.
 * @throws               Error('WRITE_FAILED: <reason>') if fs.writeFileSync throws.
 */
export function addPipeline(
  workspaceRoot: string,
  pipeline: { id: string; steps: string[]; onFailure: 'stop' | 'continue' },
): void
```

**Behaviour:**
- Resolves path: `<workspaceRoot>/.aidlc/workspace.yaml`
- If file does not exist: throws `Error('WORKSPACE_YAML_NOT_FOUND')`
- Reads raw content as UTF-8 string
- Builds the new pipeline block (see Section 3.1)
- Appends the block after the last existing pipeline entry inside the `pipelines:` section, or directly under the `pipelines:` key if the section is empty
- If `pipelines:` key is absent from the file entirely: appends `\npipelines:\n<block>` at EOF
- Writes file with a single `fs.writeFileSync` call
- Returns void on success; wraps any fs error and rethrows as `Error('WRITE_FAILED: <message>')`

### 2.2 `editPipeline`

```typescript
/**
 * Replaces an existing pipeline block identified by originalId.
 *
 * @param workspaceRoot  Absolute path to the workspace root directory.
 * @param originalId     The current id value of the pipeline block to replace.
 * @param pipeline       Replacement data. May use a different id than originalId.
 * @returns              true if the block was found and replaced; false if originalId was not found.
 * @throws               Error('WORKSPACE_YAML_NOT_FOUND') if the file is missing.
 * @throws               Error('WRITE_FAILED: <reason>') if fs.writeFileSync throws.
 */
export function editPipeline(
  workspaceRoot: string,
  originalId: string,
  pipeline: { id: string; steps: string[]; onFailure: 'stop' | 'continue' },
): boolean
```

**Behaviour:**
- Resolves path; throws if missing
- Extracts the raw text block for `originalId` (see Section 3.2)
- If not found: returns `false` without writing
- Builds the replacement block using the same serialiser as `addPipeline`
- Splices the new block text into the raw string at the extracted block's character range
- Writes file; returns `true`

### 2.3 `deletePipeline`

```typescript
/**
 * Removes the pipeline block identified by pipelineId from workspace.yaml.
 *
 * @param workspaceRoot  Absolute path to the workspace root directory.
 * @param pipelineId     The id value of the pipeline block to remove.
 * @returns              true if the block was found and removed; false if not found.
 * @throws               Error('WORKSPACE_YAML_NOT_FOUND') if the file is missing.
 * @throws               Error('WRITE_FAILED: <reason>') if fs.writeFileSync throws.
 */
export function deletePipeline(
  workspaceRoot: string,
  pipelineId: string,
): boolean
```

**Behaviour:**
- Resolves path; throws if missing
- Extracts the raw text block for `pipelineId` (see Section 3.2)
- If not found: returns `false`
- Removes the extracted text range from the raw string
- Writes file; returns `true`

---

## 3. YAML Text-Manipulation Strategy

### 3.1 Block Serialiser (shared private helper)

```typescript
// Private helper — not exported
function serializePipelineBlock(pipeline: {
  id: string;
  steps: string[];
  onFailure: 'stop' | 'continue';
}): string
```

Output format (2-space base indent, matching the template convention):

```
  - id: my-flow
    steps:
      - plan
      - human:test-plan
    on_failure: continue
```

Rules:
- Each step is `      - <step>` (6 spaces: 4 for list-item body + 2 for list marker)
- `on_failure` line is `    on_failure: <value>` (4 spaces)
- No trailing whitespace on any line
- Block ends with a single `\n`
- No blank line appended (the append logic handles separators)

### 3.2 Block Locator (shared private helper)

```typescript
// Private helper — not exported
function findPipelineBlock(
  yaml: string,
  pipelineId: string,
): { start: number; end: number } | null
```

Returns character offsets of the complete pipeline block in the raw YAML string, or `null` if the pipeline id is not found.

**Algorithm:**

1. Split the raw YAML into lines. Track running character offset as lines are consumed.
2. Walk lines until a line matches the pattern `/^\s{2}-\s+id:\s*<escapedId>\s*$/` — this is the pipeline's opening `- id:` line.
3. Record `start` = character offset of the first character of that matched line.
4. From the next line, walk forward until one of:
   - Another line matching `/^\s{2}-\s+id:\s*/` is found (start of next pipeline block).
   - A line matching `/^\S/` is found (a top-level YAML key, outside `pipelines:`).
   - End of file is reached.
5. `end` = character offset of the first character of the terminating line (or EOF offset).
6. Return `{ start, end }`. The block text is `yaml.slice(start, end)`.

`escapeRegex()` (already in the file) is applied to `pipelineId` when constructing the match pattern.

### 3.3 Append Logic (`addPipeline`)

1. Scan for the `pipelines:` top-level key line in the raw string.
2. Walk the pipeline block locator forward from that position to find the end offset of the last pipeline block in the file.
3. Insert the serialised block text at that `end` offset.
   - If `pipelines:` exists but has no `-  id:` entries: insert immediately after the `pipelines:\n` line (offset = end of that line).
   - If `pipelines:` key is absent from the file: append `\npipelines:\n<block>` at EOF.

### 3.4 Replace Logic (`editPipeline`)

1. Call `findPipelineBlock(yaml, originalId)`.
2. If null: return `false`.
3. Build new block via `serializePipelineBlock(pipeline)`.
4. `newYaml = yaml.slice(0, start) + newBlock + yaml.slice(end)`.
5. Write and return `true`.

### 3.5 Delete Logic (`deletePipeline`)

1. Call `findPipelineBlock(yaml, pipelineId)`.
2. If null: return `false`.
3. `newYaml = yaml.slice(0, start) + yaml.slice(end)`.
4. Write and return `true`.

### 3.6 Edge Cases Catalogue

| Case | Handling |
|------|----------|
| File does not exist | Throw `Error('WORKSPACE_YAML_NOT_FOUND')` before any read |
| `pipelines:` key absent from file | `addPipeline` appends the key + block at EOF; `edit`/`delete` return false immediately |
| Only one pipeline exists and it is deleted | Block removed; `pipelines:` key line remains (empty section is valid YAML) |
| Pipeline id that is a prefix of another id (e.g. `foo` and `foo-bar`) | Regex `\s*$` anchor on the `- id:` match line prevents `foo` from matching `foo-bar` |
| Steps array with `human:` prefix | Stored and retrieved verbatim; `serializePipelineBlock` writes them as-is; `parseWorkspaceYaml` reads them as-is |
| Windows line endings `\r\n` | Offset arithmetic uses per-character counting, not per-line-number arithmetic; safe for either ending style |
| Concurrent writes | Single Node.js process, single-developer workspace (PRD assumption); no locking needed |
| Pipeline id containing regex-special chars | PRD validation restricts id to `/^[a-z0-9][a-z0-9-]*$/`; `escapeRegex()` applied anyway as a safety net |

---

## 4. BuilderPanel Message Handler Pseudocode

Add the following three cases to the `onDidReceiveMessage` switch, immediately after the existing `toggleOnFailure` case. Also widen the message type annotation to add `id?: string`, `steps?: string[]`, `onFailure?: string`, `originalId?: string` alongside the existing optional fields.

```typescript
case 'createPipeline': {
  const { id, steps, onFailure } = msg as {
    id: string;
    steps: string[];
    onFailure: 'stop' | 'continue';
  };
  if (!id || !steps?.length) { break; }  // safety guard; client validates first
  try {
    addPipeline(this._workspaceRoot, { id, steps, onFailure: onFailure ?? 'stop' });
    this._sendAllData();
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'WORKSPACE_YAML_NOT_FOUND') {
      vscode.window.showErrorMessage(
        'workspace.yaml not found. Run AIDLC: Import Template first.',
      );
    } else {
      vscode.window.showErrorMessage(`Could not write workspace.yaml: ${m}`);
    }
  }
  break;
}

case 'editPipeline': {
  const { id, steps, onFailure, originalId } = msg as {
    id: string;
    steps: string[];
    onFailure: 'stop' | 'continue';
    originalId?: string;
  };
  if (!id || !steps?.length) { break; }
  const targetId = originalId ?? id;
  try {
    const found = editPipeline(this._workspaceRoot, targetId, {
      id, steps, onFailure: onFailure ?? 'stop',
    });
    if (!found) {
      vscode.window.showWarningMessage(
        `Pipeline "${targetId}" not found in workspace.yaml.`,
      );
    }
    this._sendAllData();   // resync even when not found — stale UI guard
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'WORKSPACE_YAML_NOT_FOUND') {
      vscode.window.showErrorMessage(
        'workspace.yaml not found. Run AIDLC: Import Template first.',
      );
    } else {
      vscode.window.showErrorMessage(`Could not write workspace.yaml: ${m}`);
    }
  }
  break;
}

case 'deletePipeline': {
  const { id } = msg as { id: string };
  if (!id) { break; }
  try {
    deletePipeline(this._workspaceRoot, id);
    this._sendAllData();
  } catch (err) {
    const m = (err as Error).message;
    if (m === 'WORKSPACE_YAML_NOT_FOUND') {
      vscode.window.showErrorMessage(
        'workspace.yaml not found. Run AIDLC: Import Template first.',
      );
    } else {
      vscode.window.showErrorMessage(`Could not write workspace.yaml: ${m}`);
    }
  }
  break;
}
```

**Import change in BuilderPanel.ts:**
```typescript
// Before:
import { readWorkspaceYaml, patchPipelineOnFailure } from '../utils/workspaceYamlReader';

// After:
import {
  readWorkspaceYaml,
  patchPipelineOnFailure,
  addPipeline,
  editPipeline,
  deletePipeline,
} from '../utils/workspaceYamlReader';
```

---

## 5. WorkspaceApp.tsx Modal and Pipeline Management Design

### 5.1 PipelineModal Component

```typescript
interface PipelineModalProps {
  mode: 'create' | 'edit';
  initial?: {
    id: string;
    steps: string[];        // raw strings, human: prefix included
    onFailure: 'stop' | 'continue';
  };
  existingIds: string[];    // ids to check for uniqueness collision
                            // for edit: pass all ids EXCEPT the one being edited
  onSubmit: (data: {
    id: string;
    steps: string[];
    onFailure: 'stop' | 'continue';
    originalId?: string;    // set only in edit mode
  }) => void;
  onCancel: () => void;
}
```

**Internal state:**
```typescript
const [idVal, setIdVal]         = useState(initial?.id ?? '');
const [stepsVal, setStepsVal]   = useState(initial?.steps.join('\n') ?? '');
const [onFailureVal, setOnFailureVal] = useState<'stop' | 'continue'>(
  initial?.onFailure ?? 'stop',
);
const [errors, setErrors]       = useState<{ id?: string; steps?: string }>({});
const firstInputRef             = useRef<HTMLInputElement>(null);

useEffect(() => {
  firstInputRef.current?.focus();
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { onCancel(); } };
  document.addEventListener('keydown', onKey);
  return () => document.removeEventListener('keydown', onKey);
}, []);
```

### 5.2 Validation Logic

```typescript
function validate(): boolean {
  const errs: { id?: string; steps?: string } = {};

  const trimmedId = idVal.trim();
  if (!trimmedId) {
    errs.id = 'Pipeline ID is required';
  } else if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmedId)) {
    errs.id = 'ID must be lowercase alphanumeric with hyphens only';
  } else if (existingIds.includes(trimmedId)) {
    errs.id = 'A pipeline with this ID already exists';
  }

  const parsedSteps = stepsVal
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (parsedSteps.length === 0) {
    errs.steps = 'At least one step is required';
  }

  setErrors(errs);
  return Object.keys(errs).length === 0;
}

function handleSubmit() {
  if (!validate()) { return; }
  const parsedSteps = stepsVal
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
  onSubmit({
    id: idVal.trim(),
    steps: parsedSteps,
    onFailure: onFailureVal,
    originalId: mode === 'edit' ? initial?.id : undefined,
  });
}
```

### 5.3 Modal Markup Contract

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="pipeline-modal-title"
  // Overlay: fixed, full-screen, dark semi-transparent background
>
  <form onSubmit={e => { e.preventDefault(); handleSubmit(); }}>
    <h2 id="pipeline-modal-title">
      {mode === 'create' ? 'Add Pipeline' : 'Edit Pipeline'}
    </h2>

    <label htmlFor="pipeline-id">Pipeline ID</label>
    <input
      id="pipeline-id"
      ref={firstInputRef}
      value={idVal}
      onChange={e => setIdVal(e.target.value)}
      placeholder="e.g. my-flow"
      autoComplete="off"
    />
    {errors.id && <span role="alert">{errors.id}</span>}

    <label htmlFor="pipeline-steps">
      Steps (one per line, or comma-separated)
    </label>
    <textarea
      id="pipeline-steps"
      rows={6}
      value={stepsVal}
      onChange={e => setStepsVal(e.target.value)}
      placeholder="plan&#10;design&#10;human:test-plan&#10;implement"
    />
    {errors.steps && <span role="alert">{errors.steps}</span>}

    <label>On Failure</label>
    <button
      type="button"
      aria-label={`on_failure: currently ${onFailureVal}. Click to toggle.`}
      onClick={() => setOnFailureVal(v => v === 'stop' ? 'continue' : 'stop')}
    >
      {onFailureVal.toUpperCase()}
    </button>

    <button type="button" onClick={onCancel}>Cancel</button>
    <button type="submit">
      {mode === 'create' ? 'Create Pipeline' : 'Save Changes'}
    </button>
  </form>
</div>
```

### 5.4 StepBadge Component (Pipeline Card Step Chips)

```typescript
function StepBadge({ step }: { step: string }) {
  const isHuman = step.startsWith('human:');
  const label   = isHuman ? step.slice('human:'.length) : step;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-[10px]">{label}</span>
      {isHuman && (
        <span
          aria-label="Requires human approval"
          className="text-[9px] font-bold px-1 py-0.5 rounded uppercase"
          style={{
            background: 'rgba(168,85,247,0.15)',
            color: '#a855f7',
            border: '1px solid rgba(168,85,247,0.3)',
          }}
        >
          HUMAN
        </span>
      )}
    </span>
  );
}
```

### 5.5 PipelineCard Component (Pipeline Management Row)

```typescript
interface PipelineCardProps {
  pipeline: WorkspacePipeline;
  onEdit: (pipeline: WorkspacePipeline) => void;
  onDelete: (id: string) => void;
  onToggleOnFailure: (id: string, current: 'stop' | 'continue') => void;
}

function PipelineCard({ pipeline, onEdit, onDelete, onToggleOnFailure }: PipelineCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  // ...render pipeline.id, step chips, ON_FAILURE badge, edit + delete buttons
}
```

Delete confirmation pattern (inline, no VS Code modal):
```tsx
{!confirmDelete ? (
  <button
    aria-label={`Delete pipeline ${pipeline.id}`}
    onClick={() => setConfirmDelete(true)}
  >
    ×
  </button>
) : (
  <span>
    <span>Delete "{pipeline.id}"?</span>
    <button
      onClick={() => {
        onDelete(pipeline.id);
        setConfirmDelete(false);
      }}
    >
      Yes
    </button>
    <button onClick={() => setConfirmDelete(false)}>Cancel</button>
  </span>
)}
```

### 5.6 Empty State

Inside the pipelines management section of `BuilderView`:

```tsx
{pipelines.length === 0 ? (
  <div className="text-center py-10">
    <p className="text-[#4a6a84] text-[11px] mb-3">
      No pipelines yet. Add one to define your AI workflow.
    </p>
    <button
      onClick={() => { setEditingPipeline(null); setModalMode('create'); }}
      className="px-3 py-1.5 rounded text-[11px] font-bold cursor-pointer"
      style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}
    >
      + Add Pipeline
    </button>
  </div>
) : (
  /* Pipeline card list */
)}
```

### 5.7 BuilderView State Additions

```typescript
// Added to BuilderView component state:
type ModalMode = 'create' | 'edit' | null;
const [modalMode, setModalMode]               = useState<ModalMode>(null);
const [editingPipeline, setEditingPipeline]   = useState<WorkspacePipeline | null>(null);
```

**Handler functions inside BuilderView:**

```typescript
function openCreateModal() {
  setEditingPipeline(null);
  setModalMode('create');
}

function openEditModal(pipeline: WorkspacePipeline) {
  setEditingPipeline(pipeline);
  setModalMode('edit');
}

function handleModalSubmit(data: {
  id: string;
  steps: string[];
  onFailure: 'stop' | 'continue';
  originalId?: string;
}) {
  if (modalMode === 'create') {
    postMessage({ command: 'createPipeline', id: data.id, steps: data.steps, onFailure: data.onFailure });
  } else {
    postMessage({
      command: 'editPipeline',
      id: data.id,
      steps: data.steps,
      onFailure: data.onFailure,
      originalId: data.originalId,
    });
  }
  setModalMode(null);
  setEditingPipeline(null);
}

function handleDeletePipeline(id: string) {
  postMessage({ command: 'deletePipeline', id });
}

function handleToggleOnFailure(id: string, current: 'stop' | 'continue') {
  postMessage({
    command: 'toggleOnFailure',
    pipelineId: id,
    onFailure: current === 'stop' ? 'continue' : 'stop',
  });
}
```

**existingIds computation for edit mode:**
```typescript
const existingIdsForModal = modalMode === 'edit' && editingPipeline
  ? pipelines.map(p => p.id).filter(id => id !== editingPipeline.id)
  : pipelines.map(p => p.id);
```

---

## 6. File / Module Impact List

| File | Change type | Reason |
|------|-------------|--------|
| `src/utils/workspaceYamlReader.ts` | Modified | Add exported functions `addPipeline`, `editPipeline`, `deletePipeline` and private helpers `serializePipelineBlock`, `findPipelineBlock` |
| `src/panels/BuilderPanel.ts` | Modified | Add `createPipeline`, `editPipeline`, `deletePipeline` cases to `onDidReceiveMessage`; update import to include the three new functions; widen message type annotation |
| `src/webview/workspace/WorkspaceApp.tsx` | Modified | Add `PipelineModal`, `PipelineCard`, `StepBadge` components; extend `BuilderView` with modal state, pipeline management section, and empty state |
| No files deleted | — | — |
| No new files created | — | All additions are within existing files |
| No new npm dependencies | — | Text manipulation only; no YAML library |

---

## 7. Sequence Diagram — Create Flow

```
User (webview)          WorkspaceApp.tsx          BuilderPanel.ts        workspaceYamlReader.ts   workspace.yaml
      |                        |                        |                        |                       |
      | click "+ Add Pipeline" |                        |                        |                       |
      |----------------------->|                        |                        |                       |
      |                        | setModalMode('create') |                        |                       |
      |                        | modal renders          |                        |                       |
      |<-----------------------|                        |                        |                       |
      |                        |                        |                        |                       |
      | fills form + submits   |                        |                        |                       |
      |----------------------->|                        |                        |                       |
      |                        | validate() fails       |                        |                       |
      |                        | show inline error      |                        |                       |
      |<-----------------------|                        |                        |                       |
      |                        |                        |                        |                       |
      | corrects + resubmits   |                        |                        |                       |
      |----------------------->|                        |                        |                       |
      |                        | validate() passes      |                        |                       |
      |                        | setModalMode(null)     |                        |                       |
      |                        | postMessage({          |                        |                       |
      |                        |  command:'createPipeline', id, steps, onFailure})|                      |
      |                        |----------------------->|                        |                       |
      |                        |                        | case 'createPipeline'  |                       |
      |                        |                        | addPipeline(root, ...) |                       |
      |                        |                        |----------------------->|                       |
      |                        |                        |                        | readFileSync          |
      |                        |                        |                        |<--------------------->|
      |                        |                        |                        | serializePipelineBlock|
      |                        |                        |                        | writeFileSync         |
      |                        |                        |                        |---------------------->|
      |                        |                        |<-----------------------|                       |
      |                        |                        | _sendAllData()         |                       |
      |                        |                        | readWorkspaceYaml()    |                       |
      |                        |                        |----------------------->|                       |
      |                        |                        |<-- WorkspaceConfig     |                       |
      |                        |                        | postMessage({command:'init', yaml, ...})       |
      |                        |<-----------------------|                        |                       |
      |                        | reducer('init')        |                        |                       |
      |                        | state.yaml = new config|                        |                       |
      |                        | pipeline card renders  |                        |                       |
      |<-----------------------|                        |                        |                       |
      | new card visible       |                        |                        |                       |
      | no panel reload        |                        |                        |                       |
```

---

## 8. Non-Functional Design

### No page reload
`_sendAllData()` is the existing mechanism used by `saveNewStory`, `toggleOnFailure`, and `refresh`. All three new handlers follow the same pattern. The file watcher in `src/watchers/fileWatchers.ts` also triggers `BuilderPanel.refreshAll()` on `workspace.yaml` changes, providing a second refresh path if another tool edits the file concurrently.

### Keyboard accessibility
- Modal has an `Escape` key listener registered via `useEffect` (with cleanup on unmount).
- First focusable element (`<input id="pipeline-id">`) receives auto-focus on mount via `useRef`.
- Form submission via Enter uses `<form onSubmit>`, which is native browser behaviour.
- Tab order: Pipeline ID input → Steps textarea → On Failure toggle → Cancel → Create/Save.

### Screen-reader labels
- Modal container: `role="dialog" aria-modal="true" aria-labelledby="pipeline-modal-title"`.
- All `<input>` and `<textarea>` elements have `<label htmlFor>` associations.
- Icon-only edit button: `aria-label="Edit pipeline <id>"`.
- Icon-only delete button: `aria-label="Delete pipeline <id>"`.
- ON_FAILURE badge button: `aria-label="Toggle on_failure for pipeline <id>: currently <value>"`.
- HUMAN badge span: `aria-label="Requires human approval"`.
- Validation errors rendered in `<span role="alert">` so screen readers announce them immediately.

### No new npm dependencies
All text manipulation uses standard JS string methods and `RegExp`. No YAML library. No UUID library (id is user-supplied). No React portal library (modal is an inline div overlay within the component tree).

### TypeScript strict
All new function signatures carry explicit parameter types and return types. No use of `any`. The anonymous `msg` type in `onDidReceiveMessage` is widened with `id?: string`, `steps?: string[]`, `onFailure?: string`, `originalId?: string` using the existing optional-field pattern.

### Performance
File read + regex + write for a ~100-line workspace.yaml: well under 10 ms. `_sendAllData()` reads and serialises all workspace state: well under 50 ms. Total well within the 500 ms budget from the PRD.

---

## 9. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Block locator fails for a hand-edited workspace.yaml with non-standard indentation | Medium | Locator returns null; no file corruption | `editPipeline` / `deletePipeline` return `false` without writing; BuilderPanel shows a warning message and resyncs UI |
| User's pipeline id contains regex special chars | Low | PRD regex validation blocks this at the form | `escapeRegex()` is applied unconditionally in `findPipelineBlock` regardless |
| File watcher fires after write but before `_sendAllData` completes | Very low | Webview receives two consecutive `init` messages | Reducer replaces state idempotently; double-refresh is harmless |
| `human:test-plan` stored verbatim — parser must read it back correctly | Low | Steps list corrupted in memory | Confirmed: `parseWorkspaceYaml` pushes `trimmed.replace(/^-\s+/, '').trim()` which preserves the `human:` prefix |
| Edit modal existingIds filtering: if caller forgets to exclude originalId, renaming to same id fails | Low | Inline validation error blocks save | Design specifies the exclusion explicitly; see Section 5.7 `existingIdsForModal` computation |
| `workspace.yaml` missing the `pipelines:` key entirely | Medium | `addPipeline` must not corrupt the file | Handled: append `\npipelines:\n<block>` at EOF — documented in Section 3.3 |
| Existing `PipelineDashboard` step cards (STORY-001) regress | Low | Step cards broken after CRUD changes | All STORY-001 code (`PipelineStepCard`, `PipelineProgressBar`, `PipelineDashboard`) is left untouched; only `BuilderView` gains new state variables and a new UI section |
