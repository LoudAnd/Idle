// Planted violation: production code installs the bench-only op counter.
import { installOpCounter } from '../engine/num.ts';

export const counter = installOpCounter();
