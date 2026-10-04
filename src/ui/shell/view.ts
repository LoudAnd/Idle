/**
 * The shell's view model (GDD §17.1, §17.4, §21.4): the header, the Next goal, the Sum tab and
 * the onboarding memory, derived by the game loop inside its safe wrapper (§21.8).
 *
 * `createShellDeriver()` keeps the UI-side memory that a pure view of one state cannot know:
 * - the onboarding memory (`onboarding.ts`): reveals, goals done and tabs visited, all
 *   monotone. `observe(s)` updates it from a state without deriving a view; the loop calls it
 *   at every tick boundary before the tick's actions (`GameLoopOptions.observe`), so a reveal
 *   or goal crossed between two derives is never missed (the derive rate is the UI fps);
 * - the growth samples of the last 60 s of game time (`growth.ts`);
 * - the headline x, which updates at most 10 times per second of game time (§4.2).
 *
 * Each derive computes the new memory first and assigns it last, so a derive that throws (and
 * faults the loop) leaves the memory as it was. `memory()` reads the memory and `reset(m)`
 * replaces it (M4: a loaded, imported or hard-reset game), restarting the samples and the
 * headline too.
 */
import { checkValues } from '../../engine/invariants.ts';
import type { Num } from '../../engine/num.ts';
import type { GameState } from '../../engine/state.ts';
import { nextGoal } from '../goals.ts';
import type { GoalView } from '../goals.ts';
import { addSample, growthPerMinute } from '../growth.ts';
import type { Sample } from '../growth.ts';
import { newMemory, observeContext, observeMemory, visitTab } from '../onboarding.ts';
import type { OnboardingMemory } from '../onboarding.ts';
import { REVEAL_IDS } from '../reveal.ts';
import type { RevealId } from '../reveal.ts';
import { buildSumView, sumBasis } from '../sum/view.ts';
import type { SumView } from '../sum/view.ts';

/** The headline x updates at most this often, in seconds of game time (≤ 10 Hz, §4.2). */
export const HEADLINE_INTERVAL_S = 0.1;
/** Game times are sums of doubles (0.3 − 0.2 < 0.1), so the interval allows this much jitter. */
const INTERVAL_SLACK_S = 1e-9;

export interface HeaderView {
  /** x as the headline shows it (throttled to 10 Hz of game time). */
  readonly x: Num;
  /** The x rate, A_1 · m_1 per second (exact and instantaneous). */
  readonly rate: Num;
  /** Y of ×10^Y /min, or `null` (shown as `—`). */
  readonly growth: number | null;
}

export interface ShellView {
  /** Committed plus pending game time, in seconds. */
  readonly gameTime: number;
  readonly header: HeaderView;
  readonly goal: GoalView | null;
  readonly sum: SumView;
  /** Every element revealed so far, in rule order. */
  readonly revealed: readonly RevealId[];
  /** The tabs visited so far (their dot badge is gone, §17.2). */
  readonly visited: readonly string[];
}

export interface ShellDeriver {
  derive(s: GameState): ShellView;
  /** Updates the onboarding memory from a state, without deriving a view. */
  observe(s: GameState): void;
  /** Records a visit of tab `id` (shown in the next view). */
  visit(id: string): void;
  /** The current onboarding memory. */
  memory(): OnboardingMemory;
  /** Replaces the memory (default: a new game's) and restarts the samples and the headline. */
  reset(m?: OnboardingMemory): void;
}

export function createShellDeriver(initial: OnboardingMemory = newMemory()): ShellDeriver {
  let memory = initial;
  let samples: readonly Sample[] = [];
  let headline: { readonly x: Num; readonly at: number } | null = null;
  return {
    derive(s) {
      const basis = sumBasis(s);
      const { sum } = basis;
      const gameTime = s.time + s.pendingMs / 1000;
      const ctx = { x: sum.x, bought: sum.bought, globalLevel: sum.globalLevel };
      const next = observeMemory(memory, ctx);
      const nextSamples = addSample(samples, gameTime, sum.x);
      const nextHeadline =
        headline === null ||
        gameTime < headline.at ||
        gameTime - headline.at >= HEADLINE_INTERVAL_S - INTERVAL_SLACK_S
          ? { x: sum.x, at: gameTime }
          : headline;
      const view = buildSumView(s, next.revealed, basis);
      const shell: ShellView = {
        gameTime,
        header: {
          x: nextHeadline.x,
          rate: view.tiers[0].production,
          growth: growthPerMinute(nextSamples),
        },
        goal: nextGoal(ctx, next.done),
        sum: view,
        revealed: REVEAL_IDS.filter((id) => next.revealed.has(id)),
        visited: [...next.visited],
      };
      memory = next;
      samples = nextSamples;
      headline = nextHeadline;
      return shell;
    },
    observe(s) {
      memory = observeMemory(memory, observeContext(s));
    },
    visit(id) {
      memory = visitTab(memory, id);
    },
    memory: () => memory,
    reset(m = newMemory()) {
      memory = m;
      samples = [];
      headline = null;
    },
  };
}

/** Every invalid value in the view: the generic walk of `checkValues` (GDD §21.8). */
export function checkShellView(v: ShellView): readonly string[] {
  return checkValues(v, 'view');
}
