import * as vscode from 'vscode';
import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { buildFullPipelinePrompt } from '../utils/aidlcPrompts';
import { runPipeline } from './runPipeline';

export async function runAidlcFullPipeline(
  workspaceRoot: string,
  statusBar: PipelineStatusBar,
): Promise<void> {
  const story = await vscode.window.showInputBox({
    prompt: 'Enter the story or feature request for the full AIDLC pipeline',
    placeHolder: 'As a user, I want to...',
    ignoreFocusOut: true,
  });

  if (!story?.trim()) {
    return;
  }

  await runPipeline(workspaceRoot, statusBar, buildFullPipelinePrompt(story));
}
