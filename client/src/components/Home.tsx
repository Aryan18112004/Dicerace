import { useGameSocket } from "../useGameSocket";
import type { Session } from "../api";
import { Lobby } from "./Lobby";
import { GameRoom } from "./GameRoom";
import { Stats } from "./Stats";

export function Home({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const { status, rooms, room, error, send } = useGameSocket(session.token, onLogout);

  if (status === "replaced") {
    return <p className="card">This account is open in another tab. Close that one or refresh here.</p>;
  }

  return (
    <>
      {status !== "open" && (
        <div className="banner">
          {status === "connecting" ? "Connecting…" : "Connection lost, trying to get you back in…"}
        </div>
      )}
      {error && <div className="banner error">{error}</div>}
      {room ? (
        <GameRoom room={room} me={session.user.id} send={send} />
      ) : (
        <div className="columns">
          <Lobby rooms={rooms} send={send} />
          <Stats session={session} />
        </div>
      )}
    </>
  );
}
