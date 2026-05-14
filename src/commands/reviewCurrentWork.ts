import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { buildReviewCurrentWorkPrompt } from '../utils/aidlcPrompts';
import { runPipeline } from './runPipeline';

export async function reviewCurrentWork(
  workspaceRoot: string,
  statusBar: PipelineStatusBar,
): Promise<void> {
  await runPipeline(workspaceRoot, statusBar, buildReviewCurrentWorkPrompt());
}
