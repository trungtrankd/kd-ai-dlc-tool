import React, { useCallback, useRef, useEffect } from 'react';
import { useThemeBridge } from '../hooks/useThemeBridge';
import { useHostState } from '../hooks/useHostState';
import type { ActivityFeedState, LogEntry } from '../lib/types';

const EMPTY: ActivityFeedState = { entries: [] };

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

export function ActivityFeedApp() {
  useThemeBridge();
  const bottomRef = useRef<HTMLDivElement>(null);

  const state = useHostState<ActivityFeedState>(EMPTY, useCallback((msg: unknown, prev: ActivityFeedState): ActivityFeedState => {
    const m = msg as { command?: string; entries?: LogEntry[] };
    switch (m.command) {
      case 'setEntries': return { entries: m.entries ?? [] };
      case 'appendEntries': return { entries: [...prev.entries, ...(m.entries ?? [])] };
      default: return prev;
    }
  }, []));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.entries.length]);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#0b1219', color: '#c8d8e8' }}>
      <div className="flex-shrink-0 px-4 py-2.5 border-b flex items-center justify-between"
           style={{ background: '#090f18', borderColor: '#1a2c3d' }}>
        <div>
          <div className="font-bold text-[14px] text-[#c8d8e8]">Agent Activity Feed</div>
          <div className="text-[10px] text-[#4a6a84]">{state.entries.length} entries</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {state.entries.length === 0 && (
          <div className="text-center py-16 text-[#4a6a84] text-[11px]">
            No activity yet. Start a pipeline to see logs here.
          </div>
        )}
        {state.entries.map((e, i) => (
          <div key={i} className="flex gap-3 py-1.5 border-b text-[11px]" style={{ borderColor: '#1a2c3d' }}>
            <span className="font-mono text-[10px] flex-shrink-0 w-20 pt-0.5" style={{ color: '#1e3040' }}>{shortTime(e.ts)}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap h-fit flex-shrink-0 ${logAgentBg(e.agent)}`}>
              {(e.agent || '?').slice(0, 12)}
            </span>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] break-words" style={{ color: '#8aaabe' }}>{e.msg}</span>
              {e.type && e.type !== 'info' && (
                <span className="ml-2 text-[9px] font-mono text-[#4a6a84]">[{e.type}]</span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
