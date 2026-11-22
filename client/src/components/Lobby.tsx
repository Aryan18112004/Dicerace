import { useState } from "react";
import type { ClientMessage, RoomView } from "@dicerace/game";

interface Props {
  rooms: RoomView[];
  send: (m: ClientMessage) => void;
}

export function Lobby({ rooms, send }: Props) {
  const [name, setName] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(4);

  return (
    <section className="card">
      <h2>Lobby</h2>
      <div className="row">
        <input placeholder="room name" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
          {[2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n} players
            </option>
          ))}
        </select>
        <button onClick={() => send({ t: "create_room", name, maxPlayers })}>Create</button>
      </div>

      <h3>Open rooms</h3>
      {rooms.length === 0 && <p className="muted">Nothing open right now. Make one!</p>}
      <ul className="list">
        {rooms.map((r) => (
          <li key={r.id}>
            <span>
              {r.name} <span className="muted">({r.players.length}/{r.maxPlayers})</span>
            </span>
            <button disabled={r.players.length >= r.maxPlayers} onClick={() => send({ t: "join_room", roomId: r.id })}>
              Join
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
