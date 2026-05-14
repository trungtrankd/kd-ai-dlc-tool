import * as vscode from 'vscode';
import * as path from 'path';

export interface WatcherCallbacks {
  onBoardChange: () => void;
  onLogChange: () => void;
  onMailChange: () => void;
  onAgentsChange?: () => void;
}

/**
 * Creates three FileSystemWatcher instances for the primary workspace files.
 * Returns an array of Disposables to be added to context.subscriptions.
 */
export function createFileWatchers(
  workspaceRoot: string,
  callbacks: WatcherCallbacks,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  // Watcher for .task-board.json
  const boardPattern = new vscode.RelativePattern(workspaceRoot, '.task-board.json');
  const boardWatcher = vscode.workspace.createFileSystemWatcher(boardPattern);
  boardWatcher.onDidChange(callbacks.onBoardChange);
  boardWatcher.onDidCreate(callbacks.onBoardChange);
  boardWatcher.onDidDelete(callbacks.onBoardChange);
  disposables.push(boardWatcher);

  // Watcher for .agent-log.jsonl
  const logPattern = new vscode.RelativePattern(workspaceRoot, '.agent-log.jsonl');
  const logWatcher = vscode.workspace.createFileSystemWatcher(logPattern);
  logWatcher.onDidChange(callbacks.onLogChange);
  logWatcher.onDidCreate(callbacks.onLogChange);
  disposables.push(logWatcher);

  // Watcher for mailbox/**/*.json
  const mailPattern = new vscode.RelativePattern(
    path.join(workspaceRoot, 'mailbox'),
    '**/*.json',
  );
  const mailWatcher = vscode.workspace.createFileSystemWatcher(mailPattern);
  mailWatcher.onDidChange(callbacks.onMailChange);
  mailWatcher.onDidCreate(callbacks.onMailChange);
  mailWatcher.onDidDelete(callbacks.onMailChange);
  disposables.push(mailWatcher);

  // Watcher for .claude/agents/*.md
  if (callbacks.onAgentsChange) {
    const agentsPattern = new vscode.RelativePattern(
      path.join(workspaceRoot, '.claude', 'agents'),
      '*.md',
    );
    const agentsWatcher = vscode.workspace.createFileSystemWatcher(agentsPattern);
    agentsWatcher.onDidChange(callbacks.onAgentsChange);
    agentsWatcher.onDidCreate(callbacks.onAgentsChange);
    agentsWatcher.onDidDelete(callbacks.onAgentsChange);
    disposables.push(agentsWatcher);
  }

  return disposables;
}
