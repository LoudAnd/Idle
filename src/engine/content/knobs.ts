/**
 * Balance knobs (GDD §14.3). A knob may be tuned only within its range, by the milestone that
 * introduces it or a later one, and only while every earlier blocking band still holds. Tests
 * read these constants, never literals, so tuning never breaks a test.
 *
 * Shell (M2): every M2 constant is frozen (`content/sum.ts`), so there are no knobs yet. M5 adds
 * the first ones.
 */
export interface KnobDef {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  /** The milestone that introduces the knob. */
  readonly from: string;
}

/**
 * The knobs by id. `satisfies` keeps the literal keys, so `KNOBS.someKnob.value` is typed and a
 * misspelled knob name is a compile error (an annotation would widen the keys to `string`).
 */
export const KNOBS = Object.freeze({
  // M5 adds the first knobs here.
} as const satisfies Record<string, KnobDef>);
