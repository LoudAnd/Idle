/**
 * Seeded randomness for bots and fuzz tests only (GDD §21.2: the engine has none). sfc32, with
 * its four state words drawn from a splitmix-style seeder (a Weyl sequence with the murmur3
 * 32-bit finalizer) and 12 warm-up draws.
 */

export interface Rng {
  /** A double in [0, 1). */
  next(): number;
  /** An integer in [0, n) for an integer n ≥ 1 (0 otherwise). */
  int(n: number): number;
}

function seeder(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    return (z ^ (z >>> 16)) >>> 0;
  };
}

const WARMUP = 12;

/** A deterministic generator for `seed` (any number; it is reduced to 32 bits). */
export function createRng(seed: number): Rng {
  const init = seeder(seed);
  let a = init() | 0;
  let b = init() | 0;
  let c = init() | 0;
  let d = init() | 0;
  const next32 = (): number => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < WARMUP; i++) next32();
  const next = (): number => next32() / 4294967296;
  return {
    next,
    int: (n) => (Number.isInteger(n) && n >= 1 ? Math.floor(next() * n) : 0),
  };
}
