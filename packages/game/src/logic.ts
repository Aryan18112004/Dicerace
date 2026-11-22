import { rollDie } from "./rng.js";

// The game: "Dice Race" (basically Pig with a few renames).
// On your turn you either roll or hold.
//   roll -> 2..6 gets added to your turn total, a 1 wipes it and ends your turn
//   hold -> bank the turn total, turn passes on
// First player to bank targetScore wins.
//
// Everything in here is pure: state in, new state out. No sockets, no DOM,
// no Date.now(), no Math.random(). The server, the React client and the Rune
// port all import this same file.

export type PlayerId = string;

export interface GameState {
  players: PlayerId[]; // still in the game, in turn order
  scores: Record<PlayerId, number>; // kept even for players who forfeited
  turnIndex: number; // index into players
  turnTotal: number;
  lastRoll: number | null;
  rngState: number;
  targetScore: number;
  winner: PlayerId | null;
  turnCount: number;
}

export type Action = { type: "roll" } | { type: "hold" };

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const DEFAULT_TARGET = 50;

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActionError";
  }
}

export function createGame(
  players: PlayerId[],
  seed: number,
  targetScore = DEFAULT_TARGET,
): GameState {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) {
    throw new InvalidActionError(`need ${MIN_PLAYERS}-${MAX_PLAYERS} players`);
  }
  if (new Set(players).size !== players.length) {
    throw new InvalidActionError("duplicate player ids");
  }
  const scores: Record<PlayerId, number> = {};
  for (const p of players) scores[p] = 0;
  return {
    players: [...players],
    scores,
    turnIndex: 0,
    turnTotal: 0,
    lastRoll: null,
    rngState: seed >>> 0,
    targetScore,
    winner: null,
    turnCount: 0,
  };
}

export function currentPlayer(state: GameState): PlayerId | null {
  if (state.winner) return null;
  return state.players[state.turnIndex] ?? null;
}

export function isGameOver(state: GameState): boolean {
  return state.winner !== null;
}

function endTurn(state: GameState): GameState {
  return {
    ...state,
    turnIndex: (state.turnIndex + 1) % state.players.length,
    turnTotal: 0,
    turnCount: state.turnCount + 1,
  };
}

export function applyAction(
  state: GameState,
  playerId: PlayerId,
  action: Action,
): GameState {
  if (state.winner) throw new InvalidActionError("game is over");
  if (currentPlayer(state) !== playerId) throw new InvalidActionError("not your turn");

  switch (action.type) {
    case "roll": {
      const { roll, rngState } = rollDie(state.rngState);
      const rolled = { ...state, rngState, lastRoll: roll };
      if (roll === 1) return endTurn(rolled);
      return { ...rolled, turnTotal: state.turnTotal + roll };
    }
    case "hold": {
      // holding on 0 would just be skipping, which makes stalling too easy
      if (state.turnTotal === 0) throw new InvalidActionError("roll at least once before holding");
      const banked = (state.scores[playerId] ?? 0) + state.turnTotal;
      const next: GameState = {
        ...state,
        scores: { ...state.scores, [playerId]: banked },
      };
      if (banked >= state.targetScore) {
        return { ...next, winner: playerId, turnTotal: 0, turnCount: state.turnCount + 1 };
      }
      return endTurn(next);
    }
    default: {
      const never: never = action;
      throw new InvalidActionError(`unknown action ${JSON.stringify(never)}`);
    }
  }
}

// Used when someone leaves or times out mid-match.
// If only one player is left they take the win.
export function forfeit(state: GameState, playerId: PlayerId): GameState {
  const idx = state.players.indexOf(playerId);
  if (idx === -1 || state.winner) return state;

  const players = state.players.filter((p) => p !== playerId);
  if (players.length === 1) {
    return { ...state, players, winner: players[0] ?? null, turnIndex: 0, turnTotal: 0 };
  }

  const wasTheirTurn = idx === state.turnIndex;
  // everyone after the removed player shifts down by one
  let turnIndex = state.turnIndex;
  if (idx < state.turnIndex) turnIndex -= 1;
  if (turnIndex >= players.length) turnIndex = 0;

  return {
    ...state,
    players,
    turnIndex,
    turnTotal: wasTheirTurn ? 0 : state.turnTotal,
  };
}

export interface Standing {
  playerId: PlayerId;
  score: number;
  forfeited: boolean;
  placement: number;
}

// Winner first, then everyone still in by score, then forfeiters by score.
export function standings(state: GameState): Standing[] {
  const all = Object.keys(state.scores);
  const rank = (id: PlayerId) => {
    if (id === state.winner) return 0;
    return state.players.includes(id) ? 1 : 2;
  };
  const sorted = [...all].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return (state.scores[b] ?? 0) - (state.scores[a] ?? 0);
  });
  return sorted.map((playerId, i) => ({
    playerId,
    score: state.scores[playerId] ?? 0,
    forfeited: !state.players.includes(playerId),
    placement: i + 1,
  }));
}
