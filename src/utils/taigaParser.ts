import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

/**
 * Makes an HTTP(S) GET request and returns the response body as a string.
 */
export function httpGet(url: string, headers: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'AgentDashboardTaigaImporter/1.0',
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        resolve(httpGet(res.headers.location, headers));
        return;
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage} — ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(20000, () => {
      req.destroy();
      reject(new Error(`Request timed out: ${url}`));
    });
    req.end();
  });
}

/**
 * Port of Python's _fetch_taiga_story().
 * Accepts a Taiga browser URL like /project/<slug>/us/<ref> and fetches
 * the story object via the Taiga REST API.
 */
export async function fetchTaigaStory(
  taigaUrl: string,
  token: string = '',
): Promise<{ story: Record<string, unknown>; apiUrl: string }> {
  const parsed = new URL(taigaUrl.trim());
  const origin = `${parsed.protocol}//${parsed.hostname}`;
  const decodedPath = decodeURIComponent(parsed.pathname);

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If already a direct API URL, use as-is
  if (parsed.pathname.includes('/api/v1/userstories/')) {
    const body = await httpGet(taigaUrl, headers);
    return { story: JSON.parse(body) as Record<string, unknown>, apiUrl: taigaUrl };
  }

  // Parse browser URL: /project/<slug>/us/<ref>
  const match =
    /\/project\/([^/]+)\/us\/(\d+)/.exec(decodedPath) ||
    /\/project\/([^/]+)\/(?:user-story|userstories|stories)\/(\d+)/.exec(decodedPath);

  if (!match) {
    throw new Error(
      'Cannot read Taiga story reference from URL. Expected /project/<slug>/us/<ref>.',
    );
  }

  const [, slug, ref] = match;

  // Step 1: resolve slug → numeric project ID
  const projectUrl = `${origin}/api/v1/projects/by_slug?slug=${encodeURIComponent(slug)}`;
  let projectData: Record<string, unknown>;
  try {
    const body = await httpGet(projectUrl, headers);
    projectData = JSON.parse(body) as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Cannot find project '${slug}' (step 1: ${projectUrl}): ${msg}. Check project slug and token.`,
    );
  }

  const projectId = projectData['id'];
  if (!projectId) {
    throw new Error(`Project not found for slug: ${slug}`);
  }

  // Step 2: fetch user story by numeric project ID + ref
  const apiUrl = `${origin}/api/v1/userstories/by_ref?project=${projectId}&ref=${encodeURIComponent(ref)}`;
  let storyData: Record<string, unknown>;
  try {
    const body = await httpGet(apiUrl, headers);
    storyData = JSON.parse(body) as Record<string, unknown>;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Story ref #${ref} not found in project ${projectId} (step 2: ${apiUrl}): ${msg}`);
  }

  return { story: storyData, apiUrl };
}

// ---------------------------------------------------------------------------
// Helpers mirroring Python's private functions
// ---------------------------------------------------------------------------

function stripHtml(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p\s*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function nameFromExtra(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    return String(
      obj['name'] || obj['username'] || obj['full_name'] || obj['slug'] || '',
    );
  }
  return value ? String(value) : '';
}

function extractExistingAc(description: string): string[] {
  const lines = description.split('\n').map((l) => l.trimEnd());
  let start: number | null = null;

  for (let i = 0; i < lines.length; i++) {
    const normalized = lines[i].trim().toLowerCase();
    if (
      normalized.includes('acceptance criteria') ||
      ['ac', 'acs', 'criteria'].includes(normalized)
    ) {
      start = i;
      break;
    }
  }

  if (start === null) {
    const bullets = lines
      .filter((l) => /^\s*(-|\*|\d+[.)]) /.test(l))
      .map((l) => l.trim());
    return bullets.slice(0, 10);
  }

  const result: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') && result.length > 0) {
      break;
    }
    if (line.trim()) {
      result.push(line.trim());
    }
  }
  return result.slice(0, 20);
}

/**
 * Port of Python's _build_taiga_ai_story().
 * Builds a formatted markdown string from the Taiga story object.
 */
export function buildTaigaAiStory(
  story: Record<string, unknown>,
  sourceUrl: string,
  apiUrl: string,
): string {
  const title =
    (story['subject'] as string | undefined) ||
    (story['title'] as string | undefined) ||
    'Untitled Taiga user story';

  const ref = story['ref'] || story['id'] || '';
  const description = stripHtml(story['description'] ?? '');
  const project =
    nameFromExtra(story['project_extra_info']) ||
    String(story['project'] ?? '');
  const status = nameFromExtra(
    (story['status_extra_info'] as unknown) ?? (story['status'] as unknown),
  );
  const milestone = nameFromExtra(
    (story['milestone_slug'] as unknown) ?? (story['milestone'] as unknown),
  );

  const rawTags = story['tags'];
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.map((t) => String(t))
    : [];

  const rawAssigned = story['assigned_users'];
  const assigned: unknown[] = Array.isArray(rawAssigned) ? rawAssigned : [];
  const assignees = assigned
    .map((u) => nameFromExtra(u))
    .filter(Boolean)
    .join(', ');

  const existingAc = extractExistingAc(description);

  let acBlock: string;
  if (existingAc.length > 0) {
    acBlock = existingAc
      .map((item) => `- ${item.replace(/^[-*\d.)]+\s*/, '')}`)
      .join('\n');
  } else {
    acBlock =
      '- AC1: Given the relevant user/context from the story, When the main action is performed, ' +
      'Then the expected successful outcome is completed.\n' +
      '- AC2: Given required input or preconditions are missing/invalid, When the action is submitted, ' +
      'Then the system shows a clear validation/error state.\n' +
      '- AC3: Given the task is completed, When QA verifies the result, Then implementation matches the story scope without unrelated behavior.';
  }

  const metadata: string[] = [
    `- Source: ${sourceUrl}`,
    `- API: ${apiUrl}`,
  ];
  if (ref) {
    metadata.push(`- Taiga Ref: #${ref}`);
  }
  if (project) {
    metadata.push(`- Project: ${project}`);
  }
  if (status) {
    metadata.push(`- Status: ${status}`);
  }
  if (milestone) {
    metadata.push(`- Milestone: ${milestone}`);
  }
  if (tags.length > 0) {
    metadata.push(`- Tags: ${tags.join(', ')}`);
  }
  if (assignees) {
    metadata.push(`- Assignees: ${assignees}`);
  }

  return `# User Story

## Title
${title}

## Metadata
${metadata.join('\n')}

## Original Taiga Description
${description || '_No description provided in Taiga._'}

## Acceptance Criteria
${acBlock}

## AI Analysis Instructions
- Normalize this Taiga task into a complete user story if required.
- Keep the scope limited to the Taiga task.
- Rewrite acceptance criteria into clear Given / When / Then scenarios.
- Cover happy path, validation/error states, and edge cases implied by the task.
- Produce output that developer and QA agents can execute and verify.
`;
}
