// Planted: two-word literals in UI code outside strings.ts (ui-words), and the diagnostics and
// classes the rule lets through.
export const NAME = 'Quantum Forge';
export const TPL = (n: number) => `the ${n} ancient sums`;
const problems: string[] = [];

export function allowed(): void {
  console.error('game paused:', NAME);
  problems.push('values: not an object');
  const r = { problems: ['settings: not an object'] };
  if (r.problems.length > 3) throw new Error('no migration from settings');
}
