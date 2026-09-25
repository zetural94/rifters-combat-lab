/**
 * Lab reaction-window choices for Riposte and Hidden Bola.
 * Gates match tryRiposte / tryHiddenBola. The AI hook skips these when
 * askReactions is set, so the sandbox has to offer them itself.
 */
import { inRange } from "./grid.js";
import { tryHiddenBola, tryRiposte } from "./feats.js";

function attackRange(ability) {
  if (!ability || ability.range == null) return 1;
  return ability.range | 0;
}

/**
 * Clickable and explained-blocked mitigation reactions for the hero being hit.
 * One mitigation per incoming hit (same as the engine hook, which returns after the first).
 * Defend still stacks and is listed separately by the sandbox.
 */
export function listMitigationReactions(defender, attacker, ability, decl) {
  const out = [];
  if (!defender || defender.side !== "hero" || defender.dead || (defender.hp | 0) <= 0) {
    return out;
  }
  if (decl && decl.mitigationActorId) return out;

  const range = attackRange(ability);
  const melee = range <= 1;

  if (defender.hasRiposte && !(decl && decl.riposteUsed)) {
    const reduce = 5 * Math.max(0, defender.dex | 0);
    let reason = null;
    if (!melee) reason = "melee RANGE 1 only";
    else if (defender.riposteUsedThisRound) reason = "already used this round";
    else if ((defender.stress | 0) < 1) reason = "needs 1 stress";
    out.push({
      id: "riposte",
      ok: !reason,
      actorId: defender.id,
      reason,
      reduce,
      apCost: 0,
      stressCost: 1,
      freeAction: true,
    });
  }

  if (defender.hasHiddenBola && !(decl && decl.hiddenBolaUsed)) {
    const reduce = 5 * Math.max(0, defender.dex | 0);
    const free = !!(defender.lightArmor && !defender.freeReactionUsed);
    const kd = !!(attacker && (attacker.str | 0) <= (defender.dex | 0));
    let reason = null;
    if (!attacker || !inRange(defender, attacker, 3)) reason = "attacker beyond RANGE 3";
    else if ((defender.stress | 0) < 1) reason = "needs 1 stress";
    else if (!free && (defender.ap | 0) < 1) reason = "needs 1 AP or a free reaction";
    out.push({
      id: "hiddenBola",
      ok: !reason,
      actorId: defender.id,
      reason,
      reduce,
      apCost: free ? 0 : 1,
      stressCost: 1,
      freeAction: free,
      knockdown: kd,
    });
  }

  return out;
}

export function mitigationButtonLabel(defender, extra) {
  const name = defender && defender.name ? defender.name : "Hero";
  if (!extra) return name;
  if (extra.id === "riposte") {
    if (!extra.ok) return name + " · Riposte — " + (extra.reason || "unavailable");
    return name + " · Riposte (free · −1 stress · −" + (extra.reduce | 0) + ")";
  }
  if (!extra.ok) return name + " · Hidden Bola — " + (extra.reason || "unavailable");
  const pay = extra.freeAction ? "free reaction" : "−1 AP";
  const kd = extra.knockdown ? " · Knockdown" : "";
  return (
    name +
    " · Hidden Bola (" +
    pay +
    " · −1 stress · −" +
    (extra.reduce | 0) +
    kd +
    ")"
  );
}

/**
 * Spend the reaction the way the engine does, and bake the reduced raw into the declaration
 * so Accept resolves the mitigated hit (askReactions skips the auto hook).
 */
export function commitMitigationChoice(defender, attacker, ability, decl, id) {
  if (!defender || !decl) return { ok: false, reason: "no-decl" };
  if (decl.mitigationActorId) return { ok: false, reason: "already" };
  const raw = decl.baseRaw != null ? decl.baseRaw | 0 : decl.raw | 0;
  if (decl.baseRaw == null) decl.baseRaw = raw;
  const range = attackRange(ability);
  let result;
  if (id === "riposte") {
    result = tryRiposte(defender, raw, { ranged: range > 1, range });
  } else if (id === "hiddenBola") {
    result = tryHiddenBola(defender, attacker, raw, {});
  } else {
    return { ok: false, reason: "bad-id" };
  }
  if (!result || !result.ok) return result || { ok: false, reason: "fail" };
  decl.raw = result.raw | 0;
  decl.mitigationActorId = defender.id;
  if (id === "riposte") decl.riposteUsed = true;
  else {
    decl.hiddenBolaUsed = true;
    decl.hiddenBolaKnockdown = !!result.knockdown;
  }
  return result;
}

/** Interpose can retarget the hit. The reduction belongs to the hero who spent it. */
export function reconcileMitigationTarget(decl, targetId) {
  if (!decl || !decl.mitigationActorId || decl.baseRaw == null) return decl;
  if (decl.mitigationActorId !== targetId) {
    decl.raw = decl.baseRaw | 0;
    decl.riposteUsed = false;
  }
  return decl;
}

/**
 * Free weapon OA when Riposte was used and the hit dealt 0 HP
 * (same condition as resolveStrike's _riposteOaPending).
 */
export function riposteOfferFromResolution(decl, hero, foe, strikeResult) {
  if (!decl || !decl.riposteUsed) return null;
  if (!hero || !foe) return null;
  if (decl.mitigationActorId && decl.mitigationActorId !== hero.id) return null;
  if (hero.dead || (hero.hp | 0) <= 0 || foe.dead || (foe.hp | 0) <= 0) return null;
  const dmg = strikeResult && strikeResult.dmgResult;
  if (!dmg || (dmg.toHp | 0) !== 0) return null;
  if (!inRange(hero, foe, 1)) return null;
  return { heroId: hero.id, foeId: foe.id, kind: "riposte" };
}
