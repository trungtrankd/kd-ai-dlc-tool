import * as fs from 'fs';
import * as path from 'path';

export interface AgentDef {
  name: string;
  description: string;
  tools: string[];
  model: string;
  permissionMode: string;
  filePath: string;
  bodyPreview: string;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

function bodyPreview(content: string, chars = 200): string {
  const withoutFront = content.replace(/^---[\s\S]*?---\r?\n/, '').trim();
  return withoutFront.length > chars ? withoutFront.slice(0, chars) + '…' : withoutFront;
}

export function readAgents(workspaceRoot: string): AgentDef[] {
  const agentsDir = path.join(workspaceRoot, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) return [];

  const agents: AgentDef[] = [];
  for (const file of fs.readdirSync(agentsDir)) {
    if (!file.endsWith('.md')) continue;
    const filePath = path.join(agentsDir, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fm = parseFrontmatter(content);
      agents.push({
        name: fm.name || file.replace('.md', ''),
        description: fm.description || '',
        tools: fm.tools ? fm.tools.split(',').map((t) => t.trim()).filter(Boolean) : [],
        model: fm.model || '',
        permissionMode: fm.permissionMode || '',
        filePath,
        bodyPreview: bodyPreview(content),
      });
    } catch {}
  }

  return agents.sort((a, b) => a.name.localeCompare(b.name));
}
