/**
 * The app's number formatter (GDD §4.2): the notation tables bound once, with the dev assertion.
 * In dev builds a non-finite value throws (so a NaN can never hide behind `—`); in production it
 * renders as `—`.
 */
import { createFormatter } from '../engine/format.ts';
import type { Num } from '../engine/num.ts';
import { NOTATION_TABLES } from './strings.ts';

function assertFinite(v: Num): never {
  throw new Error(`format: non-finite value ${String(v)}`);
}

export const fmt = createFormatter(
  NOTATION_TABLES,
  import.meta.env.DEV ? { onInvalid: assertFinite } : undefined,
);
