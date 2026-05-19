import * as vscode from 'vscode';
import { readWorkspaceYaml } from '../utils/workspaceYamlReader';

let _channel: vscode.OutputChannel | undefined;

export function showWorkspaceConfig(workspaceRoot: string): void {
  _channel ??= vscode.window.createOutputChannel('AIDLC');
  _channel.clear();

  const config = readWorkspaceYaml(workspaceRoot);
  if (!config) {
    _channel.appendLine('ERROR: .aidlc/workspace.yaml not found or could not be parsed.');
    _channel.appendLine('Run "AIDLC: Import Template" to create a starter workspace.');
    _channel.show(true);
    return;
  }

  _channel.appendLine(`Workspace: ${config.name}`);
  _channel.appendLine('');

  _channel.appendLine(`Agents (${config.agents.length})`);
  _channel.appendLine('─'.repeat(60));
  for (const a of config.agents) {
    _channel.appendLine(`  [${a.id.padEnd(14)}]  model=${a.model.padEnd(26)} skill=${a.skill}`);
    _channel.appendLine(`  ${''.padEnd(16)}   artifact=${a.artifact ?? '—'}`);
  }

  _channel.appendLine('');
  _channel.appendLine(`Pipelines (${config.pipelines.length})`);
  _channel.appendLine('─'.repeat(60));
  for (const p of config.pipelines) {
    _channel.appendLine(`  [${p.id}]  on_failure=${p.onFailure}`);
    _channel.appendLine(`    steps: ${p.steps.join(' → ')}`);
  }

  _channel.show(true);
}
