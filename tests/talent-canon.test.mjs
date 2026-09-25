import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveStrike, resolveAbilityTierDamage } from "../engine/strike.js";
import { applyDamage } from "../engine/damage.js";
import { beginTurn, endTurn } from "../engine/turn.js";
import { powerRoll } from "../engine/powerRoll.js";
import { systemsBargainT1Damage, tryRiposte } from "../engine/feats.js";
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

test("Living Bomb burn uses DEX ≤ INT and death burst is 8+3×INT in range 3", () => {
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
  assert.equal(open.livingBomb.dmg, 8 + 3 * 1);

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
  assert.equal(shut.livingBomb.dmg, 8 + 3 * 1 + 2 * 1);

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

test("Pin Shot gates only the T1 slow; Riposte is 5×DEX", () => {
  const pin = card("scout-pin-shot");
  assert.equal(pin.costAp, 1);
  assert.equal(pin.costStress, 1);
  assert.ok(pin.tiers.t1.status.gate);
  assert.equal(pin.tiers.t2.status.gate, undefined);
  assert.equal(pin.tiers.t3.status.gate, undefined);
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
  assert.equal(foe.st.slow, 2);

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
