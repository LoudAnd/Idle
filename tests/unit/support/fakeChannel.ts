// A fake BroadcastChannel hub for the tab-lock tests (GDD §20.1). Messages are queued and
// delivered only when the test calls `deliver()` (to every other open channel, never back to the
// sender, as BroadcastChannel does), so a test controls ordering and can drop messages to model
// a lost one. Tests must always inject one of these: in vitest's jsdom the global
// BroadcastChannel is Node's real one, whose instances would really talk to each other.
import type { ChannelLike } from '../../../src/platform/tablock.ts';

type Listener = (e: { readonly data: unknown }) => void;

export interface FakeChannel extends ChannelLike {
  readonly closed: boolean;
  /** Messages this channel posted. */
  readonly sent: unknown[];
}

export interface ChannelHub {
  channel(): FakeChannel;
  /** Delivers queued messages (and the replies they cause) until none is left. Returns the count. */
  deliver(): number;
  /** Drops every queued message (lost messages). */
  drop(): number;
  readonly pending: number;
}

export function createChannelHub(): ChannelHub {
  const open = new Set<{ ch: FakeChannel; listeners: Set<Listener> }>();
  let queue: { from: FakeChannel; data: unknown }[] = [];
  return {
    channel() {
      const listeners = new Set<Listener>();
      let closed = false;
      const ch: FakeChannel = {
        sent: [],
        get closed() {
          return closed;
        },
        postMessage(data) {
          if (closed) throw new DOMException('closed', 'InvalidStateError');
          ch.sent.push(data);
          queue.push({ from: ch, data: structuredClone(data) });
        },
        addEventListener(_type, fn) {
          listeners.add(fn);
        },
        removeEventListener(_type, fn) {
          listeners.delete(fn);
        },
        close() {
          closed = true;
          for (const e of open) if (e.ch === ch) open.delete(e);
        },
      };
      open.add({ ch, listeners });
      return ch;
    },
    deliver() {
      let n = 0;
      for (let guard = 0; queue.length > 0 && guard < 1000; guard++) {
        const batch = queue;
        queue = [];
        for (const m of batch) {
          for (const e of [...open]) {
            if (e.ch === m.from) continue;
            for (const l of [...e.listeners]) l({ data: m.data });
            n++;
          }
        }
      }
      return n;
    },
    drop() {
      const n = queue.length;
      queue = [];
      return n;
    },
    get pending() {
      return queue.length;
    },
  };
}
