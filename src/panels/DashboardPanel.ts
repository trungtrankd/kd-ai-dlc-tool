import * as vscode from 'vscode';
import * as path from 'path';
import { readTaskBoard } from '../data/taskBoardReader';
import { readAgents } from '../data/agentReader';
import { listStories, readStory, deleteStory } from '../data/storyLibrary';
import { readLogEntries } from '../data/logReader';
import { runPipeline } from '../commands/runPipeline';
import { buildStoryFilePipelinePrompt } from '../utils/aidlcPrompts';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { getNonce } from '../utils/getNonce';

export class DashboardPanel {
  static current: DashboardPanel | undefined;
  private static _logOffset = 0;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _workspaceRoot: string;
  private _statusBar: PipelineStatusBar | undefined;
  private _pendingExpandId: string | undefined;

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
      filename?: string;
      filePath?: string;
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
      { enableScripts: true, retainContextWhenHidden: true },
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
    const nonce = getNonce();
    const workspaceName = path.basename(this._workspaceRoot);
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIDLC Epics</title>
<style nonce="${nonce}">
/* ── Reset & root ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { height: 100vh; }
html, body { min-height: 0; }

:root {
  --bg:       #0b1219;
  --bg2:      #111a23;
  --bg3:      #0d1520;
  --bg-dark:  #080f18;
  --border:   #1a2c3d;
  --border-l: #243444;
  --teal:     #00b4a4;
  --teal-dim: rgba(0,180,164,0.13);
  --teal-bdr: rgba(0,180,164,0.3);
  --teal-btn: #0a5f56;
  --teal-h:   #0d7a6e;
  --teal-txt: #00c8b6;
  --green:    #22c55e;
  --green-dim:rgba(34,197,94,0.12);
  --red:      #ef4444;
  --red-dim:  rgba(239,68,68,0.12);
  --yellow:   #eab308;
  --yellow-dim:rgba(234,179,8,0.12);
  --fg:       #c8d8e8;
  --fg-muted: #4a6a84;
  --fg-dim:   #233040;
  --font:     -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:"SF Mono","Fira Code",Menlo,monospace;
  --r:        6px;
}

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--fg);
  font-size: 12px;
  line-height: 1.5;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Main header ── */
.hdr {
  padding: 12px 20px 10px;
  background: #090f18;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.hdr-left { display: flex; flex-direction: column; }

.hdr-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: 0.01em;
}

.hdr-sub { font-size: 11px; color: var(--fg-muted); margin-top: 1px; }

.hdr-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.project-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--bg2);
  border: 1px solid var(--border-l);
  border-radius: 20px;
  font-size: 11px;
}
.chip-label { color: var(--fg-muted); font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; }
.chip-val { color: var(--fg); font-weight: 600; }

.btn-outline-sm {
  padding: 5px 12px;
  background: transparent;
  color: var(--fg-muted);
  border: 1px solid var(--border-l);
  border-radius: var(--r);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  font-family: var(--font);
  transition: all 0.12s;
}
.btn-outline-sm:hover { background: var(--bg2); color: var(--fg); }

.btn-teal {
  padding: 5px 13px;
  background: var(--teal-btn);
  color: #9ef0e7;
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  font-family: var(--font);
  transition: background 0.12s;
}
.btn-teal:hover { background: var(--teal-h); }

/* ── Filter bar ── */
.filter-bar {
  padding: 8px 20px;
  background: #090f18;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  overflow-x: auto;
}

.f-btn {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  color: var(--fg-muted);
  font-family: var(--font);
  transition: all 0.12s;
  display: flex;
  align-items: center;
  gap: 5px;
}
.f-btn:hover { background: var(--bg2); color: var(--fg); }
.f-btn.active { background: var(--teal-dim); border-color: var(--teal-bdr); color: var(--teal-txt); }

.f-count {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 10px;
  background: var(--bg2);
  color: var(--fg-muted);
}
.f-btn.active .f-count { background: rgba(0,180,164,0.2); color: var(--teal-txt); }

/* ── Epic list ── */
.epic-list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  padding: 12px 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-gutter: stable;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 70px 24px;
  color: var(--fg-muted);
  text-align: center;
  gap: 10px;
}
.empty-icon { font-size: 36px; opacity: 0.25; }
.empty-icon::before { content: "AIDLC"; font-size: 18px; font-weight: 700; letter-spacing: 0.08em; }
.empty-text { font-size: 13px; line-height: 1.6; }

/* ── Epic card ── */
.epic-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  transition: border-color 0.12s;
}
.epic-card:hover { border-color: var(--border-l); }
.epic-card.is-active { border-color: rgba(0,180,164,0.28); }

.card-hdr {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 9px 14px;
  cursor: pointer;
  user-select: none;
}
.card-hdr:hover { background: rgba(255,255,255,0.018); }

.epic-id {
  font-size: 12px;
  font-weight: 700;
  color: var(--teal-txt);
  font-family: var(--font-mono);
  flex-shrink: 0;
}
.epic-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg);
  white-space: normal;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.35;
}

.pct-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  background: var(--teal-dim);
  border: 1px solid var(--teal-bdr);
  color: var(--teal-txt);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
}
.s-pending    { background: rgba(74,106,132,0.18); color: var(--fg-muted); border: 1px solid rgba(74,106,132,0.28); }
.s-in_progress { background: var(--teal-dim); color: var(--teal-txt); border: 1px solid var(--teal-bdr); }
.s-done       { background: var(--green-dim); color: var(--green); border: 1px solid rgba(34,197,94,0.28); }
.s-failed     { background: var(--red-dim); color: var(--red); border: 1px solid rgba(239,68,68,0.28); }
.s-blocked    { background: var(--yellow-dim); color: var(--yellow); border: 1px solid rgba(234,179,8,0.28); }

.expand-icon { color: var(--fg-muted); font-size: 11px; flex-shrink: 0; transition: transform 0.18s; }
.expand-icon.open { transform: rotate(90deg); }

.btn-hdr-run {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  padding: 3px 10px; border-radius: 3px; flex-shrink: 0;
  background: var(--teal-btn); border: 1px solid var(--teal-bdr);
  color: var(--teal-txt); cursor: pointer; transition: background 0.12s;
}
.btn-hdr-run:hover { background: var(--teal-h); }
.btn-hdr-state {
  font-size: 9px; font-weight: 700; letter-spacing: 0.05em;
  padding: 3px 8px; border-radius: 3px; flex-shrink: 0;
  background: transparent; border: 1px solid var(--border-l);
  color: var(--fg-muted); cursor: pointer;
}
.btn-hdr-state:hover { color: var(--fg); border-color: var(--fg-muted); }

/* ── Card body ── */
.card-body { display: none; padding: 0 14px 12px; border-top: 1px solid var(--border); background: var(--bg3); }
.card-body.open { display: block; }

.epic-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding: 9px 0 10px;
  font-size: 11px;
  color: var(--fg-muted);
}
.meta-val { color: var(--fg); font-weight: 500; }

/* ── Step diagram ── */
.step-diagram {
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 12px 14px;
  margin-bottom: 10px;
  overflow-x: auto;
}

.step-flow { display: flex; align-items: center; min-width: max-content; }

.step-group { display: flex; flex-direction: column; align-items: center; gap: 5px; }

.step-circle {
  width: 38px; height: 38px;
  border-radius: 50%;
  border: 2px solid var(--border-l);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-mono);
}
.sc-pending    { border-color: #2a4050; color: var(--fg-muted); background: var(--bg-dark); }
.sc-in_progress {
  border-color: var(--teal);
  color: var(--teal-txt);
  background: var(--teal-dim);
  box-shadow: 0 0 14px rgba(0,180,164,0.22);
  animation: pulse 2s infinite;
}
.sc-done    { border-color: var(--green); color: var(--green); background: var(--green-dim); }
.sc-failed  { border-color: var(--red); color: var(--red); background: var(--red-dim); }
.sc-blocked { border-color: var(--yellow); color: var(--yellow); background: var(--yellow-dim); }

@keyframes pulse {
  0%,100% { box-shadow: 0 0 8px rgba(0,180,164,0.2); }
  50%      { box-shadow: 0 0 20px rgba(0,180,164,0.45); }
}

.step-lbl {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--fg-muted);
  text-align: center;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-line {
  width: 34px; height: 2px;
  margin: 0 4px;
  margin-bottom: 22px;
  flex-shrink: 0;
  background: linear-gradient(90deg, var(--border-l), var(--border));
}
.sl-done   { background: linear-gradient(90deg, var(--green), rgba(34,197,94,0.25)); }
.sl-active { background: linear-gradient(90deg, var(--teal), rgba(0,180,164,0.2)); }

/* ── Step details ── */
.step-details { display: flex; flex-direction: column; gap: 8px; }

.step-row {
  background: var(--bg-dark);
  border: 1px solid var(--border);
  border-radius: var(--r);
}

.step-row-hdr {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding: 7px 10px;
  background: #0c1720;
  border-bottom: 1px solid var(--border);
}
.step-num  { font-size: 9px; color: var(--fg-muted); font-weight: 700; letter-spacing: 0.06em; }
.step-name { flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--fg); font-family: var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.step-io { padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; }

.io-row { display: flex; align-items: flex-start; gap: 10px; font-size: 11px; }

.io-lbl {
  width: 64px;
  flex-shrink: 0;
  color: var(--fg-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 3px;
}
.io-val  { color: var(--fg); flex: 1; line-height: 1.5; font-size: 11px; }
.io-val.dim { color: var(--fg-dim); }

.pending-note {
  color: var(--fg-muted);
  font-size: 11px;
}

.io-artifact {
  flex: 1;
  background: #0c1720;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 8px;
  color: var(--fg-muted);
  font-size: 11px;
  font-family: var(--font-mono);
  outline: none;
}

/* ── Epic actions ── */
.epic-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.btn-action {
  padding: 5px 12px;
  background: #0c1720;
  border: 1px solid var(--border-l);
  border-radius: var(--r);
  color: var(--fg-muted);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  font-family: var(--font);
  transition: all 0.12s;
}
.btn-action:hover { background: var(--bg2); color: var(--fg); }
.btn-action.btn-run { background: var(--teal-btn); color: #9ef0e7; border-color: var(--teal-bdr); }
.btn-action.btn-run:hover { background: var(--teal-h); }
.btn-action.btn-del:hover { background: var(--red-dim); color: var(--red); border-color: rgba(239,68,68,0.35); }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-l); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #2a4050; }

@media (max-width: 640px) {
  .hdr { padding: 10px 12px; align-items: flex-start; }
  .hdr-right { width: 100%; justify-content: flex-start; }
  .filter-bar { padding: 8px 12px; }
  .epic-list { padding: 10px 12px 16px; }
  .project-chip { max-width: 100%; }
  .chip-val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .card-hdr { align-items: flex-start; gap: 8px; }
  .pct-badge { display: none; }
  .status-badge { margin-left: auto; }
  .step-flow { min-width: 0; }
  .step-line { width: 24px; }
  .io-row { flex-direction: column; gap: 2px; }
  .io-lbl { width: auto; }
}
</style>
</head>
<body>

<!-- Header -->
<div class="hdr">
  <div class="hdr-left">
    <div class="hdr-title">AIDLC Epics</div>
    <div class="hdr-sub">Workflow runs · progress · inputs</div>
  </div>
  <div class="hdr-right">
    <div class="project-chip">
      <span class="chip-label">PROJECT</span>
      <span class="chip-val">${workspaceName}</span>
    </div>
    <button class="btn-outline-sm" id="btn-open-builder">OPEN BUILDER</button>
    <button class="btn-teal" id="btn-start">+ START EPIC</button>
  </div>
</div>

<!-- Filter bar -->
<div class="filter-bar">
  <button class="f-btn active" data-f="all">All <span class="f-count" id="fc-all">0</span></button>
  <button class="f-btn" data-f="in_progress">In progress <span class="f-count" id="fc-in_progress">0</span></button>
  <button class="f-btn" data-f="pending">Pending <span class="f-count" id="fc-pending">0</span></button>
  <button class="f-btn" data-f="done">Done <span class="f-count" id="fc-done">0</span></button>
  <button class="f-btn" data-f="failed">Failed <span class="f-count" id="fc-failed">0</span></button>
</div>

<!-- Epic list -->
<div class="epic-list" id="epic-list">
  <div class="empty-state" id="empty-state">
    <div class="empty-icon" aria-hidden="true"></div>
    <div class="empty-text">No epics yet.<br>Click <strong>+ START EPIC</strong> to run your first pipeline.</div>
  </div>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────────
let board = null, agents = [], stories = [], entries = [];
let filter = 'all';
const expanded = new Set();

// ── Helpers ────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function shortDate(ts) {
  if (!ts) { return '—'; }
  try { return new Date(ts).toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' }); }
  catch { return ts; }
}

function agentShort(name) { return (name||'').replace('developer-','').replace('developer','dev').toUpperCase().slice(0,8); }
function agentDisplay(name) { return (name||'').replace('developer-','').replace('developer','dev'); }

function boardStatus() {
  if (!board) { return 'pending'; }
  const tasks = board.tasks || [];
  if (tasks.some(t => t.status === 'in_progress')) { return 'in_progress'; }
  if (tasks.some(t => t.status === 'failed'))      { return 'failed'; }
  if (tasks.length && tasks.every(t => t.status === 'done')) { return 'done'; }
  return 'pending';
}

// ── Compute epics list ─────────────────────────────────────
function computeEpics() {
  const list = [];

  if (board) {
    const tasks = board.tasks || [];
    const done  = tasks.filter(t => t.status === 'done').length;
    list.push({
      id: 'ACTIVE', displayId: 'ACTIVE',
      title: board.feature || '(untitled)',
      type: 'board', status: boardStatus(),
      pct: tasks.length ? Math.round(done / tasks.length * 100) : 0,
      stepsDone: done, stepsTotal: tasks.length,
      startedAt: board.created_at, tasks, filename: null,
    });
  }

  const sorted = [...stories].sort((a, b) => {
    const da = a.saved_at ? new Date(a.saved_at).getTime() : 0;
    const db = b.saved_at ? new Date(b.saved_at).getTime() : 0;
    return db - da;
  });

  sorted.forEach((s, i) => {
    const num = String(sorted.length - i).padStart(3, '0');
    list.push({
      id: 'EPIC-' + num, displayId: 'EPIC-' + num,
      title: s.title || s.filename || '(untitled)',
      type: 'story', status: 'pending', pct: 0,
      stepsDone: 0, stepsTotal: 9,
      startedAt: s.saved_at, tasks: [],
      filename: s.filename, preview: s.preview,
    });
  });

  return list;
}

// ── Filter counts ──────────────────────────────────────────
function updateCounts(epics) {
  const c = { all: 0, in_progress: 0, pending: 0, done: 0, failed: 0 };
  for (const e of epics) {
    c.all++;
    if (c[e.status] !== undefined) { c[e.status]++; }
  }
  for (const k of Object.keys(c)) {
    const el = document.getElementById('fc-' + k);
    if (el) { el.textContent = c[k]; }
  }
}

// ── Step diagram ───────────────────────────────────────────
const AIDLC_PLACEHOLDER_NODES = [
  'PLAN','DESIGN','TEST-PLAN','IMPL','REVIEW','EXEC','RELEASE','MONITOR','DOC-SYNC',
];

function buildDiagram(epic) {
  const nodes = epic.tasks.length
    ? epic.tasks.map((t, i) => ({ num: i + 1, name: agentShort(t.agent), status: t.status }))
    : AIDLC_PLACEHOLDER_NODES.map((name, i) => ({ num: i + 1, name, status: 'pending' }));

  let html = '<div class="step-flow">';
  nodes.forEach((n, i) => {
    html += '<div class="step-group">' +
      '<div class="step-circle sc-' + n.status + '">' + n.num + '</div>' +
      '<div class="step-lbl">' + esc(n.name) + '</div>' +
    '</div>';
    if (i < nodes.length - 1) {
      const cls = n.status === 'done' ? 'sl-done' : (n.status === 'in_progress' ? 'sl-active' : '');
      html += '<div class="step-line ' + cls + '"></div>';
    }
  });
  html += '</div>';
  return html;
}

// ── Step detail rows ───────────────────────────────────────
function buildStepDetails(epic) {
  const tasks = epic.tasks.length ? epic.tasks : [
    { id: 'S1', agent: 'plan',         task: 'Write PRD — user stories, acceptance criteria, metrics', status: 'pending', depends_on: [], output: null },
    { id: 'S2', agent: 'design',       task: 'Architecture, API contracts, file impact list',          status: 'pending', depends_on: [], output: null },
    { id: 'S3', agent: 'test-plan',    task: 'Unit / integration / UI test cases and device matrix',   status: 'pending', depends_on: [], output: null },
    { id: 'S4', agent: 'implement',    task: 'Code + unit tests on feature branch, PR opened',         status: 'pending', depends_on: [], output: null },
    { id: 'S5', agent: 'review',       task: 'Diff review vs PRD + tech design, verdict',              status: 'pending', depends_on: [], output: null },
    { id: 'S6', agent: 'execute-test', task: 'Run test plan, produce execution report',                status: 'pending', depends_on: [], output: null },
    { id: 'S7', agent: 'release',      task: 'Cut version tag, write changelog',                       status: 'pending', depends_on: [], output: null },
    { id: 'S8', agent: 'monitor',      task: 'Watch production — crashes, analytics, health report',   status: 'pending', depends_on: [], output: null },
    { id: 'S9', agent: 'doc-sync',     task: 'Reverse-sync docs to match what was actually built',     status: 'pending', depends_on: [], output: null },
  ];

  return tasks.map((t, i) => {
    const out = t.output ? t.output.slice(0, 180) + (t.output.length > 180 ? '…' : '') : null;
    const artifacts = t.depends_on && t.depends_on.length ? t.depends_on.join(', ') : null;
    const outputRow = out
      ? '<div class="io-row"><span class="io-lbl">OUTPUT</span><span class="io-val">' + esc(out) + '</span></div>'
      : '<div class="io-row"><span class="io-lbl">STATUS</span><span class="pending-note">Waiting for this agent to produce an output.</span></div>';
    const artifactRow = artifacts
      ? '<div class="io-row"><span class="io-lbl">ARTIFACT</span><input class="io-artifact" readonly value="' + esc(artifacts) + '"></div>'
      : '';
    return '<div class="step-row">' +
      '<div class="step-row-hdr">' +
        '<span class="step-num">STEP ' + (i + 1) + '/' + tasks.length + '</span>' +
        '<span class="step-name">' + esc(agentDisplay(t.agent)) + '</span>' +
        '<span class="status-badge s-' + t.status + '">' + t.status.replace('_',' ').toUpperCase() + '</span>' +
      '</div>' +
      '<div class="step-io">' +
        '<div class="io-row"><span class="io-lbl">INPUT</span>' +
          '<span class="io-val ' + (t.task ? '' : 'dim') + '">' + esc(t.task ? t.task.slice(0,120) : '—') + '</span></div>' +
        outputRow +
        artifactRow +
      '</div>' +
    '</div>';
  }).join('');
}

// ── Build epic card body HTML ──────────────────────────────
function buildCardBody(epic) {
  const agentName = epic.tasks.length ? agentDisplay(epic.tasks[0].agent) : 'plan';

  // Buttons use data attributes — onclick not allowed by CSP; listeners wired in render()
  const actions = epic.type === 'story' && epic.filename
    ? '<button class="btn-action btn-del" data-action="del" data-fn="' + esc(epic.filename) + '">Delete</button>'
    : epic.type === 'board'
    ? '<button class="btn-action" data-action="state">OPEN STATE.JSON</button>'
    : '';

  return '<div class="epic-meta">' +
    'Agent: <span class="meta-val">' + esc(agentName) + '</span>' +
    ' · <span class="meta-val">' + epic.stepsDone + '/' + epic.stepsTotal + '</span> steps done' +
    (epic.startedAt ? ' · Started <span class="meta-val">' + shortDate(epic.startedAt) + '</span>' : '') +
  '</div>' +
  '<div class="step-diagram">' + buildDiagram(epic) + '</div>' +
  '<div class="step-details">' + buildStepDetails(epic) + '</div>' +
  '<div class="epic-actions">' + actions + '</div>';
}

// ── Render all epics ───────────────────────────────────────
function render() {
  const all = computeEpics();
  updateCounts(all);

  const vis = filter === 'all' ? all : all.filter(e => e.status === filter);

  const container = document.getElementById('epic-list');
  document.getElementById('empty-state').style.display = vis.length ? 'none' : '';

  // Remove old cards
  container.querySelectorAll('.epic-card').forEach(el => el.remove());
  if (!vis.length) { return; }

  const frag = document.createDocumentFragment();
  for (const epic of vis) {
    const isOpen = expanded.has(epic.id);
    const card = document.createElement('div');
    card.className = 'epic-card' + (epic.type === 'board' ? ' is-active' : '');
    card.id = 'card-' + epic.id;
    const runBtn = epic.type === 'story' && epic.filename
      ? '<button class="btn-hdr-run" data-fn="' + esc(epic.filename) + '">▶ RUN</button>'
      : epic.type === 'board'
      ? '<button class="btn-hdr-state" onclick="event.stopPropagation();openState()">STATE.JSON</button>'
      : '';

    card.innerHTML =
      '<div class="card-hdr" data-id="' + epic.id + '">' +
        '<span class="epic-id">' + esc(epic.displayId) + '</span>' +
        '<span class="epic-title">' + esc(epic.title) + '</span>' +
        '<span class="pct-badge">' + epic.pct + '%</span>' +
        '<span class="status-badge s-' + epic.status + '">' + epic.status.replace('_',' ').toUpperCase() + '</span>' +
        runBtn +
        '<span class="expand-icon' + (isOpen ? ' open' : '') + '">▸</span>' +
      '</div>' +
      '<div class="card-body' + (isOpen ? ' open' : '') + '" id="body-' + epic.id + '">' +
        (isOpen ? buildCardBody(epic) : '') +
      '</div>';

    card.querySelector('.card-hdr').addEventListener('click', () => toggleCard(epic.id, epic));

    const runBtnEl = card.querySelector('.btn-hdr-run');
    if (runBtnEl) {
      runBtnEl.addEventListener('click', e => {
        e.stopPropagation();
        runStory(runBtnEl.dataset.fn);
      });
    }

    // Wire card-body action buttons (onclick blocked by CSP; use listeners instead)
    card.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) { return; }
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'del')   { delEpic(btn.dataset.fn); }
      if (action === 'state') { openState(); }
    });

    frag.appendChild(card);
  }
  container.appendChild(frag);
}

function toggleCard(id, epic) {
  if (expanded.has(id)) {
    expanded.delete(id);
    const body = document.getElementById('body-' + id);
    const icon = document.querySelector('#card-' + id + ' .expand-icon');
    if (body) { body.classList.remove('open'); body.innerHTML = ''; }
    if (icon) { icon.classList.remove('open'); }
  } else {
    expanded.clear();
    expanded.add(id);
    render();
    const body = document.getElementById('body-' + id);
    const icon = document.querySelector('#card-' + id + ' .expand-icon');
    if (body) { body.innerHTML = buildCardBody(epic); body.classList.add('open'); }
    if (icon) { icon.classList.add('open'); }
    setTimeout(() => scrollCardIntoView(id), 50);
  }
}

function scrollCardIntoView(id) {
  const container = document.getElementById('epic-list');
  const card = document.getElementById('card-' + id);
  if (!container || !card) { return; }

  const top = card.offsetTop - container.offsetTop;
  const bottom = top + card.offsetHeight;
  const visibleTop = container.scrollTop;
  const visibleBottom = visibleTop + container.clientHeight;

  if (top < visibleTop || bottom > visibleBottom) {
    container.scrollTo({
      top: Math.max(0, top - 8),
      behavior: 'smooth',
    });
  }
}

// ── Actions ────────────────────────────────────────────────
function runStory(fn) { vscode.postMessage({ command: 'runStory', filename: fn }); }
function delEpic(fn) { vscode.postMessage({ command: 'deleteStory', filename: fn }); }
function openState() { vscode.postMessage({ command: 'openStateJson' }); }

// ── Filter buttons ─────────────────────────────────────────
document.querySelectorAll('.f-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.f-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filter = btn.dataset.f;
    render();
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  vscode.postMessage({ command: 'runPipeline' });
});
document.getElementById('btn-open-builder').addEventListener('click', () => {
  vscode.postMessage({ command: 'openBuilder' });
});

// ── Message handler ────────────────────────────────────────
window.addEventListener('message', ev => {
  const msg = ev.data;
  switch (msg.command) {
    case 'updateBoard':
      board = msg.board;
      render();
      break;
    case 'updateAgents':
      agents = msg.agents || [];
      break;
    case 'updateStories':
      stories = msg.stories || [];
      render();
      break;
    case 'setEntries':
      entries = msg.entries || [];
      break;
    case 'appendEntries':
      entries.push(...(msg.entries || []));
      break;
    case 'expandEpic': {
      const id = msg.id;
      if (!id) { break; }
      const all = computeEpics();
      const epic = all.find(e => e.id === id);
      if (epic && !expanded.has(id)) {
        expanded.add(id);
        render();
        setTimeout(() => scrollCardIntoView(id), 100);
      }
      break;
    }
  }
});
</script>
</body>
</html>`;
  }
}
