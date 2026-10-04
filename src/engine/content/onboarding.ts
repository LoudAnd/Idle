/**
 * The stable ids of the UI's onboarding memory (GDD §17.4, §20.1): the reveals, the goals done
 * and the tabs visited. The UI keeps the memory (`src/ui/onboarding.ts`) and its rules
 * (`reveal.ts`, `goals.ts`, `shell/tabs.ts`); the save stores it as sorted lists of these ids.
 * They live in the engine so the pure `validate()` (§20.1: "every id is known") can reject an
 * unknown id instead of dropping it, which would be a repair.
 *
 * Ids are stored in saves, so they never change or get reused. A milestone that adds a reveal,
 * a goal or a tab appends its id here; `tests/unit/onboarding-ids.test.ts` checks that the UI's
 * rule ids and these lists are equal sets.
 */

/** Every reveal id (§17.4), in the UI's rule order. */
export const REVEAL_IDS = Object.freeze([
  'tier.2',
  'global',
  'maxAll',
  'tier.3',
  'tier.4',
  'tier.5',
  'tier.6',
  'tier.7',
  'tier.8',
  'tab.product',
  'tab.power',
  'tab.tower',
] as const);

/** Every goal id of the Next goal chip (§17.1), in goal order. */
export const GOAL_IDS = Object.freeze([
  'goal.g2',
  'goal.g3',
  'goal.g4',
  'goal.g5',
  'goal.g6',
  'goal.g7',
  'goal.g8',
  'goal.product',
  'goal.power',
  'goal.tower',
] as const);

/** Every tab id (§17.2). M5, M13 and M21 append their layers' tabs. */
export const TAB_IDS = Object.freeze(['sum'] as const);

export type RevealId = (typeof REVEAL_IDS)[number];
export type GoalId = (typeof GOAL_IDS)[number];
export type TabId = (typeof TAB_IDS)[number];

/** The memory as the save stores it: sorted, unique id lists. */
export interface OnboardingIds {
  readonly revealed: readonly string[];
  readonly done: readonly string[];
  readonly visited: readonly string[];
}

/** The three lists of `OnboardingIds`. */
export type OnboardingKind = keyof OnboardingIds;

const KNOWN = Object.freeze({
  revealed: new Set<string>(REVEAL_IDS),
  done: new Set<string>(GOAL_IDS),
  visited: new Set<string>(TAB_IDS),
} satisfies Record<OnboardingKind, ReadonlySet<string>>);

/** The onboarding lists in their stored key order. */
export const ONBOARDING_KINDS: readonly OnboardingKind[] = Object.freeze([
  'revealed',
  'done',
  'visited',
]);

/** True when `id` is a known id of that list. */
export function isKnownOnboardingId(kind: OnboardingKind, id: unknown): boolean {
  return typeof id === 'string' && KNOWN[kind].has(id);
}
