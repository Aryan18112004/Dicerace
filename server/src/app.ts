import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { statsRoutes } from "./routes/stats.js";
import { RoomManager } from "./rooms/RoomManager.js";
import { saveMatch } from "./matches.js";
import { registerWs } from "./ws.js";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => Promise<void>;
  }
}

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(websocket);

  app.decorate("authenticate", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  const rooms = new RoomManager({
    graceMs: config.reconnectGraceMs,
    onMatchEnd: saveMatch,
  });

  app.get("/api/health", async () => ({ ok: true }));
  await app.register(authRoutes, { prefix: "/api" });
  await app.register(statsRoutes, { prefix: "/api" });
  registerWs(app, rooms);

  app.addHook("onClose", async () => rooms.dispose());
  return app;
}
