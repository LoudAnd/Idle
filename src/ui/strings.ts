/**
 * Player-visible chrome strings and tables (GDD §2). Each entry is at most 32 characters, with
 * `{placeholders}`, and no sentences.
 *
 * First version (M1): only the notation tables that `src/engine/format.ts` takes as a
 * parameter. This file has no runtime imports, so Node can load it directly.
 */
import type { NotationTables } from '../engine/format.ts';

/** Standard suffixes (GDD §4.2) and the spoken-form words. */
export const NOTATION_TABLES = {
  standard: {
    first: ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'],
    units: ['', 'U', 'D', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No'],
    tens: ['', 'Dc', 'Vg', 'Tg', 'Qag', 'Qig', 'Sxg', 'Spg', 'Ocg', 'Nog'],
    hundred: 'Ce',
  },
  spoken: { timesTenToThe: 'times ten to the', tenToThe: 'ten to the' },
} as const satisfies NotationTables;
