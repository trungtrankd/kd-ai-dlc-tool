import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { findClaude } from '../utils/claudeFinder';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';

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
  // Return relative path — terminal cwd is always workspaceRoot
  return path.join('.aidlc', 'runs', filename);
}

/**
 * Prompts the user for a user story (or uses a pre-filled one from the Story Library),
 * then launches the Claude pipeline in an integrated terminal.
 */
export async function runPipeline(
  workspaceRoot: string,
  statusBar: PipelineStatusBar,
  prefillStory?: string,
): Promise<void> {
  // Always use the currently active workspace folder so the command stays
  // correct after the user switches projects, even if this closure was
  // created in a previous workspace session.
  const effectiveRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? workspaceRoot;

  const story =
    prefillStory ??
    (await vscode.window.showInputBox({
      prompt: 'Enter user story for the pipeline',
      placeHolder: 'As a user, I want to...',
      ignoreFocusOut: true,
    }));

  if (!story?.trim()) {
    return;
  }

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

  if (confirm !== 'Run Pipeline') {
    return;
  }

  let relativePromptPath: string;
  try {
    relativePromptPath = savePromptFile(effectiveRoot, story.trim());
  } catch (e: unknown) {
    vscode.window.showErrorMessage(
      `Cannot create prompt file: ${e instanceof Error ? e.message : String(e)}`,
    );
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: 'Agent Pipeline',
    cwd: effectiveRoot,
  });
  terminal.show(true);

  terminal.sendText(pipelineCommand(claudePath, relativePromptPath), true);
  statusBar.setState('running');
}
