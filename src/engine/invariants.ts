/**
 * The engine invariant (GDD §20.1). The platform checks it after every step (`safeTick`,
 * §21.8), and from M4 before every save: every `Num` passes `isValidNum` (finite and ≥ 0) and
 * every count is an integer in [0, 2^53]. M2 has no ids to check. `checkValues` is the same
 * rule for derived trees (the UI's view, §21.8), which the game loop checks by default.
 */
import { isNum, isValidNum } from './num.ts';
import type { GameState } from './state.ts';
import { MAX_COUNT } from './tiers.ts';

function isCount(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNT;
}

function isTime(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function check(s: GameState, out: string[]): void {
  const sum = s.sum;
  if (!isValidNum(sum.x)) out.push('sum.x: not a valid Num');
  if (!Array.isArray(sum.amounts) || sum.amounts.length !== 8) {
    out.push('sum.amounts: not 8 entries');
  } else {
    sum.amounts.forEach((a, i) => {
      if (!isValidNum(a)) out.push(`sum.amounts[${i}]: not a valid Num`);
    });
  }
  if (!Array.isArray(sum.bought) || sum.bought.length !== 8) {
    out.push('sum.bought: not 8 entries');
  } else {
    sum.bought.forEach((b, i) => {
      if (!isCount(b)) out.push(`sum.bought[${i}]: not an integer in [0, 2^53]`);
    });
  }
  if (!isCount(sum.globalLevel)) out.push('sum.globalLevel: not an integer in [0, 2^53]');
  if (!isTime(s.time)) out.push('time: not finite and ≥ 0');
  if (!isTime(s.pendingMs)) out.push('pendingMs: not finite and ≥ 0');
}

/** The problems with a state; empty when it is valid. Never throws. */
export function checkInvariants(s: GameState): readonly string[] {
  const out: string[] = [];
  try {
    check(s, out);
  } catch {
    out.push('state: unreadable');
  }
  return out;
}

/** Deeper trees than this are reported, not walked (a view is a few levels deep). */
const MAX_DEPTH = 16;

/**
 * The invalid values in a derived tree, such as the UI's view (GDD §4.2, §21.8): every `Num`
 * that is not finite and ≥ 0, and every number that is not finite. It walks plain objects and
 * arrays, so a new view field is covered without a checklist; strings, booleans and functions
 * are skipped. Empty when the tree is clean. Never throws.
 */
export function checkValues(tree: unknown, name = 'view'): readonly string[] {
  const out: string[] = [];
  const seen = new Set<object>();
  const walk = (v: unknown, path: string, depth: number): void => {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) out.push(`${path}: not a finite number`);
      return;
    }
    if (typeof v !== 'object' || v === null) return;
    if (isNum(v)) {
      if (!isValidNum(v)) out.push(`${path}: not a valid Num`);
      return;
    }
    if (seen.has(v)) return;
    if (depth >= MAX_DEPTH) {
      out.push(`${path}: nested too deeply`);
      return;
    }
    seen.add(v);
    if (Array.isArray(v)) {
      v.forEach((e, i) => walk(e, `${path}[${i}]`, depth + 1));
    } else {
      for (const [k, e] of Object.entries(v)) walk(e, `${path}.${k}`, depth + 1);
    }
  };
  try {
    walk(tree, name, 0);
  } catch {
    out.push(`${name}: unreadable`);
  }
  return out;
}
