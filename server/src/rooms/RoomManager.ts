import { randomInt, randomUUID } from "node:crypto";
import {
  applyAction,
  createGame,
  forfeit,
  InvalidActionError,
  MAX_PLAYERS,
  MIN_PLAYERS,
  standings,
  type Action,
  type GameState,
  type PlayerId,
  type RoomView,
  type ServerMessage,
  type Standing,
} from "@dicerace/game";

// All the room / match bookkeeping lives here, in memory.
// It doesn't know about websockets, it only talks to a tiny Client interface,
// which is what makes it easy to unit test with fake clients and fake timers.
//
// Known limit: rooms live in one process, so running multiple server
// instances would need sticky sessions or moving this into Redis.

export interface Client {
  send(msg: ServerMessage): void;
}

export interface UserInfo {
  id: string;
  username: string;
}

export interface LoggedAction {
  playerId: PlayerId;
  action: Action;
}

export interface FinishedMatch {
  roomName: string;
  seed: number;
  winnerId: PlayerId | null;
  reason: "finished" | "forfeit";
  actions: LoggedAction[];
  startedAt: Date;
  endedAt: Date;
  standings: Standing[];
}

export class RoomError extends Error {}

interface Member {
  user: UserInfo;
  client: Client | null; // null while the player is disconnected
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  status: "lobby" | "playing" | "finished";
  members: Map<string, Member>;
  game: GameState | null;
  seed: number;
  actions: LoggedAction[];
  startedAt: Date | null;
}

export interface RoomManagerOptions {
  graceMs: number;
  onMatchEnd: (match: FinishedMatch) => void | Promise<void>;
  randomSeed?: () => number;
}

export class RoomManager {
  private rooms = new Map<string, Room>();
  private roomOf = new Map<string, string>(); // userId -> roomId
  private online = new Map<string, Client>(); // everyone with an open socket

  constructor(private opts: RoomManagerOptions) {}

  // ---- connection lifecycle ----

  connect(user: UserInfo, client: Client): void {
    this.online.set(user.id, client);

    const room = this.roomFor(user.id);
    const member = room?.members.get(user.id);
    if (room && member) {
      // this is a reconnect, put them back into the match they dropped from
      if (member.graceTimer) clearTimeout(member.graceTimer);
      member.graceTimer = null;
      member.client = client;
      this.sendRoom(room);
    }

    client.send({
      t: "hello",
      userId: user.id,
      rooms: this.listRooms(),
      room: room ? this.view(room) : null,
    });
  }

  disconnect(userId: string, client: Client): void {
    // a stale socket closing after the user already reconnected must not
    // kick the new connection out
    if (this.online.get(userId) !== client) return;
    this.online.delete(userId);

    const room = this.roomFor(userId);
    const member = room?.members.get(userId);
    if (!room || !member) return;
    member.client = null;

    if (room.status === "playing") {
      member.graceTimer = setTimeout(() => this.graceExpired(room, userId), this.opts.graceMs);
      this.sendRoom(room);
    } else {
      // lobby or finished room: nothing to wait for
      this.removeMember(room, userId);
    }
  }

  // ---- lobby ----

  listRooms(): RoomView[] {
    return [...this.rooms.values()].filter((r) => r.status === "lobby").map((r) => this.view(r));
  }

  createRoom(user: UserInfo, name: string, maxPlayers: number): void {
    this.assertFree(user.id);
    const clean = name.trim().slice(0, 32) || `${user.username}'s room`;
    const room: Room = {
      id: randomUUID().slice(0, 8),
      name: clean,
      hostId: user.id,
      maxPlayers: Math.min(MAX_PLAYERS, Math.max(MIN_PLAYERS, maxPlayers)),
      status: "lobby",
      members: new Map(),
      game: null,
      seed: 0,
      actions: [],
      startedAt: null,
    };
    room.members.set(user.id, { user, client: this.online.get(user.id) ?? null, graceTimer: null });
    this.rooms.set(room.id, room);
    this.roomOf.set(user.id, room.id);
    this.sendRoom(room);
    this.notifyLobby();
  }

  joinRoom(user: UserInfo, roomId: string): void {
    this.assertFree(user.id);
    const room = this.rooms.get(roomId);
    if (!room) throw new RoomError("room not found");
    if (room.status !== "lobby") throw new RoomError("match already started");
    if (room.members.size >= room.maxPlayers) throw new RoomError("room is full");

    room.members.set(user.id, { user, client: this.online.get(user.id) ?? null, graceTimer: null });
    this.roomOf.set(user.id, room.id);
    this.sendRoom(room);
    this.notifyLobby();
  }

  leaveRoom(userId: string): void {
    const room = this.roomFor(userId);
    if (!room) throw new RoomError("you are not in a room");
    const client = room.members.get(userId)?.client;

    if (room.status === "playing") {
      this.dropFromMatch(room, userId);
    } else {
      this.removeMember(room, userId);
    }
    client?.send({ t: "left" });
  }

  // ---- match ----

  startGame(userId: string): void {
    const room = this.roomFor(userId);
    if (!room) throw new RoomError("you are not in a room");
    if (room.hostId !== userId) throw new RoomError("only the host can start");
    if (room.status !== "lobby") throw new RoomError("already started");
    if (room.members.size < MIN_PLAYERS) throw new RoomError(`need at least ${MIN_PLAYERS} players`);

    room.seed = (this.opts.randomSeed ?? (() => randomInt(1, 2 ** 31)))();
    room.game = createGame([...room.members.keys()], room.seed);
    room.status = "playing";
    room.actions = [];
    room.startedAt = new Date();
    this.sendRoom(room);
    this.notifyLobby();
  }

  handleAction(userId: string, action: Action): void {
    const room = this.roomFor(userId);
    if (!room || room.status !== "playing" || !room.game) {
      throw new RoomError("no match in progress");
    }
    try {
      room.game = applyAction(room.game, userId, action);
    } catch (err) {
      if (err instanceof InvalidActionError) throw new RoomError(err.message);
      throw err;
    }
    room.actions.push({ playerId: userId, action });

    if (room.game.winner) this.finish(room, "finished");
    this.sendRoom(room);
  }

  // used by tests and graceful shutdown
  dispose(): void {
    for (const room of this.rooms.values()) this.clearTimers(room);
  }

  // ---- internals ----

  private graceExpired(room: Room, userId: string): void {
    const member = room.members.get(userId);
    if (!member || member.client) return; // they came back in time
    member.graceTimer = null;

    const someoneHere = [...room.members.values()].some((m) => m.client);
    if (!someoneHere) {
      // everybody dropped, there's no point crowning a winner
      this.destroyRoom(room);
      return;
    }
    this.dropFromMatch(room, userId);
  }

  private dropFromMatch(room: Room, userId: string): void {
    if (!room.game) return;
    room.game = forfeit(room.game, userId);
    const member = room.members.get(userId);
    if (member?.graceTimer) clearTimeout(member.graceTimer);
    room.members.delete(userId);
    this.roomOf.delete(userId);

    if (room.game.winner) this.finish(room, "forfeit");
    this.sendRoom(room);
  }

  private finish(room: Room, reason: "finished" | "forfeit"): void {
    if (!room.game) return;
    room.status = "finished";
    this.clearTimers(room);

    const match: FinishedMatch = {
      roomName: room.name,
      seed: room.seed,
      winnerId: room.game.winner,
      reason,
      actions: room.actions,
      startedAt: room.startedAt ?? new Date(),
      endedAt: new Date(),
      standings: standings(room.game),
    };
    // don't let a DB hiccup take down the game loop
    Promise.resolve(this.opts.onMatchEnd(match)).catch((err) => {
      console.error("failed to save match", err);
    });
  }

  private removeMember(room: Room, userId: string): void {
    const member = room.members.get(userId);
    if (member?.graceTimer) clearTimeout(member.graceTimer);
    room.members.delete(userId);
    this.roomOf.delete(userId);

    if (room.members.size === 0) {
      this.rooms.delete(room.id);
    } else {
      if (room.hostId === userId) room.hostId = room.members.keys().next().value as string;
      this.sendRoom(room);
    }
    this.notifyLobby();
  }

  private destroyRoom(room: Room): void {
    this.clearTimers(room);
    for (const id of room.members.keys()) this.roomOf.delete(id);
    this.rooms.delete(room.id);
    this.notifyLobby();
  }

  private clearTimers(room: Room): void {
    for (const m of room.members.values()) {
      if (m.graceTimer) clearTimeout(m.graceTimer);
      m.graceTimer = null;
    }
  }

  private assertFree(userId: string): void {
    if (this.roomOf.has(userId)) throw new RoomError("leave your current room first");
  }

  private roomFor(userId: string): Room | undefined {
    const id = this.roomOf.get(userId);
    return id ? this.rooms.get(id) : undefined;
  }

  private view(room: Room): RoomView {
    return {
      id: room.id,
      name: room.name,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      status: room.status,
      players: [...room.members.values()].map((m) => ({
        userId: m.user.id,
        username: m.user.username,
        connected: m.client !== null,
      })),
      game: room.game,
    };
  }

  private sendRoom(room: Room): void {
    const msg: ServerMessage = { t: "room", room: this.view(room) };
    for (const m of room.members.values()) m.client?.send(msg);
  }

  // push the open-rooms list to everyone who is just browsing the lobby
  private notifyLobby(): void {
    const msg: ServerMessage = { t: "rooms", rooms: this.listRooms() };
    for (const [userId, client] of this.online) {
      if (!this.roomOf.has(userId)) client.send(msg);
    }
  }
}
