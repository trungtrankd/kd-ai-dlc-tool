import * as vscode from 'vscode';
import * as path from 'path';
import { readTaskBoard } from '../data/taskBoardReader';
import { readAgents } from '../data/agentReader';
import { listStories } from '../data/storyLibrary';
import { readLogEntries } from '../data/logReader';
import { getNonce } from '../utils/getNonce';

const EXTENSION_VERSION = '0.8.5';
const AIDLC_SKILL_COUNT = 9;
const AIDLC_WORKFLOW_COUNT = 1;

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
      localResourceRoots: [this._extensionUri],
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
    const nonce = getNonce();
    const workspaceName = path.basename(this._workspaceRoot);
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>AIDLC Workspace</title>
<style nonce="${nonce}">
/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:         #060d14;
  --bg2:        #0a1620;
  --bg3:        #0c1a27;
  --border:     #1a2c3d;
  --border-l:   #243444;
  --teal:       #00b4a4;
  --teal-dim:   rgba(0,180,164,0.14);
  --teal-bdr:   rgba(0,180,164,0.32);
  --teal-btn:   #0a5f56;
  --teal-btn-h: #0d7a6e;
  --teal-txt:   #00c8b6;
  --green:      #22c55e;
  --red:        #ef4444;
  --yellow:     #eab308;
  --fg:         #c8d8e8;
  --fg-muted:   #4a6a84;
  --fg-dim:     #233040;
  --font:       -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono:  "SF Mono", "Fira Code", Menlo, monospace;
  --r:          5px;
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
  overflow-x: hidden;
}

/* ── Header ── */
.sb-header {
  padding: 12px 10px 8px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.logo-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  width: 30px; height: 30px;
  background: var(--teal-btn);
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  flex-shrink: 0;
}

.logo-name {
  font-size: 11px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: 0.06em;
  line-height: 1.2;
}

.logo-sub {
  font-size: 9px;
  color: var(--fg-muted);
  letter-spacing: 0.02em;
}

/* ── Body ── */
.body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 4px;
}

/* ── Workspace chip ── */
.ws-chip {
  background: var(--bg2);
  border: 1px solid var(--border-l);
  border-radius: var(--r);
  padding: 6px 9px;
}

.ws-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}

.ws-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg);
}

.ws-icons {
  display: flex;
  gap: 7px;
  font-size: 11px;
  color: var(--fg-muted);
}

.ws-link {
  font-size: 10px;
  color: var(--fg-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 3px;
}
.ws-link:hover { color: var(--teal-txt); }

/* ── START EPIC button ── */
.btn-epic {
  width: 100%;
  padding: 8px 12px;
  background: var(--teal-btn);
  color: #9ef0e7;
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-family: var(--font);
  transition: background 0.12s;
}
.btn-epic:hover { background: var(--teal-btn-h); }
.btn-epic .arr { color: var(--teal-txt); font-size: 13px; }

/* ── Stats ── */
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
  gap: 1px;
  background: var(--border);
}

.stat {
  background: var(--bg2);
  padding: 7px 2px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
}

.stat-n {
  font-size: 15px;
  font-weight: 700;
  color: var(--teal-txt);
  font-family: var(--font-mono);
  line-height: 1;
}

.stat-l {
  font-size: 7px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

/* ── Section ── */
.section { margin-top: 2px; }

.sec-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 2px 3px;
}

.sec-title {
  font-size: 8px;
  font-weight: 700;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  display: flex;
  align-items: center;
  gap: 5px;
}

.sec-title::before {
  content: '';
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--fg-dim);
  display: inline-block;
}

.sec-action {
  font-size: 9px;
  color: var(--teal-txt);
  cursor: pointer;
  opacity: 0.75;
}
.sec-action:hover { opacity: 1; }

/* ── Run item ── */
.run-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 9px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  cursor: pointer;
  transition: background 0.1s;
}
.run-item:hover { background: var(--bg3); border-color: var(--border-l); }
.run-stack { display: flex; flex-direction: column; gap: 4px; }
.run-primary { border-color: var(--teal-bdr); background: var(--teal-dim); }
.run-primary .run-label { color: var(--teal-txt); font-weight: 700; }
.run-secondary .run-label { color: var(--fg-2); }

.run-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--fg);
}
.run-arr { font-size: 11px; color: var(--fg-muted); }

/* ── Epic items ── */
.epic-items { display: flex; flex-direction: column; gap: 1px; }

.epic-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}
.epic-item:hover { background: rgba(0,180,164,0.07); }

.epic-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-pending    { background: var(--fg-muted); }
.dot-in_progress { background: var(--teal); box-shadow: 0 0 5px var(--teal); }
.dot-done       { background: var(--green); }
.dot-failed     { background: var(--red); }

.epic-id {
  font-size: 11px;
  font-weight: 600;
  color: var(--teal-txt);
  font-family: var(--font-mono);
}

/* ── Workflow item ── */
.wf-item {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 8px 9px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
}

.wf-icon { color: var(--teal-txt); font-size: 11px; flex-shrink: 0; margin-top: 2px; }
.wf-name { font-size: 11px; font-weight: 600; color: var(--fg); margin-bottom: 2px; }
.wf-desc { font-size: 9px; color: var(--fg-muted); }

.slash-list { display: flex; flex-direction: column; gap: 4px; }
.slash-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 26px;
  padding: 5px 9px;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  color: var(--fg-muted);
  font-size: 10px;
}
.slash-cmd {
  color: var(--teal-txt);
  font-family: var(--font-mono);
  font-weight: 700;
}
.slash-agent {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Common label ── */
.common-label {
  font-size: 9px;
  color: var(--fg-dim);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 6px 2px 2px;
}

/* ── Activity log ── */
.log-panel {
  border-top: 1px solid var(--border);
  padding: 5px 8px;
  max-height: 140px;
  overflow-y: auto;
  flex-shrink: 0;
}

.log-hdr {
  font-size: 8px;
  font-weight: 700;
  color: var(--fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.log-hdr::before { content: ''; width: 4px; height: 4px; border-radius: 50%; background: var(--fg-dim); display: inline-block; }

.log-row {
  display: flex;
  gap: 5px;
  padding: 2px 0;
  font-size: 9px;
  border-bottom: 1px solid rgba(26,44,61,0.5);
  animation: fi 0.2s ease;
}
@keyframes fi { from { opacity: 0; } to { opacity: 1; } }

.log-t  { color: var(--fg-dim); font-family: var(--font-mono); white-space: nowrap; }
.log-a  { font-size: 8px; padding: 1px 4px; border-radius: 8px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
.log-m  { color: var(--fg-muted); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.la-frontend { background: rgba(34,197,94,0.15); color: #4ade80; }
.la-backend  { background: rgba(0,180,164,0.15); color: var(--teal-txt); }
.la-database { background: rgba(234,179,8,0.15); color: var(--yellow); }
.la-devops   { background: rgba(249,115,22,0.15); color: #fb923c; }
.la-security { background: rgba(239,68,68,0.15); color: var(--red); }
.la-qa       { background: rgba(34,197,94,0.15); color: #4ade80; }
.la-po       { background: rgba(168,85,247,0.15); color: #c084fc; }
.la-default  { background: rgba(0,180,164,0.15); color: var(--teal-txt); }

/* ── Footer ── */
.sb-footer {
  padding: 7px 10px;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.footer-ver { font-size: 9px; color: var(--fg-muted); font-family: var(--font-mono); }

.footer-btns { display: flex; gap: 8px; }
.footer-btn {
  font-size: 9px;
  color: var(--fg-muted);
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font);
  padding: 0;
}
.footer-btn:hover { color: var(--teal-txt); }

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-l); border-radius: 2px; }
</style>
</head>
<body>

<!-- Header -->
<div class="sb-header">
  <div class="logo-row">
    <div class="logo-icon">⚡</div>
    <div>
      <div class="logo-name">AIDLC: WORKSPACE</div>
      <div class="logo-sub">Agent workflow runner</div>
    </div>
  </div>
</div>

<!-- Body -->
<div class="body">

  <!-- Workspace chip -->
  <div class="ws-chip" id="btn-open-builder-chip" style="cursor:pointer">
    <div class="ws-row">
      <div class="ws-name">${workspaceName}</div>
      <div class="ws-icons"><span>⇄</span><span>×</span></div>
    </div>
    <div class="ws-link">🔧 Open Builder</div>
  </div>

  <!-- START EPIC -->
  <button class="btn-epic" id="btn-start">
    <span>▶ START EPIC</span>
    <span class="arr">→</span>
  </button>

  <!-- Stats -->
  <div class="stats">
    <div class="stat">
      <div class="stat-n" id="s-agents">0</div>
      <div class="stat-l">AGENTS</div>
    </div>
    <div class="stat">
      <div class="stat-n" id="s-skills">0</div>
      <div class="stat-l">SKILLS</div>
    </div>
    <div class="stat">
      <div class="stat-n" id="s-flows">${AIDLC_WORKFLOW_COUNT}</div>
      <div class="stat-l">FLOWS</div>
    </div>
    <div class="stat">
      <div class="stat-n" id="s-epics">0</div>
      <div class="stat-l">EPICS</div>
    </div>
  </div>

  <!-- PIPELINE RUNS -->
  <div class="section">
    <div class="sec-hdr">
      <span class="sec-title">PIPELINE RUNS</span>
    </div>
    <div class="run-stack">
      <div class="run-item run-primary" id="btn-run">
        <span class="run-label">▶ Continue pipeline</span>
        <span class="run-arr">→</span>
      </div>
      <div class="run-item run-secondary" id="btn-review">
        <span class="run-label">✓ Review current work</span>
        <span class="run-arr">→</span>
      </div>
      <div class="run-item run-secondary" id="btn-activity">
        <span class="run-label">≡ Open activity feed</span>
        <span class="run-arr">→</span>
      </div>
    </div>
  </div>

  <!-- RECENT EPICS -->
  <div class="section">
    <div class="sec-hdr">
      <span class="sec-title">RECENT EPICS</span>
      <span class="sec-action" id="btn-all-epics">All <span id="epic-count">0</span> →</span>
    </div>
    <div class="epic-items" id="epic-list"></div>
  </div>

  <!-- SLASH COMMANDS (collapsed) -->
  <div class="section">
    <div class="sec-hdr">
      <span class="sec-title">SLASH COMMANDS</span>
    </div>
    <div class="slash-list">
      <div class="slash-item"><span class="slash-cmd">/plan</span><span class="slash-agent">agent plan</span></div>
      <div class="slash-item"><span class="slash-cmd">/design</span><span class="slash-agent">agent design</span></div>
      <div class="slash-item"><span class="slash-cmd">/test-plan</span><span class="slash-agent">agent test-plan</span></div>
      <div class="slash-item"><span class="slash-cmd">/implement</span><span class="slash-agent">agent implement</span></div>
      <div class="slash-item"><span class="slash-cmd">/review</span><span class="slash-agent">agent review</span></div>
      <div class="slash-item"><span class="slash-cmd">/execute-test</span><span class="slash-agent">agent execute-test</span></div>
      <div class="slash-item"><span class="slash-cmd">/release</span><span class="slash-agent">agent release</span></div>
      <div class="slash-item"><span class="slash-cmd">/monitor</span><span class="slash-agent">agent monitor</span></div>
      <div class="slash-item"><span class="slash-cmd">/doc-sync</span><span class="slash-agent">agent doc-sync</span></div>
    </div>
  </div>

  <!-- WORKFLOWS -->
  <div class="section">
    <div class="sec-hdr">
      <span class="sec-title">WORKFLOWS</span>
    </div>
    <div class="wf-item">
      <div class="wf-icon">✦</div>
      <div>
        <div class="wf-name">SDLC Pipeline</div>
        <div class="wf-desc">Plan → Design → Test Pl...</div>
      </div>
    </div>
  </div>

  <!-- COMMON -->
  <div class="common-label">COMMON</div>
  <div class="wf-item" id="btn-open-dash" style="cursor:pointer">
    <div class="wf-icon">✦</div>
    <div>
      <div class="wf-name">SDLC Pipeline</div>
      <div class="wf-desc">Plan → Design → Test Pl...</div>
    </div>
  </div>

</div>

<!-- Activity log mini -->
<div class="log-panel">
  <div class="log-hdr">ACTIVITY</div>
  <div id="log-rows"></div>
</div>

<!-- Footer -->
<div class="sb-footer">
  <span class="footer-ver">v${EXTENSION_VERSION}</span>
  <div class="footer-btns">
    <button class="footer-btn" id="btn-open-builder">Builder</button>
    <button class="footer-btn" id="btn-refresh">Refresh</button>
  </div>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────────
let board = null;
let agents = [];
let stories = [];

// ── Helpers ────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function epicStatus(board, stories) {
  // Active board status
  if (board) {
    const tasks = board.tasks || [];
    if (tasks.some(t => t.status === 'in_progress')) { return 'in_progress'; }
    if (tasks.some(t => t.status === 'failed'))      { return 'failed'; }
    if (tasks.length && tasks.every(t => t.status === 'done')) { return 'done'; }
    return 'pending';
  }
  return 'pending';
}

function shortTime(ts) {
  try { return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }); }
  catch { return ''; }
}

function logAgentClass(agent) {
  const a = (agent||'').toLowerCase();
  if (a.includes('frontend'))      { return 'la-frontend'; }
  if (a.includes('backend'))       { return 'la-backend'; }
  if (a.includes('database'))      { return 'la-database'; }
  if (a.includes('devops'))        { return 'la-devops'; }
  if (a.includes('security'))      { return 'la-security'; }
  if (a.includes('qa'))            { return 'la-qa'; }
  if (a.includes('product-owner')) { return 'la-po'; }
  return 'la-default';
}

// ── Render sidebar epics ───────────────────────────────────
function renderEpics() {
  const list = document.getElementById('epic-list');
  const countEl = document.getElementById('epic-count');

  const items = [];

  // Active board first
  if (board) {
    const st = epicStatus(board);
    items.push({ id: 'ACTIVE', status: st });
  }

  // Stories as epics
  const sorted = [...stories].sort((a, b) => {
    const da = a.saved_at ? new Date(a.saved_at).getTime() : 0;
    const db = b.saved_at ? new Date(b.saved_at).getTime() : 0;
    return db - da;
  });

  sorted.slice(0, 6).forEach((s, i) => {
    const num = String(sorted.length - i).padStart(3, '0');
    items.push({ id: 'EPIC-' + num, status: 'pending', filename: s.filename });
  });

  if (countEl) { countEl.textContent = items.length; }
  document.getElementById('s-epics').textContent = items.length;

  list.innerHTML = items.map(e =>
    '<div class="epic-item" data-epicid="' + esc(e.id) + '">' +
      '<div class="epic-dot dot-' + e.status + '"></div>' +
      '<div class="epic-id">' + esc(e.id) + '</div>' +
    '</div>'
  ).join('');

  list.querySelectorAll('.epic-item').forEach(el => {
    el.addEventListener('click', () => {
      vscode.postMessage({ command: 'openEpic', epicId: el.dataset.epicid });
    });
  });
}

function renderStats() {
  document.getElementById('s-agents').textContent = agents.length;
  document.getElementById('s-skills').textContent = ${AIDLC_SKILL_COUNT};
  document.getElementById('s-flows').textContent = ${AIDLC_WORKFLOW_COUNT};
}

// ── Log ────────────────────────────────────────────────────
function appendLogs(entries) {
  if (!entries || !entries.length) { return; }
  const container = document.getElementById('log-rows');
  const frag = document.createDocumentFragment();
  for (const e of entries) {
    const d = document.createElement('div');
    d.className = 'log-row';
    d.innerHTML =
      '<span class="log-t">' + shortTime(e.ts) + '</span>' +
      '<span class="log-a ' + logAgentClass(e.agent) + '">' + esc((e.agent||'?').slice(0,8)) + '</span>' +
      '<span class="log-m">' + esc((e.msg||'').slice(0,50)) + '</span>';
    frag.appendChild(d);
  }
  container.appendChild(frag);
  while (container.children.length > 25) { container.removeChild(container.firstChild); }
  const panel = container.closest('.log-panel');
  if (panel) { panel.scrollTop = panel.scrollHeight; }
}

// ── Buttons ────────────────────────────────────────────────
document.getElementById('btn-open-builder-chip').addEventListener('click', () => {
  vscode.postMessage({ command: 'openBuilder' });
});
document.getElementById('btn-start').addEventListener('click', () => {
  vscode.postMessage({ command: 'runFullPipeline' });
});
document.getElementById('btn-run').addEventListener('click', () => {
  vscode.postMessage({ command: 'continuePipeline' });
});
document.getElementById('btn-review').addEventListener('click', () => {
  vscode.postMessage({ command: 'reviewCurrentWork' });
});
document.getElementById('btn-activity').addEventListener('click', () => {
  vscode.postMessage({ command: 'openActivityFeed' });
});
document.getElementById('btn-all-epics').addEventListener('click', () => {
  vscode.postMessage({ command: 'openDashboard' });
});
document.getElementById('btn-open-dash').addEventListener('click', () => {
  vscode.postMessage({ command: 'openDashboard' });
});
document.getElementById('btn-open-builder').addEventListener('click', () => {
  vscode.postMessage({ command: 'openBuilder' });
});
document.getElementById('btn-refresh').addEventListener('click', () => {
  vscode.postMessage({ command: 'refresh' });
});

// ── Message handler ────────────────────────────────────────
window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.command) {
    case 'init':
      board   = msg.board;
      agents  = msg.agents  || [];
      stories = msg.stories || [];
      renderStats();
      renderEpics();
      document.getElementById('log-rows').innerHTML = '';
      appendLogs(msg.entries || []);
      break;
    case 'updateBoard':
      board = msg.board;
      renderEpics();
      break;
    case 'updateAgents':
      agents = msg.agents || [];
      renderStats();
      break;
    case 'updateStories':
      stories = msg.stories || [];
      renderStats();
      renderEpics();
      break;
    case 'appendEntries':
      appendLogs(msg.entries || []);
      break;
  }
});
</script>
</body>
</html>`;
  }
}
