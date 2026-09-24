/**
 * Full Rank-1 Dummy playthrough (every FEAT_SMOKE_STUBS talent).
 * For each talent the designer can press, checks:
 * numbers, confirm/prompt, AP/stress, bonus stress, targeting, effect.
 * Riposte and Hidden Bola go through the same reaction helpers the lab UI calls.
 *
 * Usage: node scripts/talent-playthrough.mjs
 * Writes docs/TALENT-PLAYTHROUGH.md
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { FEAT_SMOKE_STUBS, makeR1Encounter } from "../mc/r1.js";
import { preserveBrowserAppendix } from "./browser-appendix.mjs";
import {
  startDeferredEncounter,
  startPickedHeroTurn,
  applyAction,
  listLegal,
  currentActor,
  heroesEligibleForPick,
  actorById,
} from "../engine/encounter.js";
import { listActorStatusLabels } from "../engine/status.js";
import {
  isWeaponDmgToken,
  kitIndexesForAbility,
  previewTierTriplet,
} from "../engine/abilityPreview.js";
import {
  listMitigationReactions,
  commitMitigationChoice,
  riposteOfferFromResolution,
} from "../engine/reactPrompt.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLASS_ORDER = [
  "fighter",
  "brawler",
  "assassin",
  "scout",
  "mystic",
  "acolyte",
  "primalist",
];
const CHECKS = ["numbers", "confirm", "ap", "bonus", "target", "effect"];

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

function prettyKit(ref) {
  const raw = Array.isArray(ref) ? ref.join(" + ") : String(ref ?? "—");
  return raw
    .split(/\s*\+\s*/)
    .map((part) =>
      part
        .split(/[-\s]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(" + ");
}

function boot(pack, classId, feats) {
  const state = makeR1Encounter(pack, 7, {
    scenario: "train_" + classId,
    deferStart: true,
    askHeroPick: true,
    askKitPick: true,
    askReactions: true,
    featSmoke: feats,
    padBp: 0,
  });
  const started = startDeferredEncounter(state);
  if (!started.ok) throw new Error("start " + classId + ": " + started.reason);
  const hero = (state.actors || []).find(
    (a) => a && a.side === "hero" && String(a.id).endsWith("-a")
  );
  if (!hero) throw new Error("no hero-a for " + classId);
  const picked = startPickedHeroTurn(state, hero.id);
  if (!picked.ok) throw new Error("pick " + classId + ": " + picked.reason);
  if (state.awaitingKitPick) {
    const kit = applyAction(state, { type: "pickKit", kitIndex: 0 });
    if (!kit.ok) throw new Error("kit " + classId + ": " + kit.reason);
  }
  return state;
}

function foeOf(state) {
  return (state.actors || []).find((a) => a && a.side === "enemy" && !a.dead) || null;
}

function heroA(state) {
  return (
    (state.actors || []).find((a) => a && a.side === "hero" && String(a.id).endsWith("-a")) ||
    currentActor(state)
  );
}

function allyOf(state, hero) {
  return (
    (state.actors || []).find((a) => a && a.side === "hero" && hero && a.id !== hero.id && !a.dead) ||
    null
  );
}

function reachEnemy(state) {
  for (let i = 0; i < 8; i++) {
    const cur = currentActor(state);
    if (cur && cur.side === "enemy") return cur;
    if (state.awaitingHeroPick) {
      const elig = heroesEligibleForPick(state);
      if (!elig.length) break;
      const picked = startPickedHeroTurn(state, elig[0].id);
      if (!picked.ok) break;
      if (state.awaitingKitPick) applyAction(state, { type: "pickKit", kitIndex: 0 });
      continue;
    }
    if (state.awaitingKitPick) {
      applyAction(state, { type: "pickKit", kitIndex: 0 });
      continue;
    }
    const end = applyAction(state, { type: "endTurn" });
    if (!end.ok) break;
  }
  const cur = currentActor(state);
  return cur && cur.side === "enemy" ? cur : null;
}

function actionKey(a) {
  return [a.type, a.abilityId || "", a.summonKind || "", a.upcast ? "up" : "", a.label || ""].join(
    "|"
  );
}

function costsOf(action, card) {
  if (action && action.type === "strike" && card) {
    return {
      ap: action.apCost | 0,
      stress: card.costStress != null ? card.costStress | 0 : card.stressCost | 0,
      mana: card.costMana != null ? card.costMana | 0 : card.manaCost | 0,
    };
  }
  return {
    ap: action ? action.apCost | 0 : 0,
    stress: action && action.stressCost | 0,
    mana: action && action.manaCost | 0,
  };
}

function snapshotPay(actor) {
  return {
    ap: actor ? actor.ap | 0 : 0,
    stress: actor ? actor.stress | 0 : 0,
    mana: actor ? actor.mana | 0 : 0,
  };
}

function declForCommit(dry) {
  const src = dry && dry.result && dry.result.declaration;
  if (!src) return null;
  const decl = JSON.parse(JSON.stringify(src));
  if (decl.roll) decl.roll.isCrit = false;
  decl.crit = false;
  decl.critRiders = false;
  return decl;
}

function firePayload(action, extra) {
  const payload = Object.assign({ type: action.type }, extra || {});
  if (action.abilityId) payload.abilityId = action.abilityId;
  if (action.summonKind) payload.summonKind = action.summonKind;
  if (action.upcast) payload.upcast = true;
  if (action.type === "strike") {
    if (!action.selfAoe && action.targets && action.targets.length && !payload.targetId) {
      payload.targetId = action.targets[0];
    }
  } else if (action.targets && action.targets.length && !payload.targetId) {
    payload.targetId = action.targets[0];
  }
  if (action.cells && action.cells.length && !payload.dest) payload.dest = action.cells[0];
  return payload;
}

function blankRow(id, classId, label) {
  const checks = {};
  const notes = {};
  for (const k of CHECKS) {
    checks[k] = "OK";
    notes[k] = "";
  }
  return { id, classId, label, kind: "talent", checks, notes, fail: [] };
}

function setCheck(row, key, ok, note) {
  row.checks[key] = ok ? "OK" : "FAIL";
  row.notes[key] = note || "";
  if (!ok) row.fail.push(key);
}

function wdLines(hero, ability, abilityById) {
  const indexes = kitIndexesForAbility(hero, ability);
  const opts = hero.weaponOptions || [];
  return indexes.map((i) => {
    const nums = previewTierTriplet(ability, hero, i, abilityById);
    return {
      index: i,
      name: prettyKit(opts[i]),
      nums,
      text: nums.map((n) => (n == null ? "—" : String(n))).join("/"),
    };
  });
}

function statusText(actor, actors) {
  return listActorStatusLabels(actor, actors).join(", ");
}

function changedSomething(before, after) {
  return JSON.stringify(before) !== JSON.stringify(after);
}

const pack = loadPack();
const sandboxSrc = fs.readFileSync(path.join(root, "sandbox.html"), "utf8");
const ui = {
  help: sandboxSrc.includes('type: "helpAfterRoll"'),
  stress: sandboxSrc.includes('type: "stressAdvPick"') && sandboxSrc.includes("Spend "),
  stressNo: sandboxSrc.includes("No boost"),
  element: sandboxSrc.includes('type: "elementPick"'),
  multi: sandboxSrc.includes('type: "multiTarget"'),
  push: sandboxSrc.includes('type: "pushPick"'),
  riposte:
    sandboxSrc.includes("commitMitigationChoice") &&
    sandboxSrc.includes('opt.id === "riposte"') &&
    sandboxSrc.includes('type: "offerRiposte"'),
  bola:
    sandboxSrc.includes("commitMitigationChoice") &&
    sandboxSrc.includes('opt.id === "hiddenBola"'),
  eye: sandboxSrc.includes("offerEyeForAnEye"),
  outOfRange: sandboxSrc.includes("out of range") && sandboxSrc.includes("disabled: out"),
};

function confirmNoteForCard(card) {
  const bits = [];
  if (!card) return "no roll — button applies directly";
  const element = (card.traits || []).some((t) => t && t.id === "elementPick");
  const multi = card.aoe && card.aoe.maxTargets != null;
  const push = ["t1", "t2", "t3", "flat"].some((k) => {
    const eff = (card.tiers && card.tiers[k]) || (k === "flat" ? card.flat : null);
    if (!eff) return false;
    const extras = eff.extras ? (Array.isArray(eff.extras) ? eff.extras : [eff.extras]) : [];
    return extras.some((ex) => ex && (ex.id === "push" || ex.id === "pull" || ex.id === "slide"));
  });
  if (element) bits.push(ui.element ? "element type prompt" : "MISSING element prompt");
  if (multi) bits.push(ui.multi ? "extra-target prompt" : "MISSING multi-target prompt");
  if ((card.optionalStressAdv | 0) > 0) {
    bits.push(
      ui.stress && ui.stressNo
        ? "stress boost prompt (Spend / No boost)"
        : "MISSING stress boost prompt"
    );
  }
  if (push) bits.push(ui.push ? "push direction after the roll" : "MISSING push prompt");
  bits.push(ui.help ? "roll confirm (Help or accept) before resolve" : "MISSING roll confirm");
  return bits.join("; ");
}

function checkNumbers(row, hero, card) {
  if (!card) {
    setCheck(row, "numbers", true, "n/a — no damage card");
    return;
  }
  if (card.useWeapon) {
    const lines = wdLines(hero, card, pack.abilityById);
    const bad = [];
    for (const line of lines) {
      if (line.nums.some((n) => n == null || !Number.isFinite(n))) bad.push(line.name + " missing number");
      if (/\b\d*WD\b/.test(line.text)) bad.push(line.name + " still WD");
    }
    const kits = hero.weaponOptions || [];
    if (
      lines.length < 2 &&
      kits.length >= 2 &&
      !card.weaponId &&
      !(card.kitModes && card.kitModes.length === 1)
    ) {
      bad.push("did not list both kits");
    }
    if (bad.length) setCheck(row, "numbers", false, bad.join("; "));
    else {
      const shown = lines
        .map((l, i) => l.name + " " + l.text + (i === 0 ? " (active)" : ""))
        .join(" · ");
      setCheck(
        row,
        "numbers",
        true,
        shown + (card.weaponId ? " · kit-locked " + card.weaponId : "")
      );
    }
    return;
  }
  const flatBits = ["t1", "t2", "t3"].map((k) => card.tiers && card.tiers[k] && card.tiers[k].dmg);
  if (flatBits.some((d) => isWeaponDmgToken(d))) {
    setCheck(row, "numbers", false, "card prints WD but useWeapon is off");
    return;
  }
  const nums = previewTierTriplet(card, hero, hero.activeKit | 0, pack.abilityById);
  const shown = nums.filter((n) => n != null);
  if (!shown.length && !card.flat && !(card.tiers && Object.keys(card.tiers).length)) {
    setCheck(row, "numbers", true, "n/a — no printed damage");
    return;
  }
  setCheck(row, "numbers", true, shown.length ? "flat " + shown.join("/") : "no tier damage");
}

function checkBonus(row, classId, card) {
  if (!card || !(card.optionalStressAdv | 0)) {
    setCheck(row, "bonus", true, "n/a");
    return;
  }
  if (!ui.stress || !ui.stressNo) {
    setCheck(row, "bonus", false, "lab has no Spend / No boost stress prompt");
    return;
  }
  try {
    const state = boot(pack, classId, [card.id]);
    const hero = currentActor(state);
    const indexes = card.useWeapon ? kitIndexesForAbility(hero, card) : [hero.activeKit | 0];
    const kitIndex = indexes[0] | 0;
    if ((hero.activeKit | 0) !== kitIndex) {
      const swap = applyAction(state, { type: "weaponSwap", kitIndex });
      if (!swap.ok) {
        setCheck(row, "bonus", false, "could not reach kit for stress boost");
        return;
      }
    }
    const strike = (listLegal(state) || []).find((a) => a.type === "strike" && a.abilityId === card.id);
    if (!strike || strike.noTargets) {
      setCheck(row, "bonus", false, "no legal strike to attach the stress boost to");
      return;
    }
    const dry = applyAction(state, firePayload(strike, { dryRun: true }));
    const decl = declForCommit(dry);
    if (!dry.ok || !decl) {
      setCheck(row, "bonus", false, "dry-run failed: " + ((dry && dry.reason) || "no declaration"));
      return;
    }
    const base = card.costStress != null ? card.costStress | 0 : card.stressCost | 0;
    const opt = card.optionalStressAdv | 0;
    const before = hero.stress | 0;
    const boosted = applyAction(state, firePayload(strike, { declared: decl, spendStressAdv: true }));
    if (!boosted.ok) {
      setCheck(row, "bonus", false, "boosted resolve failed: " + (boosted.reason || "?"));
      return;
    }
    const spent = before - (hero.stress | 0);
    const adv = boosted.result && boosted.result.adv | 0;
    if (spent !== base + opt) {
      setCheck(
        row,
        "bonus",
        false,
        "stress " + before + "→" + (hero.stress | 0) + " want −" + (base + opt)
      );
      return;
    }
    if (adv < 1) {
      setCheck(row, "bonus", false, "spendStressAdv did not add Adv (adv " + adv + ")");
      return;
    }
    setCheck(row, "bonus", true, "prompt Spend " + opt + " / No boost; applied −" + opt + " stress, Adv " + adv);
  } catch (err) {
    setCheck(row, "bonus", false, err && err.message ? err.message : String(err));
  }
}

function effectLanded(state, hero, foe, before, result) {
  const r = result || {};
  const hpDrop = foe && before.foeHp != null && (foe.hp | 0) < before.foeHp;
  const foeStatus = foe && statusText(foe, state.actors) !== before.foeStatus;
  const heroStatus = hero && statusText(hero, state.actors) !== before.heroStatus;
  const heroMoved = hero && ((hero.x | 0) !== before.hx || (hero.y | 0) !== before.hy);
  const foeMoved = foe && ((foe.x | 0) !== before.fx || (foe.y | 0) !== before.fy);
  const moreActors = (state.actors || []).length > before.actors;
  const moreObjects = (state.objects || []).length > before.objects;
  const pendingPush = r.pendingPushes && r.pendingPushes.length;
  const dealt = r.dmgResult && ((r.dmgResult.toHp | 0) > 0 || (r.dmgResult.dealt | 0) > 0);
  const statuses = (r.statuses && r.statuses.length) || (r.aoeHits && r.aoeHits.length);
  const self =
    (r.heal | 0) > 0 ||
    r.shield != null ||
    r.bonus != null ||
    (r.cleansePts | 0) > 0 ||
    heroMoved ||
    heroStatus ||
    moreActors ||
    moreObjects;
  return !!(hpDrop || foeStatus || foeMoved || dealt || statuses || pendingPush || self || (r.raw | 0) > 0);
}

function playPress(row, classId, talentId, card, actionLabel, kitIndex) {
  const state = boot(pack, classId, talentId ? [talentId] : []);
  const hero = currentActor(state);
  const foe = foeOf(state);
  const ally = allyOf(state, hero);
  let action = null;
  if (card) {
    const indexes = card.useWeapon ? kitIndexesForAbility(hero, card) : [hero.activeKit | 0];
    const wantKit = kitIndex != null ? kitIndex | 0 : indexes[0] | 0;
    if ((hero.activeKit | 0) !== wantKit) {
      const swap = applyAction(state, { type: "weaponSwap", kitIndex: wantKit });
      if (!swap.ok) {
        setCheck(row, "target", false, "kit swap failed: " + (swap.reason || "?"));
        setCheck(row, "ap", false, "could not equip kit");
        setCheck(row, "effect", false, "could not equip kit");
        setCheck(row, "confirm", false, "could not equip kit");
        return;
      }
    }
    action = (listLegal(state) || []).find(
      (a) => a.type === "strike" && a.abilityId === card.id && !a.flurry
    );
  } else {
    action = actionLabel;
  }
  if (!action) {
    setCheck(row, "confirm", false, "no legal button");
    setCheck(row, "ap", false, "no legal button");
    setCheck(row, "target", false, "no legal button");
    setCheck(row, "effect", false, "no legal button");
    return;
  }

  const selfAoe = !!action.selfAoe;
  const needsTarget = !selfAoe && Array.isArray(action.targets);
  const needsCell = Array.isArray(action.cells);

  if (action.type === "strike") {
    const note = confirmNoteForCard(card);
    const missing = /MISSING/.test(note);
    setCheck(row, "confirm", !missing && ui.help, note);
  } else if (needsCell) {
    setCheck(row, "confirm", true, "cell prompt — " + action.cells.length + " highlighted cells, then the click resolves");
  } else if (needsTarget) {
    setCheck(row, "confirm", true, "target prompt — click a highlighted token, then the click resolves");
  } else {
    setCheck(row, "confirm", true, "no extra prompt — " + (action.label || action.type) + " resolves on click");
  }

  if (needsTarget) {
    const bits = [];
    let ok = true;
    if (!action.targets.length || action.noTargets) {
      ok = false;
      bits.push("no legal target from the train start squares");
    } else if (card && card.isAttack !== false && action.type === "strike") {
      if (!foe || action.targets.indexOf(foe.id) < 0) {
        ok = false;
        bits.push("Dummy is not a legal target");
      } else bits.push("Dummy in range");
      if (ally && action.targets.indexOf(ally.id) >= 0) {
        ok = false;
        bits.push("ally listed as a strike target");
      } else bits.push("ally is not highlighted");
      if (!sandboxSrc.includes("pending.targets.indexOf")) {
        ok = false;
        bits.push("map click does not ignore tokens outside the target list");
      }
    } else {
      bits.push((action.targets.length) + " legal target" + (action.targets.length === 1 ? "" : "s"));
      const bad = applyAction(state, firePayload(action, { targetId: "not-a-unit", dryRun: true }));
      if (bad.ok) {
        ok = false;
        bits.push("bogus target id was accepted");
      } else bits.push("bogus id blocked (" + (bad.reason || "?") + ")");
    }
    const far = boot(pack, classId, talentId ? [talentId] : []);
    const farHero = currentActor(far);
    const farFoe = foeOf(far);
    if (farHero && farFoe && card && action.type === "strike") {
      const indexes = card.useWeapon ? kitIndexesForAbility(farHero, card) : [farHero.activeKit | 0];
      if ((farHero.activeKit | 0) !== (indexes[0] | 0)) {
        applyAction(far, { type: "weaponSwap", kitIndex: indexes[0] | 0 });
      }
      farHero.x = 0;
      farHero.y = 0;
      farFoe.x = 11;
      farFoe.y = 7;
      const farStrike = (listLegal(far) || []).find(
        (a) => a.type === "strike" && a.abilityId === (card && card.id) && !a.flurry
      );
      const range = (card && card.range) | 0 || (farStrike && farStrike.range) | 0;
      const dist = 11;
      if (farStrike && dist > range) {
        if (farStrike.noTargets || (farStrike.targets || []).indexOf(farFoe.id) < 0) {
          bits.push("out of range R" + range + " blocks Dummy (button disabled in the lab)");
        } else {
          ok = false;
          bits.push("Dummy still targetable at distance " + dist + " (R" + range + ")");
        }
      }
    }
    if (!ui.outOfRange && action.type === "strike") {
      ok = false;
      bits.push("lab strike button does not disable out-of-range");
    }
    setCheck(row, "target", ok, bits.join("; "));
  } else if (needsCell) {
    setCheck(
      row,
      "target",
      action.cells.length > 0,
      action.cells.length ? action.cells.length + " legal cells" : "no legal cell"
    );
  } else if (selfAoe) {
    setCheck(row, "target", true, "self AoE — no target pick; foes in the radius are hit");
  } else {
    setCheck(row, "target", true, "n/a — no target");
  }

  const payBefore = snapshotPay(hero);
  const before = {
    foeHp: foe ? foe.hp | 0 : null,
    foeStatus: foe ? statusText(foe, state.actors) : "",
    heroStatus: statusText(hero, state.actors),
    hx: hero.x | 0,
    hy: hero.y | 0,
    fx: foe ? foe.x | 0 : null,
    fy: foe ? foe.y | 0 : null,
    actors: (state.actors || []).length,
    objects: (state.objects || []).length,
    heroDigest: JSON.stringify({
      guardUp: !!hero.guardUp,
      stealthed: !!hero.stealthed,
      feralActive: !!hero.feralActive,
      systemsBargain: !!hero.systemsBargain,
      enhanceWeaponBonus: hero.enhanceWeaponBonus | 0,
      ice: (state.objects || []).length,
      summons: (state.actors || []).length,
    }),
  };
  let declared = null;
  if (action.type === "strike") {
    const dry = applyAction(state, firePayload(action, { dryRun: true }));
    declared = declForCommit(dry);
    if (!dry.ok || !declared) {
      setCheck(row, "confirm", false, "declare failed: " + ((dry && dry.reason) || "no declaration"));
      setCheck(row, "ap", false, "declare failed");
      setCheck(row, "effect", false, "declare failed");
      return;
    }
    const payMid = snapshotPay(hero);
    if (payMid.ap !== payBefore.ap || payMid.stress !== payBefore.stress || payMid.mana !== payBefore.mana) {
      setCheck(row, "confirm", false, "dry-run declare spent resources before Accept");
    }
  }
  const fired = applyAction(
    state,
    firePayload(action, declared ? { declared, spendStressAdv: false } : null)
  );
  if (!fired.ok) {
    setCheck(row, "ap", false, "resolve failed: " + (fired.reason || "?"));
    setCheck(row, "effect", false, "resolve failed: " + (fired.reason || "?"));
    return;
  }
  const costs = costsOf(action, card);
  const payAfter = snapshotPay(hero);
  const dAp = payBefore.ap - payAfter.ap;
  const dStress = payBefore.stress - payAfter.stress;
  const dMana = payBefore.mana - payAfter.mana;
  const apOk = dAp === costs.ap;
  const stressOk = dStress === costs.stress;
  const manaOk = dMana === costs.mana;
  setCheck(
    row,
    "ap",
    apOk && stressOk && manaOk,
    "AP " +
      payBefore.ap +
      "→" +
      payAfter.ap +
      " (want −" +
      costs.ap +
      "), stress " +
      payBefore.stress +
      "→" +
      payAfter.stress +
      " (want −" +
      costs.stress +
      ")" +
      (costs.mana ? ", mana " + payBefore.mana + "→" + payAfter.mana + " (want −" + costs.mana + ")" : "")
  );
  const landed = effectLanded(state, hero, foeOf(state) || foe, before, fired.result);
  const flagNow = JSON.stringify({
    guardUp: !!hero.guardUp,
    stealthed: !!hero.stealthed,
    feralActive: !!hero.feralActive,
    systemsBargain: !!hero.systemsBargain,
    enhanceWeaponBonus: hero.enhanceWeaponBonus | 0,
    ice: (state.objects || []).length,
    summons: (state.actors || []).length,
  });
  const flagChanged = flagNow !== before.heroDigest;
  const r = fired.result || {};
  const detail = [];
  if (r.raw != null) detail.push("raw " + r.raw + (r.tier ? " T" + r.tier : ""));
  if (r.dmgResult && r.dmgResult.toHp != null) detail.push("−" + (r.dmgResult.toHp | 0) + " HP");
  if (r.statuses && r.statuses.length) detail.push("status ×" + r.statuses.length);
  const foeNow = foeOf(state) || foe;
  if (foeNow && statusText(foeNow, state.actors) !== before.foeStatus) {
    detail.push(statusText(foeNow, state.actors) || "mark");
  }
  if (r.pendingPushes && r.pendingPushes.length) detail.push("push prompt");
  if ((r.heal | 0) > 0) detail.push("heal " + r.heal);
  if ((state.actors || []).length > before.actors) detail.push("summon added");
  if ((state.objects || []).length > before.objects) detail.push("object placed");
  if (flagChanged) detail.push("self flag");
  setCheck(
    row,
    "effect",
    landed || flagChanged,
    (landed || flagChanged ? detail.join(" · ") : "resolve ok but nothing landed on Dummy or self") ||
      "landed"
  );
}

function checkReactionRiposte(row) {
  setCheck(
    row,
    "numbers",
    true,
    "n/a — mitigation is 5×DEX (Assassin DEX 1 → −5), not a WD card"
  );
  setCheck(row, "bonus", true, "n/a");
  if (!ui.riposte) {
    setCheck(row, "confirm", false, "lab reaction window has no Riposte button or OA prompt");
    setCheck(row, "ap", false, "not wired");
    setCheck(row, "target", false, "not wired");
    setCheck(row, "effect", false, "not wired");
    return;
  }
  try {
    const state = boot(pack, "assassin", ["assassin-riposte"]);
    const hero = heroA(state);
    const foe = reachEnemy(state);
    if (!foe) throw new Error("dummy never activated");
    const ab = pack.abilityById["training-dummy-basic"];
    const dry = applyAction(state, {
      type: "strike",
      abilityId: ab.id,
      targetId: hero.id,
      dryRun: true,
    });
    if (!dry.ok || !dry.result || !dry.result.declaration) {
      throw new Error("dummy declare failed: " + (dry.reason || "?"));
    }
    const decl = JSON.parse(JSON.stringify(dry.result.declaration));
    const melee = listMitigationReactions(hero, foe, ab, decl);
    const click = melee.find((o) => o.id === "riposte" && o.ok);
    const ranged = listMitigationReactions(hero, foe, { id: "ranged", range: 6 }, { raw: decl.raw });
    const blocked = ranged.find((o) => o.id === "riposte" && !o.ok);
    if (!click || !blocked) {
      setCheck(row, "target", false, "melee Riposte not offered, or ranged was not explained");
    } else {
      setCheck(
        row,
        "target",
        true,
        "melee R1 offers Riposte; ranged explained (" + blocked.reason + ")"
      );
    }
    setCheck(
      row,
      "confirm",
      !!click,
      click
        ? "reaction window: " + click.reduce + " reduce, then Accept; 0 HP opens free OA"
        : "Riposte button missing"
    );
    const stress0 = hero.stress | 0;
    const ap0 = hero.ap | 0;
    const committed = commitMitigationChoice(hero, foe, ab, decl, "riposte");
    if (!committed.ok) throw new Error("commit " + (committed.reason || "?"));
    const real = applyAction(state, {
      type: "strike",
      abilityId: ab.id,
      targetId: hero.id,
      declared: decl,
    });
    if (!real.ok) throw new Error("resolve " + (real.reason || "?"));
    const dStress = stress0 - (hero.stress | 0);
    const dAp = ap0 - (hero.ap | 0);
    setCheck(
      row,
      "ap",
      dStress === 1 && dAp === 0,
      "free action · stress " + stress0 + "→" + (hero.stress | 0) + " · AP " + ap0 + "→" + (hero.ap | 0)
    );
    const toHp = real.result && real.result.dmgResult ? real.result.dmgResult.toHp | 0 : -1;
    const wantRaw = Math.max(0, (decl.baseRaw | 0) - 5 * (hero.dex | 0));
    const rawOk = (real.result.raw | 0) === wantRaw;
    setCheck(
      row,
      "effect",
      rawOk && toHp >= 0 && toHp < (decl.baseRaw | 0),
      "Practice Blow raw " +
        (decl.baseRaw | 0) +
        " → " +
        (real.result.raw | 0) +
        " (−" +
        toHp +
        " HP after DEF). OA not expected on this 8-damage hit."
    );

    const oaState = boot(pack, "assassin", ["assassin-riposte"]);
    const oaHero = heroA(oaState);
    const oaFoe = reachEnemy(oaState);
    const swing = pack.abilityById["training-dummy-power-swing"];
    const oaDry = applyAction(oaState, {
      type: "strike",
      abilityId: swing.id,
      targetId: oaHero.id,
      dryRun: true,
    });
    const oaDecl = JSON.parse(JSON.stringify(oaDry.result.declaration));
    oaDecl.raw = 6;
    oaDecl.baseRaw = null;
    const oaCommit = commitMitigationChoice(oaHero, oaFoe, swing, oaDecl, "riposte");
    const oaReal = applyAction(oaState, {
      type: "strike",
      abilityId: swing.id,
      targetId: oaHero.id,
      declared: oaDecl,
    });
    const offer =
      (oaReal && oaReal.riposteOffer) ||
      riposteOfferFromResolution(oaDecl, oaHero, oaFoe, oaReal && oaReal.result);
    if (!oaCommit.ok || !oaReal.ok || !offer) {
      setCheck(
        row,
        "effect",
        false,
        "Power Swing T1 raw 6 should mitigate to 0 HP and offer a free OA (" +
          ((oaReal && oaReal.reason) || "no offer") +
          ")"
      );
    } else if (row.checks.effect === "OK") {
      const hp = oaReal.result.dmgResult ? oaReal.result.dmgResult.toHp | 0 : -1;
      row.notes.effect +=
        " Power Swing raw 6 → " + (oaReal.result.raw | 0) + " (−" + hp + " HP) offers free OA.";
    }
  } catch (err) {
    setCheck(row, "effect", false, err && err.message ? err.message : String(err));
    if (row.checks.ap === "OK" && !row.notes.ap) setCheck(row, "ap", false, row.notes.effect);
  }
}

function checkReactionBola(row) {
  setCheck(row, "numbers", true, "n/a — mitigation is 5×DEX (Scout DEX 1 → −5), not a WD card");
  setCheck(row, "bonus", true, "n/a");
  if (!ui.bola) {
    setCheck(row, "confirm", false, "lab reaction window has no Hidden Bola button");
    setCheck(row, "ap", false, "not wired");
    setCheck(row, "target", false, "not wired");
    setCheck(row, "effect", false, "not wired");
    return;
  }
  try {
    const state = boot(pack, "scout", ["scout-hidden-bola"]);
    const hero = heroA(state);
    const foe = reachEnemy(state);
    if (!foe) throw new Error("dummy never activated");
    const ab = pack.abilityById["training-dummy-basic"];
    const dry = applyAction(state, {
      type: "strike",
      abilityId: ab.id,
      targetId: hero.id,
      dryRun: true,
    });
    const decl = JSON.parse(JSON.stringify(dry.result.declaration));
    const near = listMitigationReactions(hero, foe, ab, decl);
    const click = near.find((o) => o.id === "hiddenBola" && o.ok);
    const far = listMitigationReactions(
      Object.assign({}, hero, { x: 0, y: 0 }),
      Object.assign({}, foe, { x: 11, y: 7 }),
      ab,
      { raw: 8 }
    );
    const blocked = far.find((o) => o.id === "hiddenBola" && !o.ok);
    const broke = hero.stress | 0;
    hero.stress = 0;
    const poor = listMitigationReactions(hero, foe, ab, { raw: 8 }).find((o) => o.id === "hiddenBola");
    hero.stress = broke;
    if (!click || !blocked || !poor || poor.ok) {
      setCheck(
        row,
        "target",
        false,
        "expected R3 offer, out-of-range explanation, and a stress block"
      );
    } else {
      setCheck(
        row,
        "target",
        true,
        "in R3 offered; far: " + blocked.reason + "; no stress: " + poor.reason
      );
    }
    setCheck(
      row,
      "confirm",
      !!click,
      click
        ? "reaction window offers Hidden Bola (" +
          (click.freeAction ? "free reaction" : "−1 AP") +
          (click.knockdown ? ", Knockdown" : "") +
          ") then Accept"
        : "Hidden Bola button missing"
    );
    const stress0 = hero.stress | 0;
    const ap0 = hero.ap | 0;
    const committed = commitMitigationChoice(hero, foe, ab, decl, "hiddenBola");
    if (!committed.ok) throw new Error("commit " + (committed.reason || "?"));
    const real = applyAction(state, {
      type: "strike",
      abilityId: ab.id,
      targetId: hero.id,
      declared: decl,
    });
    if (!real.ok) throw new Error("resolve " + (real.reason || "?"));
    const dStress = stress0 - (hero.stress | 0);
    const dAp = ap0 - (hero.ap | 0);
    const free = !!(committed.pay && committed.pay.usedFree);
    setCheck(
      row,
      "ap",
      dStress === 1 && dAp === 0 && free,
      (free ? "light-armor free reaction" : "paid AP") +
        " · stress " +
        stress0 +
        "→" +
        (hero.stress | 0) +
        " · AP " +
        ap0 +
        "→" +
        (hero.ap | 0)
    );
    const kd = /knock/i.test(statusText(foe, state.actors));
    const toHp = real.result && real.result.dmgResult ? real.result.dmgResult.toHp | 0 : -1;
    const wantRaw = Math.max(0, (decl.baseRaw | 0) - 5 * (hero.dex | 0));
    setCheck(
      row,
      "effect",
      (real.result.raw | 0) === wantRaw && kd && committed.knockdown,
      "raw " +
        (decl.baseRaw | 0) +
        " → " +
        (real.result.raw | 0) +
        " (−" +
        toHp +
        " HP). Knockdown " +
        (kd ? "on Dummy (STR " + (foe.str | 0) + " ≤ DEX " + (hero.dex | 0) + ")" : "MISSING")
    );
  } catch (err) {
    setCheck(row, "effect", false, err && err.message ? err.message : String(err));
  }
}

function checkEye(row) {
  setCheck(row, "numbers", true, "n/a — free OA, no damage card");
  setCheck(row, "bonus", true, "n/a");
  setCheck(row, "ap", true, "n/a until the OA is taken (0 AP)");
  if (!ui.eye) {
    setCheck(row, "confirm", false, "lab has no Eye for an eye prompt");
    setCheck(row, "target", false, "not wired");
    setCheck(row, "effect", false, "not wired");
    return;
  }
  try {
    const state = boot(pack, "fighter", ["fighter-eye-for-an-eye"]);
    const hero = heroA(state);
    const foe = reachEnemy(state);
    const ab = pack.abilityById["training-dummy-power-swing"];
    const dry = applyAction(state, {
      type: "strike",
      abilityId: ab.id,
      targetId: hero.id,
      dryRun: true,
    });
    const decl = JSON.parse(JSON.stringify(dry.result.declaration));
    decl.tier = 3;
    if (decl.roll) {
      decl.roll.tier = 3;
      decl.roll.isCrit = false;
    }
    const real = applyAction(state, {
      type: "strike",
      abilityId: ab.id,
      targetId: hero.id,
      declared: decl,
    });
    const offer = real && real.eyeForAnEyeOffer;
    setCheck(
      row,
      "confirm",
      !!(real.ok && offer),
      offer ? "after a T3 hit the lab asks: free OA or pass" : "T3 hit did not open the OA prompt"
    );
    setCheck(
      row,
      "target",
      !!(offer && offer.foeId === foe.id && offer.heroId === hero.id),
      offer ? "OA target is the Dummy that landed T3" : "no offer"
    );
    const lost = real.result && real.result.dmgResult ? real.result.dmgResult.toHp | 0 : 0;
    setCheck(
      row,
      "effect",
      !!(real.ok && offer && lost > 0),
      "T3 hit −" + lost + " HP, then optional free OA"
    );
  } catch (err) {
    setCheck(row, "effect", false, err && err.message ? err.message : String(err));
  }
}

function passiveRow(row, hero, base) {
  setCheck(row, "numbers", true, "n/a — passive");
  setCheck(row, "confirm", true, "n/a — nothing to confirm");
  setCheck(row, "ap", true, "n/a — no button");
  setCheck(row, "bonus", true, "n/a");
  setCheck(row, "target", true, "n/a");
  const skip = new Set([
    "id",
    "name",
    "x",
    "y",
    "ap",
    "featSmoke",
    "abilityIds",
    "kitPickedThisTurn",
  ]);
  const changed = [];
  const keys = new Set([...Object.keys(hero || {}), ...Object.keys(base || {})]);
  for (const k of keys) {
    if (skip.has(k)) continue;
    if (typeof hero[k] === "function") continue;
    if (JSON.stringify(hero[k]) !== JSON.stringify(base[k])) changed.push(k);
  }
  setCheck(
    row,
    "effect",
    changed.length > 0,
    changed.length ? "applied on grant: " + changed.sort().join(", ") : "grant changed nothing"
  );
}

const rows = [];

for (const id of Object.keys(FEAT_SMOKE_STUBS).sort()) {
  const stub = FEAT_SMOKE_STUBS[id];
  if (!stub || !CLASS_ORDER.includes(stub.classId)) continue;
  const card = pack.abilityById[id] || null;
  const row = blankRow(id, stub.classId, stub.label);
  try {
    const withT = boot(pack, stub.classId, [id]);
    const without = boot(pack, stub.classId, []);
    const hero = currentActor(withT);
    const base = currentActor(without);
    if ((hero.featSmoke || []).indexOf(id) < 0) {
      for (const k of CHECKS) setCheck(row, k, false, "apply() did not record featSmoke");
      rows.push(row);
      continue;
    }
    checkNumbers(row, hero, card);
    if (hero.hasRiposte && !card) {
      checkReactionRiposte(row);
    } else if (hero.hasHiddenBola && !card) {
      checkReactionBola(row);
    } else if (hero.eyeForAnEye && !card) {
      checkEye(row);
    } else if (card) {
      if ((hero.abilityIds || []).indexOf(id) < 0) {
        setCheck(row, "effect", false, "ability card was not granted onto abilityIds");
      }
      checkBonus(row, stub.classId, card);
      playPress(row, stub.classId, id, card, null);
      if (card.useWeapon) {
        const lines = wdLines(hero, card, pack.abilityById);
        if (lines.length >= 2) {
          const state2 = boot(pack, stub.classId, [id]);
          const h2 = currentActor(state2);
          const swap = applyAction(state2, { type: "weaponSwap", kitIndex: lines[1].index });
          const strike = (listLegal(state2) || []).find(
            (a) => a.type === "strike" && a.abilityId === id
          );
          if (!swap.ok || !strike) {
            setCheck(row, "numbers", false, (row.notes.numbers || "") + " · second kit not legal");
          } else {
            const dry = applyAction(state2, firePayload(strike, { dryRun: true }));
            const tier = dry.result && dry.result.tier | 0;
            const want = lines[1].nums[tier - 1];
            const got = dry.result && dry.result.raw | 0;
            if (dry.ok && want != null && !dry.result.crit && got !== (want | 0)) {
              setCheck(
                row,
                "numbers",
                false,
                lines[1].name + " T" + tier + " strike " + got + " != preview " + want
              );
            }
          }
        }
      }
    } else {
      const baseKeys = new Set((listLegal(without) || []).map(actionKey));
      const fresh = (listLegal(withT) || []).filter((a) => !baseKeys.has(actionKey(a)));
      const meaningful = fresh.filter((a) => a.feat || a.abilityId || a.summonKind || a.type);
      const sample = meaningful.find((a) => !a.upcast) || meaningful[0] || null;
      checkBonus(row, stub.classId, null);
      if (!sample) {
        passiveRow(row, hero, base);
        if (hero.martialArtist) {
          row.notes.effect += "; MOVE 2 safe arms after an attack, not on the opening list";
        }
        if (hero.vigilant) {
          row.notes.effect += "; MOVE 1 safe arms after this hero takes an OA";
        }
        if (id === "mystic-game-knowledge") {
          row.notes.effect += "; OOC stub (system rolls / XP)";
        }
      } else {
        playPress(row, stub.classId, id, null, sample);
        const ups = meaningful.filter((a) => a.upcast);
        if (ups.length) {
          row.notes.confirm =
            (row.notes.confirm ? row.notes.confirm + "; " : "") +
            "also listed: " +
            ups.map((a) => a.label || a.type).join(", ");
        }
      }
    }
  } catch (err) {
    for (const k of CHECKS) {
      if (!row.notes[k]) setCheck(row, k, false, err && err.message ? err.message : String(err));
    }
  }
  rows.push(row);
}

const baseRows = [];
for (const classId of CLASS_ORDER) {
  try {
    const state = boot(pack, classId, []);
    const hero = currentActor(state);
    const seen = new Set();
    const kits = hero.weaponOptions || [];
    for (let i = 0; i < kits.length; i++) {
      if ((hero.activeKit | 0) !== i) {
        const swap = applyAction(state, { type: "weaponSwap", kitIndex: i });
        if (!swap.ok) continue;
      }
      const strikes = (listLegal(state) || []).filter((a) => a.type === "strike" && !a.flurry);
      for (const strike of strikes) {
        if (seen.has(strike.abilityId)) continue;
        seen.add(strike.abilityId);
        const card = pack.abilityById[strike.abilityId];
        const row = blankRow(
          strike.abilityId || strike.label,
          classId,
          (strike.label || strike.abilityId) + " · " + prettyKit(kits[i])
        );
        row.kind = "base";
        checkNumbers(row, currentActor(state), card);
        checkBonus(row, classId, card);
        playPress(row, classId, null, card, null, i);
        if (strike.abilityId === "fighter-shield-bash") {
          if (card && card.useWeapon) setCheck(row, "numbers", false, "Shield Bash must not be useWeapon");
          const nums = previewTierTriplet(card, hero, 1, pack.abilityById);
          const flat = nums.filter((n) => n != null).join("/");
          if (flat !== "3/5/7") setCheck(row, "numbers", false, "Shield Bash preview " + flat + " want 3/5/7");
          else if (row.checks.numbers === "OK") row.notes.numbers = "flat 3/5/7 · not WD";
        }
        baseRows.push(row);
      }
    }
  } catch (err) {
    const row = blankRow("base-" + classId, classId, "base kit");
    row.kind = "base";
    for (const k of CHECKS) setCheck(row, k, false, err && err.message ? err.message : String(err));
    baseRows.push(row);
  }
}

function tally(list) {
  let ok = 0;
  let fail = 0;
  for (const row of list) {
    if (CHECKS.every((k) => row.checks[k] === "OK")) ok += 1;
    else fail += 1;
  }
  return { ok, fail, n: list.length };
}

const talentTally = tally(rows);
const baseTally = tally(baseRows);

function cell(row, key) {
  const note = row.notes[key];
  if (row.checks[key] === "OK") return note ? "OK — " + note : "OK";
  return "FAIL — " + (note || "failed");
}

let md = "";
md += "# Rank-1 Dummy talent playthrough\n\n";
md +=
  "Scope: every `FEAT_SMOKE_STUBS` talent, one at a time on `train_<class>` (two copies of that class vs the Training Dummy). Each pressable ability is resolved through the engine the lab calls. Riposte and Hidden Bola use `engine/reactPrompt.js`, which is what the reaction window buttons call.\n\n";
md +=
  "Talents: **" +
  talentTally.ok +
  " OK**, **" +
  talentTally.fail +
  " FAIL**, **" +
  talentTally.n +
  " checked**.\n\n";
md +=
  "Base kit Strikes (including Shield Bash): **" +
  baseTally.ok +
  " OK**, **" +
  baseTally.fail +
  " FAIL**, **" +
  baseTally.n +
  " checked**.\n\n";
md +=
  "Checks: numbers (resolved damage, both kits for WD), confirm/prompt, AP/stress, bonus stress, targeting, effect.\n\n";
md += "## Reaction window\n\n";
const rip = rows.find((r) => r.id === "assassin-riposte");
const bola = rows.find((r) => r.id === "scout-hidden-bola");
md +=
  "- `assassin-riposte`: " +
  (rip && CHECKS.every((k) => rip.checks[k] === "OK") ? "OK" : "FAIL") +
  ". " +
  (rip ? rip.notes.confirm : "") +
  " " +
  (rip ? rip.notes.effect : "") +
  "\n";
md +=
  "- `scout-hidden-bola`: " +
  (bola && CHECKS.every((k) => bola.checks[k] === "OK") ? "OK" : "FAIL") +
  ". " +
  (bola ? bola.notes.confirm : "") +
  " " +
  (bola ? bola.notes.effect : "") +
  "\n\n";

function tableFor(list) {
  let out = "";
  let last = "";
  for (const row of list) {
    if (row.classId !== last) {
      out += "\n### " + row.classId.charAt(0).toUpperCase() + row.classId.slice(1) + "\n\n";
      out +=
        "| Talent | Numbers | Confirm | AP / stress | Bonus stress | Target | Effect |\n";
      out += "| --- | --- | --- | --- | --- | --- | --- |\n";
      last = row.classId;
    }
    const name = "`" + row.id + "`";
    out +=
      "| " +
      name +
      " | " +
      CHECKS.map((k) => cell(row, k).replace(/\|/g, "/")).join(" | ") +
      " |\n";
  }
  return out;
}

md += "## Talents\n";
md += tableFor(rows);
md += "\n## Base kit\n";
md += tableFor(baseRows);
md += "\n## Failures\n\n";
const failed = rows.concat(baseRows).filter((r) => CHECKS.some((k) => r.checks[k] !== "OK"));
if (!failed.length) md += "None.\n";
else {
  for (const r of failed) {
    const bits = CHECKS.filter((k) => r.checks[k] !== "OK").map((k) => k + ": " + r.notes[k]);
    md += "- `" + r.id + "`: " + bits.join("; ") + "\n";
  }
}
md += "\n## How this was run\n\n";
md +=
  "- Harness: `node scripts/talent-playthrough.mjs`. Strikes dry-run first (the lab's declare / Help-or-accept step), then resolve with that declaration and `spendStressAdv: false` unless the bonus-stress check is applying the boost.\n";
md +=
  "- Out-of-range: hero parked at (0,0) and Dummy at (11,7). The lab disables that strike button (`out of range`).\n";
md +=
  "- Riposte: Dummy Practice Blow (8) clicks Riposte (−5, 1 stress, 0 AP) then Accept. A Power Swing raw 6 (T1) mitigates to 0 HP and the lab offers the free weapon OA.\n";
md +=
  "- Hidden Bola: same Practice Blow. Light Armor makes the first reaction free. Dummy STR 1 ≤ Scout DEX 1, so Knockdown lands. RANGE 3 and stress are required.\n";
md +=
  "- Passives have no button. Effect is the grant itself (the flag or stat the stub sets).\n";

const outPath = path.join(root, "docs", "TALENT-PLAYTHROUGH.md");
const previous = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
const appendix = preserveBrowserAppendix(previous);
if (appendix) {
  if (!md.endsWith("\n")) md += "\n";
  md += "\n" + appendix;
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, md);
console.log(
  "talents",
  talentTally.ok,
  "OK",
  talentTally.fail,
  "FAIL /",
  talentTally.n,
  "| base",
  baseTally.ok,
  "OK",
  baseTally.fail,
  "FAIL /",
  baseTally.n
);
if (failed.length) {
  for (const r of failed) {
    console.log(
      "FAIL",
      r.id,
      CHECKS.filter((k) => r.checks[k] !== "OK")
        .map((k) => k + "=" + r.notes[k])
        .join(" || ")
    );
  }
}
