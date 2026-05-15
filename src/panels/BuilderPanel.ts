import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { readAgents } from '../data/agentReader';
import { listStories, saveStory } from '../data/storyLibrary';
import { readTaskBoard } from '../data/taskBoardReader';
import { readLogEntries } from '../data/logReader';
import { runPipeline } from '../commands/runPipeline';
import { saveAidlcTemplate } from '../commands/saveAidlcTemplate';
import { buildRunStepPrompt } from '../utils/aidlcPrompts';
import { readWorkspaceYaml, patchPipelineOnFailure } from '../utils/workspaceYamlReader';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { getNonce } from '../utils/getNonce';

// Fallback skill definitions used when workspace.yaml is not present
const DEFAULT_SKILLS = [
  { name: 'plan',         desc: 'Plan',         tag: 'PLAN',         model: 'claude-opus-4-7' },
  { name: 'design',       desc: 'Design',       tag: 'DESIGN',       model: 'claude-opus-4-7' },
  { name: 'test-plan',    desc: 'Test Plan',    tag: 'TEST-PLAN',    model: 'claude-sonnet-4-6' },
  { name: 'implement',    desc: 'Implement',    tag: 'IMPLEMENT',    model: 'claude-sonnet-4-6' },
  { name: 'review',       desc: 'Review',       tag: 'REVIEW',       model: 'claude-opus-4-7' },
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
  private readonly _workspaceRoot: string;
  private _statusBar: PipelineStatusBar | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    _extensionUri: vscode.Uri,
    workspaceRoot: string,
    statusBar?: PipelineStatusBar,
  ) {
    this._panel = panel;
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
        case 'openAgentsFolder': {
          const agentsDir = path.join(this._workspaceRoot, '.claude', 'agents');
          if (!fs.existsSync(agentsDir)) { fs.mkdirSync(agentsDir, { recursive: true }); }
          vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(agentsDir));
          break;
        }
        case 'openSkillsFolder': {
          const skillsDir = path.join(this._workspaceRoot, '.aidlc', 'skills');
          if (!fs.existsSync(skillsDir)) {
            vscode.window.showInformationMessage('No .aidlc/skills/ found. Load the template first.');
          } else {
            vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(skillsDir));
          }
          break;
        }
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
      { enableScripts: true, retainContextWhenHidden: true },
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
    this._panel.webview.postMessage({ command: 'init', agents, stories, board, yaml, history, logs });
  }

  private _buildHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const workspaceName = path.basename(this._workspaceRoot);
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIDLC Builder</title>
<style nonce="${nonce}">
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:       #0b1219;
  --bg2:      #111a23;
  --bg3:      #0d1520;
  --bg-dark:  #080f18;
  --border:   #1a2c3d;
  --border-l: #243444;
  --teal:     #00b4a4;
  --teal-dim: rgba(0,180,164,0.12);
  --teal-bdr: rgba(0,180,164,0.28);
  --teal-btn: #0a5f56;
  --teal-h:   #0d7a6e;
  --teal-txt: #00c8b6;
  --green:    #22c55e;
  --red:      #ef4444;
  --yellow:   #eab308;
  --amber:    #d97706;
  --fg:       #c8d8e8;
  --fg-2:     #8aaabe;
  --fg-muted: #4a6a84;
  --fg-dim:   #1e3040;
  --font:     -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:"SF Mono","Fira Code",Menlo,monospace;
  --r:        6px;
}

body { font-family:var(--font); background:var(--bg); color:var(--fg); font-size:12px; line-height:1.5; height:100vh; display:flex; flex-direction:column; overflow:hidden; }

/* Header */
.top-hdr { background:#090f18; border-bottom:1px solid var(--border); flex-shrink:0; padding:10px 20px 0; }
.hdr-row1 { display:flex; align-items:center; gap:12px; margin-bottom:10px; flex-wrap:wrap; }
.builder-logo { display:flex; align-items:center; gap:10px; flex-shrink:0; }
.logo-icon { width:32px; height:32px; background:var(--teal-btn); border:1px solid var(--teal-bdr); border-radius:var(--r); display:flex; align-items:center; justify-content:center; font-size:15px; }
.logo-name { font-size:15px; font-weight:700; color:var(--fg); }
.logo-sub  { font-size:10px; color:var(--fg-muted); margin-top:1px; }
.hdr-mid { flex:1 1 180px; min-width:160px; }
.project-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 12px; background:var(--bg2); border:1px solid var(--border-l); border-radius:20px; }
.chip-lbl { font-size:9px; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.08em; }
.chip-val { font-size:12px; font-weight:600; color:var(--fg); }
.hdr-right { display:flex; align-items:center; gap:8px; flex:0 1 auto; flex-wrap:wrap; justify-content:flex-end; }

/* Buttons */
.btn-start  { padding:6px 14px; background:var(--teal-btn); color:#9ef0e7; border:1px solid var(--teal-bdr); border-radius:var(--r); font-size:11px; font-weight:700; letter-spacing:0.04em; cursor:pointer; font-family:var(--font); display:flex; align-items:center; gap:5px; transition:background 0.12s; }
.btn-start:hover { background:var(--teal-h); }
.btn-cancel { padding:6px 12px; background:rgba(239,68,68,0.12); color:var(--red); border:1px solid rgba(239,68,68,0.3); border-radius:var(--r); font-size:11px; font-weight:700; cursor:pointer; font-family:var(--font); transition:background 0.12s; display:none; }
.btn-cancel:hover { background:rgba(239,68,68,0.22); }
.btn-ghost  { padding:5px 12px; background:transparent; color:var(--fg-muted); border:1px solid var(--border-l); border-radius:var(--r); font-size:11px; font-weight:600; cursor:pointer; font-family:var(--font); transition:all 0.12s; }
.btn-ghost:hover { background:var(--bg2); color:var(--fg); }
.action-row { display:flex; gap:6px; padding-bottom:10px; }
.btn-action { padding:4px 11px; background:var(--bg2); border:1px solid var(--border-l); border-radius:var(--r); color:var(--fg-2); font-size:11px; font-weight:600; letter-spacing:0.03em; cursor:pointer; font-family:var(--font); transition:all 0.12s; }
.btn-action:hover { background:var(--bg3); color:var(--fg); }

/* Tabs */
.tab-bar { display:flex; }
.tab-btn { padding:8px 18px; border:none; border-bottom:2px solid transparent; background:transparent; color:var(--fg-muted); font-size:12px; font-weight:600; cursor:pointer; font-family:var(--font); letter-spacing:0.03em; display:flex; align-items:center; gap:7px; transition:color 0.12s; }
.tab-btn:hover { color:var(--fg); }
.tab-btn.active { color:var(--teal-txt); border-bottom-color:var(--teal); }
.tab-count { font-size:10px; font-weight:700; padding:1px 6px; border-radius:10px; background:var(--bg2); color:var(--fg-muted); }
.tab-btn.active .tab-count { background:var(--teal-dim); color:var(--teal-txt); }

/* Content */
.content { flex:1; overflow-y:auto; overflow-x:hidden; }
.tab-panel { display:none; }
.tab-panel.active { display:block; }
.panel-hdr { display:flex; align-items:center; justify-content:space-between; padding:14px 20px 12px; border-bottom:1px solid var(--border); }
.panel-hdr-l { display:flex; align-items:center; gap:8px; }
.panel-title { font-size:11px; font-weight:700; color:var(--fg-muted); text-transform:uppercase; letter-spacing:0.08em; }
.panel-count { font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px; background:var(--bg2); color:var(--fg-muted); border:1px solid var(--border); }
.btn-new { padding:5px 14px; background:transparent; border:1px solid var(--teal-bdr); border-radius:var(--r); color:var(--teal-txt); font-size:11px; font-weight:600; cursor:pointer; font-family:var(--font); transition:all 0.12s; }
.btn-new:hover { background:var(--teal-dim); }
.btn-open-list { padding:5px 12px; background:transparent; border:1px solid var(--border-l); border-radius:var(--r); color:var(--fg-muted); font-size:11px; font-weight:600; cursor:pointer; font-family:var(--font); transition:all 0.12s; }
.btn-open-list:hover { background:var(--bg2); color:var(--fg); }

/* Workflow cards */
.wf-list { padding:12px 20px 40px; display:flex; flex-direction:column; gap:12px; }
.wf-card { background:var(--bg2); border:1px solid var(--border); border-radius:var(--r); overflow:hidden; }
.wf-card-hdr { display:flex; align-items:center; gap:12px; padding:10px 14px; border-bottom:1px solid var(--border); }
.wf-name-wrap { display:flex; align-items:center; gap:8px; flex:1; }
.wf-name { font-size:13px; font-weight:700; color:var(--fg); font-family:var(--font-mono); }
.wf-steps-count { font-size:11px; color:var(--fg-muted); }
.wf-card-actions { display:flex; align-items:center; gap:8px; }
.btn-run-wf { padding:4px 12px; background:var(--teal-btn); color:#9ef0e7; border:1px solid var(--teal-bdr); border-radius:var(--r); font-size:10px; font-weight:700; cursor:pointer; font-family:var(--font); display:flex; align-items:center; gap:4px; letter-spacing:0.04em; transition:background 0.12s; }
.btn-run-wf:hover { background:var(--teal-h); }
.btn-on-failure { padding:4px 10px; border-radius:var(--r); font-size:10px; font-weight:700; cursor:pointer; font-family:var(--font); letter-spacing:0.04em; transition:all 0.12s; border:none; }
.on-stop { background:rgba(180,100,0,0.2); color:#d4860a; border:1px solid rgba(180,100,0,0.35) !important; }
.on-stop:hover { background:rgba(180,100,0,0.3); }
.on-continue { background:rgba(74,106,132,0.15); color:var(--fg-muted); border:1px solid var(--border-l) !important; }
.on-continue:hover { background:var(--bg3); color:var(--fg); }
.step-boxes-wrap { padding:14px 14px 0; overflow-x:auto; }
.step-boxes { display:flex; align-items:center; min-width:max-content; padding-bottom:14px; }
.step-box { display:flex; align-items:center; gap:8px; padding:8px 14px; background:var(--bg-dark); border:1px solid var(--border-l); border-radius:4px; min-width:100px; flex-shrink:0; cursor:pointer; transition:border-color 0.12s; }
.step-box:hover { border-color:var(--teal-bdr); }
.step-box-num { font-size:10px; font-weight:700; color:var(--fg-muted); font-family:var(--font-mono); flex-shrink:0; }
.step-box-name { font-size:12px; font-weight:600; color:var(--teal-txt); font-family:var(--font-mono); white-space:nowrap; }
.step-arrow { display:flex; align-items:center; justify-content:center; width:28px; flex-shrink:0; color:var(--border-l); font-size:14px; font-weight:300; margin:0 1px 1px; }
.wf-progress-bar { height:3px; background:var(--border); }
.wf-progress-fill { height:100%; background:linear-gradient(90deg,var(--teal),rgba(0,180,164,0.4)); border-radius:0 2px 2px 0; transition:width 0.4s ease; }

/* Agents grid */
.agents-panel { padding:0 0 40px; }
.group { margin:0; }
.group-hdr { display:flex; align-items:center; gap:8px; padding:9px 20px; background:#0a1118; border-bottom:1px solid var(--border); border-top:1px solid var(--border); margin-top:-1px; }
.group-dot { color:var(--fg-dim); font-size:11px; }
.group-icon { font-size:14px; }
.group-name { font-size:11px; font-weight:700; color:var(--fg); }
.group-count { font-size:11px; color:var(--fg-muted); }
.group-path { margin-left:auto; font-size:10px; color:var(--fg-muted); font-family:var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:50%; }
.group-body { padding:12px 20px; }
.group-empty { padding:12px 4px; color:var(--fg-muted); font-size:11px; font-style:italic; }
.group-action { margin-left:auto; }
.cards-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.agent-card { background:var(--bg3); border:1px solid var(--border); border-radius:var(--r); padding:10px 12px; cursor:pointer; transition:border-color 0.12s,background 0.12s; display:flex; flex-direction:column; gap:5px; min-height:60px; }
.agent-card:hover { border-color:var(--border-l); background:#101c28; }
.card-top { display:flex; align-items:flex-start; justify-content:space-between; gap:6px; }
.card-name { font-size:12px; font-weight:700; color:var(--fg); line-height:1.3; }
.scope-badge { font-size:9px; font-weight:700; padding:2px 6px; border-radius:3px; letter-spacing:0.05em; flex-shrink:0; white-space:nowrap; }
.scope-project { background:rgba(74,106,132,0.2); color:var(--fg-2); border:1px solid rgba(74,106,132,0.25); }
.scope-aidlc   { background:var(--teal-dim); color:var(--teal-txt); border:1px solid var(--teal-bdr); }
.card-desc { font-size:10px; color:var(--fg-muted); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.card-path { font-size:9px; color:var(--fg-muted); font-family:var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.card-tags { display:flex; flex-wrap:wrap; gap:4px; margin-top:2px; }
.skill-tag { font-size:9px; font-weight:700; padding:1px 6px; border-radius:3px; letter-spacing:0.04em; text-transform:uppercase; }
.tag-skill  { background:rgba(0,180,164,0.12); color:var(--teal-txt); border:1px solid var(--teal-bdr); }
.tag-model  { background:rgba(74,106,132,0.15); color:var(--fg-muted); border:1px solid rgba(74,106,132,0.22); font-family:var(--font-mono); text-transform:none; letter-spacing:0; }
.tag-opus   { background:rgba(168,85,247,0.1); color:#c084fc; border:1px solid rgba(168,85,247,0.2); }
.tag-haiku  { background:rgba(34,197,94,0.1); color:#4ade80; border:1px solid rgba(34,197,94,0.2); }
.card-footer { margin-top:6px; display:flex; justify-content:flex-end; }
.btn-run-step { font-size:9px; font-weight:700; letter-spacing:0.06em; padding:3px 10px; border-radius:3px; background:var(--teal-btn); border:1px solid var(--teal-bdr); color:var(--teal-txt); cursor:pointer; transition:background 0.12s; }
.btn-run-step:hover { background:var(--teal-h); }

/* Epics */
.epic-list { padding:12px 20px 40px; display:flex; flex-direction:column; gap:8px; }
.epic-row { background:var(--bg2); border:1px solid var(--border); border-radius:var(--r); padding:12px 16px; transition:border-color 0.12s; }
.epic-row:hover { border-color:var(--border-l); }
.epic-row-top { display:flex; align-items:center; gap:10px; margin-bottom:6px; }
.epic-row-id { font-size:13px; font-weight:700; color:var(--teal-txt); font-family:var(--font-mono); }
.epic-row-title { flex:1; font-size:12px; color:var(--fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.status-pill { padding:2px 9px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; }
.pill-pending     { background:rgba(74,106,132,0.18); color:var(--fg-muted); border:1px solid rgba(74,106,132,0.25); }
.pill-in_progress { background:var(--teal-dim); color:var(--teal-txt); border:1px solid var(--teal-bdr); }
.pill-done        { background:rgba(34,197,94,0.12); color:var(--green); border:1px solid rgba(34,197,94,0.25); }
.pill-failed      { background:rgba(239,68,68,0.12); color:var(--red); border:1px solid rgba(239,68,68,0.25); }
.epic-row-meta { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--fg-muted); }
.meta-dot { width:7px; height:7px; border-radius:50%; background:var(--fg-muted); flex-shrink:0; }
.dot-in_progress { background:var(--teal); box-shadow:0 0 4px var(--teal); }
.dot-done  { background:var(--green); }
.dot-failed { background:var(--red); }
.meta-sep { color:var(--fg-dim); }

/* History tab */
.history-list { padding:12px 20px 40px; display:flex; flex-direction:column; gap:8px; }
.history-row { background:var(--bg2); border:1px solid var(--border); border-radius:var(--r); padding:10px 14px; display:flex; align-items:flex-start; gap:12px; }
.history-row:hover { border-color:var(--border-l); }
.history-ts { font-size:10px; color:var(--fg-muted); font-family:var(--font-mono); white-space:nowrap; flex-shrink:0; }
.history-preview { flex:1; font-size:11px; color:var(--fg-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.btn-rerun { padding:3px 10px; font-size:9px; font-weight:700; letter-spacing:0.06em; background:var(--bg3); border:1px solid var(--border-l); border-radius:3px; color:var(--fg-muted); cursor:pointer; transition:all 0.12s; flex-shrink:0; }
.btn-rerun:hover { background:var(--teal-dim); color:var(--teal-txt); border-color:var(--teal-bdr); }
.history-empty { padding:24px; color:var(--fg-muted); font-size:12px; text-align:center; }

/* Footer */
.page-footer { padding:8px 20px; border-top:1px solid var(--border); background:var(--bg-dark); font-size:10px; color:var(--fg-muted); flex-shrink:0; display:flex; align-items:center; gap:4px; }
.footer-link { color:var(--teal-txt); cursor:pointer; }
.footer-link:hover { text-decoration:underline; }

/* Story modal */
.modal-overlay { position:fixed; inset:0; z-index:200; background:rgba(0,0,0,0.65); display:flex; align-items:center; justify-content:center; }
.modal-box { background:var(--bg2); border:1px solid var(--border-l); border-radius:6px; width:440px; max-width:90vw; display:flex; flex-direction:column; overflow:hidden; }
.modal-hdr { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--border); }
.modal-title { font-size:12px; font-weight:700; letter-spacing:0.06em; color:var(--teal-txt); }
.modal-close { background:none; border:none; color:var(--fg-muted); cursor:pointer; font-size:16px; line-height:1; padding:0 4px; }
.modal-close:hover { color:var(--fg); }
.modal-body { padding:14px 16px; display:flex; flex-direction:column; gap:8px; }
.field-lbl { font-size:10px; font-weight:700; color:var(--fg-muted); letter-spacing:0.05em; }
.field-req { color:var(--red); }
.field-input, .field-textarea { background:var(--bg3); border:1px solid var(--border); border-radius:4px; color:var(--fg); font-size:11px; padding:7px 10px; resize:vertical; outline:none; font-family:var(--font); width:100%; box-sizing:border-box; }
.field-input:focus, .field-textarea:focus { border-color:var(--teal-bdr); }
.modal-footer { display:flex; justify-content:flex-end; gap:8px; padding:10px 16px; border-top:1px solid var(--border); }

::-webkit-scrollbar { width:5px; height:5px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb { background:var(--border-l); border-radius:3px; }

/* Pipeline step status */
@keyframes spin { to { transform: rotate(360deg); } }
.step-box.step-in_progress { border-color:var(--teal-bdr); background:var(--teal-dim); }
.step-box.step-done        { border-color:rgba(34,197,94,0.35); background:rgba(34,197,94,0.07); }
.step-box.step-failed      { border-color:rgba(239,68,68,0.4); background:rgba(239,68,68,0.08); }
.step-box.step-blocked     { border-color:rgba(234,179,8,0.4); background:rgba(234,179,8,0.07); }
.step-status-icon { font-size:12px; flex-shrink:0; margin-left:auto; }
.step-status-icon.spin { display:inline-block; animation:spin 1s linear infinite; color:var(--teal-txt); }
.step-status-icon.done   { color:var(--green); }
.step-status-icon.failed { color:var(--red); }
.step-box-inner { display:flex; flex-direction:column; gap:1px; }
.step-box-agent   { font-size:9px; color:var(--fg-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80px; }
.step-box-elapsed { font-size:9px; color:var(--green); white-space:nowrap; }
/* Active log strip */
.wf-active-log { display:flex; align-items:flex-start; gap:8px; padding:7px 14px; background:#070e16; border-top:1px solid var(--border); }
.log-agent-badge { font-size:9px; font-weight:700; letter-spacing:0.05em; padding:1px 6px; border-radius:3px; background:var(--teal-dim); color:var(--teal-txt); border:1px solid var(--teal-bdr); white-space:nowrap; flex-shrink:0; }
.log-msg-text { font-size:10px; color:var(--fg-2); font-family:var(--font-mono); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.5; }
/* Progress label */
.wf-progress-row { display:flex; align-items:center; gap:8px; }
.wf-progress-bar { flex:1; height:3px; background:var(--border); }
.wf-progress-label { font-size:9px; font-weight:700; color:var(--fg-muted); white-space:nowrap; padding:0 14px 6px; padding-left:0; }
.wf-progress-wrap { padding:6px 14px 10px; display:flex; flex-direction:column; gap:4px; }
</style>
</head>
<body>

<div class="top-hdr">
  <div class="hdr-row1">
    <div class="builder-logo">
      <div class="logo-icon">⚡</div>
      <div>
        <div class="logo-name">AIDLC Builder</div>
        <div class="logo-sub">Workspace · Agents · Skills · Pipelines</div>
      </div>
    </div>
    <div class="hdr-mid">
      <div class="project-chip">
        <span class="chip-lbl">PROJECT</span>
        <span class="chip-val">${workspaceName}</span>
      </div>
    </div>
    <div class="hdr-right">
      <button class="btn-start"  id="btn-start">▶ START EPIC</button>
      <button class="btn-cancel" id="btn-cancel">■ CANCEL</button>
      <button class="btn-ghost"  id="btn-continue">CONTINUE</button>
      <button class="btn-ghost"  id="btn-review">REVIEW</button>
      <button class="btn-ghost"  id="btn-load">LOAD TEMPLATE</button>
      <button class="btn-ghost"  id="btn-save">SAVE TEMPLATE</button>
      <button class="btn-ghost"  id="btn-yaml">OPEN YAML</button>
    </div>
  </div>
  <div class="action-row">
    <button class="btn-action" id="btn-switch">SWITCH PROJECT</button>
    <button class="btn-action" id="btn-cli">CLAUDE CLI</button>
  </div>
  <div class="tab-bar">
    <button class="tab-btn active" data-tab="workflows">WORKFLOWS <span class="tab-count" id="tc-wf">1</span></button>
    <button class="tab-btn" data-tab="agents">AGENTS <span class="tab-count" id="tc-ag">0</span></button>
    <button class="tab-btn" data-tab="skills">SKILLS <span class="tab-count" id="tc-sk">0</span></button>
    <button class="tab-btn" data-tab="epics">EPICS <span class="tab-count" id="tc-ep">0</span></button>
    <button class="tab-btn" data-tab="history">HISTORY <span class="tab-count" id="tc-hi">0</span></button>
  </div>
</div>

<div class="content">

  <!-- WORKFLOWS -->
  <div class="tab-panel active" id="panel-workflows">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">WORKFLOWS</span>
        <span class="panel-count" id="ph-wf">1</span>
      </div>
      <small style="color:var(--fg-muted);font-size:10px">Edit <strong style="color:var(--fg-2)">.aidlc/workspace.yaml</strong> to add workflows</small>
    </div>
    <div class="wf-list" id="wf-list"></div>
  </div>

  <!-- AGENTS -->
  <div class="tab-panel" id="panel-agents">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">AGENTS</span>
        <span class="panel-count" id="ph-ag">0</span>
      </div>
      <button class="btn-new" id="btn-add-agent">+ ADD AGENT</button>
    </div>
    <div class="agents-panel">
      <div class="group" id="ag-project-group">
        <div class="group-hdr">
          <span class="group-dot">·</span><span class="group-icon">📁</span>
          <span class="group-name">PROJECT</span>
          <span class="group-count" id="ag-proj-cnt">0</span>
          <span class="group-path">.claude/agents/ — committed to this repo</span>
        </div>
        <div class="group-body"><div class="cards-grid" id="ag-proj-grid"></div></div>
      </div>
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span><span class="group-icon">📦</span>
          <span class="group-name">AIDLC</span>
          <span class="group-count" id="ag-aidlc-cnt">9</span>
          <span class="group-path">.aidlc/workspace.yaml — shared with the team</span>
        </div>
        <div class="group-body"><div class="cards-grid" id="ag-aidlc-grid"></div></div>
      </div>
    </div>
  </div>

  <!-- SKILLS -->
  <div class="tab-panel" id="panel-skills">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">SKILLS</span>
        <span class="panel-count" id="ph-sk">0</span>
      </div>
      <button class="btn-new" id="btn-add-skill">+ ADD SKILL</button>
    </div>
    <div class="agents-panel">
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span><span class="group-icon">📦</span>
          <span class="group-name">AIDLC</span>
          <span class="group-count" id="sk-aidlc-cnt">9</span>
          <span class="group-path">.aidlc/skills/ — one .md file per step</span>
        </div>
        <div class="group-body"><div class="cards-grid" id="sk-aidlc-grid"></div></div>
      </div>
    </div>
  </div>

  <!-- EPICS -->
  <div class="tab-panel" id="panel-epics">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">EPICS</span>
        <span class="panel-count" id="ph-ep">0</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-open-list" id="btn-open-list">OPEN LIST →</button>
        <button class="btn-new" id="btn-draft-story">✏ DRAFT STORY</button>
        <button class="btn-new" id="btn-start-epic2">▶ START EPIC</button>
      </div>
    </div>
    <div class="epic-list" id="epic-list"></div>
  </div>

  <!-- HISTORY -->
  <div class="tab-panel" id="panel-history">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">RUN HISTORY</span>
        <span class="panel-count" id="ph-hi">0</span>
      </div>
      <small style="color:var(--fg-muted);font-size:10px">Last 20 runs from <strong style="color:var(--fg-2)">.aidlc/runs/</strong></small>
    </div>
    <div class="history-list" id="history-list"></div>
  </div>

</div>

<!-- STORY MODAL -->
<div class="modal-overlay" id="story-modal" style="display:none">
  <div class="modal-box">
    <div class="modal-hdr">
      <span class="modal-title">DRAFT STORY</span>
      <button class="modal-close" id="modal-close">×</button>
    </div>
    <div class="modal-body">
      <label class="field-lbl">Title <span class="field-req">*</span></label>
      <input class="field-input" id="story-title" type="text" placeholder="As a user, I want to…" maxlength="120" />
      <label class="field-lbl">Description</label>
      <textarea class="field-textarea" id="story-desc" rows="4" placeholder="Context, motivation, background…"></textarea>
      <label class="field-lbl">Acceptance Criteria</label>
      <textarea class="field-textarea" id="story-ac" rows="4" placeholder="- Given… When… Then…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" id="modal-cancel">CANCEL</button>
      <button class="btn-start" id="modal-save">SAVE STORY</button>
    </div>
  </div>
</div>

<div class="page-footer">
  Edits sync to <strong style="color:var(--fg-2);margin:0 3px">.aidlc/workspace.yaml</strong>.
  <span class="footer-link" id="btn-open-file" style="margin-left:6px">Open file →</span>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

let agents = [], stories = [], board = null, yaml = null, history = [], logs = [];

const DEFAULT_SKILLS = ${JSON.stringify(DEFAULT_SKILLS)};

// ── Helpers ────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function shortDate(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleDateString([],{year:'numeric',month:'short',day:'numeric'}); } catch { return ts; }
}

function agentDisplay(name) { return (name||'').replace('developer-','').replace('developer','dev'); }

function modelTag(model) {
  if (!model) return '';
  const m = model.toLowerCase();
  const cls = m.includes('opus') ? 'tag-opus' : m.includes('haiku') ? 'tag-haiku' : 'tag-model';
  return '<span class="skill-tag ' + cls + '">' + esc(model.replace('claude-','').toUpperCase()) + '</span>';
}

// ── Tabs ───────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector('[data-tab="' + tab + '"]');
  const panel = document.getElementById('panel-' + tab);
  if (btn)   btn.classList.add('active');
  if (panel) panel.classList.add('active');
}

// ── Render Workflows ───────────────────────────────────────
function elapsedStr(startedAt, completedAt) {
  if (!startedAt || !completedAt) return '';
  try {
    const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (ms < 0) return '';
    const s = Math.round(ms / 1000);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  } catch { return ''; }
}

function renderWorkflows() {
  const container = document.getElementById('wf-list');
  const ph = document.getElementById('ph-wf');
  const tc = document.getElementById('tc-wf');

  // Use pipelines from workspace.yaml if available, else show the built-in default
  const pipelines = (yaml && yaml.pipelines && yaml.pipelines.length)
    ? yaml.pipelines
    : [{ id: 'sdlc-full', name: 'sdlc-full', onFailure: 'stop',
         steps: DEFAULT_SKILLS.map(s => s.name) }];

  if (ph) ph.textContent = pipelines.length;
  if (tc) tc.textContent = pipelines.length;

  // Build task lookup from board (keyed by task id = step name)
  const taskMap = {};
  if (board && board.tasks) {
    board.tasks.forEach(function(t) { taskMap[t.id] = t; });
  }

  container.innerHTML = pipelines.map(wf => {
    const steps = wf.steps || [];
    const isStop = (wf.onFailure || 'stop') === 'stop';
    const failureCls   = isStop ? 'on-stop' : 'on-continue';
    const failureLabel = 'ON_FAILURE: ' + (isStop ? 'STOP' : 'CONTINUE');

    // Progress counts
    let doneCount = 0;
    let activeTask = null;
    steps.forEach(function(step) {
      const t = taskMap[step];
      if (t) {
        if (t.status === 'done') doneCount++;
        if (t.status === 'in_progress' && !activeTask) activeTask = t;
      }
    });
    const totalCount = steps.length;
    const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

    // Latest log message for the active (in_progress) task
    let activeLogAgent = '';
    let activeLogMsg = '';
    if (activeTask && logs.length) {
      for (let i = logs.length - 1; i >= 0; i--) {
        if (logs[i].agent === activeTask.agent) {
          activeLogAgent = logs[i].agent;
          activeLogMsg   = logs[i].msg;
          break;
        }
      }
      // Fallback: last log entry regardless of agent
      if (!activeLogMsg) {
        activeLogAgent = logs[logs.length - 1].agent;
        activeLogMsg   = logs[logs.length - 1].msg;
      }
    }

    const stepsHtml = steps.map((step, i) => {
      const t = taskMap[step];
      const status  = t ? t.status : 'pending';
      const agent   = t ? t.agent  : '';
      const elapsed = t ? elapsedStr(t.started_at, t.completed_at) : '';

      let iconHtml = '';
      if (status === 'in_progress') {
        iconHtml = '<span class="step-status-icon spin">◌</span>';
      } else if (status === 'done') {
        iconHtml = '<span class="step-status-icon done">✓</span>';
      } else if (status === 'failed') {
        iconHtml = '<span class="step-status-icon failed">✗</span>';
      }

      const arrow = i < steps.length - 1 ? '<div class="step-arrow">→</div>' : '';
      return '<div class="step-box step-' + status + '">' +
        '<span class="step-box-num">' + (i + 1) + '</span>' +
        '<div class="step-box-inner">' +
          '<span class="step-box-name">' + esc(step) + '</span>' +
          (agent   ? '<span class="step-box-agent">'   + esc(agent)   + '</span>' : '') +
          (elapsed ? '<span class="step-box-elapsed">' + esc(elapsed) + '</span>' : '') +
        '</div>' +
        iconHtml +
      '</div>' + arrow;
    }).join('');

    const logStripHtml = activeLogMsg
      ? '<div class="wf-active-log">' +
          '<span class="log-agent-badge">' + esc(activeLogAgent) + '</span>' +
          '<span class="log-msg-text">' + esc(activeLogMsg) + '</span>' +
        '</div>'
      : '';

    return '<div class="wf-card">' +
      '<div class="wf-card-hdr">' +
        '<div class="wf-name-wrap">' +
          '<span class="wf-name">' + esc(wf.name || wf.id) + '</span>' +
          '<span class="wf-steps-count">' + steps.length + ' steps</span>' +
        '</div>' +
        '<div class="wf-card-actions">' +
          '<button class="btn-run-wf" data-id="' + esc(wf.id) + '">▶ RUN</button>' +
          '<button class="btn-on-failure ' + failureCls + '" data-id="' + esc(wf.id) + '" data-value="' + (isStop ? 'stop' : 'continue') + '">' + failureLabel + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="step-boxes-wrap"><div class="step-boxes">' + stepsHtml + '</div></div>' +
      logStripHtml +
      '<div class="wf-progress-wrap">' +
        '<div class="wf-progress-row">' +
          '<div class="wf-progress-bar"><div class="wf-progress-fill" style="width:' + progressPct + '%"></div></div>' +
        '</div>' +
        '<div class="wf-progress-label">' + doneCount + ' / ' + totalCount + ' steps done · ' + progressPct + '%</div>' +
      '</div>' +
    '</div>';
  }).join('');

  container.querySelectorAll('.btn-run-wf').forEach(btn => {
    btn.addEventListener('click', () => vscode.postMessage({ command: 'runWorkflow', workflowId: btn.dataset.id }));
  });

  container.querySelectorAll('.btn-on-failure').forEach(btn => {
    btn.addEventListener('click', () => {
      const cur = btn.dataset.value;
      const next = cur === 'stop' ? 'continue' : 'stop';
      btn.dataset.value = next;
      if (next === 'stop') {
        btn.classList.replace('on-continue','on-stop');
        btn.textContent = 'ON_FAILURE: STOP';
      } else {
        btn.classList.replace('on-stop','on-continue');
        btn.textContent = 'ON_FAILURE: CONTINUE';
      }
      vscode.postMessage({ command: 'toggleOnFailure', pipelineId: btn.dataset.id, onFailure: next });
    });
  });
}

// ── Render Agents ──────────────────────────────────────────
function renderAgents() {
  const grid    = document.getElementById('ag-proj-grid');
  const cnt     = document.getElementById('ag-proj-cnt');
  const ph      = document.getElementById('ph-ag');
  const tc      = document.getElementById('tc-ag');
  const aidlcGrid = document.getElementById('ag-aidlc-grid');
  const aidlcCnt  = document.getElementById('ag-aidlc-cnt');

  // AIDLC agents come from workspace.yaml agents list (or fall back to DEFAULT_SKILLS)
  const aidlcAgents = (yaml && yaml.agents && yaml.agents.length) ? yaml.agents : DEFAULT_SKILLS.map(s => ({ id: s.name, name: s.name, model: s.model, description: s.desc }));

  if (cnt)      cnt.textContent = agents.length;
  if (aidlcCnt) aidlcCnt.textContent = aidlcAgents.length;
  if (ph)       ph.textContent = agents.length + aidlcAgents.length;
  if (tc)       tc.textContent = agents.length + aidlcAgents.length;

  if (!agents.length) {
    grid.innerHTML = '<div class="group-empty">No agents in .claude/agents/ — click + ADD AGENT to create one.</div>';
  } else {
    grid.innerHTML = agents.map(a => {
      const shortPath = (a.filePath||'').split('.claude/').pop() || a.filePath || '';
      return '<div class="agent-card" data-fp="' + esc(a.filePath||'') + '">' +
        '<div class="card-top"><div class="card-name">' + esc(a.name) + '</div>' +
        '<span class="scope-badge scope-project">PROJECT</span></div>' +
        (a.description ? '<div class="card-desc">' + esc(a.description) + '</div>' : '') +
        '<div class="card-tags">' + (a.model ? modelTag(a.model) : '') + '</div>' +
        '<div class="card-path">.claude/' + esc(shortPath) + '</div>' +
      '</div>';
    }).join('');
    grid.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', () => vscode.postMessage({ command: 'openAgentFile', filePath: card.dataset.fp }));
    });
  }

  if (aidlcGrid) {
    aidlcGrid.innerHTML = aidlcAgents.map(a =>
      '<div class="agent-card">' +
        '<div class="card-top"><div class="card-name">' + esc(a.name || a.id) + '</div>' +
        '<span class="scope-badge scope-aidlc">AIDLC</span></div>' +
        (a.description ? '<div class="card-desc">' + esc(a.description) + '</div>' : '') +
        '<div class="card-tags">' + modelTag(a.model) + '</div>' +
        '<div class="card-footer"><button class="btn-run-step" data-step="' + esc(a.id || a.name) + '">▶ RUN</button></div>' +
      '</div>'
    ).join('');
    aidlcGrid.querySelectorAll('.btn-run-step').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); vscode.postMessage({ command: 'runStep', step: btn.dataset.step }); });
    });
  }
}

// ── Render Skills ──────────────────────────────────────────
function renderSkills() {
  const ph      = document.getElementById('ph-sk');
  const tc      = document.getElementById('tc-sk');
  const grid    = document.getElementById('sk-aidlc-grid');
  const cntEl   = document.getElementById('sk-aidlc-cnt');

  const skills = (yaml && yaml.agents && yaml.agents.length)
    ? yaml.agents.map(a => ({ name: a.id, desc: a.description || a.name, model: a.model }))
    : DEFAULT_SKILLS;

  if (ph)    ph.textContent = skills.length;
  if (tc)    tc.textContent = skills.length;
  if (cntEl) cntEl.textContent = skills.length;

  if (grid) {
    grid.innerHTML = skills.map(s =>
      '<div class="agent-card">' +
        '<div class="card-top"><div class="card-name">' + esc(s.name) + '</div>' +
        '<span class="scope-badge scope-aidlc">AIDLC</span></div>' +
        (s.desc ? '<div class="card-desc">' + esc(s.desc) + '</div>' : '') +
        '<div class="card-tags">' + modelTag(s.model) + '</div>' +
        '<div class="card-footer"><button class="btn-run-step" data-step="' + esc(s.name) + '">▶ RUN</button></div>' +
      '</div>'
    ).join('');
    grid.querySelectorAll('.btn-run-step').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); vscode.postMessage({ command: 'runStep', step: btn.dataset.step }); });
    });
  }
}

// ── Render Epics ───────────────────────────────────────────
function renderEpics() {
  const container = document.getElementById('epic-list');
  const ph = document.getElementById('ph-ep');
  const tc = document.getElementById('tc-ep');
  const epics = [];

  if (board) {
    const tasks = board.tasks || [];
    const done = tasks.filter(t => t.status === 'done').length;
    const hasActive  = tasks.some(t => t.status === 'in_progress');
    const hasFailed  = tasks.some(t => t.status === 'failed');
    let status = 'pending';
    if (hasActive)  status = 'in_progress';
    else if (hasFailed) status = 'failed';
    else if (tasks.length && done === tasks.length) status = 'done';
    epics.push({ id:'ACTIVE', title: board.feature||'(untitled)', status,
      steps: done + '/' + tasks.length, agent: tasks.length ? agentDisplay(tasks[0].agent) : 'pipeline',
      date: shortDate(board.created_at) });
  }

  const sorted = [...stories].sort((a,b) => {
    const da = a.saved_at ? new Date(a.saved_at).getTime() : 0;
    const db = b.saved_at ? new Date(b.saved_at).getTime() : 0;
    return db - da;
  });
  sorted.forEach((s,i) => {
    const num = String(sorted.length - i).padStart(3,'0');
    epics.push({ id:'EPIC-'+num, title: s.title||s.filename||'(untitled)',
      status:'pending', steps:'0/1', agent:'product-owner', date: shortDate(s.saved_at) });
  });

  if (ph) ph.textContent = epics.length;
  if (tc) tc.textContent = epics.length;

  if (!epics.length) {
    container.innerHTML = '<div style="padding:24px;color:var(--fg-muted);font-size:12px;text-align:center">No epics yet. Click ▶ START EPIC to begin.</div>';
    return;
  }

  container.innerHTML = epics.map(e =>
    '<div class="epic-row">' +
      '<div class="epic-row-top">' +
        '<span class="epic-row-id">' + esc(e.id) + '</span>' +
        '<span class="epic-row-title">' + esc(e.title) + '</span>' +
        '<span class="status-pill pill-' + e.status + '">' + e.status.replace('_',' ').toUpperCase() + '</span>' +
      '</div>' +
      '<div class="epic-row-meta">' +
        '<div class="meta-dot dot-' + e.status + '"></div>' +
        '<span>' + esc(e.steps) + ' steps</span><span class="meta-sep">·</span>' +
        '<span>agent: <strong style="color:var(--teal-txt)">' + esc(e.agent) + '</strong></span>' +
        '<span class="meta-sep">·</span><span>' + esc(e.date) + '</span>' +
      '</div>' +
    '</div>'
  ).join('');
}

// ── Render History ─────────────────────────────────────────
function renderHistory() {
  const container = document.getElementById('history-list');
  const ph = document.getElementById('ph-hi');
  const tc = document.getElementById('tc-hi');

  if (ph) ph.textContent = history.length;
  if (tc) tc.textContent = history.length;

  if (!history.length) {
    container.innerHTML = '<div class="history-empty">No previous runs yet. Start an epic to create history.</div>';
    return;
  }

  container.innerHTML = history.map(h =>
    '<div class="history-row">' +
      '<span class="history-ts">' + esc(h.timestamp) + '</span>' +
      '<span class="history-preview">' + esc(h.preview) + '</span>' +
      '<button class="btn-rerun" data-filename="' + esc(h.filename) + '">↺ RE-RUN</button>' +
    '</div>'
  ).join('');

  container.querySelectorAll('.btn-rerun').forEach(btn => {
    btn.addEventListener('click', () => vscode.postMessage({ command: 'reRunHistory', historyFilename: btn.dataset.filename }));
  });
}

// ── Buttons ────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click',    () => vscode.postMessage({ command: 'runPipeline' }));
document.getElementById('btn-cancel').addEventListener('click',   () => vscode.postMessage({ command: 'cancelPipeline' }));
document.getElementById('btn-start-epic2')?.addEventListener('click', () => vscode.postMessage({ command: 'runPipeline' }));
document.getElementById('btn-continue').addEventListener('click', () => vscode.postMessage({ command: 'continuePipeline' }));
document.getElementById('btn-review').addEventListener('click',   () => vscode.postMessage({ command: 'reviewCurrentWork' }));
document.getElementById('btn-open-list').addEventListener('click',() => vscode.postMessage({ command: 'openEpics' }));
document.getElementById('btn-yaml').addEventListener('click',     () => vscode.postMessage({ command: 'openYaml' }));
document.getElementById('btn-cli').addEventListener('click',      () => vscode.postMessage({ command: 'claudeCli' }));
document.getElementById('btn-open-file').addEventListener('click',() => vscode.postMessage({ command: 'openYaml' }));
document.getElementById('btn-load').addEventListener('click',     () => vscode.postMessage({ command: 'importAidlcTemplate' }));
document.getElementById('btn-switch').addEventListener('click',   () => vscode.postMessage({ command: 'switchProject' }));
document.getElementById('btn-save').addEventListener('click',     () => vscode.postMessage({ command: 'saveTemplate' }));
document.getElementById('btn-add-agent').addEventListener('click',() => vscode.postMessage({ command: 'openAgentsFolder' }));
document.getElementById('btn-add-skill').addEventListener('click',() => vscode.postMessage({ command: 'openSkillsFolder' }));

// ── Story Modal ────────────────────────────────────────────
function openStoryModal() {
  ['story-title','story-desc','story-ac'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('story-modal').style.display = 'flex';
  document.getElementById('story-title').focus();
}
function closeStoryModal() { document.getElementById('story-modal').style.display = 'none'; }

document.getElementById('btn-draft-story')?.addEventListener('click', openStoryModal);
document.getElementById('modal-close').addEventListener('click', closeStoryModal);
document.getElementById('modal-cancel').addEventListener('click', closeStoryModal);
document.getElementById('story-modal').addEventListener('click', e => { if (e.target === document.getElementById('story-modal')) closeStoryModal(); });
document.getElementById('modal-save').addEventListener('click', () => {
  const title = document.getElementById('story-title').value.trim();
  if (!title) { document.getElementById('story-title').focus(); return; }
  const btn = document.getElementById('modal-save');
  btn.textContent = 'SAVING…'; btn.disabled = true;
  vscode.postMessage({ command: 'saveNewStory', title,
    description: document.getElementById('story-desc').value,
    acceptanceCriteria: document.getElementById('story-ac').value });
});

// ── Message handler ────────────────────────────────────────
window.addEventListener('message', ev => {
  const msg = ev.data;
  switch (msg.command) {
    case 'init':
      agents  = msg.agents  || [];
      stories = msg.stories || [];
      board   = msg.board   || null;
      yaml    = msg.yaml    || null;
      history = msg.history || [];
      logs    = msg.logs    || [];
      renderWorkflows(); renderAgents(); renderSkills(); renderEpics(); renderHistory();
      break;
    case 'switchTab':
      if (msg.tab) switchTab(msg.tab);
      break;
    case 'storyCreated':
      closeStoryModal();
      break;
  }
});
</script>
</body>
</html>`;
  }
}
