/**
 * The one place numbers are rendered (GDD §4.2, §18): the formatted text, plus the spoken form
 * for screen readers in a visually hidden span when it differs from the text.
 *
 * The strings are memoized per rendered number (GDD §21.4): each `<Num>` in a row formats again
 * only when its value changes, compared by its components, since the view builds new `Num`
 * objects on every derive, or when the player's Numbers settings (notation, precision, integer
 * threshold, from `FormatContext`) change.
 */
import { useContext, useMemo } from 'preact/hooks';
import type { Num as NumValue } from '../engine/num.ts';
import { FormatContext, fmt } from './fmt.ts';

export interface NumProps {
  readonly value: NumValue | number;
}

/** A plain number's key uses layer −1, which no `Num` has. */
const PLAIN = -1;

export function Num({ value }: NumProps) {
  const opts = useContext(FormatContext);
  const plain = typeof value === 'number';
  const k0 = plain ? value : value.sign;
  const k1 = plain ? PLAIN : value.layer;
  const k2 = plain ? 0 : value.mag;
  const { text, spoken } = useMemo(
    () => ({ text: fmt.format(value, opts), spoken: fmt.spoken(value, opts) }),
    [k0, k1, k2, opts.notation, opts.precision, opts.intThreshold],
  );
  if (spoken === text) return <span class="num">{text}</span>;
  return (
    <span class="num">
      <span aria-hidden={true}>{text}</span>
      <span class="sr-only">{spoken}</span>
    </span>
  );
}
