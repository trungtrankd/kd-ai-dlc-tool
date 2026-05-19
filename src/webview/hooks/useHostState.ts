import { useEffect, useState } from 'react';
import { onHostMessage } from '../lib/bridge';

type HostMessage<T> =
  | { type: 'state'; state: T }
  | { command: 'init'; [key: string]: unknown }
  | { command: 'appendEntries'; entries: unknown[] }
  | { command: 'setEntries'; entries: unknown[] }
  | { command: 'updateBoard'; board: unknown }
  | { command: 'updateAgents'; agents: unknown[] }
  | { command: 'updateStories'; stories: unknown[] }
  | { command: 'expandEpic'; id: string }
  | { command: 'switchTab'; tab: string }
  | { command: 'storyCreated' };

export function useHostState<T>(
  initial: T,
  onMessage?: (msg: HostMessage<T>, prev: T) => T,
): T {
  // Seed from window.__AIDLC_INITIAL_STATE__ if injected by host
  const seed = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).__AIDLC_INITIAL_STATE__ as T | undefined
    : undefined;

  const [state, setState] = useState<T>(seed ?? initial);

  useEffect(() => {
    return onHostMessage((raw) => {
      const msg = raw as HostMessage<T>;
      setState((prev) => {
        if (msg.type === 'state') { return msg.state; }
        if (onMessage) { return onMessage(msg, prev); }
        return prev;
      });
    });
  }, [onMessage]);

  return state;
}
