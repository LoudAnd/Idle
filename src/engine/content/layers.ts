/**
 * The layer unlocks (GDD §7, §8.1, §10.1): x ≥ 2^n unlocks a layer, 2^128 for Product, 2^1024
 * (the cap) for Power and 2^65536 for Tower. The UI's reveal rule (§17.4) shows a layer's tab at
 * half the threshold, 2^(n−1), and the Next goal chip (§17.1) uses the same thresholds, so both
 * read this one table. The half is built as 2^(n−1) directly, since in break_eternity.js 2.1.3
 * `pow2(1024).div(2)` is one ulp away from `pow2(1023)`.
 *
 * Frozen constants (§14.3): these thresholds never change. M5, M13 and M21 add each layer's own
 * content beside them.
 */
import { CAP, TOWER1, pow2 } from '../num.ts';
import type { Num } from '../num.ts';

export type LayerId = 'product' | 'power' | 'tower';

export interface LayerUnlock {
  readonly id: LayerId;
  /** n of the threshold 2^n. */
  readonly log2: number;
  /** 2^n: x at or above it unlocks the layer. */
  readonly threshold: Num;
  /** 2^(n−1): x at or above it reveals the layer's tab (§17.4). */
  readonly half: Num;
}

function unlock(id: LayerId, log2: number, threshold: Num): LayerUnlock {
  return Object.freeze({ id, log2, threshold, half: Object.freeze(pow2(log2 - 1)) });
}

/** Product at 2^128, Power at 2^1024 (`CAP`), Tower at 2^65536 (`TOWER1`), in threshold order. */
export const LAYER_UNLOCKS: readonly LayerUnlock[] = Object.freeze([
  unlock('product', 128, Object.freeze(pow2(128))),
  unlock('power', 1024, CAP),
  unlock('tower', 65536, TOWER1),
]);
