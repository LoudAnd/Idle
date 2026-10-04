// Planted at src/engine/format.ts: format.ts may hold no words (they come from its tables).
import { num } from './num.ts';

const THOUSAND = 'K';
const QUADRILLION = 'Qa';
const EXPONENT = 'e';
const DASH = '—';

export function suffix(): string {
  return num(1).toString() + THOUSAND + QUADRILLION + EXPONENT + DASH;
}
