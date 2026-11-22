import { useState, type FormEvent } from "react";
import { api, type Session } from "../api";

export function AuthForm({ onAuth }: { onAuth: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const fn = mode === "login" ? api.login : api.signup;
      onAuth(await fn(username, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card auth" onSubmit={submit}>
      <h2>{mode === "login" ? "Log in" : "Create account"}</h2>
      <input
        placeholder="username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        required
      />
      <input
        type="password"
        placeholder="password (8+ characters)"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        required
      />
      {error && <p className="error">{error}</p>}
      <button disabled={busy}>{mode === "login" ? "Log in" : "Sign up"}</button>
      <button
        type="button"
        className="link"
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
      >
        {mode === "login" ? "Need an account? Sign up" : "Already have one? Log in"}
      </button>
    </form>
  );
}
