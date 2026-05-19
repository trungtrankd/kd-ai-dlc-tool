import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const MODEL_OPTIONS: vscode.QuickPickItem[] = [
  { label: 'claude-sonnet-4-6',        description: 'Recommended — fast & capable' },
  { label: 'claude-opus-4-6',           description: 'Powerful — for complex reasoning' },
  { label: 'claude-haiku-4-5-20251001', description: 'Lightweight — for simple tasks' },
];

const TOOL_OPTIONS: vscode.QuickPickItem[] = [
  { label: 'Read',      picked: true },
  { label: 'Write',     picked: true },
  { label: 'Edit',      picked: true },
  { label: 'Bash',      picked: true },
  { label: 'Glob',      picked: true },
  { label: 'Grep',      picked: true },
  { label: 'Agent',     picked: false },
  { label: 'WebFetch',  picked: false },
  { label: 'WebSearch', picked: false },
];

export async function addAgent(workspaceRoot: string): Promise<void> {
  const name = await vscode.window.showInputBox({
    title: 'AIDLC: Add Agent (1/4)',
    prompt: 'Agent name — used as the file name and frontmatter id',
    placeHolder: 'e.g. my-reviewer',
    ignoreFocusOut: true,
    validateInput: v => (v?.trim() ? undefined : 'Name is required'),
  });
  if (!name?.trim()) { return; }

  const description = await vscode.window.showInputBox({
    title: 'AIDLC: Add Agent (2/4)',
    prompt: 'One-line description of what this agent does',
    placeHolder: 'e.g. Reviews code for security issues and logic errors',
    ignoreFocusOut: true,
    validateInput: v => (v?.trim() ? undefined : 'Description is required'),
  });
  if (!description?.trim()) { return; }

  const modelPick = await vscode.window.showQuickPick(MODEL_OPTIONS, {
    title: 'AIDLC: Add Agent (3/4) — Select model',
    ignoreFocusOut: true,
  });
  if (!modelPick) { return; }

  const toolPicks = await vscode.window.showQuickPick(TOOL_OPTIONS, {
    title: 'AIDLC: Add Agent (4/4) — Select tools (Space to toggle, Enter to confirm)',
    canPickMany: true,
    ignoreFocusOut: true,
  });
  if (!toolPicks) { return; }

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const tools = toolPicks.length ? toolPicks.map((t) => t.label).join(', ') : 'Read, Glob, Grep';

  const content = `---
name: ${slug}
description: ${description.trim()}
tools: ${tools}
model: ${modelPick.label}
permissionMode: bypassPermissions
---

## Core Responsibilities
- [Describe what this agent does]

## Behavior
- Read relevant context before acting
- Keep changes scoped to the assigned task
- Update .task-board.json when the step is complete
- Append to .agent-log.jsonl after each significant action
`;

  const agentsDir = path.join(workspaceRoot, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  const filePath = path.join(agentsDir, `${slug}.md`);
  if (fs.existsSync(filePath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Agent "${slug}.md" already exists. Overwrite?`, { modal: true }, 'Overwrite',
    );
    if (overwrite !== 'Overwrite') { return; }
  }

  fs.writeFileSync(filePath, content, 'utf-8');
  await vscode.window.showTextDocument(vscode.Uri.file(filePath));
  vscode.window.showInformationMessage(`Agent "${slug}" created — edit the file to customise its instructions.`);
}
