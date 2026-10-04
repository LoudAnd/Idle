/**
 * The app's number formatter (GDD §4.2): the notation tables bound once, with the dev assertion.
 * In dev builds a non-finite value throws (so a NaN can never hide behind `—`); in production it
 * renders as `—`.
 *
 * The player's Numbers settings (notation, precision, integer threshold; GDD §19) reach the
 * components through `FormatContext`: `useFormat()` returns `format`/`spoken` bound to them, and
 * `<Num>` reads the same context.
 */
import { createContext } from 'preact';
import { useContext, useMemo } from 'preact/hooks';
import { createFormatter } from '../engine/format.ts';
import type { FormatOptions } from '../engine/format.ts';
import type { Num } from '../engine/num.ts';
import { NOTATION_TABLES } from './strings.ts';

function assertFinite(v: Num): never {
  throw new Error(`format: non-finite value ${String(v)}`);
}

export const fmt = createFormatter(
  NOTATION_TABLES,
  import.meta.env.DEV ? { onInvalid: assertFinite } : undefined,
);

/** The formatter options the player chose (empty: the defaults of GDD §4.2). */
export const FormatContext = createContext<Partial<FormatOptions>>({});

export interface BoundFormat {
  readonly options: Partial<FormatOptions>;
  format(v: Num | number): string;
  spoken(v: Num | number): string;
}

/** `fmt` bound to the options of the nearest `FormatContext`. */
export function useFormat(): BoundFormat {
  const options = useContext(FormatContext);
  return useMemo(
    () => ({
      options,
      format: (v: Num | number) => fmt.format(v, options),
      spoken: (v: Num | number) => fmt.spoken(v, options),
    }),
    [options],
  );
}
