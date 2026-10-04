/**
 * The bot's pacing report (GDD §22.6): an event timeline and metrics, written by
 * `npm run sim` to `sim-output/report.{json,md}`. Labels such as `G5`, `2^128` and `1e40` are
 * developer output and never shown to players.
 */
import { log10Floor1 } from '../engine/num.ts';
import type { BotRun, Profile, SimEvent } from './bot.ts';

export interface ReportEvent {
  readonly minutes: number;
  readonly label: string;
}

export interface Report {
  readonly profile: Profile;
  readonly seed: number;
  /** Simulated minutes run. */
  readonly minutes: number;
  readonly events: readonly ReportEvent[];
  readonly final: {
    readonly log10x: number;
    readonly bought: readonly number[];
    readonly globalLevel: number;
  };
  readonly purchases: number;
  /**
   * The longest stretch, in minutes, without a meaningful event (§15: in M2, tier unlocks):
   * from the start of the run to the first event, between events, and from the last event to
   * the end of the run, so a stall at the end cannot hide.
   */
  readonly longestGapMinutes: number;
  /** The stretch, in minutes, from the last meaningful event (or the start) to the end. */
  readonly trailingGapMinutes: number;
}

/** Seconds to minutes, rounded to 2 decimals. */
export function toMinutes(seconds: number): number {
  return Math.round((seconds / 60) * 100) / 100;
}

export function eventLabel(e: SimEvent): string {
  if (e.kind === 'unlock') return `G${e.tier ?? '?'}`;
  if (e.log2 !== undefined) return `2^${e.log2}`;
  return `1e${e.log10 ?? '?'}`;
}

/** A meaningful event of §15 (M2 has only tier unlocks; later layers add resets and more). */
function isMeaningful(e: SimEvent): boolean {
  return e.kind === 'unlock';
}

/** The longest stretch without a meaningful event, and the trailing one, in seconds. */
export function gaps(run: BotRun): { readonly longest: number; readonly trailing: number } {
  const times = run.events
    .filter(isMeaningful)
    .map((e) => e.t)
    .sort((a, b) => a - b);
  let last = 0;
  let longest = 0;
  for (const t of times) {
    longest = Math.max(longest, t - last);
    last = t;
  }
  const trailing = Math.max(0, run.seconds - last);
  return { longest: Math.max(longest, trailing), trailing };
}

export function buildReport(run: BotRun): Report {
  const g = gaps(run);
  const events = [...run.events]
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map(({ e }) => ({ minutes: toMinutes(e.t), label: eventLabel(e) }));
  return {
    profile: run.profile,
    seed: run.seed,
    minutes: toMinutes(run.seconds),
    events,
    final: {
      log10x: Math.round(log10Floor1(run.final.sum.x) * 100) / 100,
      bought: [...run.final.sum.bought],
      globalLevel: run.final.sum.globalLevel,
    },
    purchases: run.purchases,
    longestGapMinutes: toMinutes(g.longest),
    trailingGapMinutes: toMinutes(g.trailing),
  };
}

/** The report as Markdown: a header, the event timeline and the final state. */
export function reportMarkdown(r: Report): string {
  const lines = [
    `# Bot run: ${r.profile}, seed ${r.seed}, ${r.minutes} min`,
    '',
    '| Minutes | Event |',
    '| ------: | ----- |',
    ...r.events.map((e) => `| ${e.minutes.toFixed(2)} | ${e.label} |`),
    '',
    `- Final log10 x: ${r.final.log10x.toFixed(2)}`,
    `- Bought (G1…G8): ${r.final.bought.join(', ')}`,
    `- Global level: ${r.final.globalLevel}`,
    `- Purchases: ${r.purchases}`,
    `- Longest gap between meaningful events: ${r.longestGapMinutes.toFixed(2)} min`,
    `- Since the last meaningful event: ${r.trailingGapMinutes.toFixed(2)} min`,
    '',
  ];
  return lines.join('\n');
}
