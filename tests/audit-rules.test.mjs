import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { legalActions } from "../engine/actions.js";
import { resolveStrike } from "../engine/strike.js";
import { isMonsterSpecialAbility } from "../engine/status.js";
import { freshStatuses } from "../engine/status.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readCard(id) {
  return JSON.parse(fs.readFileSync(path.join(root, "cards", id + ".json"), "utf8"));
}

function abilityCards() {
  return fs
    .readdirSync(path.join(root, "cards"))
    .filter((name) => name.endsWith(".json") && name !== "card.schema.json")
    .map((name) => JSON.parse(fs.readFileSync(path.join(root, "cards", name), "utf8")))
    .filter((card) => card && card.kind === "ability");
}

test("legal click range is ability.range, not aoe.range", () => {
  const cards = abilityCards().filter(
    (card) => card.range != null && card.aoe && card.aoe.range != null && card.range !== card.aoe.range
  );
  assert.ok(cards.length >= 3, "expected Entangle, Toxic Cloud, and Fireball");
  const abilityById = {};
  for (const card of cards) abilityById[card.id] = card;
  const hero = {
    id: "caster",
    name: "Caster",
    side: "hero",
    hp: 30,
    hpMax: 30,
    ap: 6,
    stress: 6,
    mana: 6,
    x: 0,
    y: 0,
    st: freshStatuses(),
    abilityIds: cards.map((card) => card.id),
  };
  const near = {
    id: "near",
    name: "Near",
    side: "enemy",
    hp: 10,
    hpMax: 10,
    x: 4,
    y: 0,
    st: freshStatuses(),
  };
  const far = {
    id: "far",
    name: "Far",
    side: "enemy",
    hp: 10,
    hpMax: 10,
    x: 8,
    y: 0,
    st: freshStatuses(),
  };
  const state = {
    actors: [hero, near, far],
    objects: [],
    hazards: [],
    bounds: { minX: 0, maxX: 11, minY: 0, maxY: 7 },
    abilityById,
  };
  const legal = legalActions(state, hero, abilityById).filter((a) => a.type === "strike");
  for (const card of cards) {
    const action = legal.find((a) => a.abilityId === card.id);
    assert.ok(action, card.id);
    assert.equal(action.range, card.range | 0, card.id + " click range");
    assert.notEqual(action.range, card.aoe.range | 0, card.id + " must not use blast as click range");
    assert.ok(action.targets.includes("near"), card.id + " in cast range");
    assert.equal(action.targets.includes("far"), false, card.id + " beyond cast range");
    const inside = resolveStrike({
      attacker: hero,
      target: near,
      ability: card,
      actors: state.actors,
      dryRun: true,
      skipAp: true,
      rng: () => 0.5,
    });
    assert.notEqual(inside.reason, "out-of-range", card.id);
    const outside = resolveStrike({
      attacker: hero,
      target: far,
      ability: card,
      actors: state.actors,
      dryRun: true,
      skipAp: true,
      rng: () => 0.5,
    });
    assert.equal(outside.reason, "out-of-range", card.id);
  }
});

test("warrior pet melee is a basic; ranged summon tools stay special", () => {
  const warrior = readCard("summon-warrior-strike");
  const claws = readCard("ember-wolf-ember-claws");
  const fireball = readCard("summon-mage-fireball");
  assert.equal(warrior.range, 1);
  assert.equal(isMonsterSpecialAbility(warrior), false);
  assert.equal(isMonsterSpecialAbility(claws), false);
  assert.equal(isMonsterSpecialAbility(fireball), true);
});
