import { clearDefend } from "./damage.js";
import { resetKitSwaps, normalizeKitParts } from "./kits.js";
import { tickStartOfTurnDots, tickGloomAtStartOfTurn } from "./status.js";
import { applyDamage } from "./damage.js";
import { syncBloodiedShell } from "./actor.js";
import { moveUpcastClouds, pulseCloudsAtStart } from "./clouds.js";
import { noteTalent } from "./talentTrace.js";

/**
 * Turn / AP / reaction window (RULES-CANON §2 / Mechanika).
 * Heroes: AP resets to max at **end of your turn**; reactions spend from that pool
 * so you begin the next turn with whatever remains (no second refresh).
 */

export function apMaxFor(actor) {
  if (actor.down || (actor.hp | 0) <= 0) return 2; // Dying
  return actor.apMax != null ? actor.apMax | 0 : 3;
}

export function refreshAp(actor) {
  actor.ap = apMaxFor(actor);
  actor.apSpent = 0;
}

/** Monster kit refresh: 1 Move, 1 Action, 1 OA. */
export function refreshMonsterSlots(actor) {
  actor.moveLeft = 1;
  actor.actionLeft = 1;
  actor.oaLeft = 1;
  actor.ap = 0;
  actor.apSpent = 0;
}

export function isMonsterEconomy(actor) {
  return !!(actor && (actor.economy === "slots" || (actor.side === "enemy" && !actor.summon)));
}

/** Spend AP; never below 0. Returns false if cannot afford. */
export function spendAp(actor, cost) {
  const c = Math.max(0, cost | 0);
  if ((actor.ap | 0) < c) return false;
  actor.ap -= c;
  actor.apSpent = (actor.apSpent | 0) + c;
  return true;
}

export function canReact(actor) {
  if (!actor || actor.dead) return false;
  // Stun on monsters: no OA until Stun clears at end of their turn.
  if (isMonsterEconomy(actor) && actor.st && actor.st.stun) return false;
  if (isMonsterEconomy(actor)) return (actor.oaLeft | 0) > 0;
  if (hasWeaponEquipped(actor, "glaive") && !actor.glaiveFreeOaUsed) return true;
  // Light Armor: 1 free reaction until your next beginTurn (no window gate).
  if (actor.lightArmor && !actor.freeReactionUsed) return true;
  return (actor.ap | 0) > 0;
}

export function spendMonsterMove(actor) {
  if ((actor.moveLeft | 0) < 1) return false;
  actor.moveLeft = (actor.moveLeft | 0) - 1;
  return true;
}

export function spendMonsterAction(actor) {
  if ((actor.actionLeft | 0) < 1) return false;
  actor.actionLeft = (actor.actionLeft | 0) - 1;
  return true;
}

export function spendMonsterOa(actor) {
  if ((actor.oaLeft | 0) < 1) return false;
  actor.oaLeft = (actor.oaLeft | 0) - 1;
  return true;
}

/**
 * Light Armor free reaction: once until beginTurn resets freeReactionUsed.
 * Monsters spend the OA slot instead of AP.
 */
export function tryPayReaction(actor, opts = {}) {
  const cost = opts.forceCost != null ? opts.forceCost : 1;
  if (isMonsterEconomy(actor)) {
    if (!spendMonsterOa(actor)) return { ok: false, reason: "no-oa" };
    return { ok: true, apCost: 0, usedOa: true };
  }
  // Glaive: 1 free Opportunity Attack / round
  if (opts.asOa && hasWeaponEquipped(actor, "glaive") && !actor.glaiveFreeOaUsed) {
    actor.glaiveFreeOaUsed = true;
    return { ok: true, apCost: 0, usedGlaiveFree: true };
  }
  if (opts.lightFree && !actor.freeReactionUsed) {
    actor.freeReactionUsed = true;
    return { ok: true, apCost: 0, usedFree: true };
  }
  if (!spendAp(actor, cost)) return { ok: false, reason: "no-ap" };
  return { ok: true, apCost: cost, usedFree: false };
}

export function openReactionWindow(actor) {
  actor.reactionWindowOpen = true;
}

export function closeReactionWindow(actor) {
  actor.reactionWindowOpen = false;
  actor.freeReactionUsed = false;
}

/** Rushed: each attack after the first on your turn → +1 DISADV (attacks only). */
export function rushedDisadv(actor, opts = {}) {
  const n = actor.attacksThisTurn | 0;
  if (n <= 0) return 0;
  // Martial artist: ignore rushed penalty 1/fight
  if ((actor.rushIgnoreLeft | 0) > 0) {
    if (opts.consume) actor.rushIgnoreLeft = (actor.rushIgnoreLeft | 0) - 1;
    return 0;
  }
  return n;
}

export function noteAttack(actor) {
  actor.attacksThisTurn = (actor.attacksThisTurn | 0) + 1;
  if (actor.martialArtist && !actor.martialMoveUsedThisTurn) {
    actor.martialMoveReady = true;
  }
}

export function noteMoved(actor) {
  actor.movedThisTurn = true;
  actor.aimArmed = false;
}

/** Flat Stun: −1 AP this turn, then clear. */
export function applyStunApPenalty(actor) {
  if (!actor || !actor.st || !actor.st.stun) return false;
  actor.ap = Math.max(0, (actor.ap | 0) - 1);
  actor.st.stun = false;
  return true;
}

/**
 * First activation / encounter start: seed AP once.
 * Later turns: keep AP left after reactions (no refresh here).
 */
/** Tick ability cooldowns (e.g. not-consecutive gap between uses). */
export function tickAbilityCooldowns(actor) {
  if (!actor || !actor.abilityCooldown) return;
  const cd = actor.abilityCooldown;
  for (const id of Object.keys(cd)) {
    const n = cd[id] | 0;
    if (n <= 0) {
      delete cd[id];
      continue;
    }
    const next = n - 1;
    if (next <= 0) delete cd[id];
    else cd[id] = next;
  }
}

export function beginTurn(actor, opts = {}) {
  clearDefend(actor);
  actor.weaponmasterUsedThisTurn = false;
  closeReactionWindow(actor);
  tickAbilityCooldowns(actor);
  if (isMonsterEconomy(actor)) {
    refreshMonsterSlots(actor);
    // Stun: monsters skip their whole turn (no Move / Action / OA).
    // Stun / Disarm / Silence clear at endTurn. Stun keeps OA blocked until then;
    // Disarm/Silence do not gate canReact (OA basics still allowed).
    if (actor.st && actor.st.stun) {
      actor.moveLeft = 0;
      actor.actionLeft = 0;
      actor.oaLeft = 0;
      actor.moveBudget = 0;
      actor.stunnedSkipTurn = true;
    } else {
      actor.stunnedSkipTurn = false;
      const slowX = (actor.st && actor.st.slow) | 0;
      actor.moveBudget = Math.max(1, (actor.speed | 0) - slowX);
    }
  } else {
    // Carry AP from reaction pool; Dying gets a fresh 2 AP allotment at turn start.
    const cap = apMaxFor(actor);
    if ((actor.hp | 0) <= 0 || actor.down) {
      actor.ap = cap;
    } else if ((actor.ap | 0) > cap) {
      actor.ap = cap;
    }
    // Frontliner: next turn after becoming Bloodied → +1 AP (may exceed apMax once).
    if (actor.frontlinerApPending) {
      actor.ap = (actor.ap | 0) + 1;
      actor.frontlinerApPending = false;
      actor.frontlinerApGranted = true;
    }
    applyStunApPenalty(actor);
    // Speed pool for the turn; Slow X = −X Speed (min 1). First Move spends 1 AP to unlock.
    const slowX = (actor.st && actor.st.slow) | 0;
    actor.moveBudget = Math.max(1, (actor.speed | 0) - slowX);
    actor.moveUnlocked = false;
  }
  resetKitSwaps(actor);
  actor.kitPickedThisTurn = false;
  actor.elementPickedThisTurn = false;
  actor.shockProcThisTurn = false;
  actor.attacksThisTurn = 0;
  actor.openingUsedThisTurn = false;
  actor.movedThisTurn = false;
  actor.martialMoveReady = false;
  actor.martialMoveUsedThisTurn = false;
  actor.shadowDashUsedThisTurn = false;
  actor.magicShieldUsedThisTurn = false;
  actor.blessUsedThisTurn = false;
  // Legacy barkskinUntilTurn (pre-COMPLETE): clear only if not EOTF flag
  if (actor.barkskinUntilTurn && !actor.barkskinBleedImmune) {
    actor.barkskinUntilTurn = false;
    if (Array.isArray(actor.immuneStatuses)) {
      actor.immuneStatuses = actor.immuneStatuses.filter(
        (s) => String(s).toLowerCase() !== "bleed"
      );
    }
  } else if (actor.barkskinUntilTurn) {
    actor.barkskinUntilTurn = false;
  }
  // Grapple lasts until the start of the grappler's next turn, not the target's.
  releaseGrappleHold(actor, opts.actors);
  if (actor.st && actor.st.restrain && !actor.grappleLock) {
    actor.st.restrain = false;
    actor.grappleFocus = false;
  }
  // Guard lasts until start of your next turn
  if (actor.guardUp) {
    const b = actor._guardDefBonus != null ? actor._guardDefBonus | 0 : 1;
    if (actor.def) {
      for (const k of Object.keys(actor.def)) {
        actor.def[k] = (actor.def[k] | 0) - b;
      }
    }
    actor.guardUp = false;
    delete actor._guardDefBonus;
  }
  actor.aimUsedThisRound = actor.aimUsedThisRound || false;
  actor.tileUses = actor.tileUses || {};

  // Brace (Shield): refresh SHIELD to 2 (does not stack across turns)
  if (opts.braceShield !== false && hasShieldEquipped(actor)) {
    if (!actor.st) actor.st = {};
    actor.st.shield = 2;
  }

  // Quarterstaff Guard: +1 Stability while wielding
  if (actor.stabilityBase != null) {
    actor.stability = (actor.stabilityBase | 0) + (hasWeaponEquipped(actor, "quarterstaff") ? 1 : 0);
  }

  actor.flurryReady = false;
  // flurryUsedThisRound cleared on round rollover
  if (actor.side === "hero") actor.actedThisRound = true;

  // Gloom: DISADV X this turn, then stacks -= 1 (start of turn).
  tickGloomAtStartOfTurn(actor);

  // Toxic Cloud upcast slides first; then anyone already standing in a cloud pulses
  // before the Poison DoT tick, so stacks gained this pulse are included.
  if (opts.state) {
    const moved = moveUpcastClouds(opts.state, actor);
    const justPulsed =
      moved && moved.pulsedIds && moved.pulsedIds.indexOf(actor.id) >= 0;
    if (!justPulsed) pulseCloudsAtStart(opts.state, actor);
    noteTalent(opts.state, {
      kind: "turn",
      actorId: actor.id,
      side: actor.side,
      fear: !!(actor.st && actor.st.fearSource),
      poison: (actor.st && actor.st.poison) | 0,
      restrain: !!(actor.st && actor.st.restrain),
      grapple: !!(actor.grappleLock && actor.grappleLock.advVsTarget),
      vigilantReady: !!actor.vigilantMoveReady,
    });
  }

  if (opts.tickDots !== false) {
    tickStartOfTurnDots(actor, function (t, x) {
      applyDamage(t, x, { unpreventable: true, isDot: true, skipBleed: true });
    });
  }
  syncBloodiedShell(actor);
}

function hasShieldEquipped(actor) {
  return hasWeaponEquipped(actor, "shield");
}

function hasWeaponEquipped(actor, weaponId) {
  const parts = normalizeKitParts(
    actor.weaponOptions && actor.weaponOptions[actor.activeKit | 0]
  );
  return parts.indexOf(weaponId) >= 0;
}

/**
 * Grapple lock until the grappler's next turn.
 * T2: Adv 1 on attacks vs the grappler and vs the target.
 * T3: Adv 1 on attacks vs the target only.
 * Restrain itself stays on the gated status.
 */
export function applyGrappleLock(atk, tgt, tier, actors) {
  if (!atk || !tgt) return;
  if (atk.grappleHold && atk.grappleHold.targetId && atk.grappleHold.targetId !== tgt.id) {
    releaseGrappleHold(atk, actors);
  }
  atk.grappleHold = { targetId: tgt.id, advVsSelf: (tier | 0) === 2 };
  tgt.grappleLock = { byId: atk.id, advVsTarget: (tier | 0) >= 2 };
}

/** Drop a Grapple when the grappler's next turn starts. */
export function releaseGrappleHold(actor, actors) {
  const hold = actor && actor.grappleHold;
  if (!hold) return;
  actor.grappleHold = null;
  const tgt = (actors || []).find((a) => a && a.id === hold.targetId);
  if (!tgt || !tgt.grappleLock || tgt.grappleLock.byId !== actor.id) return;
  tgt.grappleLock = null;
  tgt.grappleFocus = false;
  if (tgt.st) tgt.st.restrain = false;
}

export { hasWeaponEquipped, hasShieldEquipped };

/** Reach used for OA triggers / OA strikes (Glaive → 2). */
export function oaRangeFor(actor) {
  if (hasWeaponEquipped(actor, "glaive")) return 2;
  return 1;
}

/** End of turn: AP resets to max, then reaction window opens. */
export function endTurn(actor) {
  if (!isMonsterEconomy(actor)) {
    refreshAp(actor);
  } else if (actor && actor.st) {
    // Monsters: Stun / Disarm / Silence drop at end of their turn.
    if (actor.st.stun) actor.st.stun = false;
    if (actor.st.disarm) actor.st.disarm = false;
    if (actor.st.silence) actor.st.silence = false;
    actor.stunnedSkipTurn = false;
  }
  openReactionWindow(actor);
}
