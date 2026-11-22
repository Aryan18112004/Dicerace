import type { GameStateRune } from "./logic";

// Deliberately tiny: no framework, just show the state and wire two buttons.
// Everything about the rules lives in logic.ts / gameLogic.ts.

const root = document.getElementById("root")!;

root.innerHTML = `
  <div id="scores"></div>
  <div id="turn"></div>
  <button id="roll">Roll</button>
  <button id="hold">Hold</button>
`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
$("roll").onclick = () => Rune.actions.roll();
$("hold").onclick = () => Rune.actions.hold();

Rune.initClient({
  onChange: ({ game, yourPlayerId, players }) => {
    const turn = game.players[game.turnIndex];
    $("scores").innerHTML = Object.entries(game.scores)
      .map(([id, score]) => `<p>${players[id]?.displayName ?? id}: <b>${score}</b></p>`)
      .join("");
    $("turn").textContent = `turn total ${game.turnTotal}, last roll ${game.lastRoll ?? "-"}`;

    const mine = turn === yourPlayerId;
    ($("roll") as HTMLButtonElement).disabled = !mine;
    ($("hold") as HTMLButtonElement).disabled = !mine || game.turnTotal === 0;
  },
});
