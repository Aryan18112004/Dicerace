// Tiny seeded PRNG (mulberry32). The generator state lives inside GameState,
// so replaying the same seed + the same actions always gives the same match.
// That's what lets us store just the action log and still replay a game later.

export function nextRandom(rngState: number): { value: number; rngState: number } {
  const s = (rngState + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, rngState: s };
}

export function rollDie(rngState: number): { roll: number; rngState: number } {
  const r = nextRandom(rngState);
  return { roll: Math.floor(r.value * 6) + 1, rngState: r.rngState };
}
