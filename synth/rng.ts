// Seeded random numbers (mulberry32), so any synthetic packet can be rebuilt from its seed.
export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  float(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(xs: readonly T[]): T;
  weighted<T>(xs: readonly [T, number][]): T;
  sample<T>(xs: readonly T[], n: number): T[];
}

export function rng(seed: number): Rng {
  let s = Math.imul((seed >>> 0) ^ 0x5bd1e995, 0x27d4eb2d) >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  return {
    next,
    int,
    float: (lo, hi) => lo + next() * (hi - lo),
    chance: p => next() < p,
    pick: xs => xs[Math.floor(next() * xs.length)],
    weighted: xs => {
      let roll = next() * xs.reduce((a, [, w]) => a + w, 0);
      for (const [v, w] of xs) { roll -= w; if (roll < 0) return v; }
      return xs[xs.length - 1][0];
    },
    sample: (xs, n) => {
      const a = [...xs];
      for (let i = a.length - 1; i > 0; i--) { const j = int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
      return a.slice(0, Math.max(0, n));
    },
  };
}
