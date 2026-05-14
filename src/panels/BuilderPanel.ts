import * as vscode from 'vscode';
import * as path from 'path';
import { readAgents } from '../data/agentReader';
import { listStories, saveStory } from '../data/storyLibrary';
import { readTaskBoard } from '../data/taskBoardReader';
import { runPipeline } from '../commands/runPipeline';
import { saveAidlcTemplate } from '../commands/saveAidlcTemplate';
import { buildRunStepPrompt } from '../utils/aidlcPrompts';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { getNonce } from '../utils/getNonce';

const AIDLC_SKILLS = [
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

const BUILT_IN_WORKFLOWS = [
  {
    id: 'sdlc-full',
    name: 'sdlc-full',
    steps: ['plan', 'design', 'test-plan', 'implement', 'review', 'execute-test', 'release', 'monitor', 'doc-sync'],
    onFailure: 'STOP',
  },
];

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
    }) => {
      switch (msg.command) {
        case 'runPipeline':
          vscode.commands.executeCommand('agentDashboard.runAidlcFullPipeline');
          break;
        case 'runWorkflow':
          if (msg.workflowId === 'sdlc-full') {
            vscode.commands.executeCommand('agentDashboard.runAidlcFullPipeline');
          } else {
            vscode.commands.executeCommand('agentDashboard.continueAidlcPipeline');
          }
          break;
        case 'continuePipeline':
          vscode.commands.executeCommand('agentDashboard.continueAidlcPipeline');
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
          catch { vscode.window.showInformationMessage('.aidlc/workspace.yaml not found.'); }
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
          if (msg.description?.trim()) {
            lines.push('## Description\n', msg.description.trim(), '\n');
          }
          if (msg.acceptanceCriteria?.trim()) {
            lines.push('## Acceptance Criteria\n', msg.acceptanceCriteria.trim(), '\n');
          }
          saveStory(this._workspaceRoot, lines.join('\n'), { filename, title });
          this._sendAllData();
          this._panel.webview.postMessage({ command: 'storyCreated' });
          break;
        }
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
    const agents  = readAgents(this._workspaceRoot);
    const stories = listStories(this._workspaceRoot);
    const board   = readTaskBoard(this._workspaceRoot);
    this._panel.webview.postMessage({ command: 'init', agents, stories, board });
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
/* ── Reset ── */
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

/* ══════════════════════════════
   TOP HEADER
══════════════════════════════ */
.top-hdr {
  background: #090f18;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  padding: 10px 20px 0;
}

.hdr-row1 {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.builder-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.logo-icon {
  width: 32px; height: 32px;
  background: var(--teal-btn);
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
}
.logo-name { font-size: 15px; font-weight: 700; color: var(--fg); }
.logo-sub  { font-size: 10px; color: var(--fg-muted); margin-top: 1px; }

.hdr-mid { flex: 1 1 180px; min-width: 160px; }

.project-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  background: var(--bg2);
  border: 1px solid var(--border-l);
  border-radius: 20px;
}
.chip-lbl { font-size: 9px; color: var(--fg-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.chip-val { font-size: 12px; font-weight: 600; color: var(--fg); }

.hdr-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ── Buttons ── */
.btn-start {
  padding: 6px 14px;
  background: var(--teal-btn);
  color: #9ef0e7;
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  font-size: 11px; font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer; font-family: var(--font);
  display: flex; align-items: center; gap: 5px;
  transition: background 0.12s;
}
.btn-start:hover { background: var(--teal-h); }

.btn-ghost {
  padding: 5px 12px;
  background: transparent;
  color: var(--fg-muted);
  border: 1px solid var(--border-l);
  border-radius: var(--r);
  font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: var(--font);
  transition: all 0.12s;
}
.btn-ghost:hover { background: var(--bg2); color: var(--fg); }

/* ── Action row ── */
.action-row {
  display: flex;
  gap: 6px;
  padding-bottom: 10px;
}
.btn-action {
  padding: 4px 11px;
  background: var(--bg2);
  border: 1px solid var(--border-l);
  border-radius: var(--r);
  color: var(--fg-2);
  font-size: 11px; font-weight: 600;
  letter-spacing: 0.03em;
  cursor: pointer; font-family: var(--font);
  transition: all 0.12s;
}
.btn-action:hover { background: var(--bg3); color: var(--fg); }

/* ── Tab bar ── */
.tab-bar { display: flex; }

.tab-btn {
  padding: 8px 18px;
  border: none; border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--fg-muted);
  font-size: 12px; font-weight: 600;
  cursor: pointer; font-family: var(--font);
  letter-spacing: 0.03em;
  display: flex; align-items: center; gap: 7px;
  transition: color 0.12s;
}
.tab-btn:hover { color: var(--fg); }
.tab-btn.active { color: var(--teal-txt); border-bottom-color: var(--teal); }

.tab-count {
  font-size: 10px; font-weight: 700;
  padding: 1px 6px; border-radius: 10px;
  background: var(--bg2); color: var(--fg-muted);
}
.tab-btn.active .tab-count {
  background: var(--teal-dim); color: var(--teal-txt);
}

/* ══════════════════════════════
   CONTENT
══════════════════════════════ */
.content { flex: 1; overflow-y: auto; overflow-x: hidden; }

.tab-panel { display: none; }
.tab-panel.active { display: block; }

/* ── Panel header row ── */
.panel-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.panel-hdr-l {
  display: flex; align-items: center; gap: 8px;
}

.panel-title {
  font-size: 11px; font-weight: 700;
  color: var(--fg-muted);
  text-transform: uppercase; letter-spacing: 0.08em;
}
.panel-count {
  font-size: 11px; font-weight: 700;
  padding: 2px 8px; border-radius: 10px;
  background: var(--bg2); color: var(--fg-muted);
  border: 1px solid var(--border);
}

.btn-new {
  padding: 5px 14px;
  background: transparent;
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  color: var(--teal-txt);
  font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: var(--font);
  transition: all 0.12s;
}
.btn-new:hover { background: var(--teal-dim); }

.btn-open-list {
  padding: 5px 12px;
  background: transparent;
  border: 1px solid var(--border-l);
  border-radius: var(--r);
  color: var(--fg-muted);
  font-size: 11px; font-weight: 600;
  cursor: pointer; font-family: var(--font);
  transition: all 0.12s;
}
.btn-open-list:hover { background: var(--bg2); color: var(--fg); }

/* ══════════════════════════════
   WORKFLOW CARDS
══════════════════════════════ */
.wf-list {
  padding: 12px 20px 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wf-card {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  overflow: hidden;
}

.wf-card-hdr {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.wf-name-wrap { display: flex; align-items: center; gap: 8px; flex: 1; }

.wf-name {
  font-size: 13px; font-weight: 700; color: var(--fg);
  font-family: var(--font-mono);
}

.wf-steps-count {
  font-size: 11px; color: var(--fg-muted);
}

.wf-card-actions { display: flex; align-items: center; gap: 8px; }

.btn-run-wf {
  padding: 4px 12px;
  background: var(--teal-btn);
  color: #9ef0e7;
  border: 1px solid var(--teal-bdr);
  border-radius: var(--r);
  font-size: 10px; font-weight: 700;
  cursor: pointer; font-family: var(--font);
  display: flex; align-items: center; gap: 4px;
  letter-spacing: 0.04em;
  transition: background 0.12s;
}
.btn-run-wf:hover { background: var(--teal-h); }

.btn-on-failure {
  padding: 4px 10px;
  border-radius: var(--r);
  font-size: 10px; font-weight: 700;
  cursor: pointer; font-family: var(--font);
  letter-spacing: 0.04em;
  transition: all 0.12s;
  border: none;
}
.on-stop {
  background: rgba(180,100,0,0.2);
  color: #d4860a;
  border: 1px solid rgba(180,100,0,0.35);
}
.on-stop:hover { background: rgba(180,100,0,0.3); }
.on-continue {
  background: rgba(74,106,132,0.15);
  color: var(--fg-muted);
  border: 1px solid var(--border-l);
}
.on-continue:hover { background: var(--bg3); color: var(--fg); }

.btn-close-wf {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--fg-muted);
  font-size: 13px; font-weight: 400;
  cursor: pointer; font-family: var(--font);
  transition: all 0.12s;
}
.btn-close-wf:hover { background: rgba(239,68,68,0.12); color: var(--red); border-color: rgba(239,68,68,0.3); }

/* ── Step boxes row ── */
.step-boxes-wrap {
  padding: 14px 14px 0;
  overflow-x: auto;
}

.step-boxes {
  display: flex;
  align-items: center;
  gap: 0;
  min-width: max-content;
  padding-bottom: 14px;
}

.step-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-dark);
  border: 1px solid var(--border-l);
  border-radius: 4px;
  min-width: 100px;
  flex-shrink: 0;
  cursor: pointer;
  transition: border-color 0.12s;
}
.step-box:hover { border-color: var(--teal-bdr); }

.step-box-num {
  font-size: 10px; font-weight: 700;
  color: var(--fg-muted);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.step-box-name {
  font-size: 12px; font-weight: 600;
  color: var(--teal-txt);
  font-family: var(--font-mono);
  white-space: nowrap;
}

.step-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px; flex-shrink: 0;
  color: var(--border-l);
  font-size: 14px;
  font-weight: 300;
  margin: 0 1px;
  margin-bottom: 1px;
}

/* ── Progress bar ── */
.wf-progress-bar {
  height: 3px;
  background: var(--border);
  margin: 0;
}
.wf-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--teal), rgba(0,180,164,0.4));
  border-radius: 0 2px 2px 0;
  transition: width 0.4s ease;
}

/* ══════════════════════════════
   AGENTS GRID
══════════════════════════════ */
.agents-panel { padding: 0 0 40px; }

.group { margin: 0; }

.group-hdr {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 20px;
  background: #0a1118;
  border-bottom: 1px solid var(--border);
  border-top: 1px solid var(--border);
  margin-top: -1px;
}

.group-dot { color: var(--fg-dim); font-size: 11px; }
.group-icon { font-size: 14px; }
.group-name { font-size: 11px; font-weight: 700; color: var(--fg); }
.group-count { font-size: 11px; color: var(--fg-muted); }
.group-path {
  margin-left: auto;
  font-size: 10px; color: var(--fg-muted);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
}

.group-body { padding: 12px 20px; }
.group-empty { padding: 12px 4px; color: var(--fg-muted); font-size: 11px; font-style: italic; }

.cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.agent-card {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 10px 12px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  display: flex; flex-direction: column; gap: 5px;
  min-height: 60px;
}
.agent-card:hover { border-color: var(--border-l); background: #101c28; }

.card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}
.card-name { font-size: 12px; font-weight: 700; color: var(--fg); line-height: 1.3; }

.scope-badge {
  font-size: 9px; font-weight: 700;
  padding: 2px 6px; border-radius: 3px;
  letter-spacing: 0.05em; flex-shrink: 0; white-space: nowrap;
}
.scope-project { background: rgba(74,106,132,0.2); color: var(--fg-2); border: 1px solid rgba(74,106,132,0.25); }
.scope-aidlc   { background: var(--teal-dim); color: var(--teal-txt); border: 1px solid var(--teal-bdr); }
.scope-global  { background: rgba(168,85,247,0.12); color: #c084fc; border: 1px solid rgba(168,85,247,0.22); }

.card-desc {
  font-size: 10px; color: var(--fg-muted); line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card-path {
  font-size: 9px; color: var(--fg-muted);
  font-family: var(--font-mono);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.card-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }

.skill-tag {
  font-size: 9px; font-weight: 700;
  padding: 1px 6px; border-radius: 3px;
  letter-spacing: 0.04em; text-transform: uppercase;
}
.tag-skill  { background: rgba(0,180,164,0.12); color: var(--teal-txt); border: 1px solid var(--teal-bdr); }
.tag-model  { background: rgba(74,106,132,0.15); color: var(--fg-muted); border: 1px solid rgba(74,106,132,0.22); font-family: var(--font-mono); text-transform: none; letter-spacing: 0; }
.tag-opus   { background: rgba(168,85,247,0.1); color: #c084fc; border: 1px solid rgba(168,85,247,0.2); }
.tag-haiku  { background: rgba(34,197,94,0.1); color: #4ade80; border: 1px solid rgba(34,197,94,0.2); }

/* ══════════════════════════════
   EPICS (compact)
══════════════════════════════ */
.epic-list { padding: 12px 20px 40px; display: flex; flex-direction: column; gap: 8px; }

.epic-row {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 12px 16px;
  transition: border-color 0.12s;
}
.epic-row:hover { border-color: var(--border-l); }

.epic-row-top {
  display: flex; align-items: center; gap: 10px; margin-bottom: 6px;
}
.epic-row-id { font-size: 13px; font-weight: 700; color: var(--teal-txt); font-family: var(--font-mono); }
.epic-row-title { flex: 1; font-size: 12px; color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.status-pill {
  padding: 2px 9px; border-radius: 4px;
  font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.pill-pending     { background: rgba(74,106,132,0.18); color: var(--fg-muted); border: 1px solid rgba(74,106,132,0.25); }
.pill-in_progress { background: var(--teal-dim); color: var(--teal-txt); border: 1px solid var(--teal-bdr); }
.pill-done        { background: rgba(34,197,94,0.12); color: var(--green); border: 1px solid rgba(34,197,94,0.25); }
.pill-failed      { background: rgba(239,68,68,0.12); color: var(--red); border: 1px solid rgba(239,68,68,0.25); }

.epic-row-meta {
  display: flex; align-items: center; gap: 8px;
  font-size: 11px; color: var(--fg-muted);
}
.meta-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--fg-muted); flex-shrink: 0;
}
.dot-in_progress { background: var(--teal); box-shadow: 0 0 4px var(--teal); }
.dot-done  { background: var(--green); }
.dot-failed { background: var(--red); }
.meta-sep { color: var(--fg-dim); }

/* ══════════════════════════════
   FOOTER
══════════════════════════════ */
.page-footer {
  padding: 8px 20px;
  border-top: 1px solid var(--border);
  background: var(--bg-dark);
  font-size: 10px; color: var(--fg-muted);
  flex-shrink: 0;
  display: flex; align-items: center; gap: 4px;
}
.footer-link { color: var(--teal-txt); cursor: pointer; }
.footer-link:hover { text-decoration: underline; }

/* ── card-footer / run-step ── */
.card-footer { margin-top: 6px; display: flex; justify-content: flex-end; }
.btn-run-step {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em;
  padding: 3px 10px; border-radius: 3px;
  background: var(--teal-btn); border: 1px solid var(--teal-bdr);
  color: var(--teal-txt); cursor: pointer; transition: background 0.12s;
}
.btn-run-step:hover { background: var(--teal-btn-h); }

/* ── Story Creator Modal ── */
.modal-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.65);
  display: flex; align-items: center; justify-content: center;
}
.modal-box {
  background: var(--bg2); border: 1px solid var(--border-l);
  border-radius: 6px; width: 440px; max-width: 90vw;
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
}
.modal-title { font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: var(--teal-txt); }
.modal-close {
  background: none; border: none; color: var(--fg-muted); cursor: pointer;
  font-size: 16px; line-height: 1; padding: 0 4px;
}
.modal-close:hover { color: var(--fg); }
.modal-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.field-lbl { font-size: 10px; font-weight: 700; color: var(--fg-muted); letter-spacing: 0.05em; }
.field-req { color: var(--red); }
.field-input, .field-textarea {
  background: var(--bg3); border: 1px solid var(--border);
  border-radius: 4px; color: var(--fg); font-size: 11px;
  padding: 7px 10px; resize: vertical; outline: none;
  font-family: var(--font); width: 100%; box-sizing: border-box;
}
.field-input:focus, .field-textarea:focus { border-color: var(--teal-bdr); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 10px 16px; border-top: 1px solid var(--border);
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-l); border-radius: 3px; }
</style>
</head>
<body>

<!-- ══ HEADER ══ -->
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
      <button class="btn-start" id="btn-start">▶ START EPIC</button>
      <button class="btn-ghost" id="btn-continue">CONTINUE</button>
      <button class="btn-ghost" id="btn-review">REVIEW</button>
      <button class="btn-ghost" id="btn-load">LOAD TEMPLATE</button>
      <button class="btn-ghost" id="btn-save">SAVE TEMPLATE</button>
      <button class="btn-ghost" id="btn-yaml">OPEN YAML</button>
    </div>
  </div>

  <div class="action-row">
    <button class="btn-action" id="btn-switch">SWITCH PROJECT</button>
    <button class="btn-action" id="btn-cli">CLAUDE CLI</button>
  </div>

  <div class="tab-bar">
    <button class="tab-btn active" data-tab="workflows">WORKFLOWS <span class="tab-count" id="tc-wf">2</span></button>
    <button class="tab-btn" data-tab="agents">AGENTS <span class="tab-count" id="tc-ag">0</span></button>
    <button class="tab-btn" data-tab="skills">SKILLS <span class="tab-count" id="tc-sk">0</span></button>
    <button class="tab-btn" data-tab="epics">EPICS <span class="tab-count" id="tc-ep">0</span></button>
  </div>
</div>

<!-- ══ CONTENT ══ -->
<div class="content">

  <!-- ── WORKFLOWS ── -->
  <div class="tab-panel active" id="panel-workflows">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">WORKFLOWS</span>
        <span class="panel-count" id="ph-wf">2</span>
      </div>
      <button class="btn-new">+ NEW WORKFLOW</button>
    </div>
    <div class="wf-list" id="wf-list">
      <!-- rendered by JS -->
    </div>
  </div>

  <!-- ── AGENTS ── -->
  <div class="tab-panel" id="panel-agents">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">AGENTS</span>
        <span class="panel-count" id="ph-ag">0</span>
      </div>
      <button class="btn-new">+ ADD AGENT</button>
    </div>

    <div class="agents-panel">
      <!-- PROJECT group -->
      <div class="group" id="ag-project-group">
        <div class="group-hdr">
          <span class="group-dot">·</span>
          <span class="group-icon">📁</span>
          <span class="group-name">PROJECT</span>
          <span class="group-count" id="ag-proj-cnt">0</span>
          <span class="group-path">.claude/ — committed to this repo, applies to this project only</span>
        </div>
        <div class="group-body">
          <div class="cards-grid" id="ag-proj-grid"></div>
        </div>
      </div>

      <!-- AIDLC group -->
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span>
          <span class="group-icon">📦</span>
          <span class="group-name">AIDLC</span>
          <span class="group-count">9</span>
          <span class="group-path">.aidlc/ — committed to this repo, declared in workspace.yaml, shared with the team</span>
        </div>
        <div class="group-body">
          <div class="cards-grid" id="ag-aidlc-grid"></div>
        </div>
      </div>

      <!-- GLOBAL group -->
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span>
          <span class="group-icon">🏠</span>
          <span class="group-name">GLOBAL</span>
          <span class="group-count">0</span>
          <span class="group-path">~/.claude/ — your personal assets, available on every project on this machine</span>
        </div>
        <div class="group-body">
          <div class="group-empty">No agents here yet.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── SKILLS ── -->
  <div class="tab-panel" id="panel-skills">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">SKILLS</span>
        <span class="panel-count" id="ph-sk">0</span>
      </div>
      <button class="btn-new">+ ADD SKILL</button>
    </div>
    <div class="agents-panel">
      <!-- PROJECT skills -->
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span>
          <span class="group-icon">📁</span>
          <span class="group-name">PROJECT</span>
          <span class="group-count" id="sk-proj-cnt">0</span>
          <span class="group-path">.claude/ — committed to this repo, applies to this project only</span>
        </div>
        <div class="group-body" id="sk-proj-body">
          <div class="group-empty">No skills here yet.</div>
        </div>
      </div>
      <!-- AIDLC skills -->
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span>
          <span class="group-icon">📦</span>
          <span class="group-name">AIDLC</span>
          <span class="group-count">9</span>
          <span class="group-path">.aidlc/ — committed to this repo, declared in workspace.yaml, shared with the team</span>
        </div>
        <div class="group-body">
          <div class="cards-grid" id="sk-aidlc-grid"></div>
        </div>
      </div>
      <!-- GLOBAL skills -->
      <div class="group">
        <div class="group-hdr">
          <span class="group-dot">·</span>
          <span class="group-icon">🏠</span>
          <span class="group-name">GLOBAL</span>
          <span class="group-count">0</span>
          <span class="group-path">~/.claude/ — your personal assets, available on every project on this machine</span>
        </div>
        <div class="group-body">
          <div class="group-empty">No skills here yet.</div>
        </div>
      </div>
    </div>
  </div>

  <!-- ── EPICS ── -->
  <div class="tab-panel" id="panel-epics">
    <div class="panel-hdr">
      <div class="panel-hdr-l">
        <span class="panel-title">EPICS</span>
        <span class="panel-count" id="ph-ep">0</span>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-open-list" id="btn-open-list">OPEN LIST →</button>
        <button class="btn-new" id="btn-draft-story">✏ DRAFT STORY</button>
        <button class="btn-new" id="btn-start-epic2">+ START EPIC</button>
      </div>
    </div>
    <div class="epic-list" id="epic-list"></div>
  </div>

</div>

<!-- ══ STORY CREATOR MODAL ══ -->
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
      <textarea class="field-textarea" id="story-ac" rows="4" placeholder="- Given… When… Then…&#10;- Given… When… Then…"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" id="modal-cancel">CANCEL</button>
      <button class="btn-start" id="modal-save">SAVE STORY</button>
    </div>
  </div>
</div>

<!-- ══ FOOTER ══ -->
<div class="page-footer">
  Edits sync to
  <strong style="color:var(--fg-2);margin:0 3px">.aidlc/workspace.yaml</strong>.
  Comments may be reflowed by the YAML serializer when you use buttons here.
  <span class="footer-link" id="btn-open-file" style="margin-left:6px">Open file →</span>
</div>

<script nonce="${nonce}">
const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────────
let agents = [], stories = [], board = null;

const AIDLC_SKILLS = ${JSON.stringify(AIDLC_SKILLS)};
const WORKFLOWS = ${JSON.stringify(BUILT_IN_WORKFLOWS)};

// ── Helpers ────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function shortDate(ts) {
  if (!ts) { return '—'; }
  try { return new Date(ts).toLocaleDateString([], { year:'numeric', month:'short', day:'numeric' }); }
  catch { return ts; }
}

function agentDisplay(name) { return (name||'').replace('developer-','').replace('developer','dev'); }

function modelTag(model) {
  if (!model) { return ''; }
  const m = model.toLowerCase();
  const cls = m.includes('opus') ? 'tag-opus' : m.includes('haiku') ? 'tag-haiku' : 'tag-model';
  const label = model.replace('claude-','').toUpperCase();
  return '<span class="skill-tag ' + cls + '">' + esc(label) + '</span>';
}

// ── Tab switching ──────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Render Workflows ───────────────────────────────────────
function renderWorkflows() {
  const container = document.getElementById('wf-list');
  const ph = document.getElementById('ph-wf');
  const tc = document.getElementById('tc-wf');

  const workflows = WORKFLOWS;

  if (ph) { ph.textContent = workflows.length; }
  if (tc) { tc.textContent = workflows.length; }

  container.innerHTML = workflows.map(wf => {
    const steps = wf.steps;
    const isStop = wf.onFailure === 'STOP';
    const failureCls = isStop ? 'on-stop' : 'on-continue';
    const failureLabel = 'ON_FAILURE: ' + wf.onFailure;

    const stepsHtml = steps.map((step, i) => {
      const arrow = i < steps.length - 1
        ? '<div class="step-arrow">→</div>'
        : '';
      return '<div class="step-box">' +
          '<span class="step-box-num">' + (i + 1) + '</span>' +
          '<span class="step-box-name">' + esc(step) + '</span>' +
        '</div>' + arrow;
    }).join('');

    return '<div class="wf-card">' +
      '<div class="wf-card-hdr">' +
        '<div class="wf-name-wrap">' +
          '<span class="wf-name">' + esc(wf.name) + '</span>' +
          '<span class="wf-steps-count">' + steps.length + ' steps</span>' +
        '</div>' +
        '<div class="wf-card-actions">' +
          '<button class="btn-run-wf" data-id="' + esc(wf.id) + '">▶ RUN</button>' +
          '<button class="btn-on-failure ' + failureCls + '" data-id="' + esc(wf.id) + '">' + failureLabel + '</button>' +
          '<button class="btn-close-wf">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="step-boxes-wrap"><div class="step-boxes">' + stepsHtml + '</div></div>' +
      '<div class="wf-progress-bar"><div class="wf-progress-fill" style="width:0%"></div></div>' +
    '</div>';
  }).join('');

  // Wire up RUN buttons
  container.querySelectorAll('.btn-run-wf').forEach(btn => {
    btn.addEventListener('click', () => {
      vscode.postMessage({ command: 'runWorkflow', workflowId: btn.dataset.id });
    });
  });

  // Toggle ON_FAILURE
  container.querySelectorAll('.btn-on-failure').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('on-stop')) {
        btn.classList.replace('on-stop', 'on-continue');
        btn.textContent = 'ON_FAILURE: CONTINUE';
      } else {
        btn.classList.replace('on-continue', 'on-stop');
        btn.textContent = 'ON_FAILURE: STOP';
      }
    });
  });
}

// ── Render Agents ──────────────────────────────────────────
function renderAgents() {
  const grid = document.getElementById('ag-proj-grid');
  const cnt  = document.getElementById('ag-proj-cnt');
  const ph   = document.getElementById('ph-ag');
  const tc   = document.getElementById('tc-ag');
  const total = agents.length + 9;
  if (cnt) { cnt.textContent = agents.length; }
  if (ph)  { ph.textContent  = total; }
  if (tc)  { tc.textContent  = total; }

  if (!agents.length) {
    grid.innerHTML = '<div class="group-empty">No agents found in .claude/agents/</div>';
  } else {
    grid.innerHTML = agents.map(a => {
      const shortPath = (a.filePath||'').split('.claude/').pop() || a.filePath || '';
      return '<div class="agent-card" data-fp="' + esc(a.filePath||'') + '">' +
        '<div class="card-top">' +
          '<div class="card-name">' + esc(a.name) + '</div>' +
          '<span class="scope-badge scope-project">PROJECT</span>' +
        '</div>' +
        (a.description ? '<div class="card-desc">' + esc(a.description) + '</div>' : '') +
        '<div class="card-tags">' +
          (a.model ? modelTag(a.model) : '') +
        '</div>' +
        '<div class="card-path">.claude/' + esc(shortPath) + '</div>' +
      '</div>';
    }).join('');

    grid.querySelectorAll('.agent-card').forEach(card => {
      card.addEventListener('click', () => {
        vscode.postMessage({ command: 'openAgentFile', filePath: card.dataset.fp });
      });
    });
  }

  // AIDLC agents
  const aidlcGrid = document.getElementById('ag-aidlc-grid');
  if (aidlcGrid) {
    aidlcGrid.innerHTML = AIDLC_SKILLS.map(s =>
      '<div class="agent-card">' +
        '<div class="card-top">' +
          '<div class="card-name">' + esc(s.name) + '</div>' +
          '<span class="scope-badge scope-aidlc">AIDLC</span>' +
        '</div>' +
        '<div class="card-desc">' + esc(s.desc) + '</div>' +
        '<div class="card-tags">' +
          '<span class="skill-tag tag-skill">' + esc(s.tag) + '</span>' +
          modelTag(s.model) +
        '</div>' +
        '<div class="card-footer">' +
          '<button class="btn-run-step" data-step="' + esc(s.name) + '">▶ RUN</button>' +
        '</div>' +
      '</div>'
    ).join('');
    aidlcGrid.querySelectorAll('.btn-run-step').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({ command: 'runStep', step: btn.dataset.step });
      });
    });
  }
}

// ── Render Skills ──────────────────────────────────────────
function renderSkills() {
  const ph  = document.getElementById('ph-sk');
  const tc  = document.getElementById('tc-sk');
  const cnt = document.getElementById('sk-proj-cnt');
  const body = document.getElementById('sk-proj-body');
  const total = AIDLC_SKILLS.length + stories.length;
  if (ph)  { ph.textContent  = total; }
  if (tc)  { tc.textContent  = total; }
  if (cnt) { cnt.textContent = stories.length; }

  if (body) {
    if (!stories.length) {
      body.innerHTML = '<div class="group-empty">No skills here yet.</div>';
    } else {
      body.innerHTML = '<div class="cards-grid">' +
        stories.map(s =>
          '<div class="agent-card">' +
            '<div class="card-top">' +
              '<div class="card-name">' + esc(s.title || s.filename) + '</div>' +
              '<span class="scope-badge scope-project">PROJECT</span>' +
            '</div>' +
            (s.preview ? '<div class="card-desc">' + esc(s.preview.slice(0,80)) + '</div>' : '') +
            '<div class="card-tags"><span class="skill-tag tag-skill">STORY</span></div>' +
          '</div>'
        ).join('') +
      '</div>';
    }
  }

  const aidlcGrid = document.getElementById('sk-aidlc-grid');
  if (aidlcGrid) {
    aidlcGrid.innerHTML = AIDLC_SKILLS.map(s =>
      '<div class="agent-card">' +
        '<div class="card-top">' +
          '<div class="card-name">' + esc(s.name) + '</div>' +
          '<span class="scope-badge scope-aidlc">AIDLC</span>' +
        '</div>' +
        '<div class="card-desc">' + esc(s.desc) + '</div>' +
        '<div class="card-tags">' +
          '<span class="skill-tag tag-skill">' + esc(s.tag) + '</span>' +
          modelTag(s.model) +
        '</div>' +
        '<div class="card-footer">' +
          '<button class="btn-run-step" data-step="' + esc(s.name) + '">▶ RUN</button>' +
        '</div>' +
      '</div>'
    ).join('');
    aidlcGrid.querySelectorAll('.btn-run-step').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        vscode.postMessage({ command: 'runStep', step: btn.dataset.step });
      });
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
    const hasActive = tasks.some(t => t.status === 'in_progress');
    const hasFailed = tasks.some(t => t.status === 'failed');
    let status = 'pending';
    if (hasActive)   { status = 'in_progress'; }
    else if (hasFailed) { status = 'failed'; }
    else if (tasks.length && done === tasks.length) { status = 'done'; }
    epics.push({
      id: 'ACTIVE', title: board.feature || '(untitled)',
      status, steps: done + '/' + tasks.length,
      agent: tasks.length ? agentDisplay(tasks[0].agent) : 'pipeline',
      date: shortDate(board.created_at),
    });
  }

  const sorted = [...stories].sort((a,b) => {
    const da = a.saved_at ? new Date(a.saved_at).getTime() : 0;
    const db = b.saved_at ? new Date(b.saved_at).getTime() : 0;
    return db - da;
  });
  sorted.forEach((s, i) => {
    const num = String(sorted.length - i).padStart(3, '0');
    epics.push({
      id: 'EPIC-' + num, title: s.title || s.filename || '(untitled)',
      status: 'pending', steps: '0/1',
      agent: 'product-owner', date: shortDate(s.saved_at),
    });
  });

  if (ph) { ph.textContent = epics.length; }
  if (tc) { tc.textContent = epics.length; }

  if (!epics.length) {
    container.innerHTML = '<div style="padding:24px;color:var(--fg-muted);font-size:12px;text-align:center">No epics yet. Click + START EPIC to begin.</div>';
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
        '<span>' + esc(e.steps) + ' steps</span>' +
        '<span class="meta-sep">·</span>' +
        '<span>agent: <strong style="color:var(--teal-txt)">' + esc(e.agent) + '</strong></span>' +
        '<span class="meta-sep">·</span>' +
        '<span>' + esc(e.date) + '</span>' +
      '</div>' +
    '</div>'
  ).join('');
}

// ── Buttons ────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => vscode.postMessage({ command: 'runPipeline' }));
document.getElementById('btn-start-epic2')?.addEventListener('click', () => vscode.postMessage({ command: 'runPipeline' }));
document.getElementById('btn-continue').addEventListener('click', () => vscode.postMessage({ command: 'continuePipeline' }));
document.getElementById('btn-review').addEventListener('click', () => vscode.postMessage({ command: 'reviewCurrentWork' }));
document.getElementById('btn-open-list').addEventListener('click', () => vscode.postMessage({ command: 'openEpics' }));
document.getElementById('btn-yaml').addEventListener('click', () => vscode.postMessage({ command: 'openYaml' }));
document.getElementById('btn-cli').addEventListener('click', () => vscode.postMessage({ command: 'claudeCli' }));
document.getElementById('btn-open-file').addEventListener('click', () => vscode.postMessage({ command: 'openYaml' }));
document.getElementById('btn-load').addEventListener('click', () => {
  vscode.postMessage({ command: 'importAidlcTemplate' });
});
document.getElementById('btn-switch').addEventListener('click', () => vscode.postMessage({ command: 'switchProject' }));
document.getElementById('btn-save').addEventListener('click', () => vscode.postMessage({ command: 'saveTemplate' }));

// ── Story Creator Modal ────────────────────────────────────
function openStoryModal() {
  document.getElementById('story-title').value = '';
  document.getElementById('story-desc').value = '';
  document.getElementById('story-ac').value = '';
  document.getElementById('story-modal').style.display = 'flex';
  document.getElementById('story-title').focus();
}
function closeStoryModal() {
  document.getElementById('story-modal').style.display = 'none';
}

document.getElementById('btn-draft-story')?.addEventListener('click', openStoryModal);
document.getElementById('modal-close').addEventListener('click', closeStoryModal);
document.getElementById('modal-cancel').addEventListener('click', closeStoryModal);
document.getElementById('story-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('story-modal')) { closeStoryModal(); }
});
document.getElementById('modal-save').addEventListener('click', () => {
  const title = document.getElementById('story-title').value.trim();
  if (!title) {
    document.getElementById('story-title').focus();
    return;
  }
  document.getElementById('modal-save').textContent = 'SAVING…';
  document.getElementById('modal-save').disabled = true;
  vscode.postMessage({
    command: 'saveNewStory',
    title,
    description: document.getElementById('story-desc').value,
    acceptanceCriteria: document.getElementById('story-ac').value,
  });
});

// ── Message handler ────────────────────────────────────────
window.addEventListener('message', ev => {
  const msg = ev.data;
  switch (msg.command) {
    case 'init':
      agents  = msg.agents  || [];
      stories = msg.stories || [];
      board   = msg.board;
      renderWorkflows();
      renderAgents();
      renderSkills();
      renderEpics();
      break;
    case 'switchTab': {
      const tab = msg.tab;
      if (!tab) { break; }
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const btn = document.querySelector('[data-tab="' + tab + '"]');
      const panel = document.getElementById('panel-' + tab);
      if (btn)   { btn.classList.add('active'); }
      if (panel) { panel.classList.add('active'); }
      break;
    }
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
