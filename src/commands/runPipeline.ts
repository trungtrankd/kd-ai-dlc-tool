import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findClaude } from '../utils/claudeFinder';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';

// Track the currently running pipeline terminal so it can be cancelled
let _activeTerminal: vscode.Terminal | undefined;

export function isRunning(): boolean {
  return _activeTerminal !== undefined;
}

export function cancelPipeline(statusBar?: PipelineStatusBar): void {
  if (_activeTerminal) {
    _activeTerminal.dispose();
    _activeTerminal = undefined;
  }
  statusBar?.setState('idle');
}

function shellQuote(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function pipelineCommand(claudePath: string, relativePromptPath: string): string {
  const quotedClaudePath = shellQuote(claudePath);
  const quotedPromptPath = shellQuote(relativePromptPath);
  if (process.platform === 'win32') {
    return `Get-Content -Raw ${quotedPromptPath} | & ${quotedClaudePath} --dangerously-skip-permissions -p`;
  }
  return `cat ${quotedPromptPath} | ${quotedClaudePath} --dangerously-skip-permissions -p`;
}

function savePromptFile(workspaceRoot: string, story: string): string {
  const runsDir = path.join(workspaceRoot, '.aidlc', 'runs');
  fs.mkdirSync(runsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `prompt-${timestamp}.md`;
  fs.writeFileSync(path.join(runsDir, filename), story, 'utf8');
  return path.join('.aidlc', 'runs', filename);
}

/**
 * Core execution engine used by all pipeline commands.
 * `prefillStory` must be a fully-formed AIDLC prompt (from aidlcPrompts.ts).
 */
export async function runPipeline(
  workspaceRoot: string,
  statusBar: PipelineStatusBar,
  prefillStory?: string,
): Promise<void> {
  const effectiveRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;

  const story =
    prefillStory ??
    (await vscode.window.showInputBox({
      prompt: 'Enter user story for the pipeline',
      placeHolder: 'As a user, I want to...',
      ignoreFocusOut: true,
    }));

  if (!story?.trim()) { return; }

  const config = vscode.workspace.getConfiguration('agentDashboard');
  const claudePath = findClaude(config.get<string>('claudePath'));

  if (!claudePath) {
    vscode.window.showErrorMessage(
      'claude CLI not found. Install it or set agentDashboard.claudePath in settings.',
    );
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    'Run Claude with --dangerously-skip-permissions for this workspace?',
    { modal: true },
    'Run Pipeline',
  );
  if (confirm !== 'Run Pipeline') { return; }

  let relativePromptPath: string;
  try {
    relativePromptPath = savePromptFile(effectiveRoot, story.trim());
  } catch (e: unknown) {
    vscode.window.showErrorMessage(
      `Cannot create prompt file: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  // Dispose any previous terminal so there's never more than one active
  if (_activeTerminal) { _activeTerminal.dispose(); }

  const terminal = vscode.window.createTerminal({
    name: 'Agent Pipeline',
    cwd: effectiveRoot,
  });
  _activeTerminal = terminal;

  // Clean up reference when the user closes the terminal manually
  const disposeListener = vscode.window.onDidCloseTerminal((t) => {
    if (t === _activeTerminal) {
      _activeTerminal = undefined;
      statusBar.update();
      disposeListener.dispose();
    }
  });

  terminal.show(true);
  terminal.sendText(pipelineCommand(claudePath, relativePromptPath), true);
  statusBar.setState('running');
}
