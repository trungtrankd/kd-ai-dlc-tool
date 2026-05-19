import * as vscode from 'vscode';
import { readLogEntries } from '../data/logReader';
import { getNonce } from '../utils/getNonce';

/**
 * Singleton WebviewPanel that streams .agent-log.jsonl entries in real-time.
 *
 * Design:
 * - `current` holds the single active panel reference.
 * - `logOffset` tracks how many entries have already been sent to the webview
 *   so that only new lines are pushed on each file-change event.
 * - On open/reveal, ALL existing entries are loaded and posted to the webview.
 */
export class ActivityFeedPanel {
  static current: ActivityFeedPanel | undefined;
  private static _logOffset = 0;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _workspaceRoot: string;
  private readonly _extensionUri: vscode.Uri;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceRoot = workspaceRoot;

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    this._panel.onDidDispose(() => {
      ActivityFeedPanel.current = undefined;
    });
  }

  static createOrShow(extensionUri: vscode.Uri, workspaceRoot: string): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Reveal existing panel
    if (ActivityFeedPanel.current) {
      ActivityFeedPanel.current._panel.reveal(column);
      // Load any entries that appeared since the panel was last focused
      ActivityFeedPanel._loadAll(workspaceRoot);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'agentActivityFeed',
      'Agent Activity Feed',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webviews')],
        retainContextWhenHidden: true,
      },
    );

    ActivityFeedPanel.current = new ActivityFeedPanel(panel, extensionUri, workspaceRoot);

    // Load all existing log entries on first open
    ActivityFeedPanel._logOffset = 0;
    ActivityFeedPanel._loadAll(workspaceRoot);
  }

  /**
   * Called by the file watcher when .agent-log.jsonl changes.
   * Posts only the new entries since the last call.
   */
  static postNewEntries(workspaceRoot: string): void {
    if (!ActivityFeedPanel.current) {
      return;
    }
    const entries = readLogEntries(workspaceRoot, ActivityFeedPanel._logOffset);
    if (entries.length === 0) {
      return;
    }
    ActivityFeedPanel._logOffset += entries.length;
    ActivityFeedPanel.current._panel.webview.postMessage({
      command: 'appendEntries',
      entries,
    });
  }

  /** Reads ALL log entries from offset 0 and posts them. Resets the offset. */
  private static _loadAll(workspaceRoot: string): void {
    if (!ActivityFeedPanel.current) {
      return;
    }
    const entries = readLogEntries(workspaceRoot, 0);
    ActivityFeedPanel._logOffset = entries.length;
    ActivityFeedPanel.current._panel.webview.postMessage({
      command: 'setEntries',
      entries,
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const base = vscode.Uri.joinPath(this._extensionUri, 'out', 'webviews');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'activityFeed.js'));
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(base, 'activityFeed.css'));
    const nonce = getNonce();
    const csp = [
      `default-src 'none'`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `script-src-elem ${webview.cspSource} 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
      `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Activity Feed</title>
<link rel="stylesheet" href="${cssUri}">
</head>
<body>
<div id="root"></div>
<script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
