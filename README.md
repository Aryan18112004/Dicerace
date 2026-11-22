# Dice Race

A small real-time multiplayer game platform: accounts, lobbies for 2-4 players, a
server-authoritative dice game, reconnect handling, match history and a leaderboard.

The thing I cared about most is the split between **game logic** and everything else.
The rules live in `packages/game` as pure functions (`state + action -> new state`) with
no sockets, no rendering, no clock and no `Math.random`. The server, the React client and
the Rune port all use that same code. It's the same idea Rune's SDK is built around.

## The game

Dice Race is basically Pig. On your turn you either **roll** (a 1 wipes your turn total and
passes the turn, anything else adds up) or **hold** (bank the turn total and pass). First to 50 wins.
It's simple on purpose so the interesting part is the multiplayer plumbing, not the rules.

## Stack

- Node + TypeScript, Fastify, `ws` (via `@fastify/websocket`)
- React + TypeScript + Vite
- PostgreSQL + Prisma
- JWT auth (bcrypt for passwords), Docker Compose, GitHub Actions

## Layout

```
packages/game   pure game logic, RNG, shared websocket message types (+ tests)
server          Fastify API, websocket layer, RoomManager, Prisma schema
client          React app
rune-demo       the same logic ported to Rune's SDK (stretch goal)
```

## Running it

With Docker:

```bash
cp .env.example .env     # set JWT_SECRET to something long and random
docker compose up --build
# app: http://localhost:8080
```

Locally (needs a Postgres, `docker compose up db` is enough):

```bash
cp .env.example .env
npm install
npm run db:generate
npm run prisma:deploy -w @dicerace/server   # apply migrations
npm run dev:server
npm run dev:client       # http://localhost:5173
```

Tests / checks:

```bash
npm test            # game logic, simulated matches, room manager
npm run typecheck
```

## How it works

**Server authority.** Clients only send intents (`roll`, `hold`). The server runs the
reducer, rejects anything invalid (wrong turn, hold on zero) and broadcasts the new room state.

**Determinism.** The RNG state is part of `GameState`, seeded when the match starts. Same
seed + same actions = same match, so each finished match is stored with its seed and action
log and could be replayed later. There's a test for exactly that.

**Reconnects.** When a socket drops mid-match the player stays in the room marked as
disconnected and gets a grace period (30s by default, `RECONNECT_GRACE_MS`). If they log
back in, the server recognises the user id, re-attaches the new socket and sends the current
room state. If the timer runs out they forfeit. A stale socket closing after a reconnect is
ignored, and if everybody drops the room is thrown away without recording a result. The client
retries with backoff on its own.

**Persistence.** When a match ends, one transaction writes the `Match`, its `MatchPlayer`
rows and updates every player's `LeaderboardEntry`.

## Prisma models

`User`, `Match`, `MatchPlayer`, `LeaderboardEntry`.

**Why the index on `LeaderboardEntry.score`?** The leaderboard is always "top N by score",
and "what's my rank" is a count of entries above my score. Both are range/sort queries on
that one column, so a descending index lets Postgres read the first N rows instead of
scanning and sorting the whole table. The cost is slightly slower score updates, which is
fine since the leaderboard gets read far more than it gets written. There's also an index
on `MatchPlayer.userId` for match history and on `Match.endedAt`.

Scoring is deliberately plain: win +25, loss -15, start at 1000.

## Rune port

See [`rune-demo/README.md`](rune-demo/README.md). It wraps the same reducer in Rune's
`initLogic` / `initClient`. `npm run sync:rune` copies the shared logic into that folder.

## Known limitations

- Rooms are held in memory in one server process. Running several instances would need
  sticky sessions or moving room state into something like Redis.
- No rate limiting on auth endpoints, no refresh tokens (JWTs last 7 days).
- Only one game. Adding another means a new reducer + a new component; the room, reconnect
  and persistence code doesn't care what the game is.
- No turn timer, so someone can stall by staying connected and not acting.
- The Rune demo hasn't been run inside Rune's dev tooling.
