import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

async function copyDir(src: string, dest: string): Promise<number> {
  if (!fs.existsSync(src)) { return 0; }
  fs.mkdirSync(dest, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      count += await copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

export async function saveAidlcTemplate(workspaceRoot: string): Promise<void> {
  const aidlcDir   = path.join(workspaceRoot, '.aidlc');
  const agentsDir  = path.join(workspaceRoot, '.claude', 'agents');

  if (!fs.existsSync(aidlcDir)) {
    vscode.window.showWarningMessage('No .aidlc/ directory found in this workspace.');
    return;
  }

  const wsName = path.basename(workspaceRoot);
  const defaultDest = path.join(os.homedir(), '.claude', 'templates', wsName);

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Save Template Here',
    title: 'Choose folder to save AIDLC template',
    defaultUri: vscode.Uri.file(path.join(os.homedir(), '.claude', 'templates')),
  });

  const destRoot = picked?.[0]?.fsPath
    ? path.join(picked[0].fsPath, wsName)
    : defaultDest;

  const existing = fs.existsSync(destRoot);
  if (existing) {
    const choice = await vscode.window.showWarningMessage(
      `Template folder already exists at ${destRoot}. Overwrite?`,
      { modal: true },
      'Overwrite',
    );
    if (choice !== 'Overwrite') { return; }
    fs.rmSync(destRoot, { recursive: true, force: true });
  }

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Saving AIDLC template…', cancellable: false },
    async () => {
      let total = 0;
      total += await copyDir(path.join(aidlcDir, 'skills'), path.join(destRoot, 'skills'));

      const wsSrc = path.join(aidlcDir, 'workspace.yaml');
      if (fs.existsSync(wsSrc)) {
        fs.mkdirSync(destRoot, { recursive: true });
        fs.copyFileSync(wsSrc, path.join(destRoot, 'workspace.yaml'));
        total++;
      }

      total += await copyDir(agentsDir, path.join(destRoot, 'agents'));

      vscode.window.showInformationMessage(
        `Template saved — ${total} files written to ${destRoot}`,
        'Open Folder',
      ).then(choice => {
        if (choice === 'Open Folder') {
          vscode.env.openExternal(vscode.Uri.file(destRoot));
        }
      });
    },
  );
}
