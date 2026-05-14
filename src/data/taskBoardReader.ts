import * as fs from 'fs';
import * as path from 'path';
import { TaskBoard } from '../types';

/**
 * Reads .task-board.json from the workspace root.
 * Returns null if the file is absent or malformed.
 */
export function readTaskBoard(workspaceRoot: string): TaskBoard | null {
  const filePath = path.join(workspaceRoot, '.task-board.json');
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as TaskBoard;
  } catch {
    return null;
  }
}
