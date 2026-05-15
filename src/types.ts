export interface Task {
  id: string;
  agent: string;
  task: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'failed';
  depends_on: string[];
  output?: string;
  started_at?: string;
  completed_at?: string;
}

export interface TaskBoard {
  feature: string;
  created_at: string;
  tasks: Task[];
  story?: string;
}

export interface LogEntry {
  ts: string;
  agent: string;
  type: string;
  msg: string;
}

export interface MailMessage {
  id?: string;
  task_id?: string;
  from: string;
  to: string;
  type: 'task' | 'result';
  subject?: string;
  body?: string;
  sent_at: string;
  status?: string;
  summary?: string;
}

export interface StoryMeta {
  filename: string;
  title?: string;
  taiga_ref?: string;
  taiga_url?: string;
  saved_at?: string;
  preview?: string;
}
