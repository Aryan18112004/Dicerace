import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import { applyScore } from "./scoring.js";
import type { FinishedMatch } from "./rooms/RoomManager.js";

// Writes one finished match and updates everyone's leaderboard row in a
// single transaction, so stats can't drift out of sync with match history.
export async function saveMatch(m: FinishedMatch): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.match.create({
      data: {
        roomName: m.roomName,
        seed: m.seed,
        playerCount: m.standings.length,
        winnerId: m.winnerId,
        endReason: m.reason,
        actions: m.actions as unknown as Prisma.InputJsonValue,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        players: {
          create: m.standings.map((s) => ({
            userId: s.playerId,
            finalScore: s.score,
            placement: s.placement,
            won: s.playerId === m.winnerId,
            forfeited: s.forfeited,
          })),
        },
      },
    });

    for (const s of m.standings) {
      const won = s.playerId === m.winnerId;
      const entry = await tx.leaderboardEntry.findUnique({ where: { userId: s.playerId } });
      if (!entry) continue; // shouldn't happen, signup creates one
      await tx.leaderboardEntry.update({
        where: { userId: s.playerId },
        data: {
          score: applyScore(entry.score, won),
          gamesPlayed: { increment: 1 },
          wins: { increment: won ? 1 : 0 },
          losses: { increment: won ? 0 : 1 },
        },
      });
    }
  });
}
