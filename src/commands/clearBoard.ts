import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';

/**
 * Deletes .task-board.json, .agent-log.jsonl, and all mailbox inbox JSON files,
 * then refreshes the status bar and all open panels.
 */
export async function clearBoard(
  workspaceRoot: string,
  statusBar: PipelineStatusBar,
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'Clear the task board, activity log, and all mailbox messages?',
    { modal: true },
    'Clear',
  );

  if (confirm !== 'Clear') { return; }

  const filesToDelete = [
    path.join(workspaceRoot, '.task-board.json'),
    path.join(workspaceRoot, '.agent-log.jsonl'),
  ];

  const mailboxDir = path.join(workspaceRoot, 'mailbox');
  if (fs.existsSync(mailboxDir)) {
    try {
      for (const agent of fs.readdirSync(mailboxDir)) {
        const inboxDir = path.join(mailboxDir, agent, 'inbox');
        if (fs.existsSync(inboxDir)) {
          try {
            for (const file of fs.readdirSync(inboxDir).filter((f) => f.endsWith('.json'))) {
              filesToDelete.push(path.join(inboxDir, file));
            }
          } catch { /* skip */ }
        }
      }
    } catch { /* skip */ }
  }

  let deleted = 0;
  for (const filePath of filesToDelete) {
    try {
      if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); deleted++; }
    } catch { /* skip */ }
  }

  statusBar.update();

  vscode.window.showInformationMessage(
    `Board cleared. Removed ${deleted} file${deleted !== 1 ? 's' : ''}.`,
  );
}
