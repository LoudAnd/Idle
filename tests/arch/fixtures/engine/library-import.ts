// Planted violation: an engine module other than num.ts imports the big-number library.
import Decimal from 'break_eternity.js';

export const two = new Decimal(2);
