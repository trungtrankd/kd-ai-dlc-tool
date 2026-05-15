import * as vscode from 'vscode';
import { fetchTaigaStory, buildTaigaAiStory } from '../utils/taigaParser';
import { saveStory } from '../data/storyLibrary';

/**
 * Prompts the user for a Taiga story URL and optional API token,
 * fetches the story via the Taiga REST API, builds an AI-ready markdown doc,
 * opens it in a new editor tab, and optionally saves it to the Story Library.
 */
export async function importTaiga(workspaceRoot: string): Promise<void> {
  const taigaUrl = await vscode.window.showInputBox({
    prompt: 'Taiga story URL (e.g. https://tree.taiga.io/project/myproject/us/42)',
    placeHolder: 'https://tree.taiga.io/project/<slug>/us/<ref>',
    ignoreFocusOut: true,
  });

  if (!taigaUrl?.trim()) { return; }

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
        const taigaRef = String(story['ref'] ?? '');

        const save = await vscode.window.showInformationMessage(
          `Imported: ${subject}. Save to Story Library?`,
          'Save to Library',
          'Skip',
        );

        if (save === 'Save to Library') {
          const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          const filename = `story-${Date.now()}-${slug}.md`;
          saveStory(workspaceRoot, markdown, {
            filename,
            title: subject,
            taiga_ref: taigaRef || undefined,
            taiga_url: taigaUrl.trim(),
          });
          vscode.window.showInformationMessage(
            `Story saved to library as ${filename}. Open Builder → Epics to run it.`,
          );
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        vscode.window.showErrorMessage(`Taiga import failed: ${msg}`);
      }
    },
  );
}
