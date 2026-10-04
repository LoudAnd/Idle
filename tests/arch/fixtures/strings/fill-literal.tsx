// Planted: a literal template passed to fill/fillParts bypasses strings.ts.
import { fill, fillParts } from '../../../../src/ui/tpl.ts';
import { STRINGS } from '../../../../src/ui/strings.ts';

export const a = fill('Buy {k}', { k: 1 });
export const b = fillParts(`Reach {n}`, { n: 2 });
export const ok = fill(STRINGS['goal.buy'], { k: 2 });
