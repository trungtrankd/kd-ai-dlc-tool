import * as fs from 'fs';
import * as path from 'path';
import { StoryMeta } from '../types';

const STORIES_DIR = 'stories';

function parseSimpleFrontmatter(content: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const lines = content.split('\n');
  let inFrontmatter = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      if (!inFrontmatter) {
        inFrontmatter = true;
        continue;
      } else {
        break; // end of frontmatter
      }
    }
    if (inFrontmatter) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
        meta[key] = value;
      }
    }
  }
  return meta;
}

function getPreview(content: string): string {
  // Strip frontmatter block
  let body = content;
  if (body.startsWith('---')) {
    const end = body.indexOf('---', 3);
    if (end > 0) {
      body = body.slice(end + 3).trim();
    }
  }
  // Strip markdown headings
  const lines = body
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, 2).join(' ').slice(0, 120);
}

/**
 * Lists all .md files in stories/ and extracts frontmatter metadata.
 */
export function listStories(workspaceRoot: string): StoryMeta[] {
  const dir = path.join(workspaceRoot, STORIES_DIR);
  if (!fs.existsSync(dir)) {
    return [];
  }

  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }

  return files.map((filename): StoryMeta => {
    const filePath = path.join(dir, filename);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const meta = parseSimpleFrontmatter(content);
      return {
        filename,
        title: meta['title'],
        taiga_ref: meta['taiga_ref'],
        taiga_url: meta['taiga_url'],
        saved_at: meta['saved_at'],
        preview: getPreview(content),
      };
    } catch {
      return { filename };
    }
  });
}

/**
 * Reads the full markdown content of a story file.
 */
export function readStory(workspaceRoot: string, filename: string): string {
  const filePath = path.join(workspaceRoot, STORIES_DIR, filename);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Saves a story to stories/<filename>.md with a YAML frontmatter header.
 */
export function saveStory(
  workspaceRoot: string,
  content: string,
  meta: Partial<StoryMeta> & { filename: string },
): void {
  const dir = path.join(workspaceRoot, STORIES_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const savedAt = meta.saved_at ?? new Date().toISOString();
  const frontmatterLines = ['---'];
  if (meta.title) {
    frontmatterLines.push(`title: "${meta.title.replace(/"/g, '\\"')}"`);
  }
  if (meta.taiga_ref) {
    frontmatterLines.push(`taiga_ref: "${meta.taiga_ref}"`);
  }
  if (meta.taiga_url) {
    frontmatterLines.push(`taiga_url: "${meta.taiga_url}"`);
  }
  frontmatterLines.push(`saved_at: "${savedAt}"`);
  frontmatterLines.push('---');

  const fullContent = frontmatterLines.join('\n') + '\n\n' + content;
  fs.writeFileSync(path.join(dir, meta.filename), fullContent, 'utf8');
}

/**
 * Deletes a story file from the stories directory.
 */
export function deleteStory(workspaceRoot: string, filename: string): void {
  const filePath = path.join(workspaceRoot, STORIES_DIR, filename);
  fs.unlinkSync(filePath);
}
