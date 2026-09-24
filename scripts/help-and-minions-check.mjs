/**
 * Engine check for Help pay (not Advantage) and human summon turns.
 * Usage: node scripts/help-and-minions-check.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FEAT_SMOKE_STUBS, makeR1Encounter } from "../mc/r1.js";
import { trainClassFeats } from "../mc/talent-ladder.js";
import {
  startDeferredEncounter,
  startPickedHeroTurn,
  applyAction,
  listLegal,
  currentActor,
  advanceTurn,
  actorById,
} from "../engine/encounter.js";
import { resolveHelp } from "../engine/strike.js";
import { helpRerollLowerDie } from "../engine/powerRoll.js";
import { applyDamage } from "../engine/damage.js";
import { SUMMON_TEMPLATES } from "../engine/summon.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLASSES = ["fighter", "brawler", "assassin", "scout", "mystic", "acolyte", "primalist"];

function loadPack() {
  const dir = path.join(root, "cards");
  const cards = {};
  const abilityById = {};
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const card = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    cards[file.replace(/\.json$/, "")] = card;
    if (card.kind === "ability" && card.id) abilityById[card.id] = card;
  }
  return { cards, abilityById };
}

function boot(pack, classId) {
  const feats = trainClassFeats(classId);
  const state = makeR1Encounter(pack, 7, {
    scenario: "train_" + classId,
    deferStart: true,
    askHeroPick: true,
    askKitPick: true,
    askReactions: true,
    playSummons: true,
    featSmoke: feats,
    padBp: 0,
  });
  const started = startDeferredEncounter(state);
  if (!started.ok) throw new Error("start " + classId + ": " + started.reason);
  const hero = (state.actors || []).find((a) => a && a.side === "hero" && String(a.id).endsWith("-a"));
  const picked = startPickedHeroTurn(state, hero.id);
  if (!picked.ok) throw new Error("pick " + picked.reason);
  if (state.awaitingKitPick) applyAction(state, { type: "pickKit", kitIndex: 0 });
  return state;
}

function allyOf(state, hero) {
  return (state.actors || []).find((a) => a && a.side === "hero" && !a.summon && a.id !== hero.id && !a.dead);
}

const pack = loadPack();
const fails = [];
function check(cond, msg) {
  if (!cond) fails.push(msg);
  else console.log("OK", msg);
}

// Help is a reroll, not +Adv.
{
  const state = boot(pack, "fighter");
  const hero = currentActor(state);
  const ally = allyOf(state, hero);
  const foe = (state.actors || []).find((a) => a.side === "enemy");
  const strike = listLegal(state).find((a) => a.type === "strike" && a.targets && a.targets.length);
  const dry = applyAction(state, {
    type: "strike",
    abilityId: strike.abilityId,
    targetId: foe.id,
    dryRun: true,
    skipRangedOa: true,
  });
  const before = dry.result.declaration.roll;
  const ap0 = ally.ap | 0;
  const hr = resolveHelp(ally);
  check(hr.ok && hr.pay && hr.pay.apCost === 1 && !hr.pay.rangerFree, "fighter Help pays 1 AP, not Advantage");
  check((ally.ap | 0) === ap0 - 1, "fighter ally AP " + ap0 + "→" + (ally.ap | 0));
  const after = helpRerollLowerDie(before, {
    rng: state.rng,
    statValue: dry.result.declaration.rollStatValue | 0,
    adv: dry.result.declaration.adv | 0,
    disadv: dry.result.declaration.disadv | 0,
    critX: dry.result.declaration.critX | 0,
    thresholdShift: before.thresholdShift | 0,
  });
  check(after && (after.d1 !== before.d1 || after.d2 !== before.d2), "Help changed the lower d10");
  check((after.advNet | 0) === (before.advNet | 0), "Help did not add Advantage (" + before.advNet + "→" + after.advNet + ")");
}

{
  const state = boot(pack, "scout");
  const hero = currentActor(state);
  const ally = allyOf(state, hero);
  check((ally.rangerFreeHelps | 0) === 2, "scout ally has 2 Ranger free Helps");
  ally.ap = 0;
  ally.freeReactionUsed = true;
  const hr = resolveHelp(ally);
  check(hr.ok && hr.pay && hr.pay.rangerFree && hr.pay.apCost === 0, "Ranger free Help at 0 AP");
  check((ally.rangerFreeHelps | 0) === 1, "Ranger free Helps 2→1");
  check((ally.ap | 0) === 0, "Ranger free Help did not spend AP");
}

const KINDS = [
  ["acolyte", "archer", "acolyte-summon-archer"],
  ["acolyte", "mage", "acolyte-summon-mage"],
  ["acolyte", "warrior", "acolyte-summon-warrior"],
  ["primalist", "elemental", "primalist-summon-elemental"],
];

for (const [cls, kind, feat] of KINDS) {
  const state = boot(pack, cls);
  check(trainClassFeats(cls).indexOf(feat) >= 0, cls + " train package includes " + feat);
  const hero = currentActor(state);
  const summonAct = listLegal(state).find((a) => a.type === "summon" && a.summonKind === kind);
  check(!!summonAct, cls + " can press Summon " + kind);
  const placed = applyAction(state, { type: "summon", summonKind: kind });
  check(placed.ok, "place " + kind + " " + (placed.ok ? "" : placed.reason));
  const pet = (state.actors || []).find((a) => a.summon && a.summonKind === kind && !a.dead);
  const tpl = SUMMON_TEMPLATES[kind];
  const wantHp = (tpl.hpMult | 0) * Math.max(1, hero.int | 0);
  check(pet && pet.hp === wantHp && pet.hpMax === wantHp, kind + " HP " + (pet && pet.hp) + " want " + wantHp);
  check(pet.str === tpl.str && pet.dex === tpl.dex && (pet.speed | 0) === (tpl.speed | 0), kind + " stats STR/DEX/Spd");
  const apBeforeEnd = hero.ap | 0;
  const ended = applyAction(state, { type: "endTurn" });
  check(ended.ok, "end summoner turn");
  const cur = currentActor(state);
  check(cur && cur.id === pet.id, kind + " turn is the summon (" + (cur && cur.name) + ")");
  check((cur.moveLeft | 0) === 1 && (cur.actionLeft | 0) === 1, kind + " slots Mv " + (cur && cur.moveLeft) + " Act " + (cur && cur.actionLeft));
  const legal = listLegal(state);
  const strikes = legal.filter((a) => a.type === "strike");
  check(strikes.length >= 1, kind + " lists " + strikes.map((s) => s.label + (s.noTargets ? " (out of range)" : "")).join(", "));
  const hit = strikes.find((a) => a.targets && a.targets.length);
  let used = hit;
  if (!used) {
    const move = legal.find((a) => a.type === "move" && a.cells && a.cells.length);
    check(!!move, kind + " can Move toward Dummy");
    const foe = (state.actors || []).find((a) => a.side === "enemy" && !a.dead);
    let best = move.cells[0];
    let bestD = 99;
    for (const c of move.cells) {
      const d = Math.max(Math.abs(c.x - foe.x), Math.abs(c.y - foe.y));
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    const mv = applyAction(state, { type: "move", dest: best });
    check(mv.ok, kind + " moved");
    used = listLegal(state).find((a) => a.type === "strike" && a.targets && a.targets.length && !/shield/i.test(a.abilityId || ""));
  }
  check(!!used, kind + " has a Strike in range");
  const foe = (state.actors || []).find((a) => a.side === "enemy" && !a.dead);
  const hp0 = foe.hp | 0;
  const act0 = cur.actionLeft | 0;
  const stress0 = cur.stress | 0;
  const helper = (state.actors || []).find((a) => a.side === "hero" && !a.summon && !a.dead);
  const helperAp0 = helper.ap | 0;
  const dry = applyAction(state, {
    type: "strike",
    abilityId: used.abilityId,
    targetId: foe.id,
    dryRun: true,
    skipRangedOa: true,
    dmgTypeOverride: kind === "elemental" && /strike/.test(used.abilityId) ? "Fire" : null,
  });
  check(dry.ok, kind + " dry roll " + (dry.ok ? "T" + dry.result.declaration.tier : dry.reason));
  const decl = dry.result.declaration;
  const mode = decl.mode;
  if (mode === "flat") {
    check(true, kind + " " + used.abilityId + " is flat — Help N/A");
  } else {
    const hr = resolveHelp(helper);
    check(hr.ok, kind + " Help from " + helper.name + " " + (hr.ok ? JSON.stringify(hr.pay) : hr.reason));
    check(helper.summon !== true, "helper is not a summon");
    const summonHelp = resolveHelp(pet);
    check(!summonHelp.ok && summonHelp.reason === "monster", "summon cannot call Help (" + summonHelp.reason + ")");
    const rolled = helpRerollLowerDie(decl.roll, {
      rng: state.rng,
      statValue: decl.rollStatValue | 0,
      adv: decl.adv | 0,
      disadv: decl.disadv | 0,
      critX: decl.critX | 0,
      thresholdShift: (decl.roll && decl.roll.thresholdShift) | 0,
    });
    decl.roll = rolled;
    decl.tier = rolled.tier;
    check((helper.ap | 0) <= helperAp0, "helper AP did not increase");
  }
  const committed = applyAction(state, {
    type: "strike",
    abilityId: used.abilityId,
    targetId: foe.id,
    declared: decl,
    skipRangedOa: true,
    dmgTypeOverride: kind === "elemental" && /strike/.test(used.abilityId) ? "Fire" : null,
  });
  check(committed.ok, kind + " strike commit " + (committed.ok ? "" : committed.reason));
  check((cur.actionLeft | 0) === act0 - 1, kind + " spent Action " + act0 + "→" + (cur.actionLeft | 0));
  const dmg = hp0 - (foe.hp | 0);
  console.log(
    "  ",
    kind,
    used.abilityId,
    "raw",
    decl.raw,
    "T" + decl.tier,
    "dummy HP",
    hp0,
    "→",
    foe.hp,
    "Δ",
    dmg,
    "stress",
    stress0,
    "→",
    cur.stress
  );
  const endPet = applyAction(state, { type: "endTurn" });
  check(endPet.ok, kind + " end summon turn");
  check(!state.summonInterlude, kind + " interlude cleared");
  check(currentActor(state) && currentActor(state).id !== pet.id, kind + " turn passed");
  applyDamage(pet, pet.hpMax + 5, { actors: state.actors, dmgType: "Physical" });
  check(pet.dead && (pet.hp | 0) === 0, kind + " dies at 0 HP");
  check(hero.activeSummonId == null, kind + " clears activeSummonId");
  console.log("  summoner AP after their endTurn was refreshed from", apBeforeEnd);
}

// Class ability modes for the Help table (engine).
for (const cls of CLASSES) {
  const feats = trainClassFeats(cls) || [];
  const pressable = feats.filter((id) => {
    const stub = FEAT_SMOKE_STUBS[id];
    return stub && !/passive/i.test(stub.label) ? true : true;
  });
  console.log(cls, "feats", feats.length, feats.join(", "));
}

if (fails.length) {
  console.error("FAILS", fails.length);
  for (const f of fails) console.error(" -", f);
  process.exit(1);
}
console.log("all engine checks passed");
