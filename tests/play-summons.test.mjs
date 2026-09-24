import test from "node:test";
import assert from "node:assert/strict";
import { advanceTurn, currentActor } from "../engine/encounter.js";
import { placeSummon } from "../engine/summon.js";
import { freshStatuses } from "../engine/status.js";

function makeState(playSummons) {
  const hero = {
    id: "acolyte-a",
    name: "Acolyte A",
    side: "hero",
    int: 1,
    str: 0,
    dex: 1,
    speed: 5,
    hp: 20,
    hpMax: 20,
    wounds: 0,
    dead: false,
    alive: true,
    ap: 3,
    apMax: 3,
    stress: 3,
    stressMax: 3,
    mana: 10,
    x: 2,
    y: 2,
    st: freshStatuses(),
    abilityIds: [],
  };
  const foe = {
    id: "wolf",
    name: "Wolf",
    side: "enemy",
    hp: 18,
    hpMax: 18,
    wounds: 0,
    dead: false,
    alive: true,
    speed: 6,
    x: 8,
    y: 2,
    st: freshStatuses(),
    str: 1,
    dex: 1,
    int: 0,
  };
  const state = {
    actors: [hero, foe],
    queue: [hero.id, foe.id],
    queueIndex: 0,
    round: 1,
    playSummons: !!playSummons,
    log: [],
    abilityById: {},
    objects: [],
    bounds: { minX: 0, maxX: 11, minY: 0, maxY: 7 },
  };
  const placed = placeSummon(state, hero, "mage", { skipCost: true });
  assert.equal(placed.ok, true);
  return { state, hero, foe, pet: placed.summon };
}

test("playSummons hands the summoner turn to the pet, then returns the queue", () => {
  const { state, hero, foe, pet } = makeState(true);
  advanceTurn(state);
  assert.equal(currentActor(state).id, pet.id);
  assert.equal(pet.moveLeft, 1);
  assert.equal(pet.actionLeft, 1);
  assert.equal(pet.oaLeft, 1);
  assert.ok(state.summonInterlude);
  assert.deepEqual(state.summonInterlude.queue, [hero.id, foe.id]);
  assert.ok(state.log.some((row) => String(row.msg).includes("(summon) acts after " + hero.name)));

  advanceTurn(state);
  assert.equal(state.summonInterlude, null);
  assert.equal(currentActor(state).id, foe.id);
  assert.ok(state.log.some((row) => String(row.msg).includes("(summon) ends")));
  assert.notEqual(state.over, true);
});

test("without playSummons the pet is not left as the current actor", () => {
  const { state, pet } = makeState(false);
  advanceTurn(state);
  assert.ok(!state.summonInterlude);
  assert.notEqual(currentActor(state) && currentActor(state).id, pet.id);
  assert.equal(currentActor(state).id, "wolf");
});
