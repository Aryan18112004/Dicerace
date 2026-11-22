import { useEffect, useState } from "react";
import { api, type LeaderboardRow, type MatchRow, type MyStats, type Session } from "../api";

export function Stats({ session }: { session: Session }) {
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [mine, setMine] = useState<MyStats | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);

  useEffect(() => {
    // fire and forget, the lobby still works if stats fail to load
    api.leaderboard().then(setBoard).catch(() => {});
    api.myStats(session.token).then(setMine).catch(() => {});
    api.myMatches(session.token).then(setMatches).catch(() => {});
  }, [session.token]);

  return (
    <section className="card">
      <h2>Leaderboard</h2>
      <table>
        <tbody>
          {board.map((r) => (
            <tr key={r.userId} className={r.userId === session.user.id ? "me" : ""}>
              <td>#{r.rank}</td>
              <td>{r.username}</td>
              <td>{r.score}</td>
              <td className="muted">
                {r.wins}W {r.losses}L
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {mine && (
        <p className="muted">
          You: rank #{mine.rank}, {mine.score} pts, {mine.wins} wins from {mine.gamesPlayed} games
        </p>
      )}

      <h3>Recent matches</h3>
      {matches.length === 0 && <p className="muted">No matches yet.</p>}
      <ul className="list">
        {matches.map((m) => (
          <li key={m.matchId}>
            <span>
              {m.won ? "🏆" : m.forfeited ? "🚪" : "·"} {m.roomName}
            </span>
            <span className="muted">
              {m.placement}/{m.playerCount} · {m.finalScore} pts
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
