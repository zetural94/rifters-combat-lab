import test from "node:test";
import assert from "node:assert/strict";
import {
  listMitigationReactions,
  mitigationButtonLabel,
  commitMitigationChoice,
  reconcileMitigationTarget,
  riposteOfferFromResolution,
} from "../engine/reactPrompt.js";

function hero(extra = {}) {
  return {
    id: "assassin-a",
    name: "Assassin A",
    side: "hero",
    dead: false,
    hp: 22,
    hpMax: 22,
    dex: 2,
    str: 0,
    stress: 2,
    ap: 3,
    apMax: 3,
    hasRiposte: true,
    hasHiddenBola: true,
    lightArmor: true,
    freeReactionUsed: false,
    x: 2,
    y: 2,
    ...extra,
  };
}

function foe(extra = {}) {
  return {
    id: "wolf",
    name: "Wolf",
    side: "enemy",
    dead: false,
    hp: 12,
    str: 1,
    dex: 0,
    x: 3,
    y: 2,
    ...extra,
  };
}

test("Riposte is offered on melee and blocked on ranged", () => {
  const melee = listMitigationReactions(hero(), foe(), { range: 1 }, {});
  const riposte = melee.find((row) => row.id === "riposte");
  assert.ok(riposte && riposte.ok);
  assert.equal(riposte.reduce, 10);
  assert.equal(riposte.stressCost, 1);
  assert.equal(riposte.apCost, 0);

  const ranged = listMitigationReactions(hero(), foe(), { range: 8 }, {});
  const blocked = ranged.find((row) => row.id === "riposte");
  assert.equal(blocked.ok, false);
  assert.match(blocked.reason, /melee/i);
});

test("Riposte and Hidden Bola stay closed without stress or when already spent", () => {
  const dry = listMitigationReactions(hero({ stress: 0 }), foe(), { range: 1 }, {});
  assert.equal(dry.find((row) => row.id === "riposte").ok, false);
  assert.equal(dry.find((row) => row.id === "hiddenBola").ok, false);

  const spent = listMitigationReactions(hero(), foe(), { range: 1 }, { mitigationActorId: "assassin-a" });
  assert.deepEqual(spent, []);

  const notHero = listMitigationReactions({ side: "enemy", hp: 5 }, foe(), { range: 1 }, {});
  assert.deepEqual(notHero, []);
});

test("Hidden Bola is free on Light Armor in range and blocked past range 3", () => {
  const near = listMitigationReactions(hero(), foe(), { range: 1 }, {});
  const bola = near.find((row) => row.id === "hiddenBola");
  assert.ok(bola.ok);
  assert.equal(bola.freeAction, true);
  assert.equal(bola.apCost, 0);
  assert.equal(bola.knockdown, true);

  const far = listMitigationReactions(hero(), foe({ x: 9, y: 2 }), { range: 1 }, {});
  const out = far.find((row) => row.id === "hiddenBola");
  assert.equal(out.ok, false);
  assert.match(out.reason, /RANGE 3/);
});

test("commitMitigationChoice bakes the reduced raw and will not stack", () => {
  const defender = hero();
  const attacker = foe();
  const decl = { raw: 12 };
  const result = commitMitigationChoice(defender, attacker, { range: 1 }, decl, "riposte");
  assert.equal(result.ok, true);
  assert.equal(decl.raw, 2);
  assert.equal(decl.baseRaw, 12);
  assert.equal(decl.riposteUsed, true);
  assert.equal(defender.stress, 1);
  const again = commitMitigationChoice(defender, attacker, { range: 1 }, decl, "hiddenBola");
  assert.equal(again.ok, false);
});

test("reconcileMitigationTarget restores raw when the hit moves off the reactor", () => {
  const decl = { raw: 2, baseRaw: 12, riposteUsed: true, mitigationActorId: "assassin-a" };
  reconcileMitigationTarget(decl, "someone-else");
  assert.equal(decl.raw, 12);
  assert.equal(decl.riposteUsed, false);
  reconcileMitigationTarget(
    { raw: 2, baseRaw: 12, riposteUsed: true, mitigationActorId: "assassin-a" },
    "assassin-a"
  );
});

test("Riposte offers a free weapon OA only when the mitigated hit deals 0 HP", () => {
  const defender = hero();
  const attacker = foe();
  const decl = { riposteUsed: true, mitigationActorId: defender.id };
  const offer = riposteOfferFromResolution(decl, defender, attacker, { dmgResult: { toHp: 0 } });
  assert.deepEqual(offer, { heroId: defender.id, foeId: attacker.id, kind: "riposte" });
  assert.equal(
    riposteOfferFromResolution(decl, defender, attacker, { dmgResult: { toHp: 4 } }),
    null
  );
  assert.match(mitigationButtonLabel(defender, { id: "riposte", ok: true, reduce: 10 }), /Riposte/);
});
