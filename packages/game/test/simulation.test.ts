import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  currentPlayer,
  standings,
  nextRandom,
  type Action,
  type GameState,
} from "../src/index.js";

// A dumb bot: holds once the turn total reaches its own threshold.
// Bots use their own rng so they don't touch the game's dice.
function botMove(state: GameState, threshold: number): Action {
  return state.turnTotal >= threshold ? { type: "hold" } : { type: "roll" };
}

function playFullMatch(players: string[], seed: number, thresholds: number[]) {
  let state = createGame(players, seed);
  const log: { playerId: string; action: Action }[] = [];

  for (let step = 0; step < 5000 && !state.winner; step++) {
    const playerId = currentPlayer(state)!;
    const idx = players.indexOf(playerId);
    let action = botMove(state, thresholds[idx] ?? 20);
    // nothing banked yet means the bot must roll first
    if (action.type === "hold" && state.turnTotal === 0) action = { type: "roll" };
    state = applyAction(state, playerId, action);
    log.push({ playerId, action });
  }
  return { state, log };
}

describe("simulated multiplayer matches", () => {
  it("a 4 player match finishes with exactly one winner at or above the target", () => {
    const { state } = playFullMatch(["p1", "p2", "p3", "p4"], 1234, [10, 15, 20, 25]);
    expect(state.winner).not.toBeNull();
    expect(state.scores[state.winner!]).toBeGreaterThanOrEqual(state.targetScore);

    const s = standings(state);
    expect(s[0]?.playerId).toBe(state.winner);
    expect(s.map((x) => x.placement)).toEqual([1, 2, 3, 4]);
  });

  it("is deterministic: same seed and same moves give the same result", () => {
    const a = playFullMatch(["p1", "p2", "p3"], 99, [12, 18, 24]);
    const b = playFullMatch(["p1", "p2", "p3"], 99, [12, 18, 24]);
    expect(b.state).toEqual(a.state);
    expect(b.log).toEqual(a.log);
  });

  it("replaying the stored action log rebuilds the final state", () => {
    const { state, log } = playFullMatch(["p1", "p2"], 2024, [15, 20]);
    let replay = createGame(["p1", "p2"], 2024);
    for (const { playerId, action } of log) replay = applyAction(replay, playerId, action);
    expect(replay).toEqual(state);
  });

  it("different seeds can produce different outcomes", () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const { state } = playFullMatch(["p1", "p2"], seed, [15, 15]);
      winners.add(state.winner!);
    }
    expect(winners.size).toBe(2);
  });

  it("many random matches always terminate and never break invariants", () => {
    let rng = 555;
    for (let m = 0; m < 200; m++) {
      const n = 2 + (m % 3);
      const players = Array.from({ length: n }, (_, i) => `p${i}`);
      const seed = m * 7919;
      let state = createGame(players, seed);

      for (let step = 0; step < 5000 && !state.winner; step++) {
        const r = nextRandom(rng);
        rng = r.rngState;
        const p = currentPlayer(state)!;
        const wantHold = r.value > 0.6 && state.turnTotal > 0;
        state = applyAction(state, p, wantHold ? { type: "hold" } : { type: "roll" });

        // invariants
        for (const score of Object.values(state.scores)) expect(score).toBeGreaterThanOrEqual(0);
        expect(state.turnTotal).toBeGreaterThanOrEqual(0);
      }
      expect(state.winner).not.toBeNull();
    }
  });
});
