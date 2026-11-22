# Rune demo

Same Dice Race rules, wrapped in Rune's `initLogic` / `initClient` API.

- `src/gameLogic.ts` is a copy of `packages/game/src/logic.ts` (run `npm run sync:rune` from the repo root after changing the rules)
- `src/logic.ts` is the thin adapter Rune loads on its server
- `src/client.ts` is a bare-bones UI

```bash
cd rune-demo
npm install
npm run dev
```

Heads up: I wrote this against the Rune SDK docs but have not run it inside the Rune dev UI, so expect to tweak
the SDK version / script tag if their API has moved. It's not part of the workspace or CI.
