// @vitest-environment node
// GDD §15, §22.6: the report's longest gap between meaningful events counts the stretch from
// the last event to the end of the run, so a stall at the end cannot hide.
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/state.ts';
import type { BotRun, SimEvent } from '../../src/sim/bot.ts';
import { buildReport, gaps, reportMarkdown } from '../../src/sim/report.ts';

function run(seconds: number, events: SimEvent[]): BotRun {
  const s = newGame();
  return {
    profile: 'active',
    seed: 1,
    seconds,
    initial: s,
    events,
    final: s,
    log: [],
    purchases: 0,
  };
}

describe('longest gap (GDD §15, §22.6)', () => {
  it('counts the stretch after the last meaningful event', () => {
    // Unlocks at 0, 60 and 180 s; the run goes on to 30 min with nothing else meaningful.
    const r = run(1800, [
      { t: 0, kind: 'unlock', tier: 1 },
      { t: 60, kind: 'unlock', tier: 2 },
      { t: 120, kind: 'reach', log10: 10 }, // reaching a decade is not a meaningful event
      { t: 180, kind: 'unlock', tier: 3 },
    ]);
    expect(gaps(r)).toEqual({ longest: 1620, trailing: 1620 });
    const report = buildReport(r);
    expect(report.longestGapMinutes).toBe(27);
    expect(report.trailingGapMinutes).toBe(27);
    expect(reportMarkdown(report)).toContain('Longest gap between meaningful events: 27.00 min');
  });

  it('counts the gaps between events, and from the start of the run', () => {
    const r = run(600, [
      { t: 90, kind: 'unlock', tier: 1 },
      { t: 500, kind: 'unlock', tier: 2 },
    ]);
    expect(gaps(r)).toEqual({ longest: 410, trailing: 100 });
    expect(gaps(run(300, []))).toEqual({ longest: 300, trailing: 300 });
  });
});
