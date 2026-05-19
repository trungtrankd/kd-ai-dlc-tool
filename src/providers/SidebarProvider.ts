import * as vscode from 'vscode';
import * as path from 'path';
import { readTaskBoard } from '../data/taskBoardReader';
import { readAgents } from '../data/agentReader';
import { listStories } from '../data/storyLibrary';
import { readLogEntries } from '../data/logReader';
import { getNonce } from '../utils/getNonce';

export class SidebarProvider implements vscode.WebviewViewProvider {
  static current: SidebarProvider | undefined;
  private _view?: vscode.WebviewView;
  private _logOffset = 0;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _workspaceRoot: string,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    SidebarProvider.current = this;
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'out', 'webviews'),
      ],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg: { command: string; epicId?: string }) => {
      switch (msg.command) {
        case 'runPipeline':
        case 'runFullPipeline':
          vscode.commands.executeCommand('agentDashboard.runAidlcFullPipeline');
          break;
        case 'continuePipeline':
          vscode.commands.executeCommand('agentDashboard.continueAidlcPipeline');
          break;
        case 'reviewCurrentWork':
          vscode.commands.executeCommand('agentDashboard.reviewCurrentWork');
          break;
        case 'openActivityFeed':
          vscode.commands.executeCommand('agentDashboard.openActivityFeed');
          break;
        case 'openDashboard':
          vscode.commands.executeCommand('agentDashboard.openDashboard');
          break;
        case 'openBuilder':
          vscode.commands.executeCommand('agentDashboard.openBuilder');
          break;
        case 'openEpic':
          vscode.commands.executeCommand('agentDashboard.openDashboard', msg.epicId);
          break;
        case 'refresh':
          this._sendAllData();
          break;
      }
    });

    this._sendAllData();
  }

  sendBoard(): void {
    const board = readTaskBoard(this._workspaceRoot);
    this._view?.webview.postMessage({ command: 'updateBoard', board });
  }

  sendAgents(): void {
    const agents = readAgents(this._workspaceRoot);
    this._view?.webview.postMessage({ command: 'updateAgents', agents });
  }

  sendStories(): void {
    const stories = listStories(this._workspaceRoot);
    this._view?.webview.postMessage({ command: 'updateStories', stories });
  }

  sendNewLogEntries(): void {
    const entries = readLogEntries(this._workspaceRoot, this._logOffset);
    if (!entries.length) { return; }
    this._logOffset += entries.length;
    this._view?.webview.postMessage({ command: 'appendEntries', entries });
  }

  private _sendAllData(): void {
    const board = readTaskBoard(this._workspaceRoot);
    const agents = readAgents(this._workspaceRoot);
    const stories = listStories(this._workspaceRoot);
    const entries = readLogEntries(this._workspaceRoot, 0);
    this._logOffset = entries.length;
    this._view?.webview.postMessage({
      command: 'init',
      board,
      agents,
      stories,
      entries: entries.slice(-20),
    });
  }

  private _buildHtml(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(this._extensionUri, 'out', 'webviews');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'sidebar.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'sidebar.css'));
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
      board: null, agents: [], stories: [], entries: [],
      pipelineRunning: false, workspaceName: workspaceName,
      agentCount: 0, skillCount: 9, flowCount: 1,
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIDLC Workspace</title>
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
