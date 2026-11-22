import type { Action, GameState } from "./logic.js";

// Websocket messages shared by the server and the client.
// Kept here so both sides break at compile time if one of them changes.

export interface RoomPlayer {
  userId: string;
  username: string;
  connected: boolean;
}

export interface RoomView {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  status: "lobby" | "playing" | "finished";
  players: RoomPlayer[];
  game: GameState | null;
}

export type ClientMessage =
  | { t: "create_room"; name: string; maxPlayers: number }
  | { t: "join_room"; roomId: string }
  | { t: "leave_room" }
  | { t: "start" }
  | { t: "action"; action: Action };

export type ServerMessage =
  | { t: "hello"; userId: string; rooms: RoomView[]; room: RoomView | null }
  | { t: "rooms"; rooms: RoomView[] }
  | { t: "room"; room: RoomView }
  | { t: "left" }
  | { t: "error"; message: string };
