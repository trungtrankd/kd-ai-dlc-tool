import * as fs from 'fs';
import * as path from 'path';
import type { Task, TaskBoard } from '../types';

function boardPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.task-board.json');
}

function logPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.agent-log.jsonl');
}

function readBoard(workspaceRoot: string): TaskBoard | null {
  const p = boardPath(workspaceRoot);
  if (!fs.existsSync(p)) { return null; }
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as TaskBoard; }
  catch { return null; }
}

function writeBoard(workspaceRoot: string, board: TaskBoard): void {
  fs.writeFileSync(boardPath(workspaceRoot), JSON.stringify(board, null, 2), 'utf-8');
}

function appendLog(workspaceRoot: string, agent: string, type: string, msg: string): void {
  const entry = JSON.stringify({ ts: new Date().toISOString(), agent, type, msg });
  try { fs.appendFileSync(logPath(workspaceRoot), entry + '\n', 'utf-8'); }
  catch { /* non-fatal */ }
}

/**
 * Returns all tasks that transitively depend on the given taskId (downstream tasks).
 * These are the tasks that need to be reset when a step is rejected.
 */
function getDownstreamTasks(tasks: Task[], taskId: string): Task[] {
  const visited = new Set<string>([taskId]);
  const result: Task[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of tasks) {
      if (!visited.has(t.id) && t.depends_on.some((d) => visited.has(d))) {
        result.push(t);
        visited.add(t.id);
        changed = true;
      }
    }
  }
  return result;
}

/**
 * Manually approve a task — marks it done and logs the action.
 */
export function approveTask(workspaceRoot: string, taskId: string): void {
  const board = readBoard(workspaceRoot);
  if (!board) { return; }
  const task = board.tasks.find((t) => t.id === taskId);
  if (!task) { return; }
  task.status = 'done';
  task.completed_at ??= new Date().toISOString();
  writeBoard(workspaceRoot, board);
  appendLog(workspaceRoot, 'orchestrator', 'approve', `Step "${taskId}" manually approved`);
}

/**
 * Reject a task — marks it failed and resets all downstream tasks to pending.
 */
export function rejectTask(workspaceRoot: string, taskId: string): void {
  const board = readBoard(workspaceRoot);
  if (!board) { return; }
  const task = board.tasks.find((t) => t.id === taskId);
  if (!task) { return; }
  task.status = 'failed';

  const downstream = getDownstreamTasks(board.tasks, taskId);
  for (const t of downstream) {
    t.status = 'pending';
    t.output = undefined;
    t.completed_at = undefined;
  }

  writeBoard(workspaceRoot, board);
  const resetIds = downstream.map((t) => t.id).join(', ');
  appendLog(
    workspaceRoot, 'orchestrator', 'reject',
    `Step "${taskId}" rejected${resetIds ? `; reset downstream: ${resetIds}` : ''}`,
  );
}

/**
 * Mark a task as pending so the pipeline can rerun it.
 */
export function markTaskPending(workspaceRoot: string, taskId: string): void {
  const board = readBoard(workspaceRoot);
  if (!board) { return; }
  const task = board.tasks.find((t) => t.id === taskId);
  if (!task) { return; }
  task.status = 'pending';
  task.output = undefined;
  task.completed_at = undefined;
  writeBoard(workspaceRoot, board);
  appendLog(workspaceRoot, 'orchestrator', 'rerun', `Step "${taskId}" reset to pending for rerun`);
}
