import type { PlayerId, RuneClient } from "rune-sdk";
import { applyAction, createGame, InvalidActionError, standings, type GameState } from "./gameLogic";

// Rune adapter. The actual rules are in gameLogic.ts, which is a copy of
// packages/game/src/logic.ts (Rune builds one folder, so it can't import from
// the monorepo; `npm run sync:rune` in the repo root copies it over).
// This file only translates between Rune's action API and our pure reducer.

export type GameStateRune = GameState;

type Actions = {
  roll: () => void;
  hold: () => void;
};

declare global {
  const Rune: RuneClient<GameStateRune, Actions>;
}

// Rune wants actions that mutate `game` in place, so we compute the new state
// with the pure function and copy it over.
function run(game: GameStateRune, playerId: PlayerId, type: "roll" | "hold") {
  try {
    Object.assign(game, applyAction(game, playerId, { type }));
  } catch (err) {
    if (err instanceof InvalidActionError) throw Rune.invalidAction();
    throw err;
  }

  if (game.winner) {
    const result: Record<PlayerId, "WON" | "LOST"> = {};
    for (const s of standings(game)) result[s.playerId] = s.playerId === game.winner ? "WON" : "LOST";
    Rune.gameOver({ players: result });
  }
}

Rune.initLogic({
  minPlayers: 2,
  maxPlayers: 4,
  setup: (allPlayerIds) => {
    // Math.random is seeded by Rune and identical on every client
    const seed = Math.floor(Math.random() * 2 ** 31);
    return createGame(allPlayerIds, seed);
  },
  actions: {
    roll: (_, { game, playerId }) => run(game, playerId, "roll"),
    hold: (_, { game, playerId }) => run(game, playerId, "hold"),
  },
});
