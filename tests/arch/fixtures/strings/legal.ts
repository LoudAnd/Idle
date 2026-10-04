// Planted: legal.ts notices that break each rule, then two that pass (checked by
// tests/arch/strings.test.ts with checkLegal).
export const LEGAL = [
  // legal-verbatim: not a substring of its licence file.
  {
    kind: 'license',
    subject: 'a',
    text: 'The Mit Licence',
    source: 'public/LICENSES/MIT-preact.txt',
  },
  // legal-source: a hand-written doc is not a licence file.
  { kind: 'attribution', subject: 'b', text: 'Sources', source: 'docs/SOURCES.md' },
  // legal-source: a licence notice without its licence file.
  { kind: 'license', subject: 'c', text: 'MIT License' },
  // legal-fixed: no source and not a line the GDD fixes.
  { kind: 'nonAffiliation', subject: 'd', text: 'Not affiliated with anyone.' },
  // legal-kind and legal-length.
  {
    kind: 'flavour',
    subject: 'e',
    text: 'x'.repeat(201),
    source: 'public/LICENSES/MIT-preact.txt',
  },
  // Pass: a GDD-fixed template and a verbatim quote.
  {
    kind: 'attribution',
    subject: 'f',
    text: 'Icons made by {author} · game-icons.net · CC BY 3.0 · recoloured',
  },
  {
    kind: 'license',
    subject: 'g',
    text: 'The MIT License (MIT)',
    source: 'public/LICENSES/MIT-preact.txt',
  },
];
