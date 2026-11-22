export interface Session {
  token: string;
  user: { id: string; username: string };
}

export interface LeaderboardRow {
  rank: number;
  userId: string;
  username: string;
  score: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
}

export interface MyStats {
  score: number;
  wins: number;
  losses: number;
  gamesPlayed: number;
  rank: number;
}

export interface MatchRow {
  matchId: string;
  roomName: string;
  endedAt: string;
  playerCount: number;
  endReason: string;
  placement: number;
  finalScore: number;
  won: boolean;
  forfeited: boolean;
}

async function request<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body as T;
}

export const api = {
  signup: (username: string, password: string) =>
    request<Session>("/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<Session>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  leaderboard: () => request<LeaderboardRow[]>("/leaderboard?limit=10"),
  myStats: (token: string) => request<MyStats>("/me/stats", undefined, token),
  myMatches: (token: string) => request<MatchRow[]>("/me/matches", undefined, token),
};
