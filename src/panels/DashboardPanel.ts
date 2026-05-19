import * as vscode from 'vscode';
import * as path from 'path';
import { readTaskBoard } from '../data/taskBoardReader';
import { readAgents } from '../data/agentReader';
import { listStories, readStory, deleteStory } from '../data/storyLibrary';
import { readLogEntries } from '../data/logReader';
import { runPipeline } from '../commands/runPipeline';
import { buildStoryFilePipelinePrompt, buildRunStepPrompt } from '../utils/aidlcPrompts';
import { approveTask, rejectTask, markTaskPending } from '../utils/taskBoardWriter';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { getNonce } from '../utils/getNonce';

export class DashboardPanel {
  static current: DashboardPanel | undefined;
  private static _logOffset = 0;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspaceRoot: string;
  private _statusBar: PipelineStatusBar | undefined;
  private _pendingExpandId: string | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    statusBar?: PipelineStatusBar,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceRoot = workspaceRoot;
    this._statusBar = statusBar;
    this._panel.webview.html = this._buildHtml(this._panel.webview);

    this._panel.webview.onDidReceiveMessage(async (msg: {
      command: string;
      filename?: string;
      filePath?: string;
      taskId?: string;
    }) => {
      switch (msg.command) {
        case 'runPipeline':
          if (this._statusBar) { await runPipeline(this._workspaceRoot, this._statusBar); }
          break;
        case 'runStory':
          if (msg.filename && this._statusBar) {
            await runPipeline(
              this._workspaceRoot,
              this._statusBar,
              buildStoryFilePipelinePrompt(msg.filename),
            );
          }
          break;
        case 'deleteStory':
          if (msg.filename) {
            const ok = await vscode.window.showWarningMessage(
              `Delete epic "${msg.filename}"?`, { modal: true }, 'Delete',
            );
            if (ok === 'Delete') {
              try {
                deleteStory(this._workspaceRoot, msg.filename);
                this._sendStories();
              } catch (e: unknown) {
                vscode.window.showErrorMessage(`Cannot delete: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
          }
          break;
        case 'openBuilder':
          vscode.commands.executeCommand('agentDashboard.openBuilder');
          break;
        case 'openStateJson': {
          const p = path.join(this._workspaceRoot, '.task-board.json');
          try { await vscode.window.showTextDocument(vscode.Uri.file(p)); }
          catch { vscode.window.showErrorMessage('No .task-board.json found.'); }
          break;
        }
        case 'openAgentFile':
          if (msg.filePath) { vscode.window.showTextDocument(vscode.Uri.file(msg.filePath)); }
          break;
        case 'refresh':
          this._sendAllData();
          break;
        case 'approveTask':
          if (msg.taskId) {
            approveTask(this._workspaceRoot, msg.taskId);
            this._sendBoard();
          }
          break;
        case 'rejectTask':
          if (msg.taskId) {
            const feedback = await vscode.window.showInputBox({
              title: 'Reject Step',
              prompt: 'Rejection feedback — will be passed to the agent on rerun (press Esc to skip rerun)',
              placeHolder: 'e.g. Missing edge case for empty input',
              ignoreFocusOut: true,
            });
            if (feedback === undefined) { break; }
            rejectTask(this._workspaceRoot, msg.taskId);
            if (feedback.trim() && this._statusBar) {
              await runPipeline(this._workspaceRoot, this._statusBar, buildRunStepPrompt(msg.taskId, feedback.trim()));
            }
            this._sendBoard();
          }
          break;
        case 'rerunTask':
          if (msg.taskId && this._statusBar) {
            const context = await vscode.window.showInputBox({
              title: 'Rerun Step',
              prompt: 'Additional context for rerun (optional — press Enter to rerun with original instructions)',
              placeHolder: 'Leave blank to rerun unchanged',
              ignoreFocusOut: true,
            });
            if (context === undefined) { break; }
            markTaskPending(this._workspaceRoot, msg.taskId);
            await runPipeline(this._workspaceRoot, this._statusBar, buildRunStepPrompt(msg.taskId, context.trim() || undefined));
            this._sendBoard();
          }
          break;
      }
    });

    this._panel.onDidDispose(() => { DashboardPanel.current = undefined; });
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    statusBar?: PipelineStatusBar,
    expandEpicId?: string,
  ): void {
    const column = vscode.ViewColumn.One;
    if (DashboardPanel.current) {
      DashboardPanel.current._panel.reveal(column);
      if (statusBar) { DashboardPanel.current._statusBar = statusBar; }
      if (expandEpicId) { DashboardPanel.current._expandEpic(expandEpicId); }
      else { DashboardPanel.current._sendAllData(); }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'aidlcEpics', 'AIDLC Epics', column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webviews')],
      },
    );
    const instance = new DashboardPanel(panel, extensionUri, workspaceRoot, statusBar);
    DashboardPanel.current = instance;
    DashboardPanel._logOffset = 0;
    if (expandEpicId) { instance._pendingExpandId = expandEpicId; }
    instance._sendAllData();
  }

  private _expandEpic(id: string): void {
    this._panel.webview.postMessage({ command: 'expandEpic', id });
  }

  static refreshBoard(workspaceRoot: string): void {
    if (!DashboardPanel.current) { return; }
    DashboardPanel.current._sendBoard();
  }

  static refreshAgents(workspaceRoot: string): void {
    if (!DashboardPanel.current) { return; }
    DashboardPanel.current._sendAgents();
  }

  static refreshStories(workspaceRoot: string): void {
    if (!DashboardPanel.current) { return; }
    DashboardPanel.current._sendStories();
  }

  static postNewEntries(workspaceRoot: string): void {
    if (!DashboardPanel.current) { return; }
    const entries = readLogEntries(workspaceRoot, DashboardPanel._logOffset);
    if (!entries.length) { return; }
    DashboardPanel._logOffset += entries.length;
    DashboardPanel.current._panel.webview.postMessage({ command: 'appendEntries', entries });
  }

  private _sendAllData(): void {
    this._sendBoard();
    this._sendAgents();
    this._sendStories();
    const entries = readLogEntries(this._workspaceRoot, 0);
    DashboardPanel._logOffset = entries.length;
    this._panel.webview.postMessage({ command: 'setEntries', entries });
    if (this._pendingExpandId) {
      this._panel.webview.postMessage({ command: 'expandEpic', id: this._pendingExpandId });
      this._pendingExpandId = undefined;
    }
  }

  private _sendBoard(): void {
    const board = readTaskBoard(this._workspaceRoot);
    this._panel.webview.postMessage({ command: 'updateBoard', board });
  }

  private _sendAgents(): void {
    const agents = readAgents(this._workspaceRoot);
    this._panel.webview.postMessage({ command: 'updateAgents', agents });
  }

  private _sendStories(): void {
    const stories = listStories(this._workspaceRoot);
    this._panel.webview.postMessage({ command: 'updateStories', stories });
  }

  private _buildHtml(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(this._extensionUri, 'out', 'webviews');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'workspace.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'workspace.css'));
    const nonce = getNonce();
    const workspaceName = path.basename(this._workspaceRoot);
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src-elem ${webview.cspSource} 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    const initialState = JSON.stringify({
      board: null, agents: [], stories: [], yaml: null,
      history: [], logs: [], pipelineRunning: false,
      workspaceName: workspaceName, entries: [],
      initialTab: 'epics',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIDLC Epics</title>
<link rel="stylesheet" href="${cssUri}">
<script nonce="${nonce}">window.__AIDLC_INITIAL_STATE__ = ${initialState};</script>
</head>
<body>
<div id="root"></div>
<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
