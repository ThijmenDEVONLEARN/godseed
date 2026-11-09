export interface Rng {
  next(): number;
  int(max: number): number;
  pick<T>(arr: readonly T[]): T;
  chance(p: number): boolean;
  /** Current internal state, for hashing and replays. */
  state(): number[];
}

/** sfc32: small, fast, seedable. All randomness in the sim goes through this. */
export function createRng(seed: number): Rng {
  let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = seed >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 15; i++) next();
  return {
    next,
    int: (max) => Math.floor(next() * max),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
    state: () => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
  };
}
