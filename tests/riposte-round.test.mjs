import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createEncounter, advanceTurn, applyAction, currentActor } from "../engine/encounter.js";
import { beginTurn } from "../engine/turn.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function card(id) {
  return JSON.parse(fs.readFileSync(path.join(root, "cards", id + ".json"), "utf8"));
}

test("AI Riposte is once per round and the next round can use it again", () => {
  const assassin = card("assassin");
  const wolf = card("ember-wolf");
  const bite = card("ember-wolf-bite");
  const state = createEncounter({
    seed: 1,
    defendPolicy: "always",
    deferStart: true,
    heroes: [{ card: assassin, id: "assassin", pos: { x: 2, y: 2 } }],
    enemies: [
      { card: wolf, id: "wolf-a", pos: { x: 3, y: 2 } },
      { card: wolf, id: "wolf-b", pos: { x: 1, y: 2 } },
    ],
    abilityById: { "ember-wolf-bite": bite },
  });
  const hero = state.actors.find((a) => a.id === "assassin");
  const w1 = state.actors.find((a) => a.id === "wolf-a");
  const w2 = state.actors.find((a) => a.id === "wolf-b");
  assert.ok(hero && w1 && w2);
  hero.hasRiposte = true;
  state.queue = [w1.id, w2.id, hero.id];
  state.queueIndex = 0;
  state.round = 1;
  beginTurn(w1, { actors: state.actors, state });

  const biteAt = () =>
    applyAction(state, {
      type: "strike",
      abilityId: "ember-wolf-bite",
      targetId: hero.id,
    });

  const first = biteAt();
  assert.equal(first.ok, true, first.reason);
  assert.equal(hero.riposteUsedThisRound, true);
  assert.equal(hero.stress, 3);
  assert.equal(first.result.raw, 2);

  advanceTurn(state);
  assert.equal(currentActor(state).id, w2.id);
  const second = biteAt();
  assert.equal(second.ok, true, second.reason);
  assert.equal(hero.stress, 3);
  assert.equal(second.result.raw, 7);

  advanceTurn(state);
  assert.equal(currentActor(state).id, hero.id);
  advanceTurn(state);
  assert.equal(state.round, 2);
  assert.equal(hero.riposteUsedThisRound, false);
  state.queue = [w1.id];
  state.queueIndex = 0;
  beginTurn(w1, { actors: state.actors, state });

  const third = biteAt();
  assert.equal(third.ok, true, third.reason);
  assert.equal(hero.riposteUsedThisRound, true);
  assert.equal(hero.stress, 2);
  assert.equal(third.result.raw, 2);
});
