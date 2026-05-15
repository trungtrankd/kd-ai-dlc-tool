import * as fs from 'fs';
import * as path from 'path';

export interface WorkspaceAgent {
  id: string;
  name: string;
  skill: string;
  model: string;
  description: string;
  artifact?: string;
}

export interface WorkspacePipeline {
  id: string;
  name: string;
  steps: string[];
  onFailure: 'stop' | 'continue';
}

export interface WorkspaceConfig {
  name: string;
  agents: WorkspaceAgent[];
  pipelines: WorkspacePipeline[];
}

export function readWorkspaceYaml(workspaceRoot: string): WorkspaceConfig | undefined {
  const filePath = path.join(workspaceRoot, '.aidlc', 'workspace.yaml');
  if (!fs.existsSync(filePath)) { return undefined; }
  try {
    return parseWorkspaceYaml(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

/**
 * Patches on_failure for a given pipeline id in workspace.yaml.
 * Uses scoped replacement: finds the pipeline block by id then replaces its on_failure line.
 */
export function patchPipelineOnFailure(
  workspaceRoot: string,
  pipelineId: string,
  value: 'stop' | 'continue',
): void {
  const filePath = path.join(workspaceRoot, '.aidlc', 'workspace.yaml');
  if (!fs.existsSync(filePath)) { return; }
  try {
    const yaml = fs.readFileSync(filePath, 'utf-8');
    // Find the pipeline block that has the matching id, then replace its on_failure line
    const pipelineBlockRe = new RegExp(
      `(- id:\\s*${escapeRegex(pipelineId)}[\\s\\S]*?on_failure:\\s*)\\S+`,
    );
    const updated = yaml.replace(pipelineBlockRe, `$1${value}`);
    fs.writeFileSync(filePath, updated, 'utf-8');
  } catch { /* non-fatal */ }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Simple line-by-line YAML parser for the specific workspace.yaml structure.
// Handles indented list items and key: value pairs at 2-space indent levels.
// ---------------------------------------------------------------------------

type Section = 'none' | 'agents' | 'pipelines';

function parseWorkspaceYaml(content: string): WorkspaceConfig {
  const config: WorkspaceConfig = { name: '', agents: [], pipelines: [] };

  // Top-level name
  const nameMatch = content.match(/^name:\s*['"]?([^'"\n\r]+)['"]?\s*$/m);
  if (nameMatch) { config.name = nameMatch[1].trim(); }

  const lines = content.split(/\r?\n/);
  let section: Section = 'none';
  let currentAgent: Partial<WorkspaceAgent> | null = null;
  let currentPipeline: Partial<WorkspacePipeline> | null = null;
  let inSteps = false;

  const flushAgent = () => {
    if (currentAgent?.id) {
      config.agents.push({
        id: currentAgent.id,
        name: currentAgent.name ?? currentAgent.id,
        skill: currentAgent.skill ?? currentAgent.id,
        model: currentAgent.model ?? '',
        description: currentAgent.description ?? '',
        artifact: currentAgent.artifact,
      });
    }
    currentAgent = null;
  };

  const flushPipeline = () => {
    if (currentPipeline?.id) {
      config.pipelines.push({
        id: currentPipeline.id,
        name: currentPipeline.name ?? currentPipeline.id,
        steps: currentPipeline.steps ?? [],
        onFailure: currentPipeline.onFailure ?? 'stop',
      });
    }
    currentPipeline = null;
    inSteps = false;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) { continue; }

    // Detect top-level section headers (no leading spaces)
    if (/^agents:\s*$/.test(raw)) {
      flushAgent(); flushPipeline();
      section = 'agents'; continue;
    }
    if (/^pipelines:\s*$/.test(raw)) {
      flushAgent(); flushPipeline();
      section = 'pipelines'; continue;
    }
    if (/^skills:\s*$|^environment:\s*$|^slash_commands:\s*$|^sidebar:\s*$/.test(raw)) {
      flushAgent(); flushPipeline();
      section = 'none'; continue;
    }

    if (section === 'agents') {
      if (/^\s{2}-\s+id:\s*/.test(raw)) {
        flushAgent();
        currentAgent = { id: trimmed.replace(/^-\s+id:\s*/, '').trim() };
        continue;
      }
      if (currentAgent) {
        const kv = parseKV(trimmed);
        if (kv) {
          switch (kv.key) {
            case 'name':        currentAgent.name = kv.val; break;
            case 'skill':       currentAgent.skill = kv.val; break;
            case 'model':       currentAgent.model = kv.val; break;
            case 'description': currentAgent.description = kv.val; break;
            case 'artifact':    currentAgent.artifact = kv.val; break;
          }
        }
      }
      continue;
    }

    if (section === 'pipelines') {
      if (/^\s{2}-\s+id:\s*/.test(raw)) {
        flushPipeline();
        currentPipeline = { id: trimmed.replace(/^-\s+id:\s*/, '').trim(), steps: [] };
        inSteps = false;
        continue;
      }
      if (currentPipeline) {
        if (/^\s{4}steps:\s*$/.test(raw)) { inSteps = true; continue; }
        if (inSteps && /^\s{6}-\s+/.test(raw)) {
          currentPipeline.steps ??= [];
          currentPipeline.steps.push(trimmed.replace(/^-\s+/, '').trim());
          continue;
        }
        // Any non-step key resets step collection
        if (!/^\s{6}/.test(raw)) { inSteps = false; }
        const kv = parseKV(trimmed);
        if (kv) {
          switch (kv.key) {
            case 'id':         currentPipeline.id = kv.val; break;
            case 'name':       currentPipeline.name = kv.val; break;
            case 'on_failure': currentPipeline.onFailure = kv.val === 'continue' ? 'continue' : 'stop'; break;
          }
        }
      }
      continue;
    }
  }

  flushAgent();
  flushPipeline();

  return config;
}

function parseKV(s: string): { key: string; val: string } | null {
  const idx = s.indexOf(':');
  if (idx < 1) { return null; }
  const key = s.slice(0, idx).trim();
  const val = s.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  return { key, val };
}
