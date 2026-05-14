import * as vscode from 'vscode';
import { readTaskBoard } from '../data/taskBoardReader';
import { Task, TaskBoard } from '../types';

// Status sort order: in_progress first, then pending/blocked, then done/failed
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  pending: 1,
  blocked: 2,
  failed: 3,
  done: 4,
};

function statusIcon(status: Task['status']): vscode.ThemeIcon {
  switch (status) {
    case 'pending':
      return new vscode.ThemeIcon('clock', new vscode.ThemeColor('charts.yellow'));
    case 'in_progress':
      return new vscode.ThemeIcon('sync~spin', new vscode.ThemeColor('charts.blue'));
    case 'done':
      return new vscode.ThemeIcon('check', new vscode.ThemeColor('charts.green'));
    case 'blocked':
      return new vscode.ThemeIcon('lock', new vscode.ThemeColor('charts.red'));
    case 'failed':
      return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
    default:
      return new vscode.ThemeIcon('circle-outline');
  }
}

// ---------------------------------------------------------------------------
// Tree items
// ---------------------------------------------------------------------------

class FeatureHeaderItem extends vscode.TreeItem {
  constructor(board: TaskBoard) {
    super(board.feature || 'Feature', vscode.TreeItemCollapsibleState.Expanded);
    const total = board.tasks.length;
    const done = board.tasks.filter((t) => t.status === 'done').length;
    this.description = `${done}/${total} done`;
    this.iconPath = new vscode.ThemeIcon('circuit-board');
    this.contextValue = 'featureHeader';
    this.tooltip = `Feature: ${board.feature}\nCreated: ${board.created_at}`;
  }
}

export class TaskTreeItem extends vscode.TreeItem {
  constructor(public readonly task: Task) {
    // Show first ~60 chars of the task description as label
    const preview = task.task.length > 60 ? task.task.slice(0, 57) + '...' : task.task;
    super(`${task.id}  ${preview}`, vscode.TreeItemCollapsibleState.None);

    this.description = task.agent.replace('developer-', '').replace('developer', 'dev');
    this.iconPath = statusIcon(task.status);
    this.contextValue = 'taskItem';

    let tooltipText = `[${task.id}] ${task.agent}\nStatus: ${task.status}\n\nTask:\n${task.task}`;
    if (task.output) {
      tooltipText += `\n\nOutput:\n${task.output}`;
    }
    if (task.depends_on && task.depends_on.length > 0) {
      tooltipText += `\n\nDepends on: ${task.depends_on.join(', ')}`;
    }
    this.tooltip = new vscode.MarkdownString(
      tooltipText.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    );
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type TreeNode = FeatureHeaderItem | TaskTreeItem;

export class TaskBoardProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TreeNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly workspaceRoot: string) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (!element) {
      // Root level — return the feature header (or empty state)
      const board = readTaskBoard(this.workspaceRoot);
      if (!board) {
        const empty = new vscode.TreeItem('No task board found');
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty as TreeNode];
      }
      return [new FeatureHeaderItem(board)];
    }

    if (element instanceof FeatureHeaderItem) {
      const board = readTaskBoard(this.workspaceRoot);
      if (!board) {
        return [];
      }
      const sorted = [...board.tasks].sort((a, b) => {
        const orderA = STATUS_ORDER[a.status] ?? 5;
        const orderB = STATUS_ORDER[b.status] ?? 5;
        return orderA !== orderB ? orderA - orderB : a.id.localeCompare(b.id);
      });
      return sorted.map((t) => new TaskTreeItem(t));
    }

    return [];
  }
}
