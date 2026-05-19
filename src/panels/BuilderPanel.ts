import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { readAgents } from '../data/agentReader';
import { listStories, saveStory } from '../data/storyLibrary';
import { readTaskBoard } from '../data/taskBoardReader';
import { readLogEntries } from '../data/logReader';
import { runPipeline, isRunning } from '../commands/runPipeline';
import { saveAidlcTemplate } from '../commands/saveAidlcTemplate';
import { buildRunStepPrompt } from '../utils/aidlcPrompts';
import { readWorkspaceYaml, patchPipelineOnFailure } from '../utils/workspaceYamlReader';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { getNonce } from '../utils/getNonce';

// Fallback skill definitions used when workspace.yaml is not present
const DEFAULT_SKILLS = [
  { name: 'plan',         desc: 'Plan',         tag: 'PLAN',         model: 'claude-opus-4-6' },
  { name: 'design',       desc: 'Design',       tag: 'DESIGN',       model: 'claude-opus-4-6' },
  { name: 'test-plan',    desc: 'Test Plan',    tag: 'TEST-PLAN',    model: 'claude-sonnet-4-6' },
  { name: 'implement',    desc: 'Implement',    tag: 'IMPLEMENT',    model: 'claude-sonnet-4-6' },
  { name: 'review',       desc: 'Review',       tag: 'REVIEW',       model: 'claude-opus-4-6' },
  { name: 'execute-test', desc: 'Execute Test', tag: 'EXECUTE-TEST', model: 'claude-sonnet-4-6' },
  { name: 'release',      desc: 'Release',      tag: 'RELEASE',      model: 'claude-sonnet-4-6' },
  { name: 'monitor',      desc: 'Monitor',      tag: 'MONITOR',      model: 'claude-sonnet-4-6' },
  { name: 'doc-sync',     desc: 'Doc Sync',     tag: 'DOC-SYNC',     model: 'claude-sonnet-4-6' },
];

interface HistoryEntry {
  filename: string;
  timestamp: string;
  preview: string;
}

function readHistory(workspaceRoot: string): HistoryEntry[] {
  const runsDir = path.join(workspaceRoot, '.aidlc', 'runs');
  if (!fs.existsSync(runsDir)) { return []; }
  try {
    return fs.readdirSync(runsDir)
      .filter((f) => f.startsWith('prompt-') && f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 20)
      .map((filename): HistoryEntry => {
        const tsRaw = filename.replace('prompt-', '').replace('.md', '');
        let timestamp = tsRaw;
        try { timestamp = new Date(tsRaw.replace(/-/g, ':')).toLocaleString(); } catch { /* keep raw */ }
        let preview = '';
        try {
          const content = fs.readFileSync(path.join(runsDir, filename), 'utf-8');
          const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? '';
          preview = firstLine.length > 100 ? firstLine.slice(0, 97) + '…' : firstLine;
        } catch { /* skip */ }
        return { filename, timestamp, preview };
      });
  } catch { return []; }
}

export class BuilderPanel {
  static current: BuilderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspaceRoot: string;
  private _statusBar: PipelineStatusBar | undefined;

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
      filePath?: string;
      workflowId?: string;
      step?: string;
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      pipelineId?: string;
      onFailure?: string;
      historyFilename?: string;
    }) => {
      switch (msg.command) {
        case 'runPipeline':
          vscode.commands.executeCommand('agentDashboard.runAidlcFullPipeline');
          break;
        case 'runWorkflow':
          vscode.commands.executeCommand('agentDashboard.runAidlcFullPipeline');
          break;
        case 'continuePipeline':
          vscode.commands.executeCommand('agentDashboard.continueAidlcPipeline');
          break;
        case 'cancelPipeline':
          vscode.commands.executeCommand('agentDashboard.cancelPipeline');
          break;
        case 'reviewCurrentWork':
          vscode.commands.executeCommand('agentDashboard.reviewCurrentWork');
          break;
        case 'openEpics':
          vscode.commands.executeCommand('agentDashboard.openDashboard');
          break;
        case 'openAgentFile':
          if (msg.filePath) { vscode.window.showTextDocument(vscode.Uri.file(msg.filePath)); }
          break;
        case 'openYaml': {
          const yaml = path.join(this._workspaceRoot, '.aidlc', 'workspace.yaml');
          try { await vscode.window.showTextDocument(vscode.Uri.file(yaml)); }
          catch { vscode.window.showInformationMessage('.aidlc/workspace.yaml not found. Load a template first.'); }
          break;
        }
        case 'openAgentsFolder':
          vscode.commands.executeCommand('agentDashboard.addAgent');
          break;
        case 'openSkillsFolder':
          vscode.commands.executeCommand('agentDashboard.addSkill');
          break;
        case 'claudeCli':
          vscode.commands.executeCommand('workbench.action.terminal.new');
          break;
        case 'importAidlcTemplate':
          vscode.commands.executeCommand('agentDashboard.importAidlcTemplate');
          break;
        case 'saveTemplate':
          await saveAidlcTemplate(this._workspaceRoot);
          break;
        case 'switchProject': {
          const picked = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Switch to Project',
            title: 'Open another AIDLC project folder',
          });
          if (picked?.[0]) {
            await vscode.commands.executeCommand('vscode.openFolder', picked[0], false);
          }
          break;
        }
        case 'runStep':
          if (msg.step && this._statusBar) {
            await runPipeline(this._workspaceRoot, this._statusBar, buildRunStepPrompt(msg.step));
          }
          break;
        case 'saveNewStory': {
          const title = msg.title?.trim();
          if (!title) { break; }
          const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          const filename = `story-${Date.now()}-${slug}.md`;
          const lines: string[] = [];
          if (msg.description?.trim()) { lines.push('## Description\n', msg.description.trim(), '\n'); }
          if (msg.acceptanceCriteria?.trim()) { lines.push('## Acceptance Criteria\n', msg.acceptanceCriteria.trim(), '\n'); }
          saveStory(this._workspaceRoot, lines.join('\n'), { filename, title });
          this._sendAllData();
          this._panel.webview.postMessage({ command: 'storyCreated' });
          break;
        }
        case 'toggleOnFailure':
          if (msg.pipelineId && (msg.onFailure === 'stop' || msg.onFailure === 'continue')) {
            patchPipelineOnFailure(this._workspaceRoot, msg.pipelineId, msg.onFailure);
          }
          break;
        case 'reRunHistory':
          if (msg.historyFilename && this._statusBar) {
            const runsDir = path.join(this._workspaceRoot, '.aidlc', 'runs');
            const fullPath = path.join(runsDir, msg.historyFilename);
            try {
              const prompt = fs.readFileSync(fullPath, 'utf-8');
              await runPipeline(this._workspaceRoot, this._statusBar, prompt);
            } catch {
              vscode.window.showErrorMessage(`Cannot read history file: ${msg.historyFilename}`);
            }
          }
          break;
        case 'refresh':
          this._sendAllData();
          break;
      }
    });

    this._panel.onDidDispose(() => { BuilderPanel.current = undefined; });
  }

  static createOrShow(
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    statusBar?: PipelineStatusBar,
    initialTab?: string,
  ): void {
    const column = vscode.ViewColumn.One;
    if (BuilderPanel.current) {
      BuilderPanel.current._panel.reveal(column);
      if (statusBar) { BuilderPanel.current._statusBar = statusBar; }
      if (initialTab) {
        BuilderPanel.current._panel.webview.postMessage({ command: 'switchTab', tab: initialTab });
      }
      BuilderPanel.current._sendAllData();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'aidlcBuilder', 'AIDLC Builder', column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out', 'webviews')],
      },
    );
    const instance = new BuilderPanel(panel, extensionUri, workspaceRoot, statusBar);
    BuilderPanel.current = instance;
    instance._sendAllData();
    if (initialTab) {
      instance._panel.webview.postMessage({ command: 'switchTab', tab: initialTab });
    }
  }

  static refreshAll(workspaceRoot: string): void {
    if (!BuilderPanel.current) { return; }
    BuilderPanel.current._sendAllData();
  }

  private _sendAllData(): void {
    const agents   = readAgents(this._workspaceRoot);
    const stories  = listStories(this._workspaceRoot);
    const board    = readTaskBoard(this._workspaceRoot);
    const yaml     = readWorkspaceYaml(this._workspaceRoot);
    const history  = readHistory(this._workspaceRoot);
    const logs     = readLogEntries(this._workspaceRoot).slice(-50);
    this._panel.webview.postMessage({ command: 'init', agents, stories, board, yaml, history, logs, pipelineRunning: isRunning() });
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
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIDLC Builder</title>
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
