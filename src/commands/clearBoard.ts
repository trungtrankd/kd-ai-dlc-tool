import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { TaskBoardProvider } from '../providers/TaskBoardProvider';
import { MailboxProvider } from '../providers/MailboxProvider';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';

/**
 * Deletes .task-board.json, .agent-log.jsonl, and all mailbox inbox JSON files,
 * then refreshes the providers and status bar.
 */
export async function clearBoard(
  workspaceRoot: string,
  taskBoardProvider: TaskBoardProvider,
  mailboxProvider: MailboxProvider,
  statusBar: PipelineStatusBar,
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    'Clear the task board, activity log, and all mailbox messages?',
    { modal: true },
    'Clear',
  );

  if (confirm !== 'Clear') {
    return;
  }

  const filesToDelete = [
    path.join(workspaceRoot, '.task-board.json'),
    path.join(workspaceRoot, '.agent-log.jsonl'),
  ];

  // Collect all mailbox inbox JSON files
  const mailboxDir = path.join(workspaceRoot, 'mailbox');
  if (fs.existsSync(mailboxDir)) {
    try {
      const agents = fs.readdirSync(mailboxDir);
      for (const agent of agents) {
        const inboxDir = path.join(mailboxDir, agent, 'inbox');
        if (fs.existsSync(inboxDir)) {
          try {
            const files = fs.readdirSync(inboxDir).filter((f) => f.endsWith('.json'));
            for (const file of files) {
              filesToDelete.push(path.join(inboxDir, file));
            }
          } catch {
            // skip unreadable inbox dirs
          }
        }
      }
    } catch {
      // skip if mailbox root is unreadable
    }
  }

  let deleted = 0;
  for (const filePath of filesToDelete) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      }
    } catch {
      // skip files we can't delete
    }
  }

  taskBoardProvider.refresh();
  mailboxProvider.refresh();
  statusBar.update();

  vscode.window.showInformationMessage(
    `Board cleared. Removed ${deleted} file${deleted !== 1 ? 's' : ''}.`,
  );
}
