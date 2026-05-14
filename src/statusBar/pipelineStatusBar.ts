import * as vscode from 'vscode';
import { readTaskBoard } from '../data/taskBoardReader';

type PipelineState = 'idle' | 'running' | 'done' | 'error';

export class PipelineStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private _state: PipelineState = 'idle';

  constructor(private readonly workspaceRoot: string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'agentDashboard.openActivityFeed';
    this.update();
    this.item.show();
  }

  setState(state: PipelineState): void {
    this._state = state;
    this._render(state);
  }

  /**
   * Infers the pipeline state from the current task board and re-renders.
   */
  update(): void {
    const board = readTaskBoard(this.workspaceRoot);
    if (!board || board.tasks.length === 0) {
      this._render('idle');
      return;
    }

    const statuses = board.tasks.map((t) => t.status);

    if (statuses.some((s) => s === 'failed')) {
      this._render('error');
    } else if (statuses.some((s) => s === 'in_progress')) {
      this._render('running');
    } else if (statuses.every((s) => s === 'done')) {
      this._render('done');
    } else {
      this._render('idle');
    }
  }

  private _render(state: PipelineState): void {
    this._state = state;
    switch (state) {
      case 'running':
        this.item.text = '$(sync~spin) Agent: Running...';
        this.item.tooltip = 'Pipeline is running. Click to open Activity Feed.';
        this.item.backgroundColor = undefined;
        break;
      case 'done':
        this.item.text = '$(check) Agent: Done';
        this.item.tooltip = 'Pipeline finished successfully. Click to open Activity Feed.';
        this.item.backgroundColor = undefined;
        break;
      case 'error':
        this.item.text = '$(error) Agent: Failed';
        this.item.tooltip = 'One or more tasks failed. Click to open Activity Feed.';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        break;
      default: // idle
        this.item.text = '$(circuit-board) Agent: Idle';
        this.item.tooltip = 'No pipeline running. Click to open Activity Feed.';
        this.item.backgroundColor = undefined;
        break;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
