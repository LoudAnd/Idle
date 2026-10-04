// Planted at src/engine/content/x.ts: content labels must be literal strings.ts keys.
const label = 'factor.beta';
const PREFIX = 'factor';

export const EFFECTS = [
  { id: 'x.literal', label: 'Doubles G1' },
  { id: 'x.key', label: 'factor.beta' },
  { id: 'x.identifier', label: PREFIX },
  { id: 'x.template', label: `${PREFIX}.beta` },
  { id: 'x.shorthand', label },
];

// Type-level names are not labels.
export interface Labelled {
  readonly label: string;
}
