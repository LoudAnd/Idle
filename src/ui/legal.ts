/**
 * Legal and attribution notices (GDD §2): the only player-visible text besides `strings.ts`,
 * OEIS fields and the generated manifests. Each entry is at most 200 characters and has one of
 * the four declared kinds. Its text comes from one of two places:
 * - a licence file that ships in `public/LICENSES/` (`source`), quoted verbatim; every `license`
 *   notice is one of these;
 * - a notice line the GDD fixes in §16 (the OEIS card line and non-affiliation line of §16.1,
 *   the icon credit line of §16.2, `{placeholders}` included), which no licence file contains;
 *   such an entry has no `source`.
 *
 * `tests/arch/strings.test.ts` checks the length, the kind and the origin (`checkLegal`);
 * `tests/arch/glyphs.test.ts` checks the glyphs. The Credits tab renders them (M6b/M8); until
 * then they are data only. Like `strings.ts`, this module has no runtime imports.
 */
export type LegalKind = 'attribution' | 'license' | 'change' | 'nonAffiliation';

export interface LegalNotice {
  readonly kind: LegalKind;
  /** What the notice is about: a font, a library or a data source. */
  readonly subject: string;
  readonly text: string;
  /**
   * The shipped licence file the text is quoted from (`public/LICENSES/…`). Absent only for a
   * notice line fixed by GDD §16.
   */
  readonly source?: string;
}

export const LEGAL: readonly LegalNotice[] = Object.freeze([
  Object.freeze({
    kind: 'attribution',
    subject: '@fontsource/jetbrains-mono',
    text: 'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)',
    source: 'public/LICENSES/OFL-1.1.txt',
  }),
  Object.freeze({
    kind: 'license',
    subject: '@fontsource/jetbrains-mono',
    text: 'SIL Open Font License, Version 1.1',
    source: 'public/LICENSES/OFL-1.1.txt',
  }),
  Object.freeze({
    kind: 'attribution',
    subject: 'preact',
    text: 'Copyright (c) 2015-present Jason Miller',
    source: 'public/LICENSES/MIT-preact.txt',
  }),
  Object.freeze({
    kind: 'license',
    subject: 'preact',
    text: 'The MIT License (MIT)',
    source: 'public/LICENSES/MIT-preact.txt',
  }),
  Object.freeze({
    kind: 'attribution',
    subject: 'break_eternity.js',
    text: 'Copyright (c) 2019 Timothy Stiles',
    source: 'public/LICENSES/MIT-break_eternity.txt',
  }),
  Object.freeze({
    kind: 'license',
    subject: 'break_eternity.js',
    text: 'MIT License',
    source: 'public/LICENSES/MIT-break_eternity.txt',
  }),
] satisfies LegalNotice[]);
