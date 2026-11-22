import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerMessage } from "@dicerace/game";
import { RoomError, RoomManager, type FinishedMatch } from "../src/rooms/RoomManager.js";

// fake socket that just remembers what it was sent
function fakeClient() {
  const sent: ServerMessage[] = [];
  return {
    sent,
    send: (m: ServerMessage) => void sent.push(m),
    last<T extends ServerMessage["t"]>(t: T) {
      return [...sent].reverse().find((m) => m.t === t) as Extract<ServerMessage, { t: T }> | undefined;
    },
  };
}

const alice = { id: "u1", username: "alice" };
const bob = { id: "u2", username: "bob" };
const carol = { id: "u3", username: "carol" };

let finished: FinishedMatch[];
let rooms: RoomManager;

beforeEach(() => {
  vi.useFakeTimers();
  finished = [];
  rooms = new RoomManager({
    graceMs: 10_000,
    onMatchEnd: (m) => void finished.push(m),
    randomSeed: () => 12345,
  });
});

afterEach(() => {
  rooms.dispose();
  vi.useRealTimers();
});

// alice hosts, bob joins, game starts
function startTwoPlayerMatch() {
  const a = fakeClient();
  const b = fakeClient();
  rooms.connect(alice, a);
  rooms.connect(bob, b);
  rooms.createRoom(alice, "test room", 2);
  const roomId = a.last("room")!.room.id;
  rooms.joinRoom(bob, roomId);
  rooms.startGame(alice.id);
  return { a, b, roomId };
}

describe("lobby", () => {
  it("lists open rooms and updates browsing players", () => {
    const a = fakeClient();
    const b = fakeClient();
    rooms.connect(alice, a);
    rooms.connect(bob, b);
    rooms.createRoom(alice, "mine", 3);
    expect(b.last("rooms")!.rooms).toHaveLength(1);
  });

  it("enforces room capacity", () => {
    const a = fakeClient();
    rooms.connect(alice, a);
    rooms.connect(bob, fakeClient());
    rooms.connect(carol, fakeClient());
    rooms.createRoom(alice, "small", 2);
    const id = a.last("room")!.room.id;
    rooms.joinRoom(bob, id);
    expect(() => rooms.joinRoom(carol, id)).toThrow("room is full");
  });

  it("only the host can start, and needs two players", () => {
    const a = fakeClient();
    rooms.connect(alice, a);
    rooms.connect(bob, fakeClient());
    rooms.createRoom(alice, "r", 2);
    expect(() => rooms.startGame(alice.id)).toThrow("at least 2");
    rooms.joinRoom(bob, a.last("room")!.room.id);
    expect(() => rooms.startGame(bob.id)).toThrow("only the host");
  });

  it("a user can't be in two rooms", () => {
    rooms.connect(alice, fakeClient());
    rooms.createRoom(alice, "one", 2);
    expect(() => rooms.createRoom(alice, "two", 2)).toThrow(RoomError);
  });
});

describe("match flow", () => {
  it("rejects actions from the wrong player", () => {
    startTwoPlayerMatch();
    expect(() => rooms.handleAction(bob.id, { type: "roll" })).toThrow("not your turn");
  });

  it("saves a finished match with the full action log", () => {
    const { a } = startTwoPlayerMatch();
    // both players just keep holding after one roll until somebody wins
    for (let i = 0; i < 2000 && a.last("room")!.room.status === "playing"; i++) {
      const g = a.last("room")!.room.game!;
      const who = g.players[g.turnIndex]!;
      rooms.handleAction(who, g.turnTotal >= 12 ? { type: "hold" } : { type: "roll" });
    }
    expect(finished).toHaveLength(1);
    const m = finished[0]!;
    expect(m.reason).toBe("finished");
    expect(m.seed).toBe(12345);
    expect(m.actions.length).toBeGreaterThan(0);
    expect(m.standings[0]?.playerId).toBe(m.winnerId);
  });
});

describe("reconnects", () => {
  it("lets a dropped player rejoin the same match within the grace period", () => {
    const { a, b, roomId } = startTwoPlayerMatch();
    rooms.disconnect(bob.id, b);
    expect(a.last("room")!.room.players.find((p) => p.userId === bob.id)?.connected).toBe(false);

    vi.advanceTimersByTime(5_000);
    const b2 = fakeClient();
    rooms.connect(bob, b2);

    const hello = b2.last("hello")!;
    expect(hello.room?.id).toBe(roomId);
    expect(hello.room?.status).toBe("playing");

    // and the timer must not forfeit them later
    vi.advanceTimersByTime(60_000);
    expect(finished).toHaveLength(0);
    expect(a.last("room")!.room.players.find((p) => p.userId === bob.id)?.connected).toBe(true);
  });

  it("forfeits a player who doesn't come back in time", () => {
    const { b } = startTwoPlayerMatch();
    rooms.disconnect(bob.id, b);
    vi.advanceTimersByTime(10_001);

    expect(finished).toHaveLength(1);
    expect(finished[0]!.reason).toBe("forfeit");
    expect(finished[0]!.winnerId).toBe(alice.id);
    expect(finished[0]!.standings.find((s) => s.playerId === bob.id)?.forfeited).toBe(true);
  });

  it("ignores a stale socket closing after the player already reconnected", () => {
    const { a, b } = startTwoPlayerMatch();
    const b2 = fakeClient();
    rooms.connect(bob, b2); // new tab/connection takes over
    rooms.disconnect(bob.id, b); // old socket finally closes
    vi.advanceTimersByTime(60_000);
    expect(finished).toHaveLength(0);
    expect(a.last("room")!.room.players.find((p) => p.userId === bob.id)?.connected).toBe(true);
  });

  it("drops the room without a result if everyone leaves", () => {
    const { a, b } = startTwoPlayerMatch();
    rooms.disconnect(alice.id, a);
    rooms.disconnect(bob.id, b);
    vi.advanceTimersByTime(60_000);
    expect(finished).toHaveLength(0);
    expect(rooms.listRooms()).toHaveLength(0);
  });
});

describe("leaving", () => {
  it("leaving mid-match counts as a forfeit", () => {
    const { b } = startTwoPlayerMatch();
    rooms.leaveRoom(bob.id);
    expect(b.last("left")).toBeDefined();
    expect(finished[0]?.winnerId).toBe(alice.id);
  });

  it("passes host to someone else if the host leaves the lobby", () => {
    const a = fakeClient();
    const b = fakeClient();
    rooms.connect(alice, a);
    rooms.connect(bob, b);
    rooms.createRoom(alice, "r", 2);
    rooms.joinRoom(bob, a.last("room")!.room.id);
    rooms.leaveRoom(alice.id);
    expect(b.last("room")!.room.hostId).toBe(bob.id);
  });
});
