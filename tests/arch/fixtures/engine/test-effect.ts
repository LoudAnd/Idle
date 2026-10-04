// Planted violation: production code injects a test-only effect (checked as src/ui/x.ts).
import { installTestEffect } from '../engine/effects.ts';

export const remove = installTestEffect;
