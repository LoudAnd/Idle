/**
 * The onboarding memory (GDD §17.1, §17.2, §17.4): the elements revealed so far, the goals done
 * and the tabs visited. All three are monotone (nothing is ever forgotten), so a purchase that
 * spends x does not hide a row, flip the Next goal chip back or bring a tab's badge back.
 *
 * One explicit value, kept by the shell's deriver (`shell/view.ts`), which observes every state
 * the loop passes through at a tick boundary, before that tick's purchases, not only the states
 * it derives a view from at the UI fps. So a reveal threshold crossed in a tick whose x a queued
 * purchase spends at the next is still recorded.
 *
 * The memory lives in the UI from M3; M4 persists it in the save as validated ids
 * (`memoryToIds` / `memoryFromIds`) and hands a loaded, imported or reset game's memory to the
 * deriver (`reset`).
 */
import type { GameState } from '../engine/state.ts';
import { previewSum } from '../engine/integrate.ts';
import { isGoalId, mergeDone } from './goals.ts';
import type { GoalContext, GoalId } from './goals.ts';
import { isRevealId, mergeReveals } from './reveal.ts';
import type { RevealContext, RevealId } from './reveal.ts';
import { TAB_DEFS } from './shell/tabs.ts';

export interface OnboardingMemory {
  readonly revealed: ReadonlySet<RevealId>;
  readonly done: ReadonlySet<GoalId>;
  /** Tab ids whose dot badge is gone (§17.2). */
  readonly visited: ReadonlySet<string>;
}

/** What the memory reads from a state: the previewed x, the bought counts, the global level. */
export type ObserveContext = RevealContext & GoalContext;

/** The tabs shown from the start (Sum) count as visited. */
const START_TABS: readonly string[] = TAB_DEFS.filter((t) => t.reveal === null).map((t) => t.id);

/** A new game's memory: nothing revealed or done, the start tab visited. */
export function newMemory(): OnboardingMemory {
  return Object.freeze({
    revealed: new Set<RevealId>(),
    done: new Set<GoalId>(),
    visited: new Set(START_TABS),
  });
}

/** The context of a state: its preview at committed + pending time (§5.5). */
export function observeContext(s: GameState): ObserveContext {
  const sum = previewSum(s);
  return { x: sum.x, bought: sum.bought, globalLevel: sum.globalLevel };
}

/** The memory after seeing `c`. Returns `m` itself when nothing is new. */
export function observeMemory(m: OnboardingMemory, c: ObserveContext): OnboardingMemory {
  const revealed = mergeReveals(m.revealed, c);
  const done = mergeDone(m.done, c);
  if (revealed === m.revealed && done === m.done) return m;
  return Object.freeze({ revealed, done, visited: m.visited });
}

/** The memory after visiting tab `id`. Returns `m` itself when it was visited already. */
export function visitTab(m: OnboardingMemory, id: string): OnboardingMemory {
  if (m.visited.has(id)) return m;
  return Object.freeze({ ...m, visited: new Set([...m.visited, id]) });
}

/** The memory as sorted id lists, the form M4 stores in the save. */
export interface MemoryIds {
  readonly revealed: readonly string[];
  readonly done: readonly string[];
  readonly visited: readonly string[];
}

export function memoryToIds(m: OnboardingMemory): MemoryIds {
  return {
    revealed: [...m.revealed].sort(),
    done: [...m.done].sort(),
    visited: [...m.visited].sort(),
  };
}

const TAB_IDS: ReadonlySet<string> = new Set(TAB_DEFS.map((t) => t.id));

const ids = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * The memory from stored ids. Never throws: a field that is not an array is empty, and ids this
 * build does not know (a typo, or a later build's element) are dropped. The start tabs are
 * always visited.
 */
export function memoryFromIds(raw: unknown): OnboardingMemory {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return Object.freeze({
    revealed: new Set(ids(r.revealed).filter(isRevealId)),
    done: new Set(ids(r.done).filter(isGoalId)),
    visited: new Set([
      ...START_TABS,
      ...ids(r.visited).filter((t): t is string => typeof t === 'string' && TAB_IDS.has(t)),
    ]),
  });
}
