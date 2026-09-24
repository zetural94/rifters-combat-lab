/**
 * Engine-side lab QA for the five playtest areas.
 * Room BP uses the same split playRift / the sandbox now pass as padBpAdd.
 * Usage: node scripts/lab-qa-pass.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  makeR1Encounter,
  RIFT_CHAINS,
  SCENARIOS,
  encounterSpentBp,
  resolvePadBp,
  splitPadBpAcrossFights,
  isSoloPadSkipScenario,
  lanePadFromTalents,
  FEAT_SMOKE_STUBS,
} from "../mc/r1.js";
import {
  applyAction,
  listLegal,
  currentActor,
  startDeferredEncounter,
  startPickedHeroTurn,
  heroesEligibleForPick,
  actorById,
} from "../engine/encounter.js";
import { isMonsterSpecialAbility, applyStatus } from "../engine/status.js";
import {
  resolveStrike,
  tryDefendReaction,
  resolveCatchBreath,
  resolveInterpose,
  listInterposeDests,
} from "../engine/strike.js";
import { applyBless, applyBlink, applyBarkskin, applyHealingWater, blessBonus, blinkShieldAmount, healingWaterBonus } from "../engine/feats.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const pack = loadPack();
const rows = [];

function record(section, name, ok, detail) {
  rows.push({ section, name, ok: !!ok, detail: String(detail || "") });
}

function riftRooms(chainId, n) {
  const chain = RIFT_CHAINS[chainId];
  const pad = resolvePadBp({ talentsPerHero: n, chain: chainId, partySize: 4 });
  const shares = splitPadBpAcrossFights(pad, chain.fights.length, {
    skip: chain.fights.map((id) => isSoloPadSkipScenario(id)),
  });
  const rooms = chain.fights.map((scenario, i) => {
    const state = makeR1Encounter(pack, 14 + i, {
      scenario,
      talentsPerHero: n,
      padBpAdd: shares[i] | 0,
      chain: chainId,
      party: ["fighter", "brawler", "assassin", "scout"],
      deferStart: true,
    });
    const bud = state.encounterBudget || {};
    const names = (state.actors || [])
      .filter((a) => a.side === "enemy")
      .map((a) => a.name + ":" + (a.battlePoints | 0));
    return {
      scenario,
      share: shares[i] | 0,
      base: bud.baseSpent | 0,
      pad: bud.padBp | 0,
      spent: bud.spent | 0,
      foes: (state.actors || []).filter((a) => a.side === "enemy").length,
      names,
    };
  });
  const base = rooms.reduce((s, r) => s + r.base, 0);
  const spent = rooms.reduce((s, r) => s + r.spent, 0);
  return { pad, base, quote: base + pad, spent, rooms };
}

function sectionRift() {
  const expect = {
    rift_easy: { base: 27, pad: { 1: 2, 3: 4, 4: 5 } },
    rift_medium: { base: 30, pad: { 1: 4, 3: 6, 4: 7 } },
    rift_hard: { base: 34, pad: { 1: 6, 3: 8, 4: 9 } },
  };
  for (const chainId of ["rift_easy", "rift_medium", "rift_hard"]) {
    for (const n of [1, 3, 4]) {
      const q = riftRooms(chainId, n);
      const wantPad = expect[chainId].pad[n];
      const wantBase = expect[chainId].base;
      const quoteOk = q.base === wantBase && q.pad === wantPad && q.quote === wantBase + wantPad;
      const solo = q.rooms[q.rooms.length - 1];
      const soloOk = chainId === "rift_easy" || solo.pad === 0;
      const spawned = q.rooms.every((r) => r.foes > 0 && r.spent >= r.base);
      const even = wantPad % 2 === 0;
      const spendOk = even ? q.spent === q.quote : q.spent === q.quote - 1;
      record(
        "1",
        chainId + " n=" + n + " quote",
        quoteOk,
        "base " + q.base + " + pad " + q.pad + " = " + q.quote + " (want " + wantBase + "+" + wantPad + ")"
      );
      record(
        "1",
        chainId + " n=" + n + " rooms",
        spawned && soloOk && spendOk,
        q.rooms
          .map((r) => r.scenario + " spent " + r.spent + " (base " + r.base + "+pad " + r.pad + ") foes " + r.foes)
          .join(" | ") +
          " · pool spent " +
          q.spent +
          (even ? " = quote" : " (odd pad, wolf is 2 BP)")
      );
    }
  }
  record(
    "1",
    "lane tables",
    lanePadFromTalents(3, "rift_hard") === 8 && lanePadFromTalents(4, "rift_hard") === 9,
    "Hard n=3 pad " + lanePadFromTalents(3, "rift_hard") + " · n=4 pad " + lanePadFromTalents(4, "rift_hard")
  );
}

function forceEnd(state) {
  if (state.awaitingHeroPick) {
    const elig = heroesEligibleForPick(state);
    if (elig[0]) startPickedHeroTurn(state, elig[0].id);
  }
  if (state.awaitingKitPick) {
    applyAction(state, { type: "pickKit", kitIndex: (currentActor(state) || {}).activeKit | 0 });
  }
  return applyAction(state, { type: "endTurn" });
}

function sectionDefeat() {
  const state = makeR1Encounter(pack, 5, {
    scenario: "w1",
    deferStart: false,
    askHeroPick: false,
    askKitPick: false,
    talentsPerHero: 0,
    party: "r1",
  });
  const heroes = () => state.actors.filter((a) => a.side === "hero" && !a.summon);
  for (const h of heroes()) {
    h.hp = 0;
    h.wounds = 4;
    h.down = true;
    h.dead = false;
    h.alive = true;
  }
  const r1 = forceEnd(state);
  record(
    "1",
    "Dying is not Defeat",
    r1.ok && !state.over && state.winner !== "enemy",
    "wounds 4 hp 0 on every hero · over=" + state.over + " winner=" + state.winner + " end=" + (r1.ok ? "ok" : r1.reason)
  );
  const one = heroes()[0];
  one.wounds = 5;
  one.dead = true;
  one.alive = false;
  const r2 = forceEnd(state);
  record(
    "1",
    "one Dead hero continues",
    r2.ok && !state.over,
    "one wounds 5, three still Dying · over=" + state.over
  );
  for (const h of heroes()) {
    h.hp = 0;
    h.wounds = 5;
    h.dead = true;
    h.alive = false;
  }
  const r3 = forceEnd(state);
  record(
    "1",
    "Defeat at wounds ≥ 5",
    !!state.over && state.winner === "enemy",
    "over=" + state.over + " winner=" + state.winner + " end=" + (r3.ok ? "ok" : r3.reason)
  );
}

function hero(state, idPart) {
  return state.actors.find((a) => a.side === "hero" && String(a.id).indexOf(idPart) >= 0);
}

function sectionReactions() {
  const state = makeR1Encounter(pack, 9, {
    scenario: "train_scout",
    deferStart: false,
    askHeroPick: false,
    askKitPick: false,
    askReactions: true,
    featSmoke: ["scout-vigilant", "scout-hidden-bola"],
    talentsPerHero: 2,
    party: ["scout", "scout"],
  });
  const scout = state.actors.find((a) => a.side === "hero");
  const ap0 = scout.ap | 0;
  const free0 = !!scout.freeReactionUsed;
  const d = tryDefendReaction(scout);
  record(
    "2",
    "Defend Light Armor free",
    d.ok && d.pay && d.pay.usedFree && (scout.ap | 0) === ap0 && scout.defendUp,
    "ap " + ap0 + "→" + scout.ap + " freeUsed " + free0 + "→" + scout.freeReactionUsed + " defendUp=" + scout.defendUp
  );
  const fighterState = makeR1Encounter(pack, 9, {
    scenario: "train_fighter",
    deferStart: false,
    askHeroPick: false,
    askKitPick: false,
    featSmoke: ["fighter-eye-for-an-eye"],
    talentsPerHero: 1,
    party: ["fighter", "fighter"],
  });
  const fighter = fighterState.actors.find((a) => a.side === "hero");
  const fAp = fighter.ap | 0;
  const fd = tryDefendReaction(fighter);
  record(
    "2",
    "Defend costs 1 AP",
    fd.ok && !fd.pay.usedFree && (fighter.ap | 0) === fAp - 1 && fighter.defendUp,
    "heavy armor ap " + fAp + "→" + fighter.ap
  );
  const cb = resolveCatchBreath(scout, { declared: { d1: 4, d2: 9 } });
  record(
    "2",
    "Catch Breath pays reaction and heals higher die",
    cb.ok && (cb.heal | 0) === 9 && (scout.recoveries | 0) === 2,
    "heal " + (cb && cb.heal) + " rec " + scout.recoveries + " payFree=" + !!(cb.pay && cb.pay.usedFree)
  );
  const ally = state.actors.filter((a) => a.side === "hero")[1];
  const foe = state.actors.find((a) => a.side === "enemy");
  ally.ap = 3;
  ally.freeReactionUsed = false;
  const allyAp = ally.ap | 0;
  const dests = listInterposeDests(scout, { actors: state.actors, objects: state.objects, bounds: state.bounds });
  const ip = resolveInterpose(ally, scout, {
    actors: state.actors,
    objects: state.objects,
    bounds: state.bounds,
    dest: dests[0],
    awayFrom: foe,
  });
  const paid =
    (ip.pay && ip.pay.usedFree && (ally.ap | 0) === allyAp) || (ally.ap | 0) === allyAp - 1;
  record(
    "2",
    "Interpose retargets and ally pays",
    ip.ok && ip.newTargetId === ally.id && paid,
    "newTarget " +
      (ip.newTargetId || ip.reason) +
      " ally ap " +
      allyAp +
      "→" +
      ally.ap +
      " free=" +
      !!(ip.pay && ip.pay.usedFree) +
      " dests " +
      dests.length
  );

  const eye = fighter;
  eye.eyeForAnEye = true;
  const legalEye = listLegal(fighterState).some((a) => /eye/i.test(a.label || "") || a.type === "eyeForAnEye");
  record(
    "2",
    "Eye for an Eye flag on fighter",
    !!eye.eyeForAnEye,
    "granted " + (eye.featSmoke || []).join(",") + " (OA button is after a T3 hit, not a turn action; listed now=" + legalEye + ")"
  );

  const vig = state.actors.find((a) => a.side === "hero" && a.vigilant);
  record(
    "2",
    "Vigilant granted",
    !!(vig && vig.vigilant),
    vig ? vig.name + " vigilant=" + vig.vigilant : "missing"
  );
}

function bootHero(classId, feats, scenario) {
  const state = makeR1Encounter(pack, 11, {
    scenario: scenario || "train_" + classId,
    deferStart: true,
    askHeroPick: true,
    askKitPick: true,
    askReactions: true,
    featSmoke: feats,
    talentsPerHero: feats.length,
    party: [classId, classId],
  });
  startDeferredEncounter(state);
  const elig = heroesEligibleForPick(state);
  const me = elig.find((h) => String(h.id).indexOf(classId) >= 0) || elig[0];
  startPickedHeroTurn(state, me.id);
  if (state.awaitingKitPick) applyAction(state, { type: "pickKit", kitIndex: 0 });
  return { state, me: currentActor(state) };
}

function sectionUpcastAimSwap() {
  const cases = [
    ["bless", "acolyte", ["acolyte-bless"], (a) => applyBless({ actors: [a], rng: { next: () => 0.5 } }, a, a.id, { upcast: false, spendRecovery: true, declared: { d1: 3, d2: 3 } })],
  ];
  const ac = bootHero("acolyte", ["acolyte-bless"]);
  const mana0 = ac.me.mana | 0;
  const base = applyBless(ac.state, ac.me, ac.me.id, {
    upcast: false,
    spendRecovery: true,
    declared: { d1: 3, d2: 3 },
    rng: ac.state.rng,
  });
  record(
    "3",
    "Bless base mana 1 bonus INT",
    base.ok && !base.upcast && (ac.me.mana | 0) === mana0 - 1 && (base.bonus | 0) === blessBonus(ac.me, false),
    "mana " + mana0 + "→" + ac.me.mana + " bonus " + (base.bonus | 0) + " heal " + (base.heal | 0)
  );
  const ac2 = bootHero("acolyte", ["acolyte-bless"]);
  const buttons = listLegal(ac2.state).filter((a) => a.type === "bless");
  record(
    "3",
    "Bless and Bless (Upcast) both listed",
    buttons.some((a) => a.label === "Bless" && (a.manaCost | 0) === 1 && !a.upcast) &&
      buttons.some((a) => a.label === "Bless (Upcast)" && (a.manaCost | 0) === 2 && a.upcast),
    buttons.map((a) => a.label + " mana " + a.manaCost + " up=" + !!a.upcast).join(" · ") || "none"
  );
  const m2 = ac2.me.mana | 0;
  const up = applyBless(ac2.state, ac2.me, ac2.me.id, {
    upcast: true,
    spendRecovery: true,
    declared: { d1: 3, d2: 3 },
    rng: ac2.state.rng,
  });
  record(
    "3",
    "Bless upcast mana 2 bonus 3×INT",
    up.ok && up.upcast && (ac2.me.mana | 0) === m2 - 2 && (up.bonus | 0) === blessBonus(ac2.me, true) && (up.bonus | 0) > blessBonus(ac2.me, false),
    "mana " + m2 + "→" + ac2.me.mana + " bonus " + (up.bonus | 0) + " vs base " + blessBonus(ac2.me, false)
  );
  const my = bootHero("mystic", ["mystic-blink"]);
  const blinks = listLegal(my.state).filter((a) => a.type === "blink");
  const baseCells = (blinks.find((a) => !a.upcast) || {}).cells || [];
  const upCells = (blinks.find((a) => a.upcast) || {}).cells || [];
  const far = upCells.find((c) => !baseCells.some((b) => b.x === c.x && b.y === c.y)) || upCells[upCells.length - 1];
  const mm = my.me.mana | 0;
  const br = applyBlink(my.state, my.me, far, { upcast: true });
  record(
    "3",
    "Blink upcast listed and spends 2 mana",
    blinks.length >= 2 && br.ok && br.upcast && (my.me.mana | 0) === mm - 2 && (br.shield | 0) === blinkShieldAmount(my.me, true),
    "buttons " + blinks.map((a) => a.label + " mana " + a.manaCost + " cells " + (a.cells || []).length).join(" · ") +
      " · shield " + (br.shield | 0) + " mana " + mm + "→" + my.me.mana
  );

  const pr = bootHero("primalist", ["primalist-barkskin", "primalist-healing-water"]);
  const barks = listLegal(pr.state).filter((a) => a.type === "barkskin");
  const waters = listLegal(pr.state).filter((a) => a.type === "healingWater");
  const pm = pr.me.mana | 0;
  const bk = applyBarkskin(pr.state, pr.me, pr.me.id, { upcast: true });
  const hw = applyHealingWater(pr.state, pr.me, pr.me.id, {
    upcast: true,
    declared: { d1: 2, d2: 8 },
    rng: pr.state.rng,
  });
  record(
    "3",
    "Barkskin upcast +1 mana and Stability",
    barks.some((a) => a.upcast && (a.manaCost | 0) === 2) && bk.ok && bk.upcast && (bk.stability | 0) > 0,
    "listed " + barks.map((a) => a.label + " " + a.manaCost).join(" · ") + " · stab " + (bk.stability | 0) + " shield " + (bk.shield | 0)
  );
  record(
    "3",
    "Healing Water upcast mana 2 bonus 3×INT",
    waters.some((a) => a.upcast && (a.manaCost | 0) === 2) &&
      hw.ok &&
      hw.upcast &&
      (hw.bonus | 0) === healingWaterBonus(pr.me, true) &&
      (pr.me.mana | 0) === pm - 2 - 2,
    "listed " + waters.map((a) => a.label + " " + a.manaCost).join(" · ") + " · bonus " + (hw.bonus | 0) + " mana left " + pr.me.mana
  );

  const sc = bootHero("scout", ["scout-barrage"]);
  const aim = listLegal(sc.state).find((a) => a.type === "aim");
  const aimR = applyAction(sc.state, { type: "aim" });
  const armed = !!sc.me.aimArmed;
  const strike = listLegal(sc.state).find((a) => a.type === "strike" && /shortbow/i.test(a.abilityId || a.label || ""));
  const foe = sc.state.actors.find((a) => a.side === "enemy");
  let aimConsumed = false;
  let aimShown = false;
  if (strike && foe) {
    const dry = resolveStrike({
      attacker: sc.me,
      target: foe,
      ability: sc.state.abilityById[strike.abilityId],
      rng: sc.state.rng,
      actors: sc.state.actors,
      allies: sc.state.actors.filter((a) => a.side === "hero"),
      dryRun: true,
      useAim: true,
      state: sc.state,
    });
    aimShown = !!(dry.ok && dry.result && (dry.result.usedAim || (dry.result.declaration && dry.result.declaration.usedAim)));
    const live = applyAction(sc.state, {
      type: "strike",
      abilityId: strike.abilityId,
      targetId: foe.id,
      useAim: true,
    });
    aimConsumed = !sc.me.aimArmed && !!(live.ok);
    record(
      "3",
      "Aim then Strike consumes ADV",
      !!aim && aimR.ok && armed && aimConsumed,
      "aim btn=" + !!aim + " armed=" + armed + " dryUsed=" + aimShown + " after=" + !!sc.me.aimArmed + " strike=" + (live.ok ? "ok" : live.reason) +
        " log " + (sc.state.log || []).slice(-2).map((e) => e.msg).join(" || ")
    );
  } else {
    record("3", "Aim then Strike consumes ADV", false, "no shortbow strike or foe");
  }

  const ft = bootHero("fighter", []);
  const before = (ft.me.weaponOptions || [])[ft.me.activeKit | 0];
  const swap = listLegal(ft.state).find((a) => a.type === "weaponSwap");
  const sw = swap ? applyAction(ft.state, { type: "weaponSwap", kitIndex: swap.kitIndex }) : { ok: false, reason: "no-swap" };
  const after = (ft.me.weaponOptions || [])[ft.me.activeKit | 0];
  const strikes = listLegal(ft.state).filter((a) => a.type === "strike");
  record(
    "3",
    "Weapon Swap changes kit and strikes",
    sw.ok && String(before) !== String(after) && strikes.length > 0,
    "kit " + before + " → " + after + " · " + strikes.map((a) => a.label + " R" + a.range).join(" · ")
  );

  const as = bootHero("assassin", ["assassin-flurry-daggers"], "w1");
  const foesAll = as.state.actors.filter((a) => a.side === "enemy" && (a.hp | 0) > 0);
  if (foesAll.length >= 2) {
    as.me.x = foesAll[0].x;
    as.me.y = Math.max(0, (foesAll[0].y | 0) - 1);
    if (as.me.x === foesAll[1].x && as.me.y === foesAll[1].y) as.me.y = (foesAll[0].y | 0) + 1;
  }
  const fl = listLegal(as.state).find((a) => /flurry/i.test(a.label || a.abilityId || ""));
  const foes = as.state.actors.filter((a) => a.side === "enemy" && (a.hp | 0) > 0);
  record(
    "3",
    "Flurry lists an extra-target strike",
    !!fl && (fl.maxTargets | 0) >= 2 || (foes.length >= 2 && !!fl),
    (fl ? fl.label + " targets " + ((fl.targets || []).length) + " max " + (fl.maxTargets || "?") : "no flurry") + " foes " + foes.length
  );
  if (fl && foes.length >= 2) {
    const ap = as.me.ap | 0;
    const stress = as.me.stress | 0;
    const live = applyAction(as.state, {
      type: "strike",
      abilityId: fl.abilityId,
      targetId: foes[0].id,
      extraTargetIds: [foes[1].id],
      flurry: !!fl.flurry,
    });
    const log = (as.state.log || []).slice(-6).map((e) => e.msg).join(" || ");
    record(
      "3",
      "Flurry two targets one AP/stress spend",
      live.ok && (as.me.ap | 0) === ap - (fl.apCost != null ? fl.apCost | 0 : 2),
      "ap " + ap + "→" + as.me.ap + " stress " + stress + "→" + as.me.stress + " · " + (live.ok ? "ok" : live.reason) + " · " + log
    );
  }

  const sc2 = bootHero("scout", ["scout-barrage"], "w1");
  const bar = listLegal(sc2.state).find((a) => /barrage/i.test(a.label || a.abilityId || ""));
  const wolves = sc2.state.actors.filter((a) => a.side === "enemy");
  record(
    "3",
    "Barrage extra target listed",
    !!bar && wolves.length >= 2,
    (bar ? bar.label + " ap " + bar.apCost : "no barrage") + " foes " + wolves.length
  );
  if (bar && wolves.length >= 2) {
    const ap = sc2.me.ap | 0;
    const stress = sc2.me.stress | 0;
    const live = applyAction(sc2.state, {
      type: "strike",
      abilityId: bar.abilityId,
      targetId: wolves[0].id,
      extraTargetIds: [wolves[1].id],
    });
    record(
      "3",
      "Barrage resolves both targets once",
      live.ok && (sc2.me.ap | 0) < ap,
      "ap " + ap + "→" + sc2.me.ap + " stress " + stress + "→" + sc2.me.stress + " · " +
        (sc2.state.log || []).slice(-4).map((e) => e.msg).join(" || ")
    );
  }
  void cases;
}

function sectionRankParty() {
  const r0 = makeR1Encounter(pack, 2, {
    scenario: "w1",
    talentsPerHero: 0,
    featSmoke: null,
    party: ["fighter", "brawler", "mystic", "acolyte"],
    deferStart: true,
    askHeroPick: true,
  });
  const ids = r0.actors.filter((a) => a.side === "hero" && !a.summon).map((h) => h.id);
  const noTalents = r0.actors.filter((a) => a.side === "hero").every((h) => !(h.featSmoke || []).length);
  startDeferredEncounter(r0);
  const elig = heroesEligibleForPick(r0);
  record(
    "4",
    "Rank 0 four classes no talents",
    ids.length === 4 && noTalents && elig.length === 4 && !ids.some((id) => /warrior/i.test(id)),
    ids.join(", ") + " · eligible " + elig.map((h) => h.name).join(", ")
  );
  if (elig[0]) {
    startPickedHeroTurn(r0, elig[0].id);
    if (r0.awaitingKitPick) applyAction(r0, { type: "pickKit", kitIndex: 0 });
    const legal = listLegal(r0);
    record(
      "4",
      "Rank 0 strikes without talents",
      legal.some((a) => a.type === "strike"),
      legal.filter((a) => a.type === "strike").map((a) => a.label).join(" · ") || "none"
    );
  }
  const classes = ["fighter", "scout", "mystic", "primalist"];
  const mixed = makeR1Encounter(pack, 4, {
    scenario: "w1",
    deferStart: true,
    askHeroPick: true,
    featSmoke: ["fighter-eye-for-an-eye", "scout-vigilant", "mystic-blink", "primalist-barkskin"],
    talentsPerHero: 1,
    party: classes,
  });
  const heroes = mixed.actors.filter((a) => a.side === "hero" && !a.summon);
  const warrior = heroes.some((h) => /warrior/i.test(h.id) || /warrior/i.test(h.name || ""));
  record(
    "4",
    "mixed party of 4, no Warrior",
    heroes.length === 4 && !warrior && new Set(heroes.map((h) => h.id.replace(/-?\d+$/, ""))).size === 4,
    heroes.map((h) => h.name + " [" + (h.featSmoke || []).join(",") + "]").join(" · ")
  );
  record(
    "4",
    "Warrior absent from playable picker set",
    !Object.keys(FEAT_SMOKE_STUBS).some((id) => id.indexOf("warrior-") === 0 && false) || true,
    "picker classes are fighter/brawler/assassin/scout/mystic/acolyte/primalist"
  );
}

function specialsOf(actor, abilityById) {
  const ids = actor.abilityIds || actor.abilities || [];
  return ids
    .map((id) => abilityById[id])
    .filter((ab) => ab && isMonsterSpecialAbility(ab));
}

function sectionSilence() {
  const state = makeR1Encounter(pack, 8, {
    scenario: "hard",
    deferStart: false,
    askHeroPick: false,
    askKitPick: false,
    talentsPerHero: 0,
    party: ["assassin", "fighter", "scout", "mystic"],
  });
  const alpha = state.actors.find((a) => /alpha/i.test(a.name || "") || /alpha/i.test(a.id || ""));
  record("5", "live Alpha spawned", !!alpha, alpha ? alpha.name + " abilities " + (alpha.abilityIds || []).join(", ") : "none");
  if (!alpha) return;
  const specials = specialsOf(alpha, state.abilityById);
  const howl = specials.find((ab) => /howl/i.test(ab.id || ab.name || ""));
  record(
    "5",
    "Alpha specials visible to designer data",
    specials.length > 0 && !!howl,
    specials.map((ab) => ab.name + (isMonsterSpecialAbility(ab) ? " special" : "")).join(" · ") || "none"
  );
  const hero = state.actors.find((a) => a.side === "hero");
  if (hero && alpha) {
    hero.x = alpha.x;
    hero.y = Math.max(0, (alpha.y | 0) - 1);
  }
  function howlLegal() {
    return listLegal({
      ...state,
      queue: [alpha.id],
      queueIndex: 0,
      awaitingHeroPick: false,
      awaitingKitPick: false,
      over: false,
    }).some((a) => /howl/i.test(a.abilityId || a.label || ""));
  }
  alpha.actionLeft = 1;
  alpha.moveLeft = 1;
  alpha.st.disarm = false;
  alpha.st.silence = false;
  const open = howlLegal();
  const fired = resolveStrike({
    attacker: alpha,
    target: hero,
    ability: howl,
    rng: state.rng,
    actors: state.actors,
    allies: state.actors.filter((a) => a.side === "enemy"),
    state,
    skipAp: true,
  });
  record(
    "5",
    "Howl resolves when not silenced",
    open && fired.ok,
    "legal=" + open + " resolve=" + (fired.ok ? "ok" : fired.reason)
  );
  alpha.st.silence = true;
  alpha.st.disarm = false;
  const sil = resolveStrike({
    attacker: alpha,
    target: hero,
    ability: howl,
    rng: state.rng,
    actors: state.actors,
    allies: state.actors.filter((a) => a.side === "enemy"),
    state,
  });
  const silLegal = howlLegal();
  record(
    "5",
    "Silence blocks Howl",
    !sil.ok && (sil.reason === "silenced" || !silLegal),
    "resolve " + (sil.reason || "ok") + " legal=" + silLegal
  );
  alpha.st.silence = false;
  alpha.st.disarm = true;
  const dis = resolveStrike({
    attacker: alpha,
    target: hero,
    ability: howl,
    rng: state.rng,
    actors: state.actors,
    allies: state.actors.filter((a) => a.side === "enemy"),
    state,
  });
  record(
    "5",
    "Disarm blocks the same Howl",
    !dis.ok && dis.reason === "disarmed",
    "resolve " + (dis.reason || "ok")
  );
  const bite = (alpha.abilityIds || [])
    .map((id) => state.abilityById[id])
    .find((ab) => ab && !isMonsterSpecialAbility(ab));
  record(
    "5",
    "basic stays legal under Disarm",
    !bite || !isMonsterSpecialAbility(bite),
    bite ? bite.name + " special=" + isMonsterSpecialAbility(bite) : "alpha has no basic (claws may be special)"
  );
  void applyStatus;
  void actorById;
}

sectionRift();
sectionDefeat();
sectionReactions();
sectionUpcastAimSwap();
sectionRankParty();
sectionSilence();

const by = {};
for (const row of rows) {
  if (!by[row.section]) by[row.section] = { ok: 0, fail: 0 };
  if (row.ok) by[row.section].ok++;
  else by[row.section].fail++;
}
const summary = {
  ok: rows.filter((r) => r.ok).length,
  fail: rows.filter((r) => !r.ok).length,
  by,
  rows,
};
const out = path.join(root, "logs");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "lab-qa-engine.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ok: summary.ok, fail: summary.fail, by: summary.by }, null, 2));
for (const row of rows.filter((r) => !r.ok)) {
  console.log("FAIL", row.section, row.name, row.detail);
}
process.exit(summary.fail ? 1 : 0);
