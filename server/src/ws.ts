import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";
import type { ClientMessage, ServerMessage } from "@dicerace/game";
import { RoomError, type RoomManager } from "./rooms/RoomManager.js";

const messageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create_room"), name: z.string().max(64), maxPlayers: z.number().int() }),
  z.object({ t: z.literal("join_room"), roomId: z.string().max(64) }),
  z.object({ t: z.literal("leave_room") }),
  z.object({ t: z.literal("start") }),
  z.object({
    t: z.literal("action"),
    action: z.discriminatedUnion("type", [
      z.object({ type: z.literal("roll") }),
      z.object({ type: z.literal("hold") }),
    ]),
  }),
]);

export function registerWs(app: FastifyInstance, rooms: RoomManager): void {
  // userId -> socket, so a second tab / reconnect replaces the old connection
  const sockets = new Map<string, WebSocket>();

  app.get("/ws", { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string }).token;
    let user: { id: string; username: string };
    try {
      if (!token) throw new Error("no token");
      user = app.jwt.verify<{ id: string; username: string }>(token);
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }

    const old = sockets.get(user.id);
    sockets.set(user.id, socket);
    if (old) old.close(4000, "replaced by a newer connection");

    const client = {
      send: (msg: ServerMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
      },
    };
    rooms.connect(user, client);

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = messageSchema.parse(JSON.parse(raw.toString()));
      } catch {
        client.send({ t: "error", message: "bad message" });
        return;
      }
      try {
        switch (msg.t) {
          case "create_room":
            rooms.createRoom(user, msg.name, msg.maxPlayers);
            break;
          case "join_room":
            rooms.joinRoom(user, msg.roomId);
            break;
          case "leave_room":
            rooms.leaveRoom(user.id);
            break;
          case "start":
            rooms.startGame(user.id);
            break;
          case "action":
            rooms.handleAction(user.id, msg.action);
            break;
        }
      } catch (err) {
        if (err instanceof RoomError) client.send({ t: "error", message: err.message });
        else {
          app.log.error(err);
          client.send({ t: "error", message: "something went wrong" });
        }
      }
    });

    socket.on("close", () => {
      if (sockets.get(user.id) === socket) sockets.delete(user.id);
      rooms.disconnect(user.id, client);
    });
  });
}
