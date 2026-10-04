/**
 * The one place numbers are rendered (GDD §4.2, §18): the formatted text, plus the spoken form
 * for screen readers in a visually hidden span when it differs from the text.
 *
 * The strings are memoized per rendered number (GDD §21.4): each `<Num>` in a row formats again
 * only when its value changes, compared by its components, since the view builds new `Num`
 * objects on every derive. When the formatter gains settings (notation, precision; M3), they
 * join the memo key.
 */
import { useMemo } from 'preact/hooks';
import type { Num as NumValue } from '../engine/num.ts';
import { fmt } from './fmt.ts';

const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: '0',
} as const;

export interface NumProps {
  readonly value: NumValue | number;
}

/** A plain number's key uses layer −1, which no `Num` has. */
const PLAIN = -1;

export function Num({ value }: NumProps) {
  const plain = typeof value === 'number';
  const k0 = plain ? value : value.sign;
  const k1 = plain ? PLAIN : value.layer;
  const k2 = plain ? 0 : value.mag;
  const { text, spoken } = useMemo(
    () => ({ text: fmt.format(value), spoken: fmt.spoken(value) }),
    [k0, k1, k2],
  );
  if (spoken === text) return <span class="num">{text}</span>;
  return (
    <span class="num">
      <span aria-hidden={true}>{text}</span>
      <span style={VISUALLY_HIDDEN}>{spoken}</span>
    </span>
  );
}
