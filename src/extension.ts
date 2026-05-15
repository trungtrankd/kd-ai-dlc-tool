import * as vscode from 'vscode';
import { SidebarProvider } from './providers/SidebarProvider';
import { PipelineStatusBar } from './statusBar/pipelineStatusBar';
import { createFileWatchers } from './watchers/fileWatchers';
import { DashboardPanel } from './panels/DashboardPanel';
import { BuilderPanel } from './panels/BuilderPanel';
import { ActivityFeedPanel } from './panels/ActivityFeedPanel';
import { runPipeline, cancelPipeline } from './commands/runPipeline';
import { clearBoard } from './commands/clearBoard';
import { importTaiga } from './commands/importTaiga';
import { importAidlcTemplate } from './commands/importAidlcTemplate';
import { runAidlcFullPipeline } from './commands/runAidlcFullPipeline';
import { reviewCurrentWork } from './commands/reviewCurrentWork';
import { continueAidlcPipeline } from './commands/continueAidlcPipeline';

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) { return; }

  const statusBar = new PipelineStatusBar(workspaceRoot);
  const sidebarProvider = new SidebarProvider(context.extensionUri, workspaceRoot);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('agentDashboard.sidebar', sidebarProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  const watchers = createFileWatchers(workspaceRoot, {
    onBoardChange: () => {
      statusBar.update();
      sidebarProvider.sendBoard();
      DashboardPanel.refreshBoard(workspaceRoot);
      BuilderPanel.refreshAll(workspaceRoot);
    },
    onLogChange: () => {
      sidebarProvider.sendNewLogEntries();
      DashboardPanel.postNewEntries(workspaceRoot);
      ActivityFeedPanel.postNewEntries(workspaceRoot);
      BuilderPanel.refreshAll(workspaceRoot);
    },
    onMailChange: () => {
      sidebarProvider.sendStories();
      DashboardPanel.refreshStories(workspaceRoot);
      BuilderPanel.refreshAll(workspaceRoot);
    },
    onAgentsChange: () => {
      sidebarProvider.sendAgents();
      DashboardPanel.refreshAgents(workspaceRoot);
      BuilderPanel.refreshAll(workspaceRoot);
    },
  });

  context.subscriptions.push(
    statusBar,
    ...watchers,

    vscode.commands.registerCommand('agentDashboard.openDashboard', (expandEpicId?: string) =>
      DashboardPanel.createOrShow(context.extensionUri, workspaceRoot, statusBar, expandEpicId),
    ),

    vscode.commands.registerCommand('agentDashboard.openBuilder', (initialTab?: string) =>
      BuilderPanel.createOrShow(context.extensionUri, workspaceRoot, statusBar, initialTab),
    ),

    vscode.commands.registerCommand('agentDashboard.openActivityFeed', () =>
      ActivityFeedPanel.createOrShow(context.extensionUri, workspaceRoot),
    ),

    vscode.commands.registerCommand('agentDashboard.runAidlcFullPipeline', () =>
      runAidlcFullPipeline(workspaceRoot, statusBar),
    ),

    vscode.commands.registerCommand('agentDashboard.reviewCurrentWork', () =>
      reviewCurrentWork(workspaceRoot, statusBar),
    ),

    vscode.commands.registerCommand('agentDashboard.continueAidlcPipeline', () =>
      continueAidlcPipeline(workspaceRoot, statusBar),
    ),

    vscode.commands.registerCommand('agentDashboard.cancelPipeline', () =>
      cancelPipeline(statusBar),
    ),

    vscode.commands.registerCommand('agentDashboard.clearBoard', () =>
      clearBoard(workspaceRoot, statusBar),
    ),

    vscode.commands.registerCommand('agentDashboard.importTaiga', () =>
      importTaiga(workspaceRoot),
    ),

    vscode.commands.registerCommand('agentDashboard.importAidlcTemplate', () =>
      importAidlcTemplate(workspaceRoot, context.extensionUri),
    ),

    vscode.commands.registerCommand('agentDashboard.openAgentFile', (filePath: string) =>
      vscode.window.showTextDocument(vscode.Uri.file(filePath)),
    ),

    vscode.commands.registerCommand('agentDashboard.refreshAgents', () => {
      sidebarProvider.sendAgents();
      BuilderPanel.refreshAll(workspaceRoot);
    }),

    vscode.commands.registerCommand('agentDashboard.refreshTaskBoard', () => {
      sidebarProvider.sendBoard();
      DashboardPanel.refreshBoard(workspaceRoot);
    }),

    // Keep runPipeline as an alias for runAidlcFullPipeline so any stored
    // keybindings or external callers still work
    vscode.commands.registerCommand('agentDashboard.runPipeline', () =>
      runPipeline(workspaceRoot, statusBar),
    ),
  );
}

export function deactivate(): void {}
