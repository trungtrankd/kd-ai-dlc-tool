import * as vscode from 'vscode';
import { listStories, deleteStory } from '../data/storyLibrary';
import { StoryMeta } from '../types';
import { getNonce } from '../utils/getNonce';
import { runPipeline } from '../commands/runPipeline';
import { buildStoryFilePipelinePrompt } from '../utils/aidlcPrompts';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';

/**
 * WebviewPanel that displays and manages the story library.
 *
 * Handles inbound messages from the webview:
 *   loadStories  — scan stories/ directory and post list
 *   useStory     — read a story file and launch runPipeline with its content
 *   deleteStory  — delete a story file and reload the list
 */
export class StoryLibraryPanel {
  static current: StoryLibraryPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _workspaceRoot: string;
  private _statusBar: PipelineStatusBar | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string,
  ) {
    this._panel = panel;
    this._workspaceRoot = workspaceRoot;

    this._panel.webview.html = this._getHtmlForWebview(panel.webview, extensionUri);

    this._panel.webview.onDidReceiveMessage((message: { command: string; filename?: string }) => {
      switch (message.command) {
        case 'loadStories':
          this._sendStoryList();
          break;
        case 'useStory':
          if (message.filename) {
            this._useStory(message.filename);
          }
          break;
        case 'deleteStory':
          if (message.filename) {
            this._deleteStory(message.filename);
          }
          break;
      }
    });

    this._panel.onDidDispose(() => {
      StoryLibraryPanel.current = undefined;
    });

    // Send the initial story list once the panel is ready
    this._sendStoryList();
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    statusBar?: PipelineStatusBar,
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (StoryLibraryPanel.current) {
      StoryLibraryPanel.current._panel.reveal(column);
      if (statusBar) {
        StoryLibraryPanel.current._statusBar = statusBar;
      }
      StoryLibraryPanel.current._sendStoryList();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'agentStoryLibrary',
      'Story Library',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    StoryLibraryPanel.current = new StoryLibraryPanel(panel, extensionUri, workspaceRoot);
    if (statusBar) {
      StoryLibraryPanel.current._statusBar = statusBar;
    }
  }

  private _sendStoryList(): void {
    const stories = listStories(this._workspaceRoot);
    this._panel.webview.postMessage({ command: 'storyList', stories });
  }

  private async _useStory(filename: string): Promise<void> {
    if (this._statusBar) {
      await runPipeline(
        this._workspaceRoot,
        this._statusBar,
        buildStoryFilePipelinePrompt(filename),
      );
    } else {
      const storyPath = `stories/${filename}`;
      vscode.window.showInformationMessage(
        `No pipeline status bar available. Open the story at ${storyPath} and run manually.`,
      );
    }
  }

  private _deleteStory(filename: string): void {
    try {
      deleteStory(this._workspaceRoot, filename);
      this._sendStoryList();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Cannot delete story: ${msg}`);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, _extensionUri: vscode.Uri): string {
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Story Library</title>
  <style nonce="${nonce}">
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 16px;
      font-size: 13px;
    }
    h1 { font-size: 16px; margin-bottom: 16px; color: var(--vscode-titleBar-activeForeground, #e6edf3); }
    .story-card {
      border: 1px solid var(--vscode-panel-border, #30363d);
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 10px;
      background: var(--vscode-sideBar-background, #161b22);
    }
    .story-title { font-weight: 600; margin-bottom: 4px; }
    .story-meta { font-size: 11px; color: var(--vscode-descriptionForeground, #8b949e); margin-bottom: 8px; }
    .story-preview { font-size: 12px; color: var(--vscode-foreground, #c9d1d9); margin-bottom: 10px; line-height: 1.5; }
    .story-actions { display: flex; gap: 8px; }
    button {
      padding: 4px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }
    .btn-run {
      background: var(--vscode-button-background, #238636);
      color: var(--vscode-button-foreground, #ffffff);
    }
    .btn-run:hover { background: var(--vscode-button-hoverBackground, #2ea043); }
    .btn-delete {
      background: var(--vscode-button-secondaryBackground, #30363d);
      color: var(--vscode-button-secondaryForeground, #c9d1d9);
    }
    .btn-delete:hover { background: var(--vscode-errorForeground, #f85149); color: #fff; }
    .empty-state {
      text-align: center;
      padding: 40px 16px;
      color: var(--vscode-descriptionForeground, #8b949e);
    }
  </style>
</head>
<body>
  <h1>Story Library</h1>
  <div id="story-list"><div class="empty-state">Loading stories...</div></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function escHtml(s) {
      return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function render(stories) {
      const el = document.getElementById('story-list');
      if (!stories || stories.length === 0) {
        el.innerHTML = '<div class="empty-state">No stories saved yet.<br>Import from Taiga or save a story from the pipeline.</div>';
        return;
      }
      el.innerHTML = stories.map(s => \`
        <div class="story-card">
          <div class="story-title">\${escHtml(s.title || s.filename)}</div>
          <div class="story-meta">
            \${s.saved_at ? 'Saved: ' + new Date(s.saved_at).toLocaleString() : ''}
            \${s.taiga_ref ? ' &bull; Taiga #' + escHtml(s.taiga_ref) : ''}
          </div>
          \${s.preview ? '<div class="story-preview">' + escHtml(s.preview) + '</div>' : ''}
          <div class="story-actions">
            <button class="btn-run" onclick="useStory('\${escHtml(s.filename)}')">Run Pipeline</button>
            <button class="btn-delete" onclick="delStory('\${escHtml(s.filename)}')">Delete</button>
          </div>
        </div>
      \`).join('');
    }

    function useStory(filename) {
      vscode.postMessage({ command: 'useStory', filename });
    }

    function delStory(filename) {
      if (confirm('Delete story: ' + filename + '?')) {
        vscode.postMessage({ command: 'deleteStory', filename });
      }
    }

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.command === 'storyList') {
        render(msg.stories);
      }
    });

    // Request the story list on load
    vscode.postMessage({ command: 'loadStories' });
  </script>
</body>
</html>`;
  }
}
