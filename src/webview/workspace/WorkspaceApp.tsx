import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useThemeBridge } from '../hooks/useThemeBridge';
import { useHostState } from '../hooks/useHostState';
import { postMessage } from '../lib/bridge';
import type {
  WorkspaceState, Task, TaskBoard, LogEntry,
  WorkspaceAgent, StoryMeta, WorkspacePipeline, WorkspaceConfig, HistoryEntry
} from '../lib/types';

const EMPTY: WorkspaceState = {
  board: null, agents: [], stories: [], yaml: null,
  history: [], logs: [], pipelineRunning: false,
  workspaceName: '—', entries: [],
};

type Tab = 'builder' | 'epics' | 'activity';

// ── Utilities ─────────────────────────────────────────────────────────────

function shortTime(ts: string): string {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
}

function statusBg(s: string): string {
  return {
    pending: 'bg-gray-800/50 text-gray-400',
    in_progress: 'bg-teal-900/30 text-teal-300',
    done: 'bg-green-900/30 text-green-400',
    failed: 'bg-red-900/30 text-red-400',
    blocked: 'bg-yellow-900/30 text-yellow-400',
  }[s] ?? 'bg-gray-800/50 text-gray-400';
}

function logAgentBg(agent: string): string {
  const a = (agent || '').toLowerCase();
  if (a.includes('frontend')) { return 'bg-green-900/30 text-green-400'; }
  if (a.includes('backend')) { return 'bg-teal-900/30 text-teal-300'; }
  if (a.includes('database')) { return 'bg-yellow-900/30 text-yellow-400'; }
  if (a.includes('devops')) { return 'bg-orange-900/30 text-orange-400'; }
  if (a.includes('security')) { return 'bg-red-900/30 text-red-400'; }
  if (a.includes('qa')) { return 'bg-green-900/30 text-green-400'; }
  if (a.includes('product-owner') || a.includes('po')) { return 'bg-purple-900/30 text-purple-400'; }
  return 'bg-teal-900/30 text-teal-300';
}

// ── Pipeline-dashboard helpers (STORY-001) ─────────────────────────────────

type StepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'blocked';

function isStepStatus(s: string | undefined): s is StepStatus {
  return s === 'pending' || s === 'in_progress' || s === 'done' || s === 'failed' || s === 'blocked';
}

/** Find the Task that drives a given pipeline step (by id). */
function taskForStep(stepId: string, board: TaskBoard | null): Task | undefined {
  return board?.tasks?.find(t => t.id === stepId);
}

/** Resolve the visual status for a step. Unknown / missing → 'pending'. */
function stepStatus(stepId: string, board: TaskBoard | null): StepStatus {
  const t = taskForStep(stepId, board);
  return t && isStepStatus(t.status) ? t.status : 'pending';
}

/** Pick the most recent log entry whose agent matches either the task's agent or the step id. */
function latestLogFor(stepId: string, task: Task | undefined, logs: LogEntry[]): LogEntry | null {
  if (!logs || logs.length === 0) { return null; }
  const candidates: LogEntry[] = [];
  const taskAgent = (task?.agent || '').toLowerCase();
  const step = stepId.toLowerCase();
  for (const e of logs) {
    const a = (e.agent || '').toLowerCase();
    if (!a) { continue; }
    if (a === taskAgent || a === step || a.includes(step)) {
      candidates.push(e);
    }
  }
  if (candidates.length === 0) { return null; }
  // ISO 8601 timestamps sort lexicographically — pick max.
  return candidates.reduce((max, cur) => (cur.ts > max.ts ? cur : max), candidates[0]);
}

/** Compute elapsed seconds between started_at and completed_at; return null when not computable. */
function formatElapsed(started?: string, completed?: string): string | null {
  if (!started || !completed) { return null; }
  const s = Date.parse(started);
  const e = Date.parse(completed);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) { return null; }
  const totalSec = Math.max(0, Math.round((e - s) / 1000));
  if (totalSec < 60) { return `${totalSec}s`; }
  const m = Math.floor(totalSec / 60);
  const r = totalSec % 60;
  return `${m}m ${r}s`;
}

interface StatusMeta {
  icon: string;             // text/emoji glyph
  iconClass?: string;       // extra class (e.g. spinner)
  badgeLabel: string;       // ALL CAPS label
  cardBorder: string;       // border CSS
  cardBg: string;           // background CSS
  badgeBg: string;          // status badge background
  badgeColor: string;       // status badge text colour
}

function statusMeta(status: StepStatus): StatusMeta {
  switch (status) {
    case 'in_progress':
      return {
        icon: '\u29D7',           // 8-spoke asterisk — rendered with .aidlc-spin
        iconClass: 'aidlc-spin',
        badgeLabel: 'IN PROGRESS',
        cardBorder: '1px solid rgba(0,180,164,0.45)',
        cardBg: 'linear-gradient(180deg, #0b2a2a 0%, #0d1520 100%)',
        badgeBg: 'rgba(0,180,164,0.18)',
        badgeColor: '#9ef0e7',
      };
    case 'done':
      return {
        icon: '\u2713',           // ✓
        badgeLabel: 'DONE',
        cardBorder: '1px solid rgba(34,197,94,0.4)',
        cardBg: '#0d1f17',
        badgeBg: 'rgba(34,197,94,0.15)',
        badgeColor: '#22c55e',
      };
    case 'failed':
      return {
        icon: '\u2717',           // ✗
        badgeLabel: 'FAILED',
        cardBorder: '1px solid rgba(239,68,68,0.45)',
        cardBg: '#1f1014',
        badgeBg: 'rgba(239,68,68,0.18)',
        badgeColor: '#ef4444',
      };
    case 'blocked':
      return {
        icon: '\u25CF',           // ●
        badgeLabel: 'BLOCKED',
        cardBorder: '1px solid rgba(234,179,8,0.4)',
        cardBg: '#1a1608',
        badgeBg: 'rgba(234,179,8,0.18)',
        badgeColor: '#eab308',
      };
    case 'pending':
    default:
      return {
        icon: '\u25CB',           // ○
        badgeLabel: 'PENDING',
        cardBorder: '1px solid #1a2c3d',
        cardBg: '#0d1520',
        badgeBg: 'rgba(74,106,132,0.18)',
        badgeColor: '#8aaabe',
      };
  }
}

// ── Reducer ────────────────────────────────────────────────────────────────
function reducer(msg: unknown, prev: WorkspaceState): WorkspaceState {
  const m = msg as { command?: string; [k: string]: unknown };
  switch (m.command) {
    case 'init':
      return {
        ...prev,
        board: (m.board ?? null) as TaskBoard | null,
        agents: (m.agents ?? []) as WorkspaceAgent[],
        stories: (m.stories ?? []) as StoryMeta[],
        yaml: (m.yaml ?? null) as WorkspaceConfig | null,
        history: (m.history ?? []) as HistoryEntry[],
        logs: (m.logs ?? []) as LogEntry[],
        pipelineRunning: Boolean(m.pipelineRunning),
        entries: [],
      };
    case 'updateBoard': return { ...prev, board: (m.board ?? null) as TaskBoard | null };
    case 'updateAgents': return { ...prev, agents: (m.agents ?? []) as WorkspaceAgent[] };
    case 'updateStories': return { ...prev, stories: (m.stories ?? []) as StoryMeta[] };
    case 'setEntries': return { ...prev, entries: (m.entries ?? []) as LogEntry[] };
    case 'appendEntries': {
      const newE = (m.entries ?? []) as LogEntry[];
      return { ...prev, entries: [...prev.entries, ...newE] };
    }
    case 'storyCreated': return prev;
    default: return prev;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${statusBg(status)}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function TaskRow({ task, onApprove, onReject, onRerun }: {
  task: Task;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRerun: (id: string) => void;
}) {
  const showApproveReject = task.status === 'in_progress' || task.status === 'done';
  const showRerun = task.status === 'failed' || task.status === 'done';

  return (
    <div className="rounded border p-2.5 mb-1.5 text-[11px]"
         style={{ background: '#111a23', border: '1px solid #1a2c3d' }}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold font-mono text-[10px]" style={{ color: '#00c8b6' }}>{task.id}</span>
          <StatusBadge status={task.status} />
          <span className="text-[10px]" style={{ color: '#4a6a84' }}>[{task.agent}]</span>
        </div>
      </div>
      <div className="text-[#c8d8e8] mb-1">{task.task}</div>
      {task.output && (
        <div className="mt-1 p-1.5 rounded text-[10px] font-mono overflow-x-auto" style={{ background: '#080f18', color: '#8aaabe' }}>
          {task.output.slice(0, 200)}{task.output.length > 200 ? '…' : ''}
        </div>
      )}
      {(showApproveReject || showRerun) && (
        <div className="flex gap-1.5 mt-1.5">
          {showApproveReject && (
            <>
              <button onClick={() => onApprove(task.id)}
                className="px-2.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors"
                style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                &#x2713; APPROVE
              </button>
              <button onClick={() => onReject(task.id)}
                className="px-2.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                &#x2717; REJECT
              </button>
            </>
          )}
          {showRerun && (
            <button onClick={() => onRerun(task.id)}
              className="px-2.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors"
              style={{ background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }}>
              &#x21BA; RERUN
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EpicCard({ board, stories, onApprove, onReject, onRerun, onRunStory, onDeleteStory, expandId }: {
  board: TaskBoard | null;
  stories: StoryMeta[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onRerun: (id: string) => void;
  onRunStory: (filename: string) => void;
  onDeleteStory: (filename: string) => void;
  expandId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedStory, setExpandedStory] = useState<string | null>(null);

  useEffect(() => {
    if (expandId) { setExpanded(true); }
  }, [expandId]);

  const tasks = board?.tasks ?? [];
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const overallStatus = tasks.some(t => t.status === 'in_progress') ? 'in_progress'
    : tasks.some(t => t.status === 'failed') ? 'failed'
    : total && done === total ? 'done'
    : 'pending';

  return (
    <div className="mb-3">
      {board && (
        <div className="rounded border overflow-hidden mb-2" style={{ border: '1px solid #1a2c3d' }}>
          <button onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center justify-between px-3 py-2 cursor-pointer transition-colors hover:bg-[#111a23]"
            style={{ background: '#0d1520' }}>
            <div className="flex items-center gap-2">
              <span className="font-bold text-[11px]" style={{ color: '#00c8b6' }}>ACTIVE EPIC</span>
              <StatusBadge status={overallStatus} />
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[#4a6a84]">
              <span>{done}/{total} tasks</span>
              <span>{expanded ? '▲' : '▼'}</span>
            </div>
          </button>
          {expanded && (
            <div className="p-2 border-t border-[#1a2c3d]">
              <div className="text-[11px] text-[#8aaabe] mb-2">{board.feature}</div>
              {tasks.map(task => (
                <TaskRow key={task.id} task={task}
                  onApprove={onApprove} onReject={onReject} onRerun={onRerun} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Story list */}
      {stories.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-2 px-1" style={{ color: '#1e3040' }}>
            STORIES ({stories.length})
          </div>
          <div className="flex flex-col gap-1.5">
            {stories.map(s => (
              <div key={s.filename} className="rounded border overflow-hidden" style={{ border: '1px solid #1a2c3d' }}>
                <button onClick={() => setExpandedStory(es => es === s.filename ? null : s.filename)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 cursor-pointer hover:bg-[#111a23] transition-colors"
                  style={{ background: '#0d1520' }}>
                  <div className="flex items-center gap-2 overflow-hidden">
                    <span className="text-[11px] font-semibold truncate" style={{ color: '#c8d8e8' }}>
                      {s.title || s.filename}
                    </span>
                  </div>
                  <span className="text-[#4a6a84] text-xs flex-shrink-0">{expandedStory === s.filename ? '▲' : '▼'}</span>
                </button>
                {expandedStory === s.filename && (
                  <div className="px-2.5 py-2 border-t border-[#1a2c3d] flex gap-2">
                    <button onClick={() => onRunStory(s.filename)}
                      className="px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer"
                      style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}>
                      &#x25B6; Run
                    </button>
                    <button onClick={() => onDeleteStory(s.filename)}
                      className="px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                      &#x2715; Delete
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!board && stories.length === 0 && (
        <div className="text-center py-8 text-[#4a6a84] text-[11px]">
          No epics yet. Start a pipeline from the Builder tab.
        </div>
      )}
    </div>
  );
}

// ── Pipeline Status Dashboard (STORY-001) ─────────────────────────────────

function PipelineStepCard({ step, board, logs }: {
  step: string;
  board: TaskBoard | null;
  logs: LogEntry[];
}) {
  const task = taskForStep(step, board);
  const status = stepStatus(step, board);
  const meta = statusMeta(status);
  const elapsed = task && status === 'done'
    ? formatElapsed(task.started_at, task.completed_at)
    : null;
  const latest = status === 'in_progress' ? latestLogFor(step, task, logs) : null;
  const failureReason = status === 'failed' ? (task?.output ?? '').trim() : '';

  return (
    <div
      className="rounded p-2.5"
      style={{ background: meta.cardBg, border: meta.cardBorder }}
      data-step={step}
      data-status={status}
      aria-label={`Step ${step} ${meta.badgeLabel}`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-block text-[13px] leading-none ${meta.iconClass ?? ''}`}
            style={{ color: meta.badgeColor }}
            aria-hidden="true"
          >
            {meta.icon}
          </span>
          <span className="font-bold text-[11px] uppercase tracking-wider" style={{ color: '#c8d8e8' }}>
            {step}
          </span>
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
            style={{ background: meta.badgeBg, color: meta.badgeColor }}
          >
            {meta.badgeLabel}
          </span>
        </div>
        {elapsed && (
          <span className="text-[10px] font-mono" style={{ color: '#22c55e' }}>
            {elapsed}
          </span>
        )}
      </div>
      {task?.agent && (
        <div className="text-[10px]" style={{ color: '#4a6a84' }}>
          agent: {task.agent}
        </div>
      )}
      {latest && (
        <div
          className="mt-1.5 px-2 py-1 rounded text-[10px] font-mono truncate"
          style={{ background: '#080f18', color: '#8aaabe' }}
          title={latest.msg}
        >
          {latest.msg}
        </div>
      )}
      {failureReason && (
        <div
          className="mt-1.5 px-2 py-1 rounded text-[10px] font-mono"
          style={{ background: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
          title={failureReason}
        >
          {failureReason.length > 240 ? failureReason.slice(0, 237) + '…' : failureReason}
        </div>
      )}
    </div>
  );
}

function PipelineProgressBar({ steps, board }: { steps: string[]; board: TaskBoard | null }) {
  if (steps.length === 0) { return null; }
  let firstFailedIndex = -1;
  let doneCount = 0;
  steps.forEach((s, i) => {
    const st = stepStatus(s, board);
    if (st === 'done') { doneCount += 1; }
    if (st === 'failed' && firstFailedIndex === -1) { firstFailedIndex = i; }
  });
  const hasFailure = firstFailedIndex !== -1;
  // On failure, freeze the bar at the failed step's index. Otherwise show done count.
  const filledSteps = hasFailure ? firstFailedIndex : doneCount;
  const pct = Math.max(0, Math.min(100, Math.round((filledSteps / steps.length) * 100)));
  const fillColor = hasFailure ? '#ef4444' : '#22c55e';
  const label = hasFailure
    ? `Failed at ${steps[firstFailedIndex]} (${filledSteps}/${steps.length})`
    : `Done ${doneCount}/${steps.length}`;
  return (
    <div className="mb-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#1e3040' }}>
          PIPELINE PROGRESS
        </span>
        <span className="text-[10px] font-mono" style={{ color: hasFailure ? '#ef4444' : '#8aaabe' }}>
          {label} — {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded overflow-hidden" style={{ background: '#1a2c3d' }}>
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}

function PipelineDashboard({ steps, board, logs }: {
  steps: string[];
  board: TaskBoard | null;
  logs: LogEntry[];
}) {
  return (
    <div>
      <PipelineProgressBar steps={steps} board={board} />
      <div className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: '#1e3040' }}>
        PIPELINE STEPS
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {steps.map(step => (
          <PipelineStepCard key={step} step={step} board={board} logs={logs} />
        ))}
      </div>
    </div>
  );
}

function BuilderView({ state }: { state: WorkspaceState }) {
  const { agents, stories, yaml, history, pipelineRunning, board, logs } = state;
  const [newStoryTitle, setNewStoryTitle] = useState('');
  const [newStoryDesc, setNewStoryDesc] = useState('');
  const [newStoryAC, setNewStoryAC] = useState('');
  const [showNewStory, setShowNewStory] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'pipeline' | 'agents' | 'history'>('pipeline');

  const pipelines = yaml?.pipelines ?? [];
  const DEFAULT_STEPS = ['plan','design','test-plan','implement','review','execute-test','release','monitor','doc-sync'];
  const steps = pipelines[0]?.steps?.length
    ? pipelines[0].steps.map(s => s.replace(/^human:/, ''))
    : DEFAULT_STEPS;

  function saveStory() {
    if (!newStoryTitle.trim()) { return; }
    postMessage({
      command: 'saveNewStory',
      title: newStoryTitle.trim(),
      description: newStoryDesc.trim(),
      acceptanceCriteria: newStoryAC.trim(),
    });
    setNewStoryTitle(''); setNewStoryDesc(''); setNewStoryAC('');
    setShowNewStory(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Sub-tabs */}
      <div className="flex border-b border-[#1a2c3d] flex-shrink-0" style={{ background: '#090f18' }}>
        {(['pipeline', 'agents', 'history'] as const).map(t => (
          <button key={t} onClick={() => setActiveSubTab(t)}
            className={`px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors cursor-pointer uppercase tracking-wider ${
              activeSubTab === t
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-[#4a6a84] hover:text-[#8aaabe]'
            }`}
            style={{ background: 'transparent' }}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeSubTab === 'pipeline' && (
          <div>
            {/* Pipeline status dashboard — real-time per-step status with progress bar (STORY-001) */}
            <div className="mb-4">
              <PipelineDashboard steps={steps} board={board} logs={logs} />
            </div>

            {/* Actions */}
            <div className="flex gap-2 mb-4 flex-wrap">
              <button onClick={() => postMessage({ command: pipelineRunning ? 'cancelPipeline' : 'runPipeline' })}
                className="px-3 py-1.5 rounded text-[11px] font-bold cursor-pointer transition-colors flex items-center gap-1.5"
                style={{
                  background: pipelineRunning ? 'rgba(239,68,68,0.12)' : '#0a5f56',
                  color: pipelineRunning ? '#ef4444' : '#9ef0e7',
                  border: `1px solid ${pipelineRunning ? 'rgba(239,68,68,0.3)' : 'rgba(0,180,164,0.28)'}`,
                }}>
                {pipelineRunning ? '\u25A0 CANCEL' : '\u25B6 START EPIC'}
              </button>
              <button onClick={() => postMessage({ command: 'continuePipeline' })}
                className="px-3 py-1.5 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                style={{ background: '#111a23', color: '#8aaabe', border: '1px solid #243444' }}>
                Continue
              </button>
              <button onClick={() => postMessage({ command: 'openYaml' })}
                className="px-3 py-1.5 rounded text-[11px] font-semibold cursor-pointer transition-colors"
                style={{ background: '#111a23', color: '#8aaabe', border: '1px solid #243444' }}>
                Edit YAML
              </button>
            </div>

            {/* Stories */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#1e3040' }}>
                  STORIES
                </div>
                <button onClick={() => setShowNewStory(s => !s)}
                  className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}>
                  + New Story
                </button>
              </div>

              {showNewStory && (
                <div className="mb-3 p-3 rounded border" style={{ background: '#111a23', border: '1px solid #243444' }}>
                  <input
                    value={newStoryTitle} onChange={e => setNewStoryTitle(e.target.value)}
                    placeholder="Story title..."
                    className="w-full px-2 py-1.5 rounded mb-2 text-[11px] outline-none"
                    style={{ background: '#0b1219', color: '#c8d8e8', border: '1px solid #243444' }}
                  />
                  <textarea
                    value={newStoryDesc} onChange={e => setNewStoryDesc(e.target.value)}
                    placeholder="Description (optional)..."
                    rows={2}
                    className="w-full px-2 py-1.5 rounded mb-2 text-[11px] outline-none resize-y"
                    style={{ background: '#0b1219', color: '#c8d8e8', border: '1px solid #243444' }}
                  />
                  <textarea
                    value={newStoryAC} onChange={e => setNewStoryAC(e.target.value)}
                    placeholder="Acceptance criteria (optional)..."
                    rows={2}
                    className="w-full px-2 py-1.5 rounded mb-2 text-[11px] outline-none resize-y"
                    style={{ background: '#0b1219', color: '#c8d8e8', border: '1px solid #243444' }}
                  />
                  <div className="flex gap-2">
                    <button onClick={saveStory}
                      className="px-3 py-1 rounded text-[11px] font-bold cursor-pointer"
                      style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}>
                      Save Story
                    </button>
                    <button onClick={() => setShowNewStory(false)}
                      className="px-3 py-1 rounded text-[11px] font-semibold cursor-pointer"
                      style={{ background: 'transparent', color: '#4a6a84', border: '1px solid #1a2c3d' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {stories.map(s => (
                <div key={s.filename} className="flex items-center justify-between px-2.5 py-1.5 rounded border mb-1 text-[11px]"
                     style={{ background: '#0d1520', border: '1px solid #1a2c3d' }}>
                  <span className="truncate text-[#c8d8e8]" style={{ maxWidth: '70%' }}>{s.title || s.filename}</span>
                  <button onClick={() => postMessage({ command: 'runStory', filename: s.filename })}
                    className="text-[10px] font-bold px-2 py-0.5 rounded cursor-pointer flex-shrink-0"
                    style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}>
                    &#x25B6; Run
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'agents' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: '#1e3040' }}>
                AGENTS ({agents.length})
              </div>
              <button onClick={() => postMessage({ command: 'openAgentsFolder' })}
                className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}>
                + Add Agent
              </button>
            </div>
            {agents.map(a => (
              <div key={a.id} className="rounded border px-3 py-2 mb-1.5 text-[11px]"
                   style={{ background: '#111a23', border: '1px solid #1a2c3d' }}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold font-mono" style={{ color: '#00c8b6' }}>{a.id}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.2)' }}>
                    {a.model.replace('claude-', '').replace('-4-6', '').replace('-4-5-20251001', '')}
                  </span>
                </div>
                {a.description && <div className="text-[10px] text-[#8aaabe]">{a.description}</div>}
                <div className="text-[9px] mt-0.5 text-[#4a6a84]">skill: {a.skill}</div>
              </div>
            ))}
            {agents.length === 0 && (
              <div className="text-center py-6 text-[#4a6a84] text-[11px]">
                No agents found. Create your first agent!
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'history' && (
          <div>
            <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: '#1e3040' }}>
              PIPELINE HISTORY
            </div>
            {history.map(h => (
              <div key={h.filename} className="rounded border px-3 py-2 mb-1.5"
                   style={{ background: '#111a23', border: '1px solid #1a2c3d' }}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] font-mono text-[#4a6a84]">{h.timestamp}</span>
                  <button onClick={() => postMessage({ command: 'reRunHistory', historyFilename: h.filename })}
                    className="text-[9px] font-bold px-1.5 py-0.5 rounded cursor-pointer"
                    style={{ background: '#0a5f56', color: '#9ef0e7', border: '1px solid rgba(0,180,164,0.28)' }}>
                    &#x21BA; Rerun
                  </button>
                </div>
                <div className="text-[10px] text-[#8aaabe] truncate">{h.preview}</div>
              </div>
            ))}
            {history.length === 0 && (
              <div className="text-center py-6 text-[#4a6a84] text-[11px]">No pipeline history yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityView({ entries }: { entries: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0" style={{ borderColor: '#1a2c3d', background: '#090f18' }}>
        <span className="text-[11px] font-bold text-[#c8d8e8]">Agent Activity Log</span>
        <span className="text-[10px] text-[#4a6a84]">{entries.length} entries</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {entries.length === 0 && (
          <div className="text-center py-12 text-[#4a6a84] text-[11px]">
            No activity yet. Start a pipeline to see logs.
          </div>
        )}
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2 py-1 border-b text-[11px]" style={{ borderColor: '#1a2c3d' }}>
            <span className="font-mono text-[10px] flex-shrink-0 w-20" style={{ color: '#1e3040' }}>{shortTime(e.ts)}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${logAgentBg(e.agent)}`}>
              {(e.agent || '?').slice(0, 10)}
            </span>
            <span className="text-[10px] break-words flex-1" style={{ color: '#8aaabe' }}>{e.msg}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export function WorkspaceApp() {
  useThemeBridge();

  // Read initial tab from window.__AIDLC_INITIAL_STATE__ if set
  const seedState = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__AIDLC_INITIAL_STATE__ as WorkspaceState | undefined
    : undefined;

  const [tab, setTab] = useState<Tab>((seedState?.initialTab as Tab | undefined) ?? 'builder');
  const [expandEpicId, setExpandEpicId] = useState<string | undefined>();

  const state = useHostState<WorkspaceState>(EMPTY, useCallback((msg: unknown, prev: WorkspaceState): WorkspaceState => {
    const m = msg as { command?: string; [k: string]: unknown };
    if (m.command === 'switchTab') {
      const newTab = m.tab as Tab;
      if (newTab === 'builder' || newTab === 'epics' || newTab === 'activity') {
        setTab(newTab);
      }
      return prev;
    }
    if (m.command === 'expandEpic') {
      setTab('epics');
      setExpandEpicId(m.id as string);
      return prev;
    }
    return reducer(msg, prev);
  }, []));

  const { board, agents, stories, yaml, history, logs, pipelineRunning, workspaceName, entries } = state;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'builder', label: 'Builder' },
    { id: 'epics',   label: 'Epics' },
    { id: 'activity',label: 'Activity' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0b1219', color: '#c8d8e8' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-2.5 border-b flex items-center justify-between flex-wrap gap-2"
           style={{ background: '#090f18', borderColor: '#1a2c3d' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded flex items-center justify-center text-base flex-shrink-0"
               style={{ background: '#0a5f56', border: '1px solid rgba(0,180,164,0.32)' }}>&#x26A1;</div>
          <div>
            <div className="font-bold text-[14px] text-[#c8d8e8]">AIDLC Builder</div>
            <div className="text-[10px] text-[#4a6a84]">{workspaceName}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pipelineRunning && (
            <button onClick={() => postMessage({ command: 'cancelPipeline' })}
              className="px-3 py-1.5 rounded text-[11px] font-bold cursor-pointer"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
              &#x25A0; CANCEL
            </button>
          )}
          <button onClick={() => postMessage({ command: 'openStateJson' })}
            className="px-2.5 py-1 rounded text-[10px] font-semibold cursor-pointer"
            style={{ background: '#111a23', color: '#8aaabe', border: '1px solid #243444' }}>
            State JSON
          </button>
          <button onClick={() => postMessage({ command: 'refresh' })}
            className="px-2.5 py-1 rounded text-[10px] font-semibold cursor-pointer"
            style={{ background: '#111a23', color: '#8aaabe', border: '1px solid #243444' }}>
            &#x21BA; Refresh
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b flex-shrink-0" style={{ background: '#090f18', borderColor: '#1a2c3d' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-[12px] font-semibold border-b-2 transition-colors cursor-pointer ${
              tab === t.id
                ? 'border-teal-400 text-teal-300'
                : 'border-transparent text-[#4a6a84] hover:text-[#8aaabe]'
            }`}
            style={{ background: 'transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'builder' && <BuilderView state={state} />}
        {tab === 'epics' && (
          <div className="h-full overflow-y-auto p-4">
            <EpicCard
              board={board} stories={stories}
              expandId={expandEpicId}
              onApprove={id => postMessage({ command: 'approveTask', taskId: id })}
              onReject={id => postMessage({ command: 'rejectTask', taskId: id })}
              onRerun={id => postMessage({ command: 'rerunTask', taskId: id })}
              onRunStory={filename => postMessage({ command: 'runStory', filename })}
              onDeleteStory={filename => postMessage({ command: 'deleteStory', filename })}
            />
          </div>
        )}
        {tab === 'activity' && <ActivityView entries={entries} />}
      </div>
    </div>
  );
}
