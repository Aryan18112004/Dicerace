import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";

const credentials = z.object({
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, "letters, numbers and underscores only"),
  password: z.string().min(8).max(72), // bcrypt ignores anything past 72 bytes
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/signup", async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid input" });
    }
    const { username, password } = parsed.data;
    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const user = await prisma.user.create({
        data: {
          username,
          passwordHash,
          // every user gets a leaderboard row up front
          leaderboard: { create: {} },
        },
      });
      const token = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: "7d" });
      return { token, user: { id: user.id, username: user.username } };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return reply.code(409).send({ error: "username is taken" });
      }
      throw err;
    }
  });

  app.post("/auth/login", async (req, reply) => {
    const parsed = credentials.safeParse(req.body);
    // same message for "bad input" and "wrong password" so we don't leak which usernames exist
    const fail = () => reply.code(401).send({ error: "invalid username or password" });
    if (!parsed.success) return fail();

    const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (!user) return fail();
    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return fail();

    const token = app.jwt.sign({ id: user.id, username: user.username }, { expiresIn: "7d" });
    return { token, user: { id: user.id, username: user.username } };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (req) => {
    return { user: req.user };
  });
}
