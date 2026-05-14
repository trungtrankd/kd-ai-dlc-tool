import * as fs from 'fs';
import * as path from 'path';
import { LogEntry } from '../types';

/**
 * Reads .agent-log.jsonl and returns parsed entries starting from `offset`.
 * Silently skips lines that cannot be parsed as JSON.
 */
export function readLogEntries(workspaceRoot: string, offset = 0): LogEntry[] {
  const filePath = path.join(workspaceRoot, '.agent-log.jsonl');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim());
    return lines.slice(offset).reduce<LogEntry[]>((acc, line) => {
      try {
        acc.push(JSON.parse(line) as LogEntry);
      } catch {
        // skip malformed lines
      }
      return acc;
    }, []);
  } catch {
    return [];
  }
}

/**
 * Returns the total number of non-empty lines in .agent-log.jsonl.
 */
export function countLogLines(workspaceRoot: string): number {
  const filePath = path.join(workspaceRoot, '.agent-log.jsonl');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.split('\n').filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}
