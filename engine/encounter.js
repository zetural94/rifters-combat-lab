import { makeHero, makeMob } from "./actor.js";
import { beginTurn, endTurn, refreshAp, spendAp as payAp, hasWeaponEquipped } from "./turn.js";
import { weaponSwap, activeKitRef, activeKitIndex, normalizeKitParts } from "./kits.js";
import { resolveStrike, tryDefendReaction, resolveCatchBreath, resolveSteelYourself, resolveCreateOpening, finishCreateOpeningPick, resolveShove, resolveAskQuestion, listRangedOaCandidates, lowestDefDmgTypeAmong, ELEMENTAL_BOLT_TYPES } from "./strike.js";
import { resolveMove } from "./move.js";
import { legalActions, packHunterBonus } from "./actions.js";
import { createRng } from "./rng.js";
import { normalizeObjects, arenaObjects } from "./terrain.js";
import { activateSystemsBargain, placeIceWall, applySpotterMark, activateGuard, applyShadowDash, applyMagicShield, applyBlink, applyBless, applyBarkskin, applyStealth, applyEnhanceWeapon, tryRiposte, tryHiddenBola, applyHealingWater, activateFeralInvocation } from "./feats.js";
import { formatStatusTag, formatGateLabel } from "./status.js";
import { isMonsterEconomy } from "./turn.js";
import { expandHordeToTokens, queueableEnemies } from "./horde.js";
import { placeSummon, findSummonOf } from "./summon.js";
import { inRange } from "./grid.js";
import { noteTalent } from "./talentTrace.js";

/**
 * Build alternating queue: H0,E0,H1,E1,...
 * Actors with bossTurns>1 are inserted that many times (extra activations / round).
 * Horde followers do not take queue slots (one stack = one activation).
 * @param {object[]} [enemies] already in desired activation order among monsters
 */
export function buildQueue(heroes, enemies) {
  const q = [];
  const enemySlots = [];
  for (const e of queueableEnemies(enemies) || []) {
    const turns = Math.max(1, Number((e && e.bossTurns) || 1) | 0);
    for (let t = 0; t < turns; t++) enemySlots.push(e);
  }
  const n = Math.max(heroes.length, enemySlots.length);
  for (let i = 0; i < n; i++) {
    if (heroes[i]) q.push(heroes[i].id);
    if (enemySlots[i]) q.push(enemySlots[i].id);
  }
  return q;
}

/** Fisher–Yates using encounter rng (falls back to Math.random). */
function shuffleInPlace(arr, rng) {
  const list = arr;
  for (let i = list.length - 1; i > 0; i--) {
    const r =
      rng && typeof rng.next === "function"
        ? rng.next()
        : rng && typeof rng === "function"
          ? rng()
          : Math.random();
    const j = Math.floor(r * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

/** Assign W1, W2, W3… tokens to non-boss wolves for grid readability. */
function assignWolfTokens(enemies) {
  let n = 0;
  for (const e of enemies || []) {
    if (!e || e.side === "hero") continue;
    if (e.monsterType === "boss" || /alpha/i.test(e.name || "")) continue;
    if (!/wolf/i.test(e.name || "") && !(e.tags || []).some((t) => /wolf/i.test(t))) {
      continue;
    }
    n += 1;
    e.token = "W" + n;
  }
}

/** Living combatants only — rebuild so dead wolves don't leave hero clumps. */
export function rebuildLivingQueue(state, opts = {}) {
  const heroes = (state.actors || []).filter(
    (a) => a && a.side === "hero" && !a.summon && !a.dead && a.alive !== false
  );
  let enemies = (state.actors || []).filter(
    (a) =>
      a &&
      a.side === "enemy" &&
      !a.dead &&
      a.alive !== false &&
      (a.hp | 0) > 0 &&
      !a.hordeFollower
  );
  if (opts.shuffle !== false) {
    shuffleInPlace(enemies, state.rng);
  } else {
    // Preserve first-seen order from current queue (mid-round compact)
    const ordered = [];
    const seen = new Set();
    for (const id of state.queue || []) {
      const a = actorById(state, id);
      if (!a || a.side !== "enemy" || a.dead || (a.hp | 0) <= 0 || a.hordeFollower) {
        continue;
      }
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      ordered.push(a);
    }
    for (const e of enemies) {
      if (!seen.has(e.id)) ordered.push(e);
    }
    enemies = ordered;
  }
  return buildQueue(heroes, enemies);
}

/** Rotate so actorId is first in the round queue (keeps relative order). */
export function rotateQueueStart(queue, actorId) {
  if (!queue || !queue.length || !actorId) return queue || [];
  const i = queue.indexOf(actorId);
  if (i <= 0) return queue.slice();
  return queue.slice(i).concat(queue.slice(0, i));
}

export function createEncounter(opts) {
  const rng = createRng(opts.seed);
  const abilityById = opts.abilityById || {};
  const bounds = opts.bounds || { minX: 0, maxX: 11, minY: 0, maxY: 7 };
  const enemiesRaw = (opts.enemies || []).map((e, i) => {
    const actor = makeMob(e.card, {
      id: e.id || (e.card.id || "mob") + "-" + (i + 1),
      name: e.name || e.card.name + " " + (i + 1),
      x: (e.pos && e.pos.x) || 8,
      y: (e.pos && e.pos.y) || 2 + i,
    });
    actor.abilityIds = e.abilityIds || e.card.abilities || [];
    actor.reactionIds = e.reactionIds || e.card.reactions || [];
    actor.tags = e.card.tags || actor.tags || [];
    return actor;
  });
  const occ = new Set();
  // Reserve hero cells so horde clusters don't spawn on them
  for (const h of opts.heroes || []) {
    const x = (h.pos && h.pos.x) || 1;
    const y = (h.pos && h.pos.y) || 2;
    occ.add((x | 0) + "," + (y | 0));
  }
  const enemies = [];
  const hordeGroupByBase = {};
  for (const e of enemiesRaw) {
    let groupIndex = 1;
    if (e.horde || (e.unitsMax | 0) > 1) {
      const base = String(e.id || "horde").replace(/-\d+$/, "");
      hordeGroupByBase[base] = (hordeGroupByBase[base] | 0) + 1;
      groupIndex = hordeGroupByBase[base];
      e.hordeGroup = groupIndex;
    }
    const tokens = expandHordeToTokens(e, occ, bounds, { groupIndex });
    for (const t of tokens) enemies.push(t);
  }
  const heroes = (opts.heroes || []).map((h, i) => {
    const actor = makeHero(h.card, {
      id: h.id || h.card.id || "hero-" + i,
      name: h.name || undefined,
      x: (h.pos && h.pos.x) || 1,
      y: (h.pos && h.pos.y) || 2 + i,
    });
    actor.abilityIds = h.abilityIds || h.card.abilities || [];
    // Crit X lives on kit ability traits (dual-daggers / stiletto); do not mirror
    // from passive prose — that double-counted with trait crit.
    if (h.passiveCritX) actor.passiveCritX = h.passiveCritX;
    if (h.card.fullContact || h.fullContact) actor.fullContact = true;
    if (h.card.frontliner || h.frontliner) actor.frontliner = true;
    if (h.card.perfectionist || h.perfectionist) actor.perfectionist = true;
    if (h.card.weaponmaster || h.weaponmaster) actor.weaponmaster = true;
    if (h.card.coldBlooded || h.coldBlooded) actor.coldBlooded = true;
    if (h.card.vigilant || h.vigilant) actor.vigilant = true;
    if (h.card.martialArtist || h.martialArtist) {
      actor.martialArtist = true;
      actor.rushIgnoreLeft = h.card.rushIgnoreLeft != null ? h.card.rushIgnoreLeft | 0 : 1;
    }
    if (/light/i.test(actor.armorId || "") || /Light Armor/i.test(h.card.passive || "")) {
      actor.lightArmor = true;
    }
    if (h.activeKit != null) actor.activeKit = h.activeKit | 0;
    refreshAp(actor); // seed AP before first turn; later resets happen on endTurn
    actor.moveBudget = Math.max(0, actor.speed | 0);
    actor.moveUnlocked = false;
    return actor;
  });
  const actors = heroes.concat(enemies);
  assignWolfTokens(enemies);
  shuffleInPlace(enemies, rng);
  let queue = buildQueue(heroes, enemies);
  if (opts.startActorId) {
    queue = rotateQueueStart(queue, opts.startActorId);
  }
  let objects = [];
  if (opts.objects) objects = normalizeObjects(opts.objects);
  else if (opts.arena) objects = arenaObjects(opts.arena);

  const state = {
    rng,
    abilityById,
    actors,
    queue,
    queueIndex: 0,
    round: 1,
    turnInRound: 0,
    log: [],
    over: false,
    winner: null,
    bounds,
    objects,
    hazards: [],
    arenaId: opts.arena || null,
    startActorId: opts.startActorId || (queue[0] || null),
    defendPolicy: opts.defendPolicy || "smart",
    heroTier3Seen: false,
    askHeroPick: !!opts.askHeroPick,
    askKitPick: !!opts.askKitPick,
    awaitingHeroPick: false,
    awaitingKitPick: false,
  };
  const first = actorById(state, queue[0]);
  if (!opts.deferStart) {
    const terrainNote =
      objects.length ? " · terrain ×" + objects.length : "";
    pushLog(state, "FIGHT START" + terrainNote);
    pushRoundStart(state);
    if (first) beginActorTurn(state, first);
    pushTurnStart(state, (first ? first.name : "?") + "'s turn");
  } else {
    state.deferredStart = true;
    pushLog(
      state,
      "Setup — ustaw pozycje / kolumny, potem Start" +
        (objects.length ? " · terrain ×" + objects.length : "")
    );
  }
  return state;
}

/** Begin the first turn after createEncounter({ deferStart: true }). */
export function startDeferredEncounter(state) {
  if (!state || state.over) return { ok: false, reason: "bad-state" };
  if (!state.deferredStart) return { ok: false, reason: "already-started" };
  state.deferredStart = false;
  const first = currentActor(state);
  const terrainNote =
    (state.objects || []).length ? " · terrain ×" + state.objects.length : "";
  pushLog(state, "FIGHT START" + terrainNote);
  pushRoundStart(state);
  if (first && first.side === "hero" && state.askHeroPick) {
    // Same as later rounds: player picks who opens (ignore fixed "zaczyna" auto-lock).
    beginHeroSlot(state, first);
    return { ok: true };
  }
  if (first) beginActorTurn(state, first);
  pushTurnStart(state, (first ? first.name : "?") + "'s turn");
  if (first) maybeAskKitPick(state, first);
  return { ok: true };
}

export function actorById(state, id) {
  return (state.actors || []).find((a) => a.id === id) || null;
}

export function currentActor(state) {
  return actorById(state, state.queue[state.queueIndex]);
}

function pushLog(state, msg) {
  if (!state.log) state.log = [];
  state.log.push({ t: Date.now(), msg });
  const cap = state.logCap != null ? state.logCap | 0 : 2000;
  while (state.log.length > Math.max(50, cap)) state.log.shift();
}

function runSummonAfter(state, summoner) {
  const pet = findSummonOf(state, summoner.id);
  if (!pet || pet.dead || (pet.hp | 0) <= 0) return;
  const savedQ = state.queue;
  const savedI = state.queueIndex;
  state.queue = [pet.id];
  state.queueIndex = 0;
  beginActorTurn(state, pet);
  pushLog(state, pet.name + " (summon) acts after " + summoner.name);
  for (let step = 0; step < 10; step++) {
    if (state.over || pet.dead || (pet.hp | 0) <= 0) break;
    const legal = legalActions(state, pet, state.abilityById || {});
    const foes = (state.actors || []).filter(
      (a) => a.side === "enemy" && !a.dead && (a.hp | 0) > 0
    );
    const rankFoe = (f) => {
      if (f.grappleLock && f.grappleLock.advVsTarget) return 0;
      if (f.st && f.st.restrain) return 0;
      if (f.st && f.st.fearSource) return 1;
      return 2;
    };
    foes.sort((a, b) => {
      const ra = rankFoe(a);
      const rb = rankFoe(b);
      if (ra !== rb) return ra - rb;
      const da = Math.max(Math.abs((a.x | 0) - (pet.x | 0)), Math.abs((a.y | 0) - (pet.y | 0)));
      const db = Math.max(Math.abs((b.x | 0) - (pet.x | 0)), Math.abs((b.y | 0) - (pet.y | 0)));
      return da - db || (a.hp | 0) - (b.hp | 0);
    });
    let near = foes[0] || null;
    let nearD = near
      ? Math.max(Math.abs((near.x | 0) - (pet.x | 0)), Math.abs((near.y | 0) - (pet.y | 0)))
      : 99;
    const isSpecial = (id) =>
      /living-shield|fireball|bone-arrow|elemental-shield/i.test(id || "");
    const isBolt = (id) =>
      /summon-(?:warrior|mage|archer|elemental)-strike/i.test(id || "");
    const offensiveSpecial = legal.find(
      (a) =>
        a.type === "strike" &&
        a.targets &&
        a.targets.length &&
        /living-shield|fireball|bone-arrow/i.test(a.abilityId || "")
    );
    const shieldSpecial = legal.find(
      (a) =>
        a.type === "strike" &&
        /elemental-shield/i.test(a.abilityId || "")
    );
    const strike = legal.find(
      (a) =>
        a.type === "strike" &&
        a.targets &&
        a.targets.length &&
        !isSpecial(a.abilityId)
    );
    const move = legal.find((a) => a.type === "move" && a.cells && a.cells.length);
    let action = null;
    const pickTid = (act) =>
      (near && act.targets && act.targets.indexOf(near.id) >= 0 && near.id) ||
      (act.targets && act.targets[0]);
    // Elemental: prefer Bolt for damage; Shield only as ally support (not enemy-spam).
    if (pet.summonKind === "elemental") {
      if (strike && nearD <= 5) {
        const tid = pickTid(strike);
        const foe = (state.actors || []).find((a) => a && a.id === tid) || near;
        const dmgTypeOverride = foe
          ? lowestDefDmgTypeAmong(foe, ELEMENTAL_BOLT_TYPES, "Fire")
          : null;
        action = {
          type: "strike",
          abilityId: strike.abilityId,
          targetId: tid,
        };
        if (dmgTypeOverride) action.dmgTypeOverride = dmgTypeOverride;
      } else if (shieldSpecial && (pet.stress | 0) >= 1) {
        const allies = (state.actors || []).filter(
          (a) =>
            a &&
            a.side === "hero" &&
            !a.dead &&
            (a.hp | 0) > 0 &&
            a.id !== pet.id
        );
        let ally = allies.sort(
          (a, b) => (a.hp / Math.max(1, a.hpMax)) - (b.hp / Math.max(1, b.hpMax))
        )[0] || pet;
        // Nominal target: nearest foe if listed, else self via supportAllyId buff path
        const tid = pickTid(shieldSpecial) || (near && near.id) || pet.id;
        action = {
          type: "strike",
          abilityId: shieldSpecial.abilityId,
          targetId: tid,
          supportAllyId: ally.id,
        };
      }
    } else if (offensiveSpecial && (pet.stress | 0) >= 1 && nearD <= 5) {
      // Mage/Archer/Warrior: spend stress on kit specials
      action = {
        type: "strike",
        abilityId: offensiveSpecial.abilityId,
        targetId: pickTid(offensiveSpecial),
      };
    } else if (strike) {
      action = { type: "strike", abilityId: strike.abilityId, targetId: pickTid(strike) };
    } else if (move && near) {
      let best = null;
      let bestD = nearD;
      for (const c of move.cells) {
        const d = Math.max(
          Math.abs((c.x | 0) - (near.x | 0)),
          Math.abs((c.y | 0) - (near.y | 0))
        );
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best) action = { type: "move", dest: best };
    }
    if (!action) break;
    const r = applyAction(state, action);
    if (!r || !r.ok) break;
  }
  endTurn(pet);
  state.queue = savedQ;
  state.queueIndex = savedI;
}

function beginActorTurn(state, actor) {
  if (!actor) return actor;
  const w0 = actor.wounds | 0;
  beginTurn(actor, { actors: state.actors, state });
  if ((actor.wounds | 0) > w0) {
    pushLog(
      state,
      actor.name +
        " Wound " +
        (actor.wounds | 0) +
        " (DoT na starcie tury)" +
        ((actor.wounds | 0) >= 5 ? " — Dead" : " — Dying")
    );
  }
  if (actor.stunnedSkipTurn) {
    pushLog(state, actor.name + " Stun — skips turn");
  }
  if (actor.frontlinerApGranted) {
    pushLog(state, actor.name + " Frontliner +1 AP");
    actor.frontlinerApGranted = false;
  }
  return actor;
}

function logWoundIfAny(state, target, dmgResult) {
  if (!target || !dmgResult || !dmgResult.wound) return;
  pushLog(
    state,
    target.name +
      " Wound " +
      (target.wounds | 0) +
      ((target.wounds | 0) >= 5 ? " — Dead" : " — Dying")
  );
}

/** Clear round banner for humans + agents reading JSONL. */
function pushRoundStart(state) {
  state.turnInRound = 0;
  state.howlUsedInRound = {};
  for (const a of state.actors || []) {
    if (a) a.timesTargetedThisRound = 0;
  }
  pushLog(state, "ROUND " + state.round + " START");
}

/** Turn N within the current round (pick → same N when hero resolves). */
function pushTurnStart(state, label, opts) {
  const reuse = opts && opts.reuse;
  if (!reuse) state.turnInRound = (state.turnInRound | 0) + 1;
  const n = Math.max(1, state.turnInRound | 0);
  pushLog(state, "Turn " + n + " — " + label);
}

/** Human-readable Power Roll: dice + STAT + ADV/DISADV = total [T#]. */
function formatPowerRollLine(r) {
  if (!r || !r.roll) return "";
  const roll = r.roll;
  const bits = [roll.d1 + "+" + roll.d2];
  const stat = r.rollStat || "STAT";
  const sv = r.rollStatValue | 0;
  bits.push(stat + (sv >= 0 ? "+" : "") + sv);
  if (r.modNotes && r.modNotes.length) {
    for (const m of r.modNotes) {
      if (!m || !(m.n | 0)) continue;
      const sign = m.sign === "−" || m.sign === "-" ? "−" : "+";
      bits.push(sign + (m.n | 0) + (m.src ? " " + m.src : ""));
    }
  } else {
    if ((r.adv | 0) > 0) bits.push("ADV" + (r.adv | 0));
    if ((r.disadv | 0) > 0) bits.push("DISADV" + (r.disadv | 0));
  }
  let s =
    " roll " +
    bits.join(" ") +
    " = " +
    roll.total +
    " [T" +
    r.tier +
    (r.crit ? (r.critBlockedBySteel ? " CRIT/steel" : " CRIT") : "") +
    "]";
  if (r.usedAim) s += " · Aim";
  if (r.critApGain) s += " · +" + r.critApGain + " AP (crit)";
  return s;
}

function checkOver(state) {
  // Heroes: Defeat only when every hero is Dead (wounds ≥ 5 / dead flag).
  // Dying (hp ≤ 0, wounds < 5) still counts — Adrian 2026-09-24 correction.
  // Enemies: 0 HP → dead; require !dead && hp>0.
  const heroesAlive = state.actors.some(
    (a) =>
      a.side === "hero" &&
      !a.summon &&
      !a.dead &&
      a.alive !== false &&
      (a.wounds | 0) < 5
  );
  const foesAlive = state.actors.some(
    (a) => a.side === "enemy" && !a.dead && a.alive !== false && (a.hp | 0) > 0
  );
  if (!heroesAlive) {
    state.over = true;
    state.winner = "enemy";
    pushLog(state, "FIGHT END — Defeat");
  } else if (!foesAlive) {
    state.over = true;
    state.winner = "hero";
    pushLog(state, "FIGHT END — Victory");
  }
}

/** Living heroes who have not yet activated this round. */
export function heroesEligibleForPick(state) {
  return (state.actors || []).filter((a) => {
    if (!a || a.side !== "hero" || a.summon) return false;
    if (a.dead) return false;
    if ((a.hp | 0) <= 0 && (a.wounds | 0) >= 5) return false;
    if (a.actedThisRound) return false;
    return true;
  });
}

/**
 * Commit a hero into the current queue slot and begin their turn.
 * Used when state.askHeroPick pauses before beginTurn.
 */
export function startPickedHeroTurn(state, heroId) {
  if (state.over) return { ok: false, reason: "over" };
  if (!state.awaitingHeroPick) return { ok: false, reason: "not-awaiting" };
  const hero = actorById(state, heroId);
  if (!hero || hero.side !== "hero") return { ok: false, reason: "bad-hero" };
  if (hero.dead || ((hero.hp | 0) <= 0 && (hero.wounds | 0) >= 5)) {
    return { ok: false, reason: "hero-down" };
  }
  if (hero.actedThisRound) return { ok: false, reason: "already-acted" };

  const slotId = state.queue[state.queueIndex];
  if (slotId !== heroId) {
    const otherIdx = state.queue.indexOf(heroId);
    state.queue[state.queueIndex] = heroId;
    if (otherIdx >= 0) state.queue[otherIdx] = slotId;
  }
  state.awaitingHeroPick = false;
  beginActorTurn(state, hero);
  if (hero.dead || ((hero.hp | 0) <= 0 && (hero.wounds | 0) >= 5)) {
    pushLog(
      state,
      hero.name + " umiera na starcie tury (Wounds " + (hero.wounds | 0) + ") — pomijam"
    );
    pushTurnStart(state, hero.name + "'s turn", { reuse: true });
    advanceTurn(state);
    return { ok: true, skippedDead: true };
  }
  pushTurnStart(state, hero.name + "'s turn", { reuse: true });
  maybeAskKitPick(state, hero);
  return { ok: true };
}

/** Pause for weapon/kit choice at turn start (sandbox). */
function maybeAskKitPick(state, actor) {
  if (!state || !actor || actor.side !== "hero") return;
  if (!state.askKitPick) {
    actor.kitPickedThisTurn = true;
    return;
  }
  const opts = actor.weaponOptions || actor.kits || [];
  if (opts.length < 2) {
    actor.kitPickedThisTurn = true;
    state.awaitingKitPick = false;
    return;
  }
  state.awaitingKitPick = true;
  pushLog(state, actor.name + " — wybierz broń (kit) na tę turę");
}

function beginHeroSlot(state, next) {
  if (state.askHeroPick) {
    const elig = heroesEligibleForPick(state);
    if (!elig.length) return false;
    if (elig.length === 1) {
      const only = elig[0];
      const slotId = state.queue[state.queueIndex];
      if (slotId !== only.id) {
        const otherIdx = state.queue.indexOf(only.id);
        state.queue[state.queueIndex] = only.id;
        if (otherIdx >= 0) state.queue[otherIdx] = slotId;
      }
      beginActorTurn(state, only);
      pushTurnStart(state, only.name + "'s turn");
      maybeAskKitPick(state, only);
      return true;
    }
    state.awaitingHeroPick = true;
    pushTurnStart(state, "wybierz bohatera");
    return true;
  }
  if (next.dead || ((next.hp | 0) <= 0 && (next.wounds | 0) >= 5)) return false;
  beginActorTurn(state, next);
  pushTurnStart(state, next.name + "'s turn");
  maybeAskKitPick(state, next);
  return true;
}

/**
 * After the actor who just finished (and after their summon, if any),
 * step the queue to the next living actor.
 * `cur` is that finished actor — used to rebuild around a dead enemy.
 */
function continueAfterFinishedTurn(state, cur) {
  checkOver(state);
  if (state.over) return;

  for (let step = 0; step < 64; step++) {
    const len = Math.max(state.queue.length, 1);
    state.queueIndex = (state.queueIndex + 1) % len;
    if (state.queueIndex === 0) {
      // askHeroPick: do not roll a new round while heroes still have not acted.
      if (state.askHeroPick) {
        const left = heroesEligibleForPick(state);
        if (left.length) {
          state.queue = left.map((h) => h.id);
          state.queueIndex = 0;
          const nextH = currentActor(state);
          if (nextH && beginHeroSlot(state, nextH)) return;
          continue;
        }
      }
      state.round += 1;
      for (const a of state.actors) {
        a.aimUsedThisRound = false;
        a.flurryUsedThisRound = false;
        a.stealthUsedThisRound = false;
        a.glaiveFreeOaUsed = false;
        a.roundUsed = {};
        a.actedThisRound = false;
        if (a.aiMemory) {
          a.aiMemory.howledThisRound = false;
          a.aiMemory.howledLastActivation = false;
          a.aiMemory.skipHowlAfterWeak = false;
        }
      }
      state.howlUsedInRound = {};
      // Drop dead enemies so Boss still alternates H / E / H / E
      state.queue = rebuildLivingQueue(state);
      if (!state.queue.length) {
        checkOver(state);
        return;
      }
      state.queueIndex = 0;
      pushRoundStart(state);
    }
    const next = currentActor(state);
    if (!next) continue;
    if (next.side === "enemy") {
      if (next.dead || (next.hp | 0) <= 0) {
        // Dead enemies leave holes → consecutive hero turns. Rebuild living queue mid-round.
        const prevId = cur && cur.id;
        state.queue = rebuildLivingQueue(state, { shuffle: false });
        if (!state.queue.length) {
          checkOver(state);
          return;
        }
        const idx = prevId ? state.queue.indexOf(prevId) : -1;
        state.queueIndex = idx >= 0 ? idx : Math.min(state.queueIndex, state.queue.length - 1);
        continue;
      }
      beginActorTurn(state, next);
      pushTurnStart(state, next.name + "'s turn");
      return;
    }
    if (next.side === "hero") {
      // Skip heroes who already acted this round (stale queue slots after rebuild).
      if (next.actedThisRound) continue;
      if (beginHeroSlot(state, next)) return;
      continue;
    }
  }
  checkOver(state);
  if (!state.over) {
    state.over = true;
    state.winner = "timeout";
    pushLog(state, "No actors left to act");
  }
}

export function advanceTurn(state) {
  if (state.over) return;
  if (state.awaitingHeroPick || state.awaitingKitPick) return;
  const cur = currentActor(state);

  // Human lab: the summon's Move + Action is a real turn, not an AI script.
  // MC leaves playSummons unset and still auto-resolves via runSummonAfter.
  if (cur && cur.summon && state.summonInterlude) {
    endTurn(cur);
    const saved = state.summonInterlude;
    state.summonInterlude = null;
    state.queue = saved.queue;
    state.queueIndex = saved.queueIndex;
    pushLog(state, cur.name + " (summon) ends");
    continueAfterFinishedTurn(state, actorById(state, saved.summonerId) || cur);
    return;
  }

  if (cur) endTurn(cur);

  // Summon acts after its summoner's turn (not a main queue slot).
  if (cur && cur.side === "hero" && !cur.summon) {
    const pet = findSummonOf(state, cur.id);
    if (pet && state.playSummons) {
      state.summonInterlude = {
        summonerId: cur.id,
        queue: (state.queue || []).slice(),
        queueIndex: state.queueIndex | 0,
      };
      state.queue = [pet.id];
      state.queueIndex = 0;
      beginActorTurn(state, pet);
      pushLog(state, pet.name + " (summon) acts after " + cur.name);
      pushTurnStart(state, pet.name + "'s turn");
      return;
    }
    runSummonAfter(state, cur);
  }

  continueAfterFinishedTurn(state, cur);
}

/** OA ability: monster reaction line, else active-kit Strike (heroes). */
export function getReactionAbility(state, actor) {
  const ids = actor.reactionIds || [];
  for (const id of ids) {
    if (state.abilityById[id]) return state.abilityById[id];
  }
  const abs = (actor.abilityIds || [])
    .map((id) => state.abilityById[id])
    .filter(Boolean);
  const parts = normalizeKitParts(activeKitRef(actor));
  // Prefer active-kit weapon Strike (not a talent without weaponId).
  const weaponMatch = abs.find((ab) => {
    if (!ab || !ab.weaponId) return false;
    if (!parts.length) return true;
    return parts.indexOf(ab.weaponId) >= 0 || parts.indexOf(String(ab.weaponId)) >= 0;
  });
  if (weaponMatch) return weaponMatch;
  const any = abs.find((ab) => ab && !ab.weaponId);
  return weaponMatch || any || abs[0] || null;
}

function maybeDefendHook(state, target, info = {}) {
  if (state.askReactions) return null;
  if (!target || target.side !== "hero" || target.defendUp) return null;
  const policy = state.defendPolicy || "smart";
  if (policy === "always" || policy === "defend1") {
    const r = tryDefendReaction(target);
    if (r.ok) pushLog(state, target.name + " Defends (reaction)");
    return r;
  }
  if (policy !== "smart" && policy !== "table") return null;

  const hpRatio = (target.hp | 0) / Math.max(1, target.hpMax | 0);
  const raw = info.raw | 0;
  // Threat: big printed hit and/or already hurt. Chip ≤4 rarely worth 1 AP reaction.
  // table: slightly stingier than smart (less AP spent on chip Defends).
  const bigHit = raw >= 8;
  const mediumHit = raw >= 6;
  const want =
    policy === "table"
      ? (bigHit && hpRatio <= 0.7) ||
        (mediumHit && hpRatio <= 0.5) ||
        (raw >= 5 && hpRatio <= 0.4) ||
        (hpRatio <= 0.3 && raw >= 1)
      : (bigHit && hpRatio <= 0.85) ||
        (mediumHit && hpRatio <= 0.6) ||
        (raw >= 4 && hpRatio <= 0.45) ||
        (hpRatio <= 0.35 && raw >= 1);
  if (!want) return null;
  const r = tryDefendReaction(target);
  if (r.ok) {
    pushLog(
      state,
      target.name + " Defends (reaction, raw " + raw + ")"
    );
  }
  return r;
}

/** Riposte / Hidden Bola before damage lands. */
function maybeMitigationHook(state, target, info = {}) {
  if (state.askReactions) return null;
  if (!target || target.side !== "hero") return null;
  const policy = state.defendPolicy || "smart";
  if (policy !== "smart" && policy !== "table" && policy !== "always" && policy !== "defend1") {
    return null;
  }
  const raw = info.raw | 0;
  const atkRange = info.range != null ? info.range | 0 : info.ranged ? 99 : 1;
  const ranged = !!info.ranged || atkRange > 1;
  const hpRatio = (target.hp | 0) / Math.max(1, target.hpMax | 0);
  const wantMit =
    policy === "always" ||
    policy === "defend1" ||
    raw >= 8 ||
    (raw >= 5 && hpRatio <= 0.6) ||
    hpRatio <= 0.35;

  // Riposte: RANGE 1 melee mitigation only when threat warrants spending stress.
  if (wantMit && !ranged && atkRange <= 1 && target.hasRiposte) {
    const r = tryRiposte(target, raw, { ranged: false, range: 1, state });
    if (r.ok) {
      pushLog(
        state,
        target.name +
          " Riposte (−" +
          (r.reduce | 0) +
          " · raw " +
          (r.raw | 0) +
          (r.oa ? " · OA ready" : "") +
          ")"
      );
      return r;
    }
  }

  // Hidden Bola: R3 reaction — fire on threat OR when Knockdown is likely (STR≤DEX).
  if (target.hasHiddenBola && info.attacker) {
    const atk = info.attacker;
    const kdLikely = (atk.str | 0) <= (target.dex | 0);
    if (wantMit || (kdLikely && raw >= 1)) {
      const r = tryHiddenBola(target, atk, raw, {});
      if (r.ok) {
        pushLog(
          state,
          target.name +
            " Hidden Bola (−" +
            (r.reduce | 0) +
            " · raw " +
            (r.raw | 0) +
            (r.knockdown ? " · Knockdown" : "") +
            ")"
        );
        return r;
      }
    }
  }
  return null;
}

/**
 * Apply a player/AI action object from legalActions (or constructed).
 */
export function applyAction(state, action) {
  if (state.over) return { ok: false, reason: "over" };
  if (state.awaitingHeroPick) {
    return { ok: false, reason: "awaiting-hero-pick" };
  }
  const actor = currentActor(state);
  if (!actor) return { ok: false, reason: "no-actor" };
  if (action.actorId && action.actorId !== actor.id) {
    return { ok: false, reason: "not-your-turn" };
  }

  if (action.type === "pickKit") {
    if (!state.awaitingKitPick && actor.kitPickedThisTurn) {
      return { ok: false, reason: "kit-already-picked" };
    }
    const opts = actor.weaponOptions || [];
    const idx = action.kitIndex | 0;
    if (idx < 0 || idx >= opts.length) return { ok: false, reason: "bad-kit" };
    // Opening kit choice does NOT consume the 1 free Weapon Swap this turn.
    actor.activeKit = idx;
    actor.kitSwapsThisTurn = 0;
    if (actor.stabilityBase != null) {
      actor.stability =
        (actor.stabilityBase | 0) + (hasWeaponEquipped(actor, "quarterstaff") ? 1 : 0);
    }
    actor.kitPickedThisTurn = true;
    state.awaitingKitPick = false;
    pushLog(
      state,
      actor.name +
        " Kit → " +
        (Array.isArray(opts[idx]) ? opts[idx].join("+") : opts[idx]) +
        " (turn start · free swap still available)"
    );
    return { ok: true };
  }

  if (state.awaitingKitPick) {
    return { ok: false, reason: "awaiting-kit-pick" };
  }

  if (action.type === "endTurn") {
    advanceTurn(state);
    return { ok: true };
  }

  if (action.type === "defend") {
    const r = tryDefendReaction(actor);
    if (!r.ok) return r;
    pushLog(state, actor.name + " Defends (reaction)");
    return { ok: true, result: r };
  }

  if (action.type === "catchBreath") {
    const r = resolveCatchBreath(actor, {
      rng: state.rng,
      dryRun: !!action.dryRun,
      declared: action.declared || null,
    });
    if (!r.ok) return r;
    if (r.dryRun) return { ok: true, result: r };
    let payNote = "";
    if (r.pay && r.pay.usedFree) payNote = " · free reaction";
    else if (r.pay && (r.pay.apCost | 0) > 0) payNote = " · −" + r.pay.apCost + " AP";
    pushLog(
      state,
      actor.name +
        " CATCH BREATH " +
        r.d1 +
        "+" +
        r.d2 +
        " → +" +
        r.heal +
        " HP (wyższy) (rec " +
        actor.recoveries +
        ")" +
        payNote
    );
    return { ok: true, result: r };
  }

  if (action.type === "steelYourself") {
    const r = resolveSteelYourself(actor, {
      rng: state.rng,
      pick: action.pick,
      autoPick: !!action.autoPick,
      dryRun: !!action.dryRun,
      declaredRoll: action.declaredRoll || null,
      skipAp: !!action.skipAp,
    });
    if (!r.ok) return r;
    if (r.dryRun || r.needsPick) return { ok: true, result: r };
    let msg = actor.name + " Steel Yourself T" + r.tier;
    if (r.roll) {
      msg +=
        " roll " +
        r.roll.d1 +
        "+" +
        r.roll.d2 +
        " INT+" +
        (actor.int | 0) +
        " = " +
        r.roll.total;
    }
    if (r.shield) msg += " · SHIELD " + r.shield;
    if (r.cleansePts) msg += " · CLEANSE " + r.cleansePts + (r.cleansed ? " (−" + r.cleansed + ")" : "");
    if (r.cannotBeCrit) msg += " · cannot be crit";
    pushLog(state, msg);
    return { ok: true, result: r };
  }

  if (action.type === "systemsBargain") {
    const r = activateSystemsBargain(actor);
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name +
        " System's Bargain (−2 AP · −" +
        ((r.pay && r.pay.mana) || 0) +
        " mana" +
        ((r.pay && r.pay.stress) ? " −" + r.pay.stress + " stress" : "") +
        ") · PR thresholds −1"
    );
    noteTalent(state, { kind: "bargain", actorId: actor.id });
    return { ok: true, result: r };
  }

  if (action.type === "summon") {
    const r = placeSummon(state, actor, action.summonKind || "warrior", {
      dest: action.dest || null,
    });
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name +
        " summons " +
        ((r.summon && r.summon.name) || action.summonKind) +
        " @ (" +
        r.summon.x +
        "," +
        r.summon.y +
        ") · HP " +
        r.summon.hp +
        "/" +
        r.summon.hpMax +
        " · STR " +
        (r.summon.str | 0) +
        " DEX " +
        (r.summon.dex | 0) +
        " INT " +
        (r.summon.int | 0) +
        " · Spd " +
        (r.summon.speed | 0)
    );
    return { ok: true, result: r };
  }

  if (action.type === "iceWall") {
    const r = placeIceWall(state, actor);
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name +
        " Ice Wall ×" +
        (r.segments || []).length +
        " (HP " +
        (r.segHp | 0) +
        "/seg · adjacent difficult)"
    );
    return { ok: true, result: r };
  }

  if (action.type === "spotterMark") {
    const r = applySpotterMark(state, actor, action.targetId);
    if (!r.ok) return r;
    const tgt = actorById(state, action.targetId);
    pushLog(
      state,
      actor.name +
        " Spotter Mark → " +
        ((tgt && tgt.name) || action.targetId) +
        " (−1 AP · −1 stress · allies BREAK 2 this round · Crit 1 next ranged)"
    );
    return { ok: true, result: r };
  }

  if (action.type === "guard") {
    const r = activateGuard(actor);
    if (!r.ok) return r;
    pushLog(state, actor.name + " Guard (−1 stress · +1 DEF until next turn)");
    return { ok: true, result: r };
  }

  if (action.type === "magicShield") {
    const r = applyMagicShield(state, actor, action.targetId || actor.id);
    if (!r.ok) return r;
    const tgt = actorById(state, r.targetId);
    pushLog(
      state,
      actor.name +
        " Magic Shield → " +
        ((tgt && tgt.name) || r.targetId) +
        " (SHIELD " +
        (r.shield | 0) +
        ")"
    );
    return { ok: true, result: r };
  }

  if (action.type === "shadowDash") {
    const dest = action.dest || (action.cells && action.cells[0]);
    const r = applyShadowDash(state, actor, dest);
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name + " Shadow Dash → (" + r.dest.x + "," + r.dest.y + ") · −1 stress · Adv 1 next melee"
    );
    return { ok: true, result: r };
  }

  if (action.type === "blink") {
    const dest = action.dest || (action.cells && action.cells[0]);
    const r = applyBlink(state, actor, dest, { upcast: !!action.upcast });
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name + " Blink → (" + r.dest.x + "," + r.dest.y + ") · SHIELD " + (r.shield | 0)
    );
    return { ok: true, result: r };
  }

  if (action.type === "bless") {
    const r = applyBless(state, actor, action.targetId || actor.id, {
      upcast: !!action.upcast,
      spendRecovery: true,
      rng: state.rng,
    });
    if (!r.ok) return r;
    const tgt = actorById(state, r.targetId);
    pushLog(
      state,
      actor.name +
        (r.upcast ? " Bless (Upcast)" : " Bless") +
        " → " +
        ((tgt && tgt.name) || r.targetId) +
        " (heal " + (r.heal | 0) + " · +" + (r.bonus | 0) + " INT · reroll +1)"
    );
    return { ok: true, result: r };
  }

  if (action.type === "barkskin") {
    const r = applyBarkskin(state, actor, action.targetId || actor.id, {
      upcast: !!action.upcast,
    });
    if (!r.ok) return r;
    const tgt = actorById(state, r.targetId);
    pushLog(
      state,
      actor.name +
        (r.upcast ? " Barkskin (Upcast)" : " Barkskin") +
        " → " +
        ((tgt && tgt.name) || r.targetId) +
        " (SHIELD " +
        (r.shield | 0) +
        " · immune Bleed" +
        (r.stability ? " · +" + (r.stability | 0) + " Stability" : "") +
        ")"
    );
    return { ok: true, result: r };
  }

  if (action.type === "stealth") {
    const r = applyStealth(actor);
    if (!r.ok) return r;
    pushLog(state, actor.name + " Stealth (0 AP · −1 stress · 1/round · untargetable >R2 · Crit 1 next)");
    return { ok: true, result: r };
  }

  if (action.type === "enhanceWeapon") {
    const r = applyEnhanceWeapon(actor, {
      upcast: !!action.upcast,
      dmgType: action.dmgType || action.enhanceType || null,
    });
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name +
        " Enhance Weapon (−1 AP · −" +
        (action.upcast ? 2 : 1) +
        " mana · +" +
        (r.bonus | 0) +
        " dmg" +
        (r.dmgType ? " · type " + r.dmgType : "") +
        ")"
    );
    return { ok: true, result: r };
  }

  if (action.type === "healingWater") {
    const r = applyHealingWater(state, actor, action.targetId || actor.id, {
      upcast: !!action.upcast,
      rng: state.rng,
    });
    if (!r.ok) return r;
    const tgt = actorById(state, r.targetId);
    pushLog(
      state,
      actor.name +
        (r.upcast ? " Healing Water (Upcast)" : " Healing Water") +
        " → " +
        ((tgt && tgt.name) || r.targetId) +
        " (heal " +
        (r.heal | 0) +
        " · Cleanse " +
        (r.cleansePts | 0) +
        " · Adv 1)"
    );
    return { ok: true, result: r };
  }

  if (action.type === "feralInvocation") {
    const r = activateFeralInvocation(actor);
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name +
        " Feral Invocation (−1 AP · −2 stress · Break " +
        (r.breakStr | 0) +
        " · T3 Fear INT≤STR)"
    );
    return { ok: true, result: r };
  }

  if (action.type === "askQuestion") {
    const r = resolveAskQuestion(actor, {
      rng: state.rng,
      dryRun: !!action.dryRun,
      declaredRoll: action.declaredRoll || null,
      skipAp: !!action.skipAp,
      adv: (action.adv | 0) + (actor.huntersKnowledge ? 1 : 0),
      disadv: action.disadv | 0,
      aboutEnemyId: action.targetId || action.aboutEnemyId || null,
    });
    if (!r.ok) return r;
    if (r.dryRun) return { ok: true, result: r };
    if (actor.huntersKnowledge && (action.targetId || action.aboutEnemyId)) {
      actor.huntersMarkId = action.targetId || action.aboutEnemyId;
    }
    let msg = actor.name + " Ask a Question T" + r.tier;
    if (r.roll) {
      msg +=
        " roll " +
        r.roll.d1 +
        "+" +
        r.roll.d2 +
        " INT+" +
        (actor.int | 0) +
        " = " +
        r.roll.total;
    }
    if (r.grantAdv) msg += " · ADV " + r.grantAdv + " next attack";
    else msg += " · (no ADV — GM info only)";
    pushLog(state, msg);
    return { ok: true, result: r };
  }

  if (action.type === "shove") {
    const tgt =
      state.actors.find((a) => a.id === action.targetId) ||
      state.actors.find((a) => a.id === (action.target && action.target.id));
    if (!tgt) return { ok: false, reason: "no-target" };
    const r = resolveShove(actor, tgt, {
      rng: state.rng,
      dryRun: !!action.dryRun,
      declaredRoll: action.declaredRoll || null,
      skipAp: !!action.skipAp,
      adv: action.adv | 0,
      disadv: action.disadv | 0,
      actors: state.actors,
      objects: state.objects,
      hazards: state.hazards,
      bounds: state.bounds,
      askPush: !!state.askPush && actor.side === "hero" && !action.pushDir,
      pushDir: action.pushDir || null,
    });
    if (!r.ok) return r;
    if (r.dryRun) return { ok: true, result: r };
    let msg = actor.name + " Shove → " + tgt.name + " T" + r.tier;
    if (r.roll) {
      msg +=
        " roll " +
        r.roll.d1 +
        "+" +
        r.roll.d2 +
        " STR+" +
        (actor.str | 0) +
        " = " +
        r.roll.total;
    }
    msg += " · Push " + r.spaces;
    if (r.knockdown) msg += " · Knock down";
    pushLog(state, msg);
    return { ok: true, result: r };
  }

  if (action.type === "createOpening") {
    const r = resolveCreateOpening(actor, {
      rng: state.rng,
      pick: action.pick,
      autoPick: !!action.autoPick,
      dryRun: !!action.dryRun,
      declaredRoll: action.declaredRoll || null,
      skipAp: !!action.skipAp,
      adv: (action.adv | 0) + (actor.pugilist ? 1 : 0),
      disadv: action.disadv | 0,
    });
    if (!r.ok) return r;
    if (r.dryRun) return { ok: true, result: r };
    let msg = actor.name + " Line Up the Strike T" + r.tier;
    if (r.roll) {
      msg +=
        " roll " +
        r.roll.d1 +
        "+" +
        r.roll.d2 +
        " DEX+" +
        (actor.dex | 0) +
        " = " +
        r.roll.total;
    }
    if (r.needsPick) msg += " · wybierz CRIT 1 lub ADV 1";
    else if (r.buff) {
      if (r.buff.disadv) msg += " · DISADV " + r.buff.disadv;
      if (r.buff.adv) msg += " · ADV " + r.buff.adv;
      if (r.buff.critX) msg += " · CRIT " + r.buff.critX;
      if (r.buff.break) msg += " · BREAK " + r.buff.break;
    }
    actor.openingUsedThisTurn = true;
    pushLog(state, msg);
    return { ok: true, result: r };
  }

  if (action.type === "aim") {
    const kit = activeKitRef(actor);
    const bow =
      kit === "shortbow" || (Array.isArray(kit) && kit.indexOf("shortbow") >= 0);
    if (!bow) return { ok: false, reason: "no-bow" };
    if (actor.movedThisTurn) return { ok: false, reason: "moved" };
    if (actor.aimUsedThisRound) return { ok: false, reason: "aim-used" };
    actor.aimArmed = true;
    pushLog(state, actor.name + " Aims (Shortbow) — next Strike ADV 1");
    return { ok: true };
  }

  if (action.type === "openingPick") {
    const r = finishCreateOpeningPick(actor, action.pick);
    if (!r.ok) return r;
    pushLog(
      state,
      actor.name + " Opening → " + (r.pick === "crit" ? "CRIT 1" : "ADV 1") + " · BREAK 5"
    );
    return { ok: true, result: r };
  }

  if (action.type === "weaponSwap") {
    const r = weaponSwap(actor, action.kitIndex, payAp);
    if (!r.ok) return r;
    if (actor.stabilityBase != null) {
      actor.stability =
        (actor.stabilityBase | 0) + (hasWeaponEquipped(actor, "quarterstaff") ? 1 : 0);
    }
    pushLog(
      state,
      actor.name + " Weapon Swap → kit " + ((action.kitIndex | 0) + 1) + (r.free ? " (free)" : " (−1 AP)")
    );
    return { ok: true, result: r };
  }

  if (action.type === "stand") {
    if (!(actor.st && actor.st.knockdown)) {
      return { ok: false, reason: "not-knocked" };
    }
    const monster = isMonsterEconomy(actor);
    const cost = Math.max(1, action.moveCost | 0 || 3);
    const budget = Math.max(
      0,
      actor.moveBudget != null ? actor.moveBudget | 0 : actor.speed | 0
    );
    if (budget < cost) return { ok: false, reason: "no-move-budget" };
    if (monster) {
      if ((actor.moveLeft | 0) < 1) return { ok: false, reason: "no-move" };
    } else {
      if (!actor.moveUnlocked) {
        if (!payAp(actor, 1)) return { ok: false, reason: "no-ap" };
        actor.moveUnlocked = true;
      }
    }
    actor.moveBudget = budget - cost;
    actor.st.knockdown = false;
    pushLog(
      state,
      actor.name +
        " Stands (−" +
        cost +
        " move; " +
        (actor.moveBudget | 0) +
        " left)"
    );
    return { ok: true, result: { moveLeft: actor.moveBudget | 0 } };
  }

  if (action.type === "move" || action.type === "carefulStep" || action.type === "martialStep" || action.type === "vigilantStep") {
    const martial = action.type === "martialStep";
    const vigilant = action.type === "vigilantStep";
    const r = resolveMove({
      actor,
      dest: action.dest,
      actors: state.actors,
      careful: action.type === "carefulStep" || martial || vigilant,
      maxSteps: martial ? 2 : vigilant ? 1 : undefined,
      skipAp: martial || vigilant || !!action.skipAp,
      chase: !!action.chase,
      asChase: !!action.chase,
      rng: state.rng,
      bounds: state.bounds,
      objects: state.objects,
      hazards: state.hazards,
      getReactionAbility: (e) => getReactionAbility(state, e),
      // Sandbox askReactions: collect OAs so the OA target (hero) sees declare + Accept
      // even with 0 AP (no Defend). Applies when anyone leaves R1.
      deferOa: !!state.askReactions,
      maybeDefend: (t, info) => maybeDefendHook(state, t, info || {}),
      maybeMitigation: (t, info) => maybeMitigationHook(state, t, info || {}),
      state,
    });
    if (!r.ok) return r;
    if (martial) {
      actor.martialMoveUsedThisTurn = true;
      actor.martialMoveReady = false;
    }
    if (vigilant) {
      actor.vigilantMoveReady = false;
    }
    const pendingOas = r.pendingOas || [];
    pushLog(
      state,
      actor.name +
        (martial
          ? " Martial Step"
          : vigilant
            ? " Vigilant Step"
          : action.type === "carefulStep"
            ? " Careful Step"
            : action.chase
              ? " Chase (Action→Move)"
              : " Move") +
        " → (" +
        actor.x +
        "," +
        actor.y +
        ")" +
        (pendingOas.length
          ? " [OA×" + pendingOas.length + " pending]"
          : r.oaEvents && r.oaEvents.length
            ? " [OA×" + r.oaEvents.length + "]"
            : "") +
        ((r.shockDmg | 0) > 0 ? " · Shock −" + (r.shockDmg | 0) + " HP" : "") +
        (r.hazardEvents && r.hazardEvents.length
          ? " · hazard −" +
            r.hazardEvents.reduce((s, h) => s + (h.dmg | 0), 0) +
            " HP"
          : "")
    );
    for (const oa of r.oaEvents || []) {
      if (oa.result && oa.result.ok) {
        const from = actorById(state, oa.from);
        pushOaLog(state, from, actor, oa.result);
      }
    }
    checkOver(state);
    return {
      ok: true,
      result: r,
      pendingOas: pendingOas.length ? pendingOas : null,
    };
  }

  if (action.type === "strike") {
    const ab = state.abilityById[action.abilityId];
    const selfAoe =
      !!(ab && ab.selfAoe) ||
      !!(ab && /intimidating-shout|self-aoe/i.test(String(ab.id || ab.name || "")));
    const target = action.targetId ? actorById(state, action.targetId) : null;
    if (!ab || (!selfAoe && !target)) return { ok: false, reason: "bad-strike" };

    let pack = null;
    const ph = packHunterBonus(actor, state.actors);
    if (ph) {
      const mode = (ab.roll && ab.roll.mode) || "power";
      pack = mode === "flat" ? { bonusDmg: 1 } : { adv: 1 };
    }

    const r = resolveStrike({
      attacker: actor,
      target,
      ability: ab,
      rng: state.rng,
      allies: state.actors.filter((a) => a.side === actor.side),
      actors: state.actors,
      pack,
      bounds: state.bounds,
      objects: state.objects,
      hazards: state.hazards,
      state,
      round: state.round | 0,
      getReactionAbility: (e) => getReactionAbility(state, e),
      maybeDefend: (t, info) => maybeDefendHook(state, t, info || {}),
      maybeMitigation: (t, info) => maybeMitigationHook(state, t, info || {}),
      flurry: !!action.flurry,
      helpHelper: action.helpHelperId ? actorById(state, action.helpHelperId) : null,
      useAim: !!action.useAim,
      dryRun: !!action.dryRun,
      declared: action.declared || null,
      // AP/Action: never on dryRun preview; always on real resolve (even with declared rolls)
      skipAp: !!action.skipAp || !!action.dryRun,
      skipRangedOa: !!action.declared || !!action.skipRangedOa,
      oaAllowIds: action.oaAllowIds || null,
      askPush: !!state.askPush && actor.side === "hero" && !action.pushDir,
      pushDir: action.pushDir || null,
      supportPick: action.supportPick || null,
      supportAllyId: action.supportAllyId || null,
      dmgTypeOverride: action.dmgTypeOverride || null,
      cleaveTargetId: action.cleaveTargetId || null,
      extraTargetIds: action.extraTargetIds || null,
      spendStressAdv: !!action.spendStressAdv,
      upcast: !!action.upcast,
      sourceAllyId: action.sourceAllyId || null,
    });
    if (r.oaEvents && r.oaEvents.length) {
      for (const oa of r.oaEvents) {
        if (!oa.result || !oa.result.ok) continue;
        pushOaLog(state, actorById(state, oa.from), actor, oa.result);
      }
    }
    if (!r.ok) {
      return r;
    }
    if (r.dryRun) {
      return { ok: true, result: r };
    }
    if (state.traceTalents) {
      const hits = 1 + ((r.aoeHits && r.aoeHits.length) || 0);
      noteTalent(state, {
        kind: "cast",
        abilityId: ab.id,
        actorId: actor.id,
        side: actor.side,
        targetId: target ? target.id : null,
        hits,
        upcast: !!action.upcast,
        feared: !!(target && target.st && target.st.fearSource),
        grappled: !!(
          target &&
          ((target.grappleLock && target.grappleLock.advVsTarget) ||
            (target.st && target.st.restrain))
        ),
        sourceAllyId: action.sourceAllyId || (r && null),
      });
    }
    // Soft-focus: count hero as targeted this round (enemy single-target strikes)
    if (target && actor.side === "enemy" && target.side === "hero") {
      target.timesTargetedThisRound = (target.timesTargetedThisRound | 0) + 1;
    }
    // Eye for an eye: hero hit by enemy T3 → free OA (optional when askReactions)
    let eyeForAnEyeOffer = null;
    if (
      target &&
      actor.side === "enemy" &&
      target.side === "hero" &&
      target.eyeForAnEye &&
      (r.tier | 0) >= 3 &&
      !target.dead &&
      (target.hp | 0) > 0
    ) {
      if (state.askReactions) {
        // Sandbox / table: player chooses after the hit lands.
        eyeForAnEyeOffer = { heroId: target.id, foeId: actor.id };
      } else {
        const oa = applyOpportunityAttack(state, target.id, actor.id, { skipAp: true });
        if (oa && oa.ok && oa.result && oa.result.ok) {
          // applyOpportunityAttack already logged the OA line
          pushLog(state, "  (Eye for an eye)");
        } else {
          pushLog(
            state,
            "  (Eye for an eye — " +
              ((oa && (oa.reason || (oa.result && oa.result.reason))) || "fail") +
              ")"
          );
        }
      }
    }
    // Riposte: if mitigation reduced DMG to 0 → standard weapon OA (skipAp; stress already paid)
    let riposteOffer = null;
    if (
      target &&
      target._riposteOaPending === actor.id &&
      !target.dead &&
      (target.hp | 0) > 0
    ) {
      delete target._riposteOaPending;
      if (state.askReactions) {
        riposteOffer = { heroId: target.id, foeId: actor.id, kind: "riposte" };
      } else {
        const oa = applyOpportunityAttack(state, target.id, actor.id, { skipAp: true });
        if (oa && oa.ok && oa.result && oa.result.ok) {
          pushLog(state, "  (Riposte OA)");
        } else {
          pushLog(
            state,
            "  (Riposte OA — " +
              ((oa && (oa.reason || (oa.result && oa.result.reason))) || "fail") +
              ")"
          );
        }
      }
    } else if (target && target._riposteOaPending) {
      delete target._riposteOaPending;
    }
    // Alpha Howl memory: one Howl / round; weak (T1 / single-target) → next activation attacks
    if (/howl/i.test(ab.id || ab.name || "")) {
      state.howlUsedInRound = state.howlUsedInRound || {};
      state.howlUsedInRound[actor.id] = state.round | 0;
      actor.aiMemory = actor.aiMemory || {};
      actor.aiMemory.howledThisRound = true;
      actor.aiMemory.howledLastActivation = true;
      const weak =
        (r.tier | 0) <= 1 ||
        (r.aoeMode === "one" && !(r.aoeHits && r.aoeHits.length));
      if (weak) actor.aiMemory.skipHowlAfterWeak = true;
      else actor.aiMemory.skipHowlAfterWeak = false;
    } else if (actor.aiMemory) {
      actor.aiMemory.howledLastActivation = false;
    }
    if (r.roll && r.roll.help) {
      const h = r.roll.help;
      const helper = actorById(state, h.helperId);
      pushLog(
        state,
        "  Help " +
          (helper ? helper.name : h.helperId) +
          ": reroll " +
          h.before.d1 +
          "+" +
          h.before.d2 +
          " → " +
          h.after.d1 +
          "+" +
          h.after.d2
      );
    }
    const selfAoeHit =
      selfAoe || !target
        ? (r.aoeHits || [])
            .map((h) => {
              const a = actorById(state, h.id);
              const tags = (h.statuses || []).map(formatStatusTag).filter(Boolean).join(",");
              return (a ? a.name : h.id) + (tags ? "(" + tags + ")" : "");
            })
            .filter(Boolean)
            .join(", ")
        : "";
    let msg =
      actor.name +
      " " +
      ab.name +
      " → " +
      (target ? target.name : selfAoeHit || "AoE R" + (r.aoeR != null ? r.aoeR : "?"));
    const hpLost = r.dmgResult && r.dmgResult.toHp != null ? r.dmgResult.toHp | 0 : 0;
    if ((r.raw | 0) > 0 || hpLost > 0) {
      msg += ": " + r.raw + " " + r.dmgType + " (−" + hpLost + " HP)";
      if (r.dmgResult && r.dmgResult.bleedExtra) msg += " +Bleed " + r.dmgResult.bleedExtra;
    } else if (r.statuses && r.statuses.length) {
      msg += ": " + r.statuses.map(formatStatusTag).filter(Boolean).join(", ");
    } else if (selfAoeHit && !target) {
      msg +=
        ": R" +
        (r.aoeR != null ? r.aoeR : "?") +
        (r.statuses && r.statuses.length
          ? ""
          : r.aoeHits && r.aoeHits[0] && r.aoeHits[0].statuses
            ? " · " +
              r.aoeHits[0].statuses.map(formatStatusTag).filter(Boolean).join(", ")
            : "");
    } else {
      msg += ": —";
    }
    if (r.twin && r.rolls && r.rolls.length) {
      const bits = r.rolls.map((roll) => {
        if (!roll) return "?";
        return (
          roll.d1 +
          "+" +
          roll.d2 +
          "=" +
          roll.total +
          "[T" +
          roll.tier +
          (roll.isCrit ? " CRIT" : "") +
          "]"
        );
      });
      msg += " twin " + bits.join(" + ");
      if (r.disadv) msg += " DISADV" + r.disadv;
    } else if (r.roll) msg += formatPowerRollLine(r);
    else if (r.tier != null) msg += " [flat]";
    if (pack) msg += pack.adv ? " · Pack ADV" : " · Pack +1";
    if ((r.raw | 0) > 0 && r.statuses && r.statuses.length) {
      msg += " · " + r.statuses.map(formatStatusTag).filter(Boolean).join(", ");
    }
    if (r.statusesBlocked && r.statusesBlocked.length) {
      msg +=
        " · gate miss: " +
        r.statusesBlocked
          .map((st) => {
            const tag = formatStatusTag(st) || st.id;
            if (!st.gate) return tag;
            return tag + " (" + formatGateLabel(st.gate, { vsActor: actor }) + ")";
          })
          .join(", ");
    }
    if (r.supportEvents && r.supportEvents.length) {
      for (const se of r.supportEvents) {
        if (se.id === "allyCatchBreath") {
          msg +=
            " · support Catch Breath " +
            (se.allyId || "?") +
            " +" +
            (se.heal | 0) +
            " HP";
        } else if (se.id === "allyCleanse" || se.id === "selfCleanse") {
          msg +=
            " · " +
            (se.self ? "self" : "ally") +
            " Cleanse " +
            (se.points | 0) +
            (se.cleansed ? " (−" + se.cleansed + ")" : "");
        }
      }
    }
    if (r.critApGain) msg += " · +" + r.critApGain + " AP (crit)";
    if (r.coldBloodedClear) msg += " · Cold Blooded clear stress";
    if (r.weaponmasterClear) msg += " · Weaponmaster clear stress";
    if (r.primalInstinctAdv) msg += " · Primal Instinct ADV1";
    if (r.courageFearIgnore) msg += " · Courage ignore Fear";
    if (r.critRiders === false && r.critBlockedBySteel) msg += " · onCrit blocked";
    if (r.cardCritHits && r.cardCritHits.length) {
      msg += " · Crit aura ×" + r.cardCritHits.length;
    }
    if (r.forced && r.forced.length) {
      const modes = [];
      let fullContactNote = 0;
      for (const f of r.forced) {
        const m = (f && f.mode) || "push";
        const label = m === "pull" ? "Pull" : m === "slide" ? "Slide" : "Push";
        if (!modes.includes(label)) modes.push(label);
        if (f && f.fullContactPush) fullContactNote = f.fullContactPush | 0;
        if (f && f.collision) {
          const c = f.collision;
          const forcedName = target ? target.name : label;
          if (c.kind === "creature") {
            const blocker = actorById(state, c.blockerId);
            const bName = blocker ? blocker.name : c.blockerId || "blocker";
            pushLog(
              state,
              "  " +
                label +
                " collision → creature: " +
                forcedName +
                " −" +
                (c.toForced | 0) +
                " unprev, " +
                bName +
                " −" +
                (c.toBlocker | 0) +
                " unprev (packet " +
                (c.packet | 0) +
                ")"
            );
          } else {
            let cmsg = "  " + label + " collision → " + c.kind;
            if (c.material) cmsg += " " + c.material;
            if (c.toForced)
              cmsg += " · " + forcedName + " −" + c.toForced + " unprev";
            if (c.objectDestroyed) cmsg += " · destroyed";
            if (c.toBlocker) cmsg += " · blocker " + c.toBlocker;
            pushLog(state, cmsg);
          }
        }
      }
      msg += " · " + modes.join("/");
      if (fullContactNote) msg += " · Full Contact +" + fullContactNote;
    }
    pushLog(state, msg);
    logWoundIfAny(state, target, r.dmgResult);
    if (r.aoeHits && r.aoeHits.length) {
      for (const hit of r.aoeHits) {
        const other = actorById(state, hit.id);
        const tags = (hit.statuses || []).map(formatStatusTag).filter(Boolean);
        const dmgBit =
          hit.dealt != null
            ? " " + (hit.dealt | 0) + " dmg"
            : hit.raw != null
              ? " raw " + (hit.raw | 0)
              : "";
        pushLog(
          state,
          "  AoE → " +
            (other ? other.name : hit.id) +
            dmgBit +
            (tags.length ? ": " + tags.join(", ") : dmgBit ? "" : " (bez statusu)")
        );
      }
    }
    if (r.terrainLeft && r.terrainLeft.length) {
      pushLog(
        state,
        "  Terrain left ×" +
          r.terrainLeft.length +
          (r.aoeShape === "cube" ? " (cube)" : "") +
          (r.terrainLeft[0] && r.terrainLeft[0].enterDmg
            ? " · enter " + r.terrainLeft[0].enterDmg + " unprev"
            : "")
      );
    }
    if (/howl/i.test(ab.id || ab.name || "")) {
      const feared = [];
      const clean = [];
      for (const h of state.actors) {
        if (!h || h.side !== "hero" || h.dead) continue;
        if (h.st && h.st.fearSource) feared.push(h.name);
        else clean.push(h.name);
      }
      pushLog(
        state,
        "  Fear teraz: " +
          (feared.length ? feared.join(", ") : "—") +
          (clean.length ? " · bez Fear: " + clean.join(", ") : "")
      );
    }
    checkOver(state);
    if (
      actor.side === "hero" &&
      actor.martialArtist &&
      !actor.martialMoveUsedThisTurn &&
      ab.isAttack !== false
    ) {
      actor.martialMoveReady = true;
    }
    return { ok: true, result: r, eyeForAnEyeOffer, riposteOffer };
  }

  return { ok: false, reason: "unknown-action" };
}

function pushOaLog(state, fromActor, toActor, or) {
  if (!or || !or.ok) return;
  let omsg =
    "  OA " +
    (fromActor ? fromActor.name : "?") +
    " → " +
    (toActor ? toActor.name : "?") +
    ": ";
  if ((or.raw | 0) > 0) {
    omsg +=
      or.raw +
      " " +
      or.dmgType +
      " (−" +
      (or.dmgResult && or.dmgResult.toHp) +
      " HP)";
  } else if (or.statuses && or.statuses.length) {
    omsg += or.statuses.map(formatStatusTag).filter(Boolean).join(", ");
  } else omsg += "—";
  if (or.roll) omsg += formatPowerRollLine(or);
  if ((or.raw | 0) > 0 && or.statuses && or.statuses.length) {
    omsg += " · " + or.statuses.map(formatStatusTag).filter(Boolean).join(", ");
  } else if (or.statuses && or.statuses.length && (or.raw | 0) === 0) {
    omsg += " · " + or.statuses.map(formatStatusTag).filter(Boolean).join(", ");
  }
  if ((or.breakX | 0) > 0) omsg += " · BREAK " + (or.breakX | 0);
  if (or.critApGain) omsg += " · +" + or.critApGain + " AP (crit)";
  else if (or.crit) omsg += " · CRIT";
  pushLog(state, omsg);
}

/** Player/AI chooses to take an OA (reaction Strike with ADV 1 for heroes). */
export function applyOpportunityAttack(state, fromId, toId, opts = {}) {
  const from = actorById(state, fromId);
  const to = actorById(state, toId);
  if (!from || !to) return { ok: false, reason: "bad-actors" };
  const ab = getReactionAbility(state, from);
  if (!ab) return { ok: false, reason: "no-oa-ability" };
  const r = resolveStrike({
    attacker: from,
    target: to,
    ability: ab,
    rng: state.rng,
    asReaction: true,
    asOa: true,
    // Heroes: baseline OA Adv 1; Vigilant adds +1 more
    extraAdv:
      (isMonsterEconomy(from) ? 0 : 1) + (from.vigilant && !isMonsterEconomy(from) ? 1 : 0),
    allies: state.actors.filter((a) => a.side === from.side),
    actors: state.actors,
    skipRangedOa: true,
    state,
    bounds: state.bounds,
    objects: state.objects,
    dryRun: !!opts.dryRun,
    declared: opts.declared || null,
    skipAp: !!opts.dryRun || !!opts.skipAp,
  });
  if (opts.dryRun) return { ok: !!r.ok, result: r };
  if (r.ok) {
    pushOaLog(state, from, to, r);
    // Vigilant: MOVE 1 safely after OA
    if (from.vigilant && !from.dead && (from.hp | 0) > 0) {
      from.vigilantMoveReady = true;
      noteTalent(state, { kind: "vigilantOa", actorId: from.id, targetId: to.id });
    }
  } else pushLog(state, "  OA " + from.name + " nieudany: " + (r.reason || "?"));
  checkOver(state);
  return { ok: !!r.ok, result: r };
}

export function listLegal(state) {
  const actor = currentActor(state);
  if (!actor) return [];
  return legalActions(state, actor, state.abilityById);
}

export { listRangedOaCandidates, checkOver };
