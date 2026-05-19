import type { Task, TaskBoard, LogEntry, StoryMeta } from '../../types';

export type { Task, TaskBoard, LogEntry, StoryMeta };

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

export interface HistoryEntry {
  filename: string;
  timestamp: string;
  preview: string;
}

export interface SidebarState {
  board: TaskBoard | null;
  agents: WorkspaceAgent[];
  stories: StoryMeta[];
  entries: LogEntry[];
  pipelineRunning: boolean;
  workspaceName: string;
  agentCount: number;
  skillCount: number;
  flowCount: number;
}

export interface WorkspaceState {
  board: TaskBoard | null;
  agents: WorkspaceAgent[];
  stories: StoryMeta[];
  yaml: WorkspaceConfig | null;
  history: HistoryEntry[];
  logs: LogEntry[];
  pipelineRunning: boolean;
  workspaceName: string;
  entries: LogEntry[];
  expandEpicId?: string;
  initialTab?: string;
}

export interface ActivityFeedState {
  entries: LogEntry[];
}
