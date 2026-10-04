/**
 * Durations and times (GDD §17.4, §19, §20.2). Every word and unit comes from `strings.ts`; the
 * numbers go through the player's formatter, so they follow the notation and precision settings.
 *
 * - Time-to-afford: `≈ 12s`, `≈ 3.40m`, `≈ 2.10h`, `≈ 1,234d`, or `—` when the target is never
 *   reached. An affordable button shows ✓ instead (its time is 0), so there is no "now".
 * - Durations (`formatDuration`, the While-away time): the same units without `≈`.
 * - Timestamps (`formatTimestamp`, the backup's time): local `YYYY-MM-DD HH:MM` from the `Date`
 *   getters, without `Intl`, so every locale shows the same form.
 */
import { STRINGS } from './strings.ts';
import { fill } from './tpl.ts';

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

/** Formats a number (the bound formatter of `fmt.ts` / `useFormat`). */
export type FormatFn = (v: number) => string;

/** The value a formatted number shows (plain digits below 1000 in every notation, §4.2). */
function shownValue(text: string): number {
  return Number(text.replace(/,/g, ''));
}

/**
 * Seconds as an approximate duration: `null` (never) is `—`; under a minute whole seconds
 * rounded up (so never `≈ 0s`), then minutes, hours and days. The unit is chosen after
 * rounding: a value that would show as 60 of its unit (or 24 hours) moves to the next unit, so
 * 59.2 s is `≈ 1m`, 3,599 s `≈ 1.00h` and 86,399 s `≈ 1.00d`, never `≈ 60s`, `≈ 60.0m` or
 * `≈ 24.0h`.
 */
export function formatEta(seconds: number | null, format: FormatFn): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return STRINGS.none;
  const text = formatDuration(seconds, format);
  return text === STRINGS.none ? text : fill(STRINGS['time.approx'], { t: text });
}

type UnitKey = 'time.s' | 'time.m' | 'time.h' | 'time.d';

/**
 * Seconds as a duration in the largest unit that does not round to 60 of it (24 hours): `12s`
 * (whole seconds rounded up, never `0s`), `3.40m`, `2.10h`, `1,234d`; `—` for an invalid value.
 */
export function formatDuration(seconds: number, format: FormatFn): string {
  if (!Number.isFinite(seconds) || seconds < 0) return STRINGS.none;
  const unit = (key: UnitKey, n: string): string => fill(STRINGS[key], { n });
  const whole = Math.max(1, Math.ceil(seconds));
  if (whole < MINUTE) return unit('time.s', format(whole));
  // Under a minute, the whole seconds rounded up are 60: exactly 1 m.
  const minutes = format(seconds < MINUTE ? 1 : seconds / MINUTE);
  if (seconds < HOUR && !(shownValue(minutes) >= 60)) return unit('time.m', minutes);
  const hours = format(seconds / HOUR);
  if (seconds < DAY && !(shownValue(hours) >= 24)) return unit('time.h', hours);
  return unit('time.d', format(seconds / DAY));
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Epoch milliseconds as local `YYYY-MM-DD HH:MM`; `—` for an invalid time. */
export function formatTimestamp(ms: number): string {
  if (!Number.isFinite(ms)) return STRINGS.none;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return STRINGS.none;
  return fill(STRINGS['time.stamp'], {
    y: String(d.getFullYear()),
    mo: pad2(d.getMonth() + 1),
    d: pad2(d.getDate()),
    h: pad2(d.getHours()),
    mi: pad2(d.getMinutes()),
  });
}
