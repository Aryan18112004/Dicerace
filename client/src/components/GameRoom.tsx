import { currentPlayer, standings, type ClientMessage, type RoomView } from "@dicerace/game";

interface Props {
  room: RoomView;
  me: string;
  send: (m: ClientMessage) => void;
}

const FACES = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

export function GameRoom({ room, me, send }: Props) {
  const game = room.game;
  const nameOf = (id: string) => room.players.find((p) => p.userId === id)?.username ?? "(left)";

  // ---- waiting room ----
  if (!game) {
    const isHost = room.hostId === me;
    return (
      <section className="card">
        <h2>{room.name}</h2>
        <p className="muted">
          {room.players.length}/{room.maxPlayers} players
        </p>
        <ul className="list">
          {room.players.map((p) => (
            <li key={p.userId}>
              {p.username} {p.userId === room.hostId && "👑"}
            </li>
          ))}
        </ul>
        <div className="row">
          {isHost && (
            <button disabled={room.players.length < 2} onClick={() => send({ t: "start" })}>
              Start match
            </button>
          )}
          <button className="secondary" onClick={() => send({ t: "leave_room" })}>
            Leave
          </button>
        </div>
        {!isHost && <p className="muted">Waiting for the host to start…</p>}
      </section>
    );
  }

  // ---- match ----
  const turn = currentPlayer(game);
  const myTurn = turn === me;
  const over = room.status === "finished";

  return (
    <section className="card">
      <h2>{room.name}</h2>
      <p className="muted">First to {game.targetScore} wins</p>

      <ul className="scores">
        {Object.entries(game.scores).map(([id, score]) => {
          const player = room.players.find((p) => p.userId === id);
          return (
            <li key={id} className={id === turn ? "active" : ""}>
              <span>
                {nameOf(id)} {id === me && "(you)"}
                {player && !player.connected && <span className="muted"> · disconnected</span>}
                {!game.players.includes(id) && <span className="muted"> · left</span>}
              </span>
              <strong>{score}</strong>
            </li>
          );
        })}
      </ul>

      <div className="die">{game.lastRoll ? FACES[game.lastRoll] : "🎲"}</div>

      {over ? (
        <div className="result">
          <h3>{game.winner === me ? "You win! 🎉" : `${nameOf(game.winner ?? "")} wins`}</h3>
          <ol>
            {standings(game).map((s) => (
              <li key={s.playerId}>
                {nameOf(s.playerId)} – {s.score}
                {s.forfeited && " (forfeited)"}
              </li>
            ))}
          </ol>
          <button onClick={() => send({ t: "leave_room" })}>Back to lobby</button>
        </div>
      ) : (
        <>
          <p>
            {myTurn ? "Your turn" : `${nameOf(turn ?? "")}'s turn`} · turn total: <strong>{game.turnTotal}</strong>
          </p>
          <div className="row">
            <button disabled={!myTurn} onClick={() => send({ t: "action", action: { type: "roll" } })}>
              Roll
            </button>
            <button
              disabled={!myTurn || game.turnTotal === 0}
              onClick={() => send({ t: "action", action: { type: "hold" } })}
            >
              Hold
            </button>
            <button className="secondary" onClick={() => send({ t: "leave_room" })}>
              Forfeit
            </button>
          </div>
        </>
      )}
    </section>
  );
}
