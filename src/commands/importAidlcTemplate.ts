import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

async function copyDir(src: string, dest: string, overwrite: boolean): Promise<number> {
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath, overwrite);
    } else {
      if (!overwrite && fs.existsSync(destPath)) { continue; }
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

export async function importAidlcTemplate(
  workspaceRoot: string,
  extensionUri: vscode.Uri,
): Promise<void> {
  const templatesDir = path.join(extensionUri.fsPath, 'templates', 'aidlc');
  if (!fs.existsSync(templatesDir)) {
    vscode.window.showErrorMessage('AIDLC templates not found in extension bundle.');
    return;
  }

  const existing = fs.existsSync(path.join(workspaceRoot, '.aidlc'));
  let overwrite = false;

  if (existing) {
    const choice = await vscode.window.showWarningMessage(
      '.aidlc/ already exists in this workspace. Overwrite existing files?',
      { modal: true },
      'Overwrite', 'Skip existing',
    );
    if (!choice) { return; }
    overwrite = choice === 'Overwrite';
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Importing AIDLC template…', cancellable: false },
    async () => {
      let total = 0;

      // Copy .aidlc/skills/ and workspace.yaml
      const aidlcDest = path.join(workspaceRoot, '.aidlc');
      total += await copyDir(path.join(templatesDir, 'skills'), path.join(aidlcDest, 'skills'), overwrite);

      const wsSrc  = path.join(templatesDir, 'workspace.yaml');
      const wsDest = path.join(aidlcDest, 'workspace.yaml');
      if (overwrite || !fs.existsSync(wsDest)) {
        fs.mkdirSync(aidlcDest, { recursive: true });
        fs.copyFileSync(wsSrc, wsDest);
        total++;
      }

      // Patch workspace.yaml project name to match workspace folder name
      const wsName = path.basename(workspaceRoot);
      try {
        const yaml = fs.readFileSync(wsDest, 'utf8');
        // Single-quote the value and escape any interior single quotes to prevent YAML injection
        const safeWsName = wsName.replace(/'/g, "''");
        fs.writeFileSync(wsDest, yaml.replace(/^name:\s*.+$/m, `name: '${safeWsName}'`));
      } catch { /* non-fatal */ }

      // Copy .claude/agents/
      const agentsDest = path.join(workspaceRoot, '.claude', 'agents');
      total += await copyDir(path.join(templatesDir, 'agents'), agentsDest, overwrite);

      vscode.window.showInformationMessage(
        `AIDLC template imported — ${total} files written. ` +
        `Open the Builder to explore agents & workflows.`,
        'Open Builder',
      ).then(choice => {
        if (choice === 'Open Builder') {
          vscode.commands.executeCommand('agentDashboard.openBuilder');
        }
      });
    },
  );
}
