import { describe, expect, it } from "vitest";
import {
  applyAction,
  createGame,
  currentPlayer,
  forfeit,
  InvalidActionError,
  standings,
  type GameState,
} from "../src/index.js";

const ids = ["a", "b", "c"];

// finds a seed where the first roll is (or isn't) a 1, so tests don't depend on luck
function seedWhere(pred: (s: GameState) => boolean): number {
  for (let seed = 0; seed < 500; seed++) {
    const s = applyAction(createGame(["a", "b"], seed), "a", { type: "roll" });
    if (pred(s)) return seed;
  }
  throw new Error("no seed found");
}

describe("createGame", () => {
  it("rejects bad player counts and duplicates", () => {
    expect(() => createGame(["a"], 1)).toThrow(InvalidActionError);
    expect(() => createGame(["a", "b", "c", "d", "e"], 1)).toThrow(InvalidActionError);
    expect(() => createGame(["a", "a"], 1)).toThrow(InvalidActionError);
  });

  it("starts with everyone on zero and the first player to move", () => {
    const g = createGame(ids, 42);
    expect(g.scores).toEqual({ a: 0, b: 0, c: 0 });
    expect(currentPlayer(g)).toBe("a");
  });
});

describe("applyAction", () => {
  it("does not mutate the previous state", () => {
    const g = createGame(ids, 7);
    const snapshot = JSON.stringify(g);
    applyAction(g, "a", { type: "roll" });
    expect(JSON.stringify(g)).toBe(snapshot);
  });

  it("rejects actions out of turn", () => {
    const g = createGame(ids, 7);
    expect(() => applyAction(g, "b", { type: "roll" })).toThrow("not your turn");
  });

  it("rejects holding with an empty turn total", () => {
    const g = createGame(ids, 7);
    expect(() => applyAction(g, "a", { type: "hold" })).toThrow(InvalidActionError);
  });

  it("a 1 wipes the turn total and passes the turn", () => {
    const seed = seedWhere((s) => s.lastRoll === 1);
    const g = applyAction(createGame(["a", "b"], seed), "a", { type: "roll" });
    expect(g.turnTotal).toBe(0);
    expect(currentPlayer(g)).toBe("b");
  });

  it("any other roll adds to the turn total and keeps the turn", () => {
    const seed = seedWhere((s) => s.lastRoll !== 1);
    const g = applyAction(createGame(["a", "b"], seed), "a", { type: "roll" });
    expect(g.turnTotal).toBe(g.lastRoll);
    expect(currentPlayer(g)).toBe("a");
  });

  it("hold banks the turn total", () => {
    const seed = seedWhere((s) => s.lastRoll !== 1);
    let g = applyAction(createGame(["a", "b"], seed), "a", { type: "roll" });
    const banked = g.turnTotal;
    g = applyAction(g, "a", { type: "hold" });
    expect(g.scores.a).toBe(banked);
    expect(currentPlayer(g)).toBe("b");
  });

  it("nothing is allowed after the game is won", () => {
    let g = createGame(["a", "b"], 3, 2);
    // keep playing until someone wins with a tiny target
    for (let i = 0; i < 200 && !g.winner; i++) {
      const p = currentPlayer(g)!;
      g = applyAction(g, p, g.turnTotal > 0 ? { type: "hold" } : { type: "roll" });
    }
    expect(g.winner).not.toBeNull();
    expect(() => applyAction(g, "a", { type: "roll" })).toThrow("game is over");
  });
});

describe("forfeit", () => {
  it("gives the win to the last player standing", () => {
    const g = forfeit(createGame(["a", "b"], 1), "a");
    expect(g.winner).toBe("b");
  });

  it("moves the turn along if the current player leaves", () => {
    const g = forfeit(createGame(ids, 1), "a");
    expect(g.players).toEqual(["b", "c"]);
    expect(currentPlayer(g)).toBe("b");
  });

  it("keeps the turn with the same person when someone earlier leaves", () => {
    let g = createGame(ids, 1);
    g = { ...g, turnIndex: 2 }; // c to move
    g = forfeit(g, "a");
    expect(currentPlayer(g)).toBe("c");
  });

  it("wraps around when the last player in order forfeits on their turn", () => {
    let g = createGame(ids, 1);
    g = { ...g, turnIndex: 2 };
    g = forfeit(g, "c");
    expect(currentPlayer(g)).toBe("a");
  });

  it("ignores unknown players", () => {
    const g = createGame(ids, 1);
    expect(forfeit(g, "zzz")).toBe(g);
  });
});

describe("standings", () => {
  it("puts the winner first and forfeiters last", () => {
    let g = createGame(ids, 1);
    g = { ...g, scores: { a: 30, b: 10, c: 45 } };
    g = forfeit(g, "c"); // c has the most points but quit
    g = { ...g, winner: "b" };
    const s = standings(g);
    expect(s.map((x) => x.playerId)).toEqual(["b", "a", "c"]);
    expect(s[2]?.forfeited).toBe(true);
  });
});
