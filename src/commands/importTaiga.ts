import * as vscode from 'vscode';
import { fetchTaigaStory, buildTaigaAiStory } from '../utils/taigaParser';

/**
 * Prompts the user for a Taiga story URL and optional API token,
 * fetches the story via the Taiga REST API, builds an AI-ready markdown doc,
 * and opens it in a new editor tab.
 */
export async function importTaiga(_workspaceRoot: string): Promise<void> {
  const taigaUrl = await vscode.window.showInputBox({
    prompt: 'Taiga story URL (e.g. https://tree.taiga.io/project/myproject/us/42)',
    placeHolder: 'https://tree.taiga.io/project/<slug>/us/<ref>',
    ignoreFocusOut: true,
  });

  if (!taigaUrl?.trim()) {
    return;
  }

  const token =
    (await vscode.window.showInputBox({
      prompt: 'Taiga API token (optional — leave blank for public projects)',
      password: true,
      ignoreFocusOut: true,
    })) ?? '';

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Importing from Taiga...',
      cancellable: false,
    },
    async () => {
      try {
        const { story, apiUrl } = await fetchTaigaStory(taigaUrl.trim(), token);
        const markdown = buildTaigaAiStory(story, taigaUrl.trim(), apiUrl);

        const doc = await vscode.workspace.openTextDocument({
          content: markdown,
          language: 'markdown',
        });
        await vscode.window.showTextDocument(doc);

        const subject = (story['subject'] as string | undefined) ?? 'Taiga story';
        vscode.window.showInformationMessage(
          `Imported: ${subject}. Review the markdown then run the pipeline.`,
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Taiga import failed: ${msg}`);
      }
    },
  );
}
