import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, RoomView, ServerMessage } from "@dicerace/game";

export type ConnStatus = "connecting" | "open" | "reconnecting" | "replaced";

// Owns the websocket. If the connection drops we keep retrying with the same
// token; the server recognises the user and drops them back into their match.
export function useGameSocket(token: string, onUnauthorized: () => void) {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [rooms, setRooms] = useState<RoomView[]>([]);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onUnauthRef = useRef(onUnauthorized);
  onUnauthRef.current = onUnauthorized;

  useEffect(() => {
    let closedByUs = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        switch (msg.t) {
          case "hello":
            setRooms(msg.rooms);
            setRoom(msg.room);
            break;
          case "rooms":
            setRooms(msg.rooms);
            break;
          case "room":
            setRoom(msg.room);
            setError(null);
            break;
          case "left":
            setRoom(null);
            break;
          case "error":
            setError(msg.message);
            break;
        }
      };

      ws.onclose = (ev) => {
        if (closedByUs) return;
        if (ev.code === 4401) return onUnauthRef.current();
        if (ev.code === 4000) return setStatus("replaced"); // opened in another tab
        setStatus("reconnecting");
        const delay = Math.min(5000, 500 * 2 ** attempt++);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [token]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return { status, rooms, room, error, send };
}
