import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Locates the claude CLI binary.
 * Mirrors Python's _find_claude():
 *   1. Explicit override path from VS Code config
 *   2. `which claude` / `where claude` (PATH)
 *   3. Common install locations
 */
export function findClaude(explicitPath?: string): string | undefined {
  // 1. Explicit override
  if (explicitPath && explicitPath.trim()) {
    try {
      fs.accessSync(explicitPath.trim(), fs.constants.X_OK);
      return explicitPath.trim();
    } catch {
      // fall through
    }
  }

  // 2. PATH lookup
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
    const result = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (result) {
      return result.split('\n')[0].trim();
    }
  } catch {
    // not in PATH
  }

  // 3. Common install locations
  const candidates = [
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(os.homedir(), '.npm-global', 'bin', 'claude'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'claude.cmd'), // Windows npm global
  ];

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // try next
    }
  }

  return undefined;
}
