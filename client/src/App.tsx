import { useState } from "react";
import { AuthForm } from "./components/AuthForm";
import { Home } from "./components/Home";
import type { Session } from "./api";

const KEY = "dicerace.session";

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(loadSession);

  const save = (s: Session | null) => {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
    setSession(s);
  };

  return (
    <div className="app">
      <header>
        <h1>🎲 Dice Race</h1>
        {session && (
          <div className="who">
            {session.user.username}
            <button className="link" onClick={() => save(null)}>
              log out
            </button>
          </div>
        )}
      </header>
      {session ? <Home session={session} onLogout={() => save(null)} /> : <AuthForm onAuth={save} />}
    </div>
  );
}
