import { PipelineStatusBar } from '../statusBar/pipelineStatusBar';
import { buildContinuePipelinePrompt } from '../utils/aidlcPrompts';
import { runPipeline } from './runPipeline';

export async function continueAidlcPipeline(
  workspaceRoot: string,
  statusBar: PipelineStatusBar,
): Promise<void> {
  await runPipeline(workspaceRoot, statusBar, buildContinuePipelinePrompt());
}
