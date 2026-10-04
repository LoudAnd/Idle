/**
 * Game state (GDD §5.1, §21.2). States are immutable values: every engine function returns a
 * new state and never mutates its input, so the same actions on the same state always give the
 * same result (replay, §21.2).
 *
 * - `time` is committed game time in seconds; only `integrate` advances it.
 * - `pendingMs` is time the lazy online integration (§5.5) has not committed yet.
 * - `table` caches the event-constant effect table (§21.3). It is `null` when dirty (after a
 *   purchase), is rebuilt on demand, and is never serialized.
 */
import { ZERO, encodeNum, num } from './num.ts';
import type { Num, NumCode } from './num.ts';
import { X_START } from './content/sum.ts';
import type { EffectTable } from './effects.ts';
import { map8 } from './tiers.ts';
import type { Tuple8 } from './tiers.ts';

export { MAX_COUNT, TIERS, isTier, map8, set8, tierAt, tierIndex } from './tiers.ts';
export type { Tier, TierIndex, Tuple8 } from './tiers.ts';

/** The Sum layer (§5.1): x, the amounts A_k, the bought counts b_k and the global level L. */
export interface SumState {
  readonly x: Num;
  readonly amounts: Tuple8<Num>;
  readonly bought: Tuple8<number>;
  readonly globalLevel: number;
}

export interface GameState {
  readonly sum: SumState;
  /** Committed game seconds (advanced only by `integrate`). */
  readonly time: number;
  /** Lazy-integration pending time in milliseconds (§5.5). */
  readonly pendingMs: number;
  /** The cached event-constant effect table; `null` means dirty. Never serialized. */
  readonly table: EffectTable | null;
}

/**
 * The state after an event (a purchase; later resets, unlocks and loadout changes) that sets a
 * new Sum state: the effect table is marked dirty (§21.3). Every event goes through this, so no
 * event can forget to invalidate the cache. `integrate` keeps the table, since x and the amounts
 * feed no event-constant effect.
 */
export function withSum(s: GameState, sum: SumState): GameState {
  return { ...s, sum, table: null };
}

/** A new game (§5.1): x = 10, no generators, level 0. */
export function newGame(): GameState {
  return {
    sum: {
      x: num(X_START),
      amounts: map8(() => ZERO),
      bought: map8(() => 0),
      globalLevel: 0,
    },
    time: 0,
    pendingMs: 0,
    table: null,
  };
}

export interface StateInit {
  readonly x?: Num | number | string;
  readonly amounts?: readonly (Num | number | string)[];
  readonly bought?: readonly number[];
  readonly globalLevel?: number;
  readonly time?: number;
  readonly pendingMs?: number;
}

/**
 * A state from partial values, for tests and bot fixtures. Missing amounts and counts are 0;
 * a missing x is `X_START`. Entries beyond the eighth are ignored.
 */
export function makeState(init: StateInit = {}): GameState {
  const a = init.amounts ?? [];
  const b = init.bought ?? [];
  return {
    sum: {
      x: num(init.x ?? X_START),
      amounts: map8((i) => {
        const v = a[i];
        return v === undefined ? ZERO : num(v);
      }),
      bought: map8((i) => b[i] ?? 0),
      globalLevel: init.globalLevel ?? 0,
    },
    time: init.time ?? 0,
    pendingMs: init.pendingMs ?? 0,
    table: null,
  };
}

/** The serialized form: `Num` values as `[sign, layer, mag]` codes, keys in a fixed order. */
export interface SerializedState {
  readonly sum: {
    readonly x: NumCode;
    readonly amounts: readonly NumCode[];
    readonly bought: readonly number[];
    readonly globalLevel: number;
  };
  readonly time: number;
  readonly pendingMs: number;
}

/** The serializable form of a state (the effect table is a cache and is left out). */
export function toSerializable(s: GameState): SerializedState {
  return {
    sum: {
      x: encodeNum(s.sum.x),
      amounts: s.sum.amounts.map(encodeNum),
      bought: [...s.sum.bought],
      globalLevel: s.sum.globalLevel,
    },
    time: s.time,
    pendingMs: s.pendingMs,
  };
}

/** `JSON.stringify(toSerializable(s))`: byte-identical for identical states (§21.2). */
export function serializeState(s: GameState): string {
  return JSON.stringify(toSerializable(s));
}
