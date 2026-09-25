import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveStrike, resolveAbilityTierDamage } from "../engine/strike.js";
import { applyDamage } from "../engine/damage.js";
import { beginTurn, endTurn } from "../engine/turn.js";
import { powerRoll } from "../engine/powerRoll.js";
import { systemsBargainT1Damage, tryRiposte, placeIceWall, iceWallDestroySplash, applyMagicShield, magicShieldAmount, blessBonus, healingWaterBonus, applySpotterMark, consumeSpotterAttackBonus } from "../engine/feats.js";
import { legalActions } from "../engine/actions.js";
import { chooseHeroAction } from "../engine/ai.js";
import { applyAction } from "../engine/encounter.js";
import { paintToxicCloud } from "../engine/clouds.js";
import { freshStatuses } from "../engine/status.js";
import { createRng } from "../engine/rng.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function card(id) {
  return JSON.parse(fs.readFileSync(path.join(root, "cards", id + ".json"), "utf8"));
}

function actor(partial) {
  return Object.assign(
    {
      id: "a",
      name: "A",
      side: "hero",
      str: 1,
      dex: 1,
      int: 1,
      hp: 30,
      hpMax: 30,
      ap: 6,
      stress: 6,
      mana: 10,
      x: 0,
      y: 0,
      speed: 5,
      stability: 1,
      dead: false,
      alive: true,
      st: freshStatuses(),
      abilityIds: [],
      def: { Physical: 0, Fire: 0, Toxic: 0, Dark: 0 },
    },
    partial
  );
}

test("System's Bargain shifts thresholds by −1 and T1 costs 3×tier", () => {
  assert.equal(systemsBargainT1Damage({ tier: 1 }), 3);
  assert.equal(systemsBargainT1Damage({}), 3);
  assert.equal(systemsBargainT1Damage({ rank: 2 }), 6);
  const t1 = powerRoll({ d1: 2, d2: 3, statValue: 5, adv: 0, disadv: 0, thresholdShift: -1 });
  assert.equal(t1.total, 10);
  assert.equal(t1.tier, 1);
  const t2 = powerRoll({ d1: 3, d2: 3, statValue: 5, adv: 0, disadv: 0, thresholdShift: -1 });
  assert.equal(t2.total, 11);
  assert.equal(t2.tier, 2);
  const t2b = powerRoll({ d1: 5, d2: 5, statValue: 5, adv: 0, disadv: 0, thresholdShift: -1 });
  assert.equal(t2b.total, 15);
  assert.equal(t2b.tier, 2);
  const t3 = powerRoll({ d1: 6, d2: 5, statValue: 5, adv: 0, disadv: 0, thresholdShift: -1 });
  assert.equal(t3.total, 16);
  assert.equal(t3.tier, 3);
});

test("Shadowplay fears from the chosen ally, INT gate, upcast intimidate", () => {
  const ab = card("mystic-shadowplay");
  const caster = actor({
    id: "mystic",
    name: "Mystic",
    int: 1,
    x: 0,
    y: 0,
    shadowplay: true,
    abilityIds: ["mystic-shadowplay"],
  });
  const ally = actor({ id: "tank", name: "Tank", x: 3, y: 0 });
  const weak = actor({
    id: "weak",
    name: "Weak",
    side: "enemy",
    int: 0,
    x: 6,
    y: 0,
    hp: 20,
    hpMax: 20,
  });
  const strong = actor({
    id: "strong",
    name: "Strong",
    side: "enemy",
    int: 5,
    x: 3,
    y: 3,
    hp: 20,
    hpMax: 20,
  });
  const actors = [caster, ally, weak, strong];
  const r = resolveStrike({
    attacker: caster,
    target: weak,
    ability: ab,
    actors,
    allies: [caster, ally],
    rng: createRng(1),
    skipAp: true,
    sourceAllyId: ally.id,
    upcast: true,
    state: { actors, hazards: [], clouds: [] },
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(weak.st.fearSource, ally.id);
  assert.equal(strong.st.fearSource, null);
  assert.equal(caster.shadowplayFearAdv, true);
  assert.equal(weak.st.intimidate, 2);
  assert.equal(strong.st.intimidate | 0, 0);
});

test("Toxic Cloud is 4×INT, persists, poisons on enter and start, and stacks", () => {
  const caster = actor({ id: "acol", int: 2, side: "hero" });
  const foe = actor({
    id: "foe",
    name: "Foe",
    side: "enemy",
    int: 1,
    x: 4,
    y: 0,
    hp: 40,
    hpMax: 40,
    def: { Toxic: 0, Physical: 0 },
  });
  const state = { actors: [caster, foe], hazards: [], clouds: [], bounds: null };
  paintToxicCloud(state, caster, foe, { radius: 3 });
  assert.equal(foe.hp, 40 - 8);
  assert.equal(foe.st.poison, 2);
  assert.ok(state.hazards.length > 0);
  beginTurn(foe, { actors: state.actors, state, tickDots: true });
  assert.equal(foe.st.poison, 3);
  assert.ok(foe.hp < 40 - 8);
});

test("Living Bomb burn uses DEX ≤ INT and death burst is 10+INT in range 3", () => {
  const ab = card("mystic-living-bomb");
  assert.equal(ab.costAp, 2);
  assert.equal(ab.costMana, 2);
  assert.equal(ab.tiers.t1.status.gate.nBonus, -1);
  const caster = actor({ id: "mystic", int: 1, x: 0, y: 0 });
  const open = actor({
    id: "open",
    side: "enemy",
    dex: 2,
    x: 2,
    y: 0,
    hp: 20,
    hpMax: 20,
    st: freshStatuses(),
  });
  const shut = actor({
    id: "shut",
    side: "enemy",
    dex: 0,
    x: 2,
    y: 1,
    hp: 20,
    hpMax: 20,
    st: freshStatuses(),
  });
  const actors = [caster, open];
  const miss = resolveStrike({
    attacker: caster,
    target: open,
    ability: ab,
    actors,
    rng: createRng(1),
    skipAp: true,
    declared: { effect: ab.tiers.t2, tier: 2, roll: { tier: 2, d1: 1, d2: 1, total: 12 } },
    state: { actors, hazards: [] },
  });
  assert.equal(miss.ok, true, miss.reason);
  assert.equal(open.st.burn | 0, 0);
  assert.ok(open.livingBomb);
  assert.equal(open.livingBomb.dmg, 10 + 1);

  const hit = resolveStrike({
    attacker: caster,
    target: shut,
    ability: ab,
    actors: [caster, shut],
    rng: createRng(1),
    skipAp: true,
    upcast: true,
    declared: { effect: ab.tiers.t1, tier: 1, roll: { tier: 1, d1: 1, d2: 1, total: 8 } },
    state: { actors: [caster, shut], hazards: [] },
  });
  assert.equal(hit.ok, true, hit.reason);
  assert.equal(shut.st.burn, 2);
  assert.equal(shut.livingBomb.dmg, 10 + 1 + 2 * 1);

  const listed = legalActions(
    { actors: [caster, open], objects: [], hazards: [], bounds: { minX: 0, minY: 0, maxX: 11, maxY: 7 } },
    Object.assign(caster, { abilityIds: ["mystic-living-bomb"], ap: 3, mana: 10, x: 0, y: 0 }),
    { "mystic-living-bomb": ab }
  ).filter((a) => a.abilityId === "mystic-living-bomb");
  assert.equal(listed.length, 2);
  assert.equal(listed[0].apCost, 2);
  assert.equal(listed[0].manaCost, 2);
  assert.equal(listed[0].upcast, undefined);
  assert.equal(listed[1].label, "Living Bomb (Upcast)");
  assert.equal(listed[1].manaCost, 3);
  assert.equal(listed[1].upcast, true);

  const near = actor({ id: "near", side: "enemy", x: 5, y: 0, hp: 30, hpMax: 30, def: { Fire: 0 } });
  const far = actor({ id: "far", side: "enemy", x: 8, y: 0, hp: 30, hpMax: 30, def: { Fire: 0 } });
  const bombActors = [caster, shut, near, far];
  shut.x = 4;
  shut.y = 0;
  shut.livingBomb = { dmg: 9, fromId: caster.id, range: 3, traceState: null };
  applyDamage(shut, 100, { dmgType: "Physical", actors: bombActors });
  assert.equal(shut.dead, true);
  assert.equal(near.hp, 21);
  assert.equal(far.hp, 30);
  assert.equal(caster.hp, 30);
});

test("Ice Wall costs 2 AP and 3 mana, places 4 segments, and can be cast again", () => {
  const bounds = { minX: 0, minY: 0, maxX: 11, maxY: 7 };
  const foe = actor({ id: "foe", side: "enemy", x: 10, y: 2, hp: 20, hpMax: 20 });
  const hero = actor({
    id: "mystic",
    hasIceWall: true,
    int: 2,
    ap: 4,
    mana: 6,
    stress: 0,
    x: 2,
    y: 2,
  });
  const state = { actors: [hero, foe], objects: [], hazards: [], bounds };
  const legal = legalActions(state, hero, {});
  const walls = legal.filter((a) => a.type === "iceWall");
  assert.equal(walls.filter((a) => !a.upcast).length, 1);
  assert.equal(walls.find((a) => !a.upcast).apCost, 2);
  assert.equal(walls.find((a) => !a.upcast).manaCost, 3);
  assert.ok(walls.some((a) => a.upcastMode === "spaces" && a.manaCost === 4));
  assert.ok(walls.some((a) => a.upcastMode === "damage" && a.manaCost === 4));

  const broke = actor({ id: "poor", hasIceWall: true, ap: 1, mana: 10, stress: 0, x: 2, y: 2 });
  const noAp = placeIceWall({ actors: [broke, foe], objects: [], hazards: [], bounds }, broke);
  assert.equal(noAp.ok, false);
  assert.equal(noAp.reason, "no-ap");
  assert.equal(broke.ap, 1);
  assert.equal(broke.mana, 10);

  const dry = actor({ id: "dry", hasIceWall: true, ap: 3, mana: 2, stress: 0, x: 2, y: 2 });
  const noMana = placeIceWall({ actors: [dry, foe], objects: [], hazards: [], bounds }, dry);
  assert.equal(noMana.ok, false);
  assert.equal(noMana.reason, "no-mana");
  assert.equal(dry.ap, 3);
  assert.equal(dry.mana, 2);

  const first = placeIceWall(state, hero);
  assert.equal(first.ok, true, first.reason);
  assert.equal(first.segments.length, 4);
  assert.equal(first.segHp, 5);
  assert.equal(first.destroyDmg, 2);
  assert.equal(hero.ap, 2);
  assert.equal(hero.mana, 3);
  assert.equal(hero.iceWallUsed, undefined);
  assert.ok(state.hazards.some((h) => h.difficult));

  const second = placeIceWall(state, hero);
  assert.equal(second.ok, true, second.reason);
  assert.equal(second.segments.length, 4);
  assert.equal(hero.ap, 0);
  assert.equal(hero.mana, 0);
  assert.equal(state.objects.filter((o) => o.iceWall).length, 8);

  const up = actor({
    id: "up",
    hasIceWall: true,
    int: 1,
    ap: 4,
    mana: 8,
    stress: 0,
    x: 1,
    y: 1,
  });
  const upState = {
    actors: [up, actor({ id: "foe2", side: "enemy", x: 10, y: 1, hp: 20, hpMax: 20 })],
    objects: [],
    hazards: [],
    bounds,
  };
  const spaces = placeIceWall(upState, up, { upcast: true, upcastMode: "spaces" });
  assert.equal(spaces.ok, true, spaces.reason);
  assert.equal(spaces.segments.length, 7);
  assert.equal(spaces.destroyDmg, 2);
  assert.equal(up.mana, 4);
  const boom = placeIceWall(upState, up, { upcast: true, upcastMode: "damage" });
  assert.equal(boom.ok, true, boom.reason);
  assert.equal(boom.segments.length, 4);
  assert.equal(boom.destroyDmg, 4);
  assert.equal(up.mana, 0);
  const bystander = actor({ id: "by", side: "enemy", x: boom.segments[0].x, y: boom.segments[0].y + 1, hp: 20, hpMax: 20 });
  iceWallDestroySplash(boom.segments[0], [bystander]);
  assert.equal(bystander.hp, 16);
});

test("Ice Wall once-per-fight is AI-only; the lab button stays", () => {
  const bounds = { minX: 0, minY: 0, maxX: 11, maxY: 7 };
  const hero = actor({
    id: "mystic",
    name: "Mystic",
    hasIceWall: true,
    int: 1,
    ap: 6,
    apMax: 3,
    mana: 10,
    stress: 0,
    x: 2,
    y: 2,
    attacksThisTurn: 0,
    kitPickedThisTurn: true,
    weaponOptions: [],
  });
  const foes = [
    actor({ id: "w1", name: "Wolf A", side: "enemy", x: 10, y: 1, hp: 18, hpMax: 18 }),
    actor({ id: "w2", name: "Wolf B", side: "enemy", x: 10, y: 4, hp: 18, hpMax: 18 }),
  ];
  const state = {
    actors: [hero, ...foes],
    objects: [],
    hazards: [],
    bounds,
    queue: [hero.id],
    queueIndex: 0,
    abilityById: {},
    log: [],
    awaitingKitPick: false,
    awaitingHeroPick: false,
  };

  const human = applyAction(state, { type: "iceWall" });
  assert.equal(human.ok, true, human.reason);
  assert.equal(hero.iceWallUsed, undefined);
  assert.equal(state.objects.filter((o) => o.iceWall).length, 4);
  const still = legalActions(state, hero, {}).filter((a) => a.type === "iceWall");
  assert.ok(still.some((a) => !a.upcast));
  const again = chooseHeroAction(state, "smart");
  assert.equal(again.type, "iceWall");
  assert.equal(again.fromAi, true);

  hero.ap = 6;
  hero.mana = 10;
  hero.attacksThisTurn = 0;
  const ai = applyAction(state, again);
  assert.equal(ai.ok, true, ai.reason);
  assert.equal(hero.iceWallUsed, true);
  assert.ok(state.objects.filter((o) => o.iceWall).length > 4);
  hero.ap = 6;
  hero.mana = 10;
  hero.attacksThisTurn = 0;
  const refused = chooseHeroAction(state, "smart");
  assert.notEqual(refused.type, "iceWall");
  const buttons = legalActions(state, hero, {}).filter((a) => a.type === "iceWall");
  assert.ok(buttons.some((a) => !a.upcast), "lab list still offers Ice Wall");
  assert.ok(buttons.some((a) => a.upcastMode === "spaces"));
  assert.ok(buttons.some((a) => a.upcastMode === "damage"));
  const humanAgain = applyAction(state, { type: "iceWall" });
  assert.equal(humanAgain.ok, true, humanAgain.reason);
  assert.equal(hero.iceWallUsed, true);
});

test("Grapple damage scales by tier and the Restrain gate is +0/+1/+1", () => {
  const ab = card("brawler-grapple");
  const gloves = card("brawler-fighting-gloves");
  assert.equal(ab.tiers.t2.status.gate.nBonus, 1);
  assert.equal(ab.tiers.t3.status.gate.nBonus, 1);
  assert.equal(ab.tiers.t1.status.gate.nBonus, undefined);
  const hero = actor({
    id: "brawler",
    str: 2,
    abilityIds: ["brawler-fighting-gloves-strike"],
    weaponOptions: ["fighting-gloves"],
    activeKit: 0,
  });
  const ctx = { abilityById: { "brawler-fighting-gloves-strike": gloves } };
  assert.equal(resolveAbilityTierDamage(ab, ab.tiers.t1, hero, ctx), 6 + 2);
  assert.equal(resolveAbilityTierDamage(ab, ab.tiers.t2, hero, ctx), 8 + 4);
  assert.equal(resolveAbilityTierDamage(ab, ab.tiers.t3, hero, ctx), 11 + 6);
  const bare = actor({ id: "bare", str: 3, abilityIds: [], weaponOptions: [] });
  assert.equal(resolveAbilityTierDamage(ab, ab.tiers.t1, bare, ctx), 7);
  assert.equal(resolveAbilityTierDamage(ab, ab.tiers.t2, bare, ctx), 10);
  assert.equal(resolveAbilityTierDamage(ab, ab.tiers.t3, bare, ctx), 14);

  function strikeTier(tier, foeStr) {
    const atk = actor({
      id: "brawler",
      str: 1,
      x: 0,
      y: 0,
      abilityIds: ["brawler-grapple", "brawler-fighting-gloves-strike"],
      weaponOptions: ["fighting-gloves"],
      activeKit: 0,
    });
    const foe = actor({
      id: "foe",
      side: "enemy",
      str: foeStr,
      x: 1,
      y: 0,
      hp: 40,
      hpMax: 40,
    });
    const key = "t" + tier;
    const hit = resolveStrike({
      attacker: atk,
      target: foe,
      ability: ab,
      actors: [atk, foe],
      abilityById: ctx.abilityById,
      state: { abilityById: Object.assign({ "brawler-grapple": ab }, ctx.abilityById), actors: [atk, foe] },
      rng: createRng(1),
      skipAp: true,
      declared: { effect: ab.tiers[key], tier, roll: { tier, d1: 6, d2: 6, total: 18 } },
    });
    assert.equal(hit.ok, true, hit.reason);
    return foe;
  }
  assert.equal(!!strikeTier(1, 1).st.restrain, true);
  assert.equal(!!strikeTier(1, 2).st.restrain, false);
  assert.equal(!!strikeTier(2, 2).st.restrain, true);
  assert.equal(!!strikeTier(2, 3).st.restrain, false);
  assert.equal(!!strikeTier(3, 2).st.restrain, true);
  assert.equal(!!strikeTier(3, 3).st.restrain, false);
  const t2Miss = strikeTier(2, 3);
  assert.equal(t2Miss.grappleLock.advVsTarget, true);
});

test("Grapple lasts until the end of the grappler's next turn; T2 grants Adv both ways", () => {
  const ab = card("brawler-grapple");
  const gloves = card("brawler-fighting-gloves");
  const hero = actor({
    id: "brawler",
    str: 2,
    x: 0,
    y: 0,
    abilityIds: ["brawler-grapple", "brawler-fighting-gloves-strike"],
    weaponOptions: ["fighting-gloves"],
    activeKit: 0,
  });
  const foe = actor({
    id: "foe",
    side: "enemy",
    str: 0,
    x: 1,
    y: 0,
    hp: 40,
    hpMax: 40,
  });
  const ally = actor({ id: "ally", x: 1, y: 1, abilityIds: ["brawler-fighting-gloves-strike"] });
  const abilityById = {
    "brawler-grapple": ab,
    "brawler-fighting-gloves-strike": gloves,
  };
  const actors = [hero, foe, ally];
  const turnState = { actors, hazards: [], clouds: [] };
  const r = resolveStrike({
    attacker: hero,
    target: foe,
    ability: ab,
    actors,
    abilityById,
    state: { abilityById, actors },
    rng: createRng(1),
    skipAp: true,
    declared: { effect: ab.tiers.t2, tier: 2, roll: { tier: 2, d1: 5, d2: 5, total: 14 } },
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.raw, 8 + 4);
  assert.equal(!!foe.st.restrain, true);
  assert.equal(foe.grappleLock.advVsTarget, true);
  assert.equal(hero.grappleHold.advVsSelf, true);

  endTurn(hero, { actors });
  assert.equal(!!foe.st.restrain, true);
  assert.equal(hero.grappleHold.releaseOnEnd, true);

  beginTurn(foe, { actors, state: turnState });
  assert.equal(!!foe.st.restrain, true);

  const vsFoe = resolveStrike({
    attacker: ally,
    target: foe,
    ability: gloves,
    actors,
    abilityById,
    state: { abilityById, actors },
    rng: createRng(2),
    skipAp: true,
    declared: { effect: gloves.tiers.t1, tier: 1, roll: { tier: 1, d1: 1, d2: 1, total: 3 } },
  });
  assert.ok((vsFoe.adv | 0) >= 1);

  const vsHero = resolveStrike({
    attacker: foe,
    target: hero,
    ability: gloves,
    actors,
    abilityById,
    state: { abilityById, actors },
    rng: createRng(3),
    skipAp: true,
    declared: { effect: gloves.tiers.t1, tier: 1, roll: { tier: 1, d1: 1, d2: 1, total: 3 } },
  });
  assert.ok((vsHero.adv | 0) >= 1);

  beginTurn(hero, { actors, state: turnState });
  assert.equal(!!foe.st.restrain, true);
  assert.ok(foe.grappleLock);

  const duringNext = resolveStrike({
    attacker: ally,
    target: foe,
    ability: gloves,
    actors,
    abilityById,
    state: { abilityById, actors },
    rng: createRng(4),
    skipAp: true,
    declared: { effect: gloves.tiers.t1, tier: 1, roll: { tier: 1, d1: 1, d2: 1, total: 3 } },
  });
  assert.ok((duringNext.adv | 0) >= 1);

  endTurn(hero, { actors });
  assert.equal(!!foe.st.restrain, false);
  assert.equal(foe.grappleLock, null);
  assert.equal(hero.grappleHold, null);
});

test("Pin Shot gates every tier on DEX; Riposte is 5×DEX", () => {
  const pin = card("scout-pin-shot");
  assert.equal(pin.costAp, 1);
  assert.equal(pin.costStress, 1);
  assert.ok(pin.tiers.t1.status.gate);
  assert.ok(pin.tiers.t2.status.gate);
  assert.ok(pin.tiers.t3.status.gate);
  const bow = card("scout-shortbow");
  const scout = actor({
    id: "scout",
    dex: 1,
    x: 0,
    y: 0,
    abilityIds: ["scout-pin-shot", "scout-shortbow-strike"],
    weaponOptions: ["shortbow"],
    activeKit: 0,
  });
  const foe = actor({ id: "foe", side: "enemy", dex: 9, x: 4, y: 0, hp: 40, hpMax: 40 });
  const abilityById = { "scout-pin-shot": pin, "scout-shortbow-strike": bow };
  const r = resolveStrike({
    attacker: scout,
    target: foe,
    ability: pin,
    actors: [scout, foe],
    abilityById,
    state: { abilityById, actors: [scout, foe] },
    rng: createRng(1),
    skipAp: true,
    declared: { effect: pin.tiers.t2, tier: 2, roll: { tier: 2, d1: 6, d2: 6, total: 14 } },
  });
  assert.equal(r.ok, true, r.reason);
  assert.equal(foe.st.slow | 0, 0);
  const soft = actor({ id: "soft", side: "enemy", dex: 1, x: 4, y: 0, hp: 40, hpMax: 40 });
  const r2 = resolveStrike({
    attacker: scout,
    target: soft,
    ability: pin,
    actors: [scout, soft],
    abilityById,
    state: { abilityById, actors: [scout, soft] },
    rng: createRng(1),
    skipAp: true,
    declared: { effect: pin.tiers.t2, tier: 2, roll: { tier: 2, d1: 6, d2: 6, total: 14 } },
  });
  assert.equal(r2.ok, true, r2.reason);
  assert.equal(soft.st.slow, 2);

  const once = actor({ dex: 1, hasRiposte: true, stress: 2 });
  const rip = tryRiposte(once, 8, { range: 1 });
  assert.equal(rip.ok, true);
  assert.equal(rip.reduce, 5);
  assert.equal(rip.raw, 3);
  assert.equal(rip.oa, false);
  assert.equal(once.stress, 1);
  assert.equal(once.riposteUsedThisRound, true);
  const again = tryRiposte(once, 8, { range: 1 });
  assert.equal(again.ok, false);
  assert.equal(again.reason, "used-this-round");
  assert.equal(once.stress, 1);
  const rip0 = tryRiposte(actor({ dex: 1, hasRiposte: true, stress: 2 }), 4, { range: 1 });
  assert.equal(rip0.raw, 0);
  assert.equal(rip0.oa, true);
  const ranged = tryRiposte(actor({ dex: 1, hasRiposte: true, stress: 2 }), 4, { range: 5, ranged: true });
  assert.equal(ranged.ok, false);
});

test("Summon Archer cards stay on the printed 7×INT shot and tiered Bone Arrow", () => {
  const shot = card("summon-archer-strike");
  const bone = card("summon-archer-bone-arrow");
  for (const key of ["t1", "t2", "t3"]) {
    assert.equal(shot.tiers[key].dmgStatMult, 7);
    assert.equal(shot.range, 5);
  }
  assert.equal(bone.tiers.t1.dmgStatMult, 6);
  assert.equal(bone.tiers.t2.dmgStatMult, 8);
  assert.equal(bone.tiers.t3.dmgStatMult, 10);
  assert.equal(bone.costStress, 1);
  assert.equal(bone.tiers.t1.status.gate.vsStat, "INT");
});

function declaredStrike(attacker, target, ability, effect, tier, extra) {
  const actors = [attacker, target].concat((extra && extra.others) || []);
  return resolveStrike(
    Object.assign(
      {
        attacker,
        target,
        ability,
        actors,
        abilityById: { [ability.id]: ability },
        state: { abilityById: { [ability.id]: ability }, actors },
        rng: createRng(1),
        skipAp: true,
        declared: {
          effect,
          tier,
          roll: { tier, d1: 8, d2: 8, total: 18 },
        },
      },
      extra || {}
    )
  );
}

test("Lightning Bolt scales with INT and upcast splashes half", () => {
  const bolt = card("mystic-lightning-bolt");
  const hero = actor({ id: "my", int: 1, abilityIds: [bolt.id] });
  assert.equal(resolveAbilityTierDamage(bolt, bolt.tiers.t1, hero), 8);
  assert.equal(resolveAbilityTierDamage(bolt, bolt.tiers.t2, hero), 12);
  assert.equal(resolveAbilityTierDamage(bolt, bolt.tiers.t3, hero), 14);
  hero.int = 2;
  assert.equal(resolveAbilityTierDamage(bolt, bolt.tiers.t1, hero), 12);
  assert.equal(resolveAbilityTierDamage(bolt, bolt.tiers.t2, hero), 18);
  assert.equal(resolveAbilityTierDamage(bolt, bolt.tiers.t3, hero), 21);
  const primary = actor({ id: "p", side: "enemy", dex: 0, x: 4, y: 0, hp: 40, hpMax: 40, def: { Lightning: 0 } });
  const splash = actor({ id: "s", side: "enemy", dex: 9, x: 5, y: 0, hp: 40, hpMax: 40, def: { Lightning: 0 } });
  const far = actor({ id: "f", side: "enemy", x: 8, y: 0, hp: 40, hpMax: 40, def: { Lightning: 0 } });
  const hit = declaredStrike(hero, primary, bolt, bolt.tiers.t1, 1, {
    others: [splash, far],
    upcast: true,
    extraTargetIds: [splash.id, far.id],
  });
  assert.equal(hit.ok, true, hit.reason);
  assert.equal(hit.raw, 12);
  assert.equal(primary.st.shock, 2);
  assert.equal(primary.hp, 28);
  assert.equal(splash.hp, 34);
  assert.equal(hit.halfSplash && hit.halfSplash.raw, 6);
  assert.equal(far.hp, 40);
  const gated = actor({ id: "g", side: "enemy", dex: 9, x: 4, y: 0, hp: 30, hpMax: 30 });
  const miss = declaredStrike(hero, gated, bolt, bolt.tiers.t1, 1);
  assert.equal(miss.ok, true);
  assert.equal(gated.st.shock | 0, 0);
});

test("Enfeeble, Purge, Entangle, Frost and Wind Gale use the scaling canon", () => {
  const enf = card("acolyte-enfeeble");
  const hero = actor({ id: "ac", int: 2, x: 0, y: 0 });
  const near = actor({ id: "n", side: "enemy", x: 1, y: 0, hp: 30, hpMax: 30, str: 0, dex: 0, int: 1 });
  const mid = actor({ id: "m", side: "enemy", x: 4, y: 0, hp: 30, hpMax: 30 });
  const r = declaredStrike(hero, near, enf, enf.tiers.t1, 1, { others: [mid] });
  assert.equal(r.ok, true, r.reason);
  assert.equal(near.st.intimidate, 4);
  assert.equal(mid.st.intimidate | 0, 0);
  const up = declaredStrike(hero, mid, enf, enf.tiers.t1, 1, { upcast: true, others: [near] });
  assert.equal(up.ok, true, up.reason);
  assert.ok((mid.st.intimidate | 0) >= 4);

  const purge = card("acolyte-purge-wicked");
  const foe = actor({ id: "pw", side: "enemy", x: 2, y: 0, hp: 80, hpMax: 80, def: { Light: 0 } });
  assert.equal(resolveAbilityTierDamage(purge, purge.tiers.t3, hero), 24);
  const pr = declaredStrike(hero, foe, purge, purge.tiers.t1, 1, { upcast: true });
  assert.equal(pr.raw, 12);
  assert.equal(foe.vulnerable && foe.vulnerable.Light, 4);

  const ent = card("primalist-entangle");
  const vine = actor({ id: "v", side: "enemy", x: 2, y: 0, hp: 40, hpMax: 40, str: 0, int: 2, def: { Earth: 0 } });
  assert.equal(resolveAbilityTierDamage(ent, ent.tiers.t1, hero), 10);
  const er = declaredStrike(hero, vine, ent, ent.tiers.t1, 1, { upcast: true });
  assert.equal(er.raw, 10);
  assert.equal(vine.st.slow, 2);
  assert.equal(vine.st.poison, 4);

  const frost = card("primalist-frost-shock");
  const cold = actor({ id: "c", side: "enemy", x: 2, y: 0, hp: 40, hpMax: 40, dex: 0, def: { Water: 0 } });
  assert.equal(resolveAbilityTierDamage(frost, frost.tiers.t2, hero), 16);
  const fr = declaredStrike(hero, cold, frost, frost.tiers.t2, 2, { upcast: true });
  assert.equal(fr.raw, 16);
  assert.equal(cold.st.slow, 2);
  assert.equal(cold.st.intimidate, 5);

  const gale = card("primalist-wind-gale");
  const pushed = actor({ id: "gp", side: "enemy", x: 2, y: 0, hp: 40, hpMax: 40, str: 0, stability: 0, def: { Air: 0 } });
  const beside = actor({ id: "gb", side: "enemy", x: 2, y: 1, hp: 40, hpMax: 40, str: 9, stability: 0, def: { Air: 0 } });
  const gr = declaredStrike(hero, pushed, gale, gale.tiers.t1, 1, {
    others: [beside],
    bounds: { minX: 0, maxX: 8, minY: 0, maxY: 6 },
  });
  assert.equal(gr.ok, true, gr.reason);
  assert.equal(gr.raw, 10);
  assert.ok((pushed.x | 0) > 2, "gated push should move STR 0");
  assert.equal(beside.x, 2, "STR above the gate stays put");
  assert.equal(beside.hp, 30);
});

test("Magic Shield is 2+INT and Bless upcast is 2×INT", () => {
  const hero = actor({ id: "my", int: 2, hasMagicShield: true, mana: 10 });
  const ally = actor({ id: "al", x: 1, y: 0, hp: 20, hpMax: 20 });
  assert.equal(magicShieldAmount(hero, false), 4);
  assert.equal(magicShieldAmount(hero, true), 6);
  const base = applyMagicShield({ actors: [hero, ally] }, hero, ally.id);
  assert.equal(base.ok, true);
  assert.equal(base.shield, 4);
  assert.equal(ally.st.shield, 4);
  hero.magicShieldUsedThisTurn = false;
  hero.mana = 10;
  const up = applyMagicShield({ actors: [hero, ally] }, hero, hero.id, {
    upcast: true,
    extraTargetId: ally.id,
  });
  assert.equal(up.ok, true, up.reason);
  assert.equal(up.shield, 6);
  assert.equal(hero.st.shield, 6);
  assert.equal(ally.st.shield, 10);
  assert.equal(blessBonus(hero, false), 2);
  assert.equal(blessBonus(hero, true), 4);
  assert.equal(healingWaterBonus(hero, true), 4);
});

test("Spotter Break is 2+INT", () => {
  const scout = actor({ id: "sc", int: 3, hasSpotter: true, ap: 3, stress: 3, abilityIds: ["scout-shortbow-strike"] });
  const foe = actor({ id: "foe", side: "enemy", x: 4, y: 0, hp: 20, hpMax: 20 });
  const state = { round: 1, actors: [scout, foe], abilityById: {} };
  const mark = applySpotterMark(state, scout, foe.id);
  assert.equal(mark.ok, true, mark.reason);
  assert.equal(mark.breakBonus, 5);
  const ally = actor({ id: "ally", x: 1, y: 1 });
  const bonus = consumeSpotterAttackBonus(ally, foe, { round: 1, isAttack: true });
  assert.equal(bonus.breakBonus, 5);
});
