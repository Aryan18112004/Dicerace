import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/leaderboard", async (req) => {
    const { limit } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(20) })
      .parse(req.query);

    // this is the query the score index exists for
    const rows = await prisma.leaderboardEntry.findMany({
      orderBy: { score: "desc" },
      take: limit,
      include: { user: { select: { username: true } } },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: r.user.username,
      score: r.score,
      wins: r.wins,
      losses: r.losses,
      gamesPlayed: r.gamesPlayed,
    }));
  });

  app.get("/me/stats", { preHandler: [app.authenticate] }, async (req, reply) => {
    const entry = await prisma.leaderboardEntry.findUnique({ where: { userId: req.user.id } });
    if (!entry) return reply.code(404).send({ error: "no stats yet" });
    const ahead = await prisma.leaderboardEntry.count({ where: { score: { gt: entry.score } } });
    return {
      score: entry.score,
      wins: entry.wins,
      losses: entry.losses,
      gamesPlayed: entry.gamesPlayed,
      rank: ahead + 1,
    };
  });

  app.get("/me/matches", { preHandler: [app.authenticate] }, async (req) => {
    const rows = await prisma.matchPlayer.findMany({
      where: { userId: req.user.id },
      orderBy: { match: { endedAt: "desc" } },
      take: 20,
      include: { match: { select: { id: true, roomName: true, endedAt: true, playerCount: true, endReason: true } } },
    });
    return rows.map((r) => ({
      matchId: r.match.id,
      roomName: r.match.roomName,
      endedAt: r.match.endedAt,
      playerCount: r.match.playerCount,
      endReason: r.match.endReason,
      placement: r.placement,
      finalScore: r.finalScore,
      won: r.won,
      forfeited: r.forfeited,
    }));
  });
}
