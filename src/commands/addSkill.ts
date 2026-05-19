import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const SKILL_TEMPLATES: Record<string, string> = {
  'hello-world': `---
name: hello-world
description: A minimal starter skill — replace this with real instructions.
---

You are a helpful assistant. Greet the user, summarise the current task from
\`.task-board.json\`, and suggest the next action.

## Operating rules
- Read \`.task-board.json\` before responding.
- Keep your response concise (under 200 words).
- Append one log entry to \`.agent-log.jsonl\` when done.
`,

  'code-reviewer': `---
name: code-reviewer
description: Reviews code for quality, security, and correctness.
---

You are a senior code reviewer. Your job is to read a diff or a set of files
and produce a structured review.

## Process
1. Run \`git diff origin/main...HEAD\` to get the diff.
2. Check every changed function for: correctness, security (OWASP Top 10),
   error handling, and test coverage.
3. For each finding include a \`file:line\` reference and a severity:
   🔴 BLOCKER | 🟠 MAJOR | 🟡 MINOR | 🔵 NIT

## Output
\`\`\`
## Code Review

### Summary
[one-paragraph verdict]

### Findings
| Severity | File:Line | Description |
|----------|-----------|-------------|

### Verdict: APPROVE / APPROVE WITH COMMENTS / CHANGES REQUESTED
\`\`\`

## Rules
- Never modify files — read only.
- Every BLOCKER must block the merge.
- Reference every finding with file:line.
`,

  'doc-writer': `---
name: doc-writer
description: Generates or updates documentation — JSDoc, README, inline comments.
---

You are a technical writer. You produce clear, accurate documentation that
matches what the code actually does.

## Process
1. Read the files listed in the task or story.
2. Identify: public APIs, exported functions, complex logic that needs comments.
3. Write or update:
   - JSDoc / TSDoc / docstrings for public functions
   - README sections if the interface changed
   - Inline comments for non-obvious logic (max 1 line per block)

## Rules
- Match the existing documentation style.
- Do not add comments to obvious code.
- Never change business logic — documentation only.
- Append to \`.agent-log.jsonl\` and update \`.task-board.json\` when done.
`,

  'test-writer': `---
name: test-writer
description: Writes unit and integration tests for new or changed code.
---

You are a QA-focused developer. You write tests that cover the happy path,
edge cases, and error states for the code under test.

## Process
1. Read the implementation files from the story or task.
2. Identify all public functions / endpoints / components.
3. For each, write tests covering:
   - Happy path (valid inputs → expected output)
   - Edge cases (empty, null, boundary values)
   - Error states (invalid input, missing deps, network failure)
4. Follow the existing test framework and file naming conventions.

## Rules
- Do not change production code.
- Run the test suite via Bash to confirm tests pass before finishing.
- Append to \`.agent-log.jsonl\` and update \`.task-board.json\` when done.
`,

  'release-notes': `---
name: release-notes
description: Generates a formatted changelog from git history since the last tag.
---

You are a release manager. You read the git log and produce clear, user-facing
release notes.

## Process
1. Run \`git describe --tags --abbrev=0\` to find the last tag.
2. Run \`git log <last-tag>..HEAD --oneline\` to list commits.
3. Group commits by type: Features, Fixes, Improvements, Chores.
4. Write a \`RELEASE-NOTES.md\` with:
   - Version header (suggest next semver based on change types)
   - Date
   - Grouped changes with clear user-facing language
   - Breaking changes section if any

## Rules
- Translate commit messages into user-friendly language.
- Omit chore/ci/docs commits from user-facing notes.
- Write the file to \`mailbox/pipeline/release/RELEASE-NOTES.md\`.
- Append to \`.agent-log.jsonl\` and update \`.task-board.json\` when done.
`,
};

const SOURCE_OPTIONS: vscode.QuickPickItem[] = [
  { label: 'From template', description: 'Choose a built-in starter template' },
  { label: 'Blank',         description: 'Empty file — write your own instructions' },
];

const TEMPLATE_OPTIONS: vscode.QuickPickItem[] = Object.keys(SKILL_TEMPLATES).map((k) => ({
  label: k,
  description: SKILL_TEMPLATES[k].split('\n').find((l) => l.startsWith('description:'))?.replace('description:', '').trim() ?? '',
}));

export async function addSkill(workspaceRoot: string): Promise<void> {
  const skillId = await vscode.window.showInputBox({
    title: 'AIDLC: Add Skill (1/3)',
    prompt: 'Skill id — used as the file name (e.g. code-reviewer → .aidlc/skills/code-reviewer.md)',
    placeHolder: 'e.g. code-reviewer',
    ignoreFocusOut: true,
    validateInput: v => (v?.trim() ? undefined : 'Skill id is required'),
  });
  if (!skillId?.trim()) { return; }

  const slug = skillId.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

  const sourcePick = await vscode.window.showQuickPick(SOURCE_OPTIONS, {
    title: 'AIDLC: Add Skill (2/3) — Select source',
    ignoreFocusOut: true,
  });
  if (!sourcePick) { return; }

  let content: string;

  if (sourcePick.label === 'From template') {
    const templatePick = await vscode.window.showQuickPick(TEMPLATE_OPTIONS, {
      title: 'AIDLC: Add Skill (3/3) — Select template',
      ignoreFocusOut: true,
    });
    if (!templatePick) { return; }
    content = SKILL_TEMPLATES[templatePick.label]
      .replace(/^name: \S+/m, `name: ${slug}`);
  } else {
    content = `---
name: ${slug}
description: [Describe what this skill does]
---

## Purpose
[What is this agent's goal?]

## Process
1. [Step 1]
2. [Step 2]

## Output
[Describe the artifact this skill produces]

## Rules
- Append to \`.agent-log.jsonl\` after each significant action.
- Update \`.task-board.json\` when the step is complete.
`;
  }

  const skillsDir = path.join(workspaceRoot, '.aidlc', 'skills');
  if (!fs.existsSync(skillsDir)) {
    vscode.window.showErrorMessage('No .aidlc/skills/ directory found. Load the AIDLC template first (AIDLC: Import Template).');
    return;
  }

  const filePath = path.join(skillsDir, `${slug}.md`);
  if (fs.existsSync(filePath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Skill "${slug}.md" already exists. Overwrite?`, { modal: true }, 'Overwrite',
    );
    if (overwrite !== 'Overwrite') { return; }
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  await vscode.window.showTextDocument(vscode.Uri.file(filePath));
  vscode.window.showInformationMessage(
    `Skill "${slug}" created. Register it in .aidlc/workspace.yaml to use it in a pipeline.`,
    'Open workspace.yaml',
  ).then(async (choice) => {
    if (choice === 'Open workspace.yaml') {
      const yaml = path.join(workspaceRoot, '.aidlc', 'workspace.yaml');
      try { await vscode.window.showTextDocument(vscode.Uri.file(yaml)); }
      catch { /* file may not exist */ }
    }
  });
}
