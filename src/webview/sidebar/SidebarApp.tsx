import React, { useCallback } from 'react';
import { useThemeBridge } from '../hooks/useThemeBridge';
import { useHostState } from '../hooks/useHostState';
import { postMessage } from '../lib/bridge';
import type { SidebarState, LogEntry, TaskBoard, StoryMeta, WorkspaceAgent } from '../lib/types';

const EMPTY: SidebarState = {
  board: null, agents: [], stories: [], entries: [],
  pipelineRunning: false, workspaceName: '—',
  agentCount: 0, skillCount: 9, flowCount: 1,
};

function epicStatus(board: TaskBoard | null): string {
  if (!board) { return 'pending'; }
  const tasks = board.tasks ?? [];
  if (tasks.some(t => t.status === 'in_progress')) { return 'in_progress'; }
  if (tasks.some(t => t.status === 'failed')) { return 'failed'; }
  if (tasks.length && tasks.every(t => t.status === 'done')) { return 'done'; }
  return 'pending';
}

function shortTime(ts: string): string {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return ''; }
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

export function SidebarApp() {
  useThemeBridge();

  const state = useHostState<SidebarState>(EMPTY, useCallback((msg: unknown, prev: SidebarState): SidebarState => {
    const m = msg as { command?: string; board?: TaskBoard | null; agents?: WorkspaceAgent[]; stories?: StoryMeta[]; entries?: LogEntry[]; pipelineRunning?: boolean; [k: string]: unknown };
    switch (m.command) {
      case 'init':
        return {
          ...prev,
          board: (m.board ?? null) as TaskBoard | null,
          agents: (m.agents ?? []) as WorkspaceAgent[],
          stories: (m.stories ?? []) as StoryMeta[],
          entries: ((m.entries ?? []) as LogEntry[]).slice(-20),
          pipelineRunning: Boolean(m.pipelineRunning),
          agentCount: ((m.agents ?? []) as WorkspaceAgent[]).length,
        };
      case 'updateBoard': return { ...prev, board: (m.board ?? null) as TaskBoard | null };
      case 'updateAgents': return { ...prev, agents: (m.agents ?? []) as WorkspaceAgent[], agentCount: ((m.agents ?? []) as WorkspaceAgent[]).length };
      case 'updateStories': return { ...prev, stories: (m.stories ?? []) as StoryMeta[] };
      case 'appendEntries': {
        const newE = (m.entries ?? []) as LogEntry[];
        const combined = [...prev.entries, ...newE].slice(-25);
        return { ...prev, entries: combined };
      }
      default: return prev;
    }
  }, []));

  const { board, agents, stories, entries, pipelineRunning, workspaceName, agentCount, skillCount, flowCount } = state;

  const epicItems = React.useMemo(() => {
    const items: { id: string; status: string }[] = [];
    if (board) { items.push({ id: 'ACTIVE', status: epicStatus(board) }); }
    const sorted = [...stories].sort((a, b) => {
      const da = a.saved_at ? new Date(a.saved_at).getTime() : 0;
      const db = b.saved_at ? new Date(b.saved_at).getTime() : 0;
      return db - da;
    });
    sorted.slice(0, 6).forEach((s, i) => {
      items.push({ id: `EPIC-${String(sorted.length - i).padStart(3, '0')}`, status: 'pending' });
    });
    return items;
  }, [board, stories]);

  const epicCount = epicItems.length;

  const dotColor: Record<string, string> = {
    pending: 'bg-gray-500',
    in_progress: 'bg-teal-400 shadow-[0_0_5px_#00b4a4]',
    done: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#060d14', color: '#c8d8e8' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-2.5 pt-3 pb-2 border-b border-[#1a2c3d]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded flex items-center justify-center text-sm flex-shrink-0"
               style={{ background: '#0a5f56', border: '1px solid rgba(0,180,164,0.32)' }}>&#x26A1;</div>
          <div>
            <div className="text-[11px] font-bold tracking-widest text-[#c8d8e8]">AIDLC: WORKSPACE</div>
            <div className="text-[9px] text-[#4a6a84]">Agent workflow runner</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-1 p-2">
        {/* Workspace chip */}
        <button
          onClick={() => postMessage({ command: 'openBuilder' })}
          className="w-full text-left rounded p-2 border border-[#243444] hover:bg-[#0a1620] transition-colors cursor-pointer"
          style={{ background: '#0a1620' }}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-[#c8d8e8]">{workspaceName}</span>
            <span className="text-[#4a6a84] text-xs">&#x21C4; &#x00D7;</span>
          </div>
          <div className="text-[10px] text-[#4a6a84]">&#x1F527; Open Builder</div>
        </button>

        {/* Start Epic button */}
        <button
          onClick={() => postMessage({ command: pipelineRunning ? 'cancelPipeline' : 'runFullPipeline' })}
          className="w-full flex items-center justify-between px-3 py-2 rounded font-bold text-[11px] tracking-widest cursor-pointer transition-colors"
          style={{
            background: pipelineRunning ? 'rgba(239,68,68,0.12)' : '#0a5f56',
            color: pipelineRunning ? '#ef4444' : '#9ef0e7',
            border: `1px solid ${pipelineRunning ? 'rgba(239,68,68,0.3)' : 'rgba(0,180,164,0.28)'}`,
          }}
        >
          <span>{pipelineRunning ? '&#x25A0; CANCEL PIPELINE' : '&#x25B6; START EPIC'}</span>
          <span style={{ color: pipelineRunning ? '#ef4444' : '#00c8b6' }}>&#x2192;</span>
        </button>

        {/* Stats */}
        <div className="grid grid-cols-4 rounded overflow-hidden border border-[#1a2c3d] gap-px bg-[#1a2c3d]">
          {[
            { n: agentCount, l: 'AGENTS' },
            { n: skillCount, l: 'SKILLS' },
            { n: flowCount,  l: 'FLOWS' },
            { n: epicCount,  l: 'EPICS' },
          ].map(({ n, l }) => (
            <div key={l} className="flex flex-col items-center py-1.5 px-0.5" style={{ background: '#0a1620' }}>
              <div className="text-[15px] font-bold leading-none font-mono" style={{ color: '#00c8b6' }}>{n}</div>
              <div className="text-[7px] uppercase tracking-widest mt-0.5" style={{ color: '#4a6a84' }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Pipeline Runs */}
        <div className="mt-0.5">
          <div className="flex items-center justify-between px-0.5 py-1">
            <span className="text-[8px] font-bold uppercase tracking-widest flex items-center gap-1" style={{ color: '#1e3040' }}>
              PIPELINE RUNS
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <button onClick={() => postMessage({ command: 'continuePipeline' })}
              className="flex items-center justify-between px-2 py-1.5 rounded border cursor-pointer hover:bg-[#0c1a27] transition-colors"
              style={{ background: 'rgba(0,180,164,0.14)', border: '1px solid rgba(0,180,164,0.32)' }}>
              <span className="text-[11px] font-bold" style={{ color: '#00c8b6' }}>&#x25B6; Continue pipeline</span>
              <span className="text-[#4a6a84] text-[11px]">&#x2192;</span>
            </button>
            <button onClick={() => postMessage({ command: 'reviewCurrentWork' })}
              className="flex items-center justify-between px-2 py-1.5 rounded border cursor-pointer transition-colors hover:bg-[#0c1a27]"
              style={{ background: '#0a1620', border: '1px solid #1a2c3d' }}>
              <span className="text-[11px] text-[#c8d8e8]">&#x2713; Review current work</span>
              <span className="text-[#4a6a84] text-[11px]">&#x2192;</span>
            </button>
            <button onClick={() => postMessage({ command: 'openActivityFeed' })}
              className="flex items-center justify-between px-2 py-1.5 rounded border cursor-pointer transition-colors hover:bg-[#0c1a27]"
              style={{ background: '#0a1620', border: '1px solid #1a2c3d' }}>
              <span className="text-[11px] text-[#c8d8e8]">&#x2261; Open activity feed</span>
              <span className="text-[#4a6a84] text-[11px]">&#x2192;</span>
            </button>
          </div>
        </div>

        {/* Recent Epics */}
        <div className="mt-0.5">
          <div className="flex items-center justify-between px-0.5 py-1">
            <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#1e3040' }}>
              RECENT EPICS
            </span>
            <button onClick={() => postMessage({ command: 'openDashboard' })}
              className="text-[9px] cursor-pointer opacity-75 hover:opacity-100 bg-transparent border-none" style={{ color: '#00c8b6' }}>
              All {epicCount} &#x2192;
            </button>
          </div>
          <div className="flex flex-col gap-0.5">
            {epicItems.map(e => (
              <button key={e.id} onClick={() => postMessage({ command: 'openEpic', epicId: e.id })}
                className="flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-teal-900/10 transition-colors w-full text-left bg-transparent border-none">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor[e.status] ?? 'bg-gray-500'}`} />
                <span className="text-[11px] font-semibold font-mono" style={{ color: '#00c8b6' }}>{e.id}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Slash Commands */}
        <div className="mt-0.5">
          <div className="px-0.5 py-1">
            <span className="text-[8px] font-bold uppercase tracking-widest" style={{ color: '#1e3040' }}>
              SLASH COMMANDS
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {['plan','design','test-plan','implement','review','execute-test','release','monitor','doc-sync'].map(cmd => (
              <div key={cmd} className="flex items-center justify-between px-2 py-1 rounded border text-[10px]"
                style={{ background: '#0a1620', border: '1px solid #1a2c3d', color: '#4a6a84' }}>
                <span className="font-bold font-mono" style={{ color: '#00c8b6' }}>/{cmd}</span>
                <span>agent {cmd}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity log */}
      <div className="flex-shrink-0 border-t border-[#1a2c3d] p-2 max-h-36 overflow-y-auto">
        <div className="text-[8px] font-bold uppercase tracking-widest pb-1" style={{ color: '#1e3040' }}>
          ACTIVITY
        </div>
        {entries.map((e, i) => (
          <div key={i} className="flex gap-1 py-0.5 text-[9px] border-b border-[#1a2c3d]/50">
            <span className="text-[#1e3040] font-mono whitespace-nowrap">{shortTime(e.ts)}</span>
            <span className={`text-[8px] px-1 py-px rounded-full font-bold whitespace-nowrap flex-shrink-0 ${logAgentBg(e.agent)}`}>
              {(e.agent || '?').slice(0, 8)}
            </span>
            <span className="overflow-hidden text-ellipsis whitespace-nowrap flex-1 text-[#4a6a84]">
              {(e.msg || '').slice(0, 50)}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 flex items-center justify-between px-2.5 py-1.5 border-t border-[#1a2c3d]">
        <span className="text-[9px] font-mono text-[#4a6a84]">v1.0.0</span>
        <div className="flex gap-2">
          <button onClick={() => postMessage({ command: 'openBuilder' })}
            className="text-[9px] text-[#4a6a84] hover:text-[#00c8b6] cursor-pointer bg-transparent border-none">Builder</button>
          <button onClick={() => postMessage({ command: 'refresh' })}
            className="text-[9px] text-[#4a6a84] hover:text-[#00c8b6] cursor-pointer bg-transparent border-none">Refresh</button>
        </div>
      </div>
    </div>
  );
}
