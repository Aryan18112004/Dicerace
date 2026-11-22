// Very plain rating change: win = +25, loss = -15, floor at 0.
// Not Elo on purpose, easy to reason about and good enough for a leaderboard.
export function scoreDelta(won: boolean): number {
  return won ? 25 : -15;
}

export function applyScore(current: number, won: boolean): number {
  return Math.max(0, current + scoreDelta(won));
}
