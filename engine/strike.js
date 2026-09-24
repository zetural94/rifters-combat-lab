/**
 * Resolve an ability Strike against one target (printed numbers only).
 */
import { powerRoll, helpRerollLowerDie, tierKey, resolveTierDmg } from "./powerRoll.js";
import { inRange, hasFlank, footprintKeys, footprintFree, actorSize } from "./grid.js";
import { applyDamage } from "./damage.js";
import { normalizeKitParts } from "./kits.js";
import {
  applyStatus,
  gatePass,
  fearDisadv,
  tauntDisadv,
  stressDisadv,
  woundDisadv,
  gloomDisadv,
  statusExtraApCost,
  cleanse,
  freshStatuses,
  isWeaponAttack,
  isMonsterSpecialAbility,
} from "./status.js";
import {
  spendAp,
  spendMonsterAction,
  isMonsterEconomy,
  rushedDisadv,
  noteAttack,
  tryPayReaction,
  canReact,
  hasWeaponEquipped,
  applyGrappleLock,
} from "./turn.js";
import { activateDefend } from "./damage.js";
import { applyPush, applyPull, applySlide, applyForcedMove } from "./forced.js";
import { cubeCellsIncluding, leaveTerrainHazards, cellKey } from "./terrain.js";
import { syncBloodiedShell } from "./actor.js";
import { consumeSpotterAttackBonus, spendMana, tryRiposte, tryHiddenBola, systemsBargainT1Damage } from "./feats.js";
import { paintToxicCloud } from "./clouds.js";

function isBloodied(actor) {
  return (actor.hp | 0) <= Math.floor((actor.hpMax | 0) / 2);
}

function targetHasVulnerable(target) {
  const v = target && target.vulnerable;
  if (!v || typeof v !== "object") return false;
  for (const k of Object.keys(v)) {
    if ((v[k] | 0) > 0) return true;
  }
  return false;
}

/** Peelable status burden (stack X, or binary ≈ 2 cleanse pts). */
function statusBurden(actor) {
  const st = actor && actor.st;
  if (!st) return 0;
  let v =
    (st.burn | 0) +
    (st.bleed | 0) +
    (st.poison | 0) +
    (st.shock | 0) +
    (st.intimidate | 0) +
    (st.unsteady | 0) +
    (st.slow | 0);
  if (st.fearSource) v += 2;
  if (st.tauntSource) v += 2;
  if (st.blind) v += 2;
  if (st.knockdown) v += 2;
  if (st.stun) v += 2;
  if (st.silence) v += 2;
  if (st.disarm) v += 2;
  return v;
}

function alliesInRange(atk, actors, range) {
  const r = range != null ? range | 0 : 5;
  const out = [];
  for (const a of actors || []) {
    if (!a || a === atk || a.side !== atk.side) continue;
    if (a.dead || (a.hp | 0) <= 0) continue;
    if (!inRange(atk, a, r)) continue;
    out.push(a);
  }
  return out;
}

/**
 * Support CATCH BREATH: ally spends 1 Recovery, heal higher of 2d10 + bonus.
 * No Reaction / AP cost for the ally (support rider).
 */
export function resolveSupportCatchBreath(ally, opts = {}) {
  if (!ally || ally.dead) return { ok: false, reason: "dead" };
  if ((ally.recoveries | 0) < 1) return { ok: false, reason: "no-recovery" };
  const rng = opts.rng || Math.random;
  let d1;
  let d2;
  let heal;
  if (opts.declared && opts.declared.d1 != null) {
    d1 = opts.declared.d1 | 0;
    d2 = opts.declared.d2 | 0;
    heal = Math.max(d1, d2) + (opts.bonus | 0);
  } else {
    d1 = 1 + Math.floor(rng() * 10);
    d2 = 1 + Math.floor(rng() * 10);
    heal = Math.max(d1, d2) + (opts.bonus | 0);
  }
  if (opts.dryRun) {
    return { ok: true, dryRun: true, d1, d2, heal, allyId: ally.id };
  }
  ally.recoveries = (ally.recoveries | 0) - 1;
  const before = ally.hp | 0;
  ally.hp = Math.min(ally.hpMax | 0, before + heal);
  if ((ally.hp | 0) > 0) ally.down = false;
  return { ok: true, heal, d1, d2, hp: ally.hp, before, allyId: ally.id, recoveries: ally.recoveries };
}

/**
 * Lab AI pick for Symbol support: Catch Breath on bloodied ally;
 * else Cleanse on highest-burden ally (when orCleanse is set).
 */
function pickSymbolSupport(atk, actors, ex, forcedAllyId) {
  const range = ex.range != null ? ex.range | 0 : 5;
  const allies = alliesInRange(atk, actors, range);
  // Symbol may target self (Catch Breath / Cleanse).
  if (!allies.some((a) => a === atk)) allies.push(atk);
  const orCleanse = ex.orCleanse != null ? ex.orCleanse | 0 : null;
  if (forcedAllyId) {
    const ally =
      allies.find((a) => a.id === forcedAllyId) ||
      (forcedAllyId === atk.id
        ? atk
        : (actors || []).find((a) => a && a.id === forcedAllyId));
    if (
      ally &&
      ally.side === atk.side &&
      !ally.dead &&
      (ally.hp | 0) > 0 &&
      (ally === atk || inRange(atk, ally, range))
    ) {
      if (orCleanse != null && statusBurden(ally) > 0) {
        return { mode: "cleanse", ally, points: orCleanse, forced: true };
      }
      return { mode: "catchBreath", ally, bonus: ex.x | 0, forced: true };
    }
  }
  const bloodied = allies
    .filter((a) => isBloodied(a) && (a.recoveries | 0) > 0)
    .sort((a, b) => (a.hp | 0) - (b.hp | 0));
  if (bloodied.length) {
    return { mode: "catchBreath", ally: bloodied[0], bonus: ex.x | 0 };
  }
  if (orCleanse != null && orCleanse > 0) {
    const burdened = allies
      .map((a) => ({ a, b: statusBurden(a) }))
      .filter((x) => x.b > 0)
      .sort((x, y) => y.b - x.b);
    if (burdened.length) {
      return { mode: "cleanse", ally: burdened[0].a, points: orCleanse };
    }
  }
  const withRec = allies.filter((a) => (a.recoveries | 0) > 0);
  if (withRec.length && (ex.x | 0) >= 0) {
    return { mode: "catchBreath", ally: withRec[0], bonus: ex.x | 0 };
  }
  return null;
}

function pickAllyCleanseTarget(atk, actors, ex, forcedAllyId) {
  const range = ex.range != null ? ex.range | 0 : 5;
  if (forcedAllyId) {
    if (forcedAllyId === atk.id) return atk;
    const ally =
      (actors || []).find((a) => a && a.id === forcedAllyId) || null;
    if (
      ally &&
      ally.side === atk.side &&
      !ally.dead &&
      (ally.hp | 0) > 0 &&
      inRange(atk, ally, range)
    ) {
      return ally;
    }
  }
  const allies = alliesInRange(atk, actors, range);
  const burdened = allies
    .map((a) => ({ a, b: statusBurden(a) }))
    .filter((x) => x.b > 0)
    .sort((x, y) => y.b - x.b);
  if (burdened.length) return burdened[0].a;
  if (statusBurden(atk) > 0 || ex.allowSelf !== false) return atk;
  return null;
}

function resolveForcedAlly(atk, actors, allyId, range) {
  if (!allyId) return null;
  if (allyId === atk.id) return atk;
  const ally = (actors || []).find((a) => a && a.id === allyId);
  if (!ally || ally.side !== atk.side || ally.dead || (ally.hp | 0) <= 0) return null;
  if (!inRange(atk, ally, range != null ? range | 0 : 5)) return null;
  return ally;
}

/** Prefer Slide into nearest map edge (Full Contact — wall collision). */
function slideTowardEdge(target, bounds) {
  if (!target || !bounds) return { dx: 0, dy: 0 };
  const x = target.x | 0;
  const y = target.y | 0;
  const left = x - bounds.minX;
  const right = bounds.maxX - x;
  const up = y - bounds.minY;
  const down = bounds.maxY - y;
  const m = Math.min(left, right, up, down);
  if (m === left) return { dx: -1, dy: 0 };
  if (m === right) return { dx: 1, dy: 0 };
  if (m === up) return { dx: 0, dy: -1 };
  return { dx: 0, dy: 1 };
}

function traitRequires(ability, actor, ctx) {
  const traits = ability.traits || [];
  for (const t of traits) {
    if (t.require && t.require.selfBloodied && !isBloodied(actor)) {
      return { ok: false, reason: "not-bloodied" };
    }
    if (t.require && t.require.heroTier3Seen) {
      const st = ctx && ctx.state;
      if (!(st && st.heroTier3Seen)) {
        return { ok: false, reason: "need-hero-t3" };
      }
    }
    if (t.id === "once-per-fight") {
      const max = Math.max(1, (t.x != null ? t.x : t.uses) | 0 || 1);
      const used = (actor.fightUsed && actor.fightUsed[ability.id]) | 0;
      if (used >= max) return { ok: false, reason: "fight-limit" };
    }
    if (t.id === "once-per-round") {
      if (actor.roundUsed && actor.roundUsed[ability.id]) {
        return { ok: false, reason: "round-limit" };
      }
    }
    if (t.id === "not-consecutive") {
      const cd = (actor.abilityCooldown && actor.abilityCooldown[ability.id]) | 0;
      if (cd > 0) return { ok: false, reason: "not-consecutive" };
    }
  }
  return { ok: true };
}

/** Walk toward target up to `spaces` Chebyshev steps (charge approach). */
function approachTarget(mover, target, spaces, actors, bounds) {
  const max = Math.max(0, spaces | 0);
  let moved = 0;
  const size = actorSize(mover);
  const occ = new Set();
  for (const a of actors || []) {
    if (!a || a === mover || a.dead || (a.hp | 0) <= 0) continue;
    for (const k of footprintKeys(a)) occ.add(k);
  }
  const selfKeys = new Set(footprintKeys(mover));
  for (let i = 0; i < max; i++) {
    if (inRange(mover, target, 1)) break;
    const dx = Math.sign((target.x | 0) - (mover.x | 0));
    const dy = Math.sign((target.y | 0) - (mover.y | 0));
    if (!dx && !dy) break;
    const nx = (mover.x | 0) + dx;
    const ny = (mover.y | 0) + dy;
    if (!footprintFree(nx, ny, size, occ, bounds, selfKeys)) break;
    mover.x = nx;
    mover.y = ny;
    // refresh self keys after move
    selfKeys.clear();
    for (const k of footprintKeys(mover)) selfKeys.add(k);
    moved += 1;
  }
  return moved;
}

function statOf(actor, name) {
  const k = String(name || "").toUpperCase();
  if (k === "STR") return actor.str | 0;
  if (k === "DEX") return actor.dex | 0;
  if (k === "INT") return actor.int | 0;
  return 0;
}

function pickTierEffect(ability, tier, mode) {
  const tiers = ability.tiers || {};
  if (mode === "flat") {
    const flat = tiers.flat || null;
    if (flat && flat._tierKey == null) flat._tierKey = "flat";
    return flat;
  }
  const key = tierKey(tier);
  const eff = tiers[key] || null;
  if (eff && eff._tierKey == null) eff._tierKey = key;
  return eff;
}

/** Active-kit Strike card (for WD / dmgType inheritance on talents). */
export function activeWeaponStrike(attacker, ctx = {}) {
  if (!attacker) return null;
  const byId =
    (ctx.state && ctx.state.abilityById) ||
    ctx.abilityById ||
    (ctx.actors && ctx.actors._abilityById) ||
    {};
  const parts = normalizeKitParts(
    attacker.weaponOptions && attacker.weaponOptions[attacker.activeKit | 0]
  );
  const ids = attacker.abilityIds || attacker.abilities || [];
  let fallback = null;
  for (const id of ids) {
    const ab = typeof id === "object" ? id : byId[id];
    if (!ab || !ab.weaponId) continue;
    if ((ab.traits || []).some((t) => t && t.id === "twinStrike")) continue;
    if (parts.length && parts.indexOf(ab.weaponId) < 0) continue;
    // Prefer basic Strike over named weapon extras
    if (/strike/i.test(ab.name || ab.id || "") && !/twin/i.test(ab.name || "")) {
      return ab;
    }
    if (!fallback) fallback = ab;
  }
  return fallback;
}

function weaponDmgBands(weaponAb) {
  if (!weaponAb || !weaponAb.tiers) return null;
  const out = {};
  for (const k of ["t1", "t2", "t3"]) {
    const t = weaponAb.tiers[k];
    if (t && t.dmg != null && t.dmg !== "WD" && t.dmg !== "2WD" && t.dmg !== "3WD") {
      out[k] = Number(t.dmg) || 0;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** maxTargets: number or "2+DEX" / { base, stat }. */
export function resolveMaxTargets(ability, attacker) {
  const mt = ability && ability.aoe && ability.aoe.maxTargets;
  if (mt == null) return null;
  if (typeof mt === "number") return Math.max(1, mt | 0);
  if (typeof mt === "string") {
    const m = /^(\d+)\s*\+\s*(STR|DEX|INT)$/i.exec(String(mt).trim());
    if (m) return Math.max(1, (m[1] | 0) + statOf(attacker, m[2]));
    const n = Number(mt);
    if (Number.isFinite(n)) return Math.max(1, n | 0);
  }
  if (typeof mt === "object" && mt) {
    return Math.max(1, (mt.base | 0) + statOf(attacker, mt.stat));
  }
  return Math.max(1, mt | 0);
}

/** Resolve tier printed dmg (WD / 2WD / +stat) using active kit when ability.useWeapon. */
export function resolveAbilityTierDamage(ability, tierOrEffect, attacker, ctx = {}) {
  let effect = null;
  if (tierOrEffect && typeof tierOrEffect === "object" && tierOrEffect.dmg != null) {
    effect = tierOrEffect;
    // Infer _tierKey when the caller passed a raw tiers.tN object.
    if (effect._tierKey == null && ability && ability.tiers) {
      for (const k of ["t1", "t2", "t3", "flat"]) {
        if (ability.tiers[k] === effect) {
          effect._tierKey = k;
          break;
        }
      }
    }
  } else {
    effect = pickTierEffect(ability, tierOrEffect | 0 || 1, "power");
  }
  if (!effect) return 0;
  let bands = null;
  if (ability && ability.useWeapon) {
    bands = weaponDmgBands(activeWeaponStrike(attacker, ctx));
  }
  return resolveTierDmg(effect, bands, attacker);
}

function statusesFrom(effect) {
  if (!effect || !effect.status) return [];
  return Array.isArray(effect.status) ? effect.status : [effect.status];
}

/** Resolve status.x + optional xStat / xStatMult from attacker. */
function resolveStatusSpec(st, attacker) {
  if (!st) return st;
  const out = Object.assign({}, st);
  let x = out.x | 0;
  if (out.xStat) {
    const mult = Math.max(1, (out.xStatMult | 0) || 1);
    x += (statOf(attacker, out.xStat) | 0) * mult;
  }
  out.x = x;
  return out;
}


function extrasFrom(effect) {
  if (!effect || !effect.extras) return [];
  return Array.isArray(effect.extras) ? effect.extras : [effect.extras];
}

/** Heroes always; monsters only Brute / Boss (or explicit canCrit). Flat attacks never roll crits. */
export function actorCanCrit(actor) {
  if (!actor) return false;
  if (actor.side === "hero") return true;
  if (actor.canCrit != null) return !!actor.canCrit;
  return /^(brute|boss)$/i.test(String(actor.monsterType || ""));
}

function onCritExtrasFrom(ability) {
  const out = [];
  const pushOne = (x) => {
    if (!x) return;
    if (Array.isArray(x)) for (const e of x) out.push(e);
    else out.push(x);
  };
  pushOne(ability && ability.onCrit);
  for (const t of (ability && ability.traits) || []) pushOne(t.onCrit);
  return out;
}

/**
 * Passive weapon traits for WD talents (Sharp etc.).
 * Numbers only from weapon.traits / weapon.onCrit — never weapon tier (t1/t2/t3) extras.
 */
function weaponPassiveAbility(attacker, ability, ctx = {}) {
  if (!ability || !ability.useWeapon || !attacker) return null;
  return activeWeaponStrike(attacker, ctx);
}

/** Sum onCritBonusDmg from ability traits + (if WD) active weapon passive traits. */
export function critPassiveBonusDmg(ability, attacker, ctx = {}) {
  let n = 0;
  const add = (traits) => {
    for (const t of traits || []) {
      if (t && t.onCritBonusDmg) n += t.onCritBonusDmg | 0;
    }
  };
  add(ability && ability.traits);
  if (ability && ability.onCritBonusDmg) n += ability.onCritBonusDmg | 0;
  const wab = weaponPassiveAbility(attacker, ability, ctx);
  if (wab && wab !== ability) {
    add(wab.traits);
    if (wab.onCritBonusDmg) n += wab.onCritBonusDmg | 0;
  }
  return n;
}

function onCritExtrasForStrike(ability, attacker, ctx = {}) {
  const out = onCritExtrasFrom(ability);
  const wab = weaponPassiveAbility(attacker, ability, ctx);
  if (wab && wab !== ability) {
    for (const ex of onCritExtrasFrom(wab)) out.push(ex);
  }
  return out;
}

/**
 * Monster card Crit line (Passive / Crit / OA).
 * Fires on a successful crit rider window — not part of the attack's T1–T3 text.
 * Example: { range: 2, status: { id: "burn", x: 3 } }
 */
function applyCardCrit(attacker, ctx) {
  const feat = attacker && attacker.crit;
  if (!feat || typeof feat !== "object") return [];
  const range = feat.range != null ? feat.range | 0 : null;
  if (range == null) return [];
  let statuses = statusesFrom(feat);
  if (!statuses.length && feat.id) statuses = [feat];
  if (!statuses.length) return [];
  const hits = [];
  for (const other of ctx.actors || []) {
    if (!other || other === attacker || other.side === attacker.side) continue;
    if (other.dead || (other.hp | 0) <= 0) continue;
    if (!inRange(attacker, other, range)) continue;
    const applied = [];
    for (const st of statuses) {
      if (applyStatus(other, st, { sourceId: attacker.id, sourceActor: attacker })) applied.push(st);
    }
    if (applied.length) hits.push({ id: other.id, statuses: applied });
  }
  return hits;
}

function tierFromTotal(total, shift = 0) {
  const t1 = 11 + (shift | 0);
  const t2 = 16 + (shift | 0);
  if (total <= t1) return 1;
  if (total <= t2) return 2;
  return 3;
}

/** Pick dmg type vs foe's lowest DEF (Enhance Weapon / elementPick-style). */
export function lowestDefDmgType(foe, fallback = "Physical") {
  if (!foe) return fallback;
  const TYPES = [
    "Physical",
    "Fire",
    "Air",
    "Water",
    "Earth",
    "Lightning",
    "Dark",
    "Light",
    "Toxic",
  ];
  return lowestDefDmgTypeAmong(foe, TYPES, fallback);
}

/** Lowest-DEF pick restricted to an explicit type list (e.g. Elemental Bolt E/F/L/W). */
export function lowestDefDmgTypeAmong(foe, types, fallback = "Physical") {
  if (!foe) return fallback;
  const list = types && types.length ? types : [fallback];
  const def = foe.def || {};
  let best = fallback;
  let bestDef = 99;
  for (const t of list) {
    const d = def[t] != null ? def[t] | 0 : 0;
    if (d < bestDef) {
      bestDef = d;
      best = t;
    }
  }
  return best;
}

/** Summon Elemental Bolt / Shield pick pool (card: Earth / Fire / Lightning / Water). */
export const ELEMENTAL_BOLT_TYPES = ["Earth", "Fire", "Lightning", "Water"];

/** Defend reaction before a hit lands (AI / auto policy). */
export function tryDefendReaction(target, opts = {}) {
  if (!target || target.defendUp) return { ok: false, reason: "already-up" };
  if (!canReact(target) && !target.lightArmor) return { ok: false, reason: "no-react" };
  const pay = tryPayReaction(target, {
    lightFree: !!target.lightArmor,
    forceCost: 1,
  });
  if (!pay.ok) return pay;
  const r = activateDefend(target);
  if (!r.ok) {
    // refund AP / free flag roughly
    if (pay.usedFree) target.freeReactionUsed = false;
    else if (!isMonsterEconomy(target)) target.ap = (target.ap | 0) + 1;
    return r;
  }
  return { ok: true, pay };
}

/** Ally within cast range who covers `tgt` and the most enemies in the blast. */
function resolveAllySource(atk, tgt, ctx, ab) {
  const actors = ctx.actors || [];
  if (ctx.sourceAllyId) {
    const picked = actors.find((a) => a && a.id === ctx.sourceAllyId);
    if (picked) return picked;
  }
  const range = ab.range != null ? ab.range | 0 : 3;
  const blast = (ab.aoe && ab.aoe.range != null ? ab.aoe.range : 3) | 0;
  const allies = actors.filter(
    (a) =>
      a &&
      a.side === atk.side &&
      !a.dead &&
      (a.hp | 0) > 0 &&
      (a === atk || inRange(atk, a, range))
  );
  let best = atk;
  let bestScore = -1;
  for (const al of allies.length ? allies : [atk]) {
    let n = 0;
    let covers = !tgt;
    for (const o of actors) {
      if (!o || o.side === atk.side || o.dead || (o.hp | 0) <= 0) continue;
      if (!inRange(al, o, blast)) continue;
      n += 1;
      if (tgt && o.id === tgt.id) covers = true;
    }
    const score = (covers ? 100 : 0) + n * 10 + (al !== atk ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = al;
    }
  }
  return best;
}

/**
 * @param {object} ctx
 */
export function resolveStrike(ctx) {
  const atk = ctx.attacker;
  const tgt = ctx.target;
  const ab = ctx.ability;
  const selfAoe =
    !!(ab && ab.selfAoe) ||
    !!(ab && /intimidating-shout|self-aoe/i.test(String(ab.id || ab.name || "")));
  if (!atk || !ab || (!selfAoe && !tgt)) return { ok: false, reason: "missing" };
  if (atk.dead || (atk.hp | 0) < 0) return { ok: false, reason: "attacker-down" };
  if (!selfAoe && (tgt.dead || tgt.alive === false)) return { ok: false, reason: "target-dead" };

  const req = traitRequires(ab, atk, ctx);
  if (!req.ok) return req;

  const range = ab.range != null ? ab.range | 0 : 1;
  const actorsField = ctx.actors || ctx.allies || [];
  // Shadowplay: choose an ally as the fear source. Blast is AoE around that ally,
  // not around the caster. Cast range is the range to the ally (self is always legal).
  let aoeOrigin = atk;
  if (ab.allySource && !selfAoe) {
    aoeOrigin = resolveAllySource(atk, tgt, ctx, ab);
    const blast = (ab.aoe && ab.aoe.range != null ? ab.aoe.range : 3) | 0;
    const sourceOk =
      aoeOrigin &&
      aoeOrigin.side === atk.side &&
      !aoeOrigin.dead &&
      (aoeOrigin.hp | 0) > 0 &&
      (aoeOrigin === atk || inRange(atk, aoeOrigin, range));
    const tgtOk = !tgt || (aoeOrigin && inRange(aoeOrigin, tgt, blast));
    if (!sourceOk || !tgtOk) return { ok: false, reason: "out-of-range" };
    ctx._aoeOrigin = aoeOrigin;
    ctx._fearSourceId = aoeOrigin.id;
  } else if (!selfAoe) {
    const inReach = atk.hordeStackId
      ? actorsField.some(
          (m) =>
            m &&
            m.hordeStackId === atk.hordeStackId &&
            !m.dead &&
            (m.hp | 0) > 0 &&
            inRange(m, tgt, range)
        )
      : inRange(atk, tgt, range);
    if (!inReach) return { ok: false, reason: "out-of-range" };
    // Stealth: cannot be chosen as single-target beyond Range 2 (AoE fan-out still hits).
    const isAoeAbility =
      !!(ab.aoe && (ab.aoe.range != null || ab.aoe.shape || ab.aoe.size != null)) ||
      ab.aoeMode === "all";
    if (
      !isAoeAbility &&
      tgt &&
      tgt.stealthed &&
      !inRange(atk, tgt, 2)
    ) {
      return { ok: false, reason: "stealthed" };
    }
  }

  const monster = isMonsterEconomy(atk);
  const isFlurry = !!ctx.flurry;
  const isTwin = !!(ab.traits || []).some((t) => t.id === "twinStrike") && !ctx.twinHalf;
  const baseCost = isFlurry ? 0 : ab.costAp | 0;
  const statusExtra = monster || isFlurry ? 0 : statusExtraApCost(atk, ab);
  const cost = baseCost + statusExtra;
  // Disarm / Silence on monsters: hard-block specials (Charge / Howl / AoE …).
  // Basics stay legal. (Adrian lock 2026-09-24: Silence mirrors Disarm on slot economy.)
  if (
    monster &&
    atk.st &&
    (atk.st.disarm || atk.st.silence) &&
    isMonsterSpecialAbility(ab) &&
    !ctx.asReaction &&
    !ctx.skipAp
  ) {
    return { ok: false, reason: atk.st.disarm ? "disarmed" : "silenced" };
  }
  if (!ctx.skipAp && !ctx.dryRun) {
    if (ctx.asReaction) {
      const pay = tryPayReaction(atk, {
        lightFree: !!atk.lightArmor,
        forceCost: monster ? 1 : Math.max(1, cost || 1),
        asOa: !!ctx.asOa,
      });
      if (!pay.ok) return { ok: false, reason: pay.reason || "no-ap" };
    } else if (monster) {
      if (!spendMonsterAction(atk)) return { ok: false, reason: "no-action" };
    } else if (isFlurry) {
      if (!atk.flurryReady || atk.flurryUsedThisRound) {
        return { ok: false, reason: "no-flurry" };
      }
    } else if (cost > 0 && !spendAp(atk, cost)) {
      return { ok: false, reason: "no-ap" };
    }
  }

  const stressCost = ab.costStress != null ? ab.costStress | 0 : ab.stressCost | 0;
  const optStressNeed =
    (ab.optionalStressAdv | 0) > 0 && ctx.spendStressAdv ? ab.optionalStressAdv | 0 : 0;
  if (
    !ctx.skipAp &&
    !ctx.dryRun &&
    (!monster || atk.summon) &&
    (stressCost > 0 || optStressNeed > 0)
  ) {
    const totalStress = stressCost + optStressNeed;
    if ((atk.stress | 0) < totalStress) return { ok: false, reason: "no-stress" };
    atk.stress = (atk.stress | 0) - totalStress;
  }
  let manaCost = ab.costMana != null ? ab.costMana | 0 : ab.manaCost | 0;
  if (ctx.upcast && (ab.upcastMana | 0) > 0) manaCost += ab.upcastMana | 0;
  if (!ctx.skipAp && !ctx.dryRun && !monster && manaCost > 0) {
    const pay = spendMana(atk, manaCost);
    if (!pay.ok) return { ok: false, reason: "no-mana" };
  }

  const isAttack = ab.isAttack !== false;
  let adv = (ctx.extraAdv | 0) + ((ctx.pack && ctx.pack.adv) || 0);
  let disadv = ctx.extraDisadv | 0;
  let courageFearIgnore = 0;
  let openingBreak = 0;
  const modNotes = [];
  const pushMod = (sign, n, src) => {
    const v = n | 0;
    if (!v) return;
    modNotes.push({ sign, n: v, src: src || "?" });
  };
  if ((ctx.extraAdv | 0) > 0) pushMod("+", ctx.extraAdv, "extra Adv");
  if ((ctx.pack && ctx.pack.adv) | 0) pushMod("+", ctx.pack.adv, "Pack Hunter");
  if ((ctx.extraDisadv | 0) > 0) pushMod("−", ctx.extraDisadv, "extra Disadv");
  // Opening buffs the next attack — including OA / reaction strikes.
  const opening = isAttack && atk.nextAttack ? atk.nextAttack : null;
  if (opening && !opening._needsPick) {
    if ((opening.adv | 0) > 0) {
      adv += opening.adv | 0;
      pushMod("+", opening.adv, "Opening");
    }
    if ((opening.disadv | 0) > 0) {
      disadv += opening.disadv | 0;
      pushMod("−", opening.disadv, "Opening");
    }
    openingBreak = opening.break | 0;
  }
  // Twin Strike: neither half is rushed (skipRushed on halves)
  if (isAttack && !ctx.asReaction && !ctx.skipRushed && !isTwin) {
    const rush = rushedDisadv(atk, { consume: !ctx.dryRun });
    if (rush > 0) {
      disadv += rush;
      pushMod("−", rush, "Rushed");
    }
  }
  if (isFlurry) {
    const before = disadv | 0;
    disadv = Math.max(disadv, 1);
    if ((disadv | 0) > before) pushMod("−", (disadv | 0) - before, "Flurry");
  }
  if (isAttack) {
    const field = ctx.actors || ctx.allies || [];
    atk._courageFearIgnore = false;
    const fear = fearDisadv(atk, tgt, field);
    if (atk._courageFearIgnore) courageFearIgnore = 1;
    atk._courageFearIgnore = false;
    if (fear > 0) {
      disadv += fear;
      pushMod("−", fear, "Fear");
    }
    const taunt = tauntDisadv(atk, tgt);
    if (taunt > 0) {
      disadv += taunt;
      pushMod("−", taunt, "Taunt");
    }
    const stressD = stressDisadv(atk);
    if (stressD > 0) {
      disadv += stressD;
      pushMod("−", stressD, "0 Stress");
    }
    const woundD = woundDisadv(atk);
    if (woundD > 0) {
      disadv += woundD;
      pushMod("−", woundD, "Wound");
    }
    const gloomD = gloomDisadv(atk);
    if (gloomD > 0) {
      disadv += gloomD;
      pushMod("−", gloomD, "Gloom");
    }
  }

  // Twin Strike: two rolls, one DEF application on combined damage
  if (isTwin) {
    const halfCtx = Object.assign({}, ctx, {
      skipAp: true,
      skipRushed: true,
      twinHalf: true,
      flurry: false,
      extraAdv: adv,
      extraDisadv: disadv,
      pack: null, // already folded into adv
      strikeModsPrecomputed: true,
    });
    if (ctx.dryRun) {
      const r1 = resolveStrikeHalf(halfCtx);
      const r2 = resolveStrikeHalf(halfCtx);
      if (!r1.ok) return r1;
      if (!r2.ok) return r2;
      let raw = (r1.raw | 0) + (r2.raw | 0);
      const intimidateX = (atk.st && atk.st.intimidate) | 0;
      let consumeIntimidate = false;
      if (intimidateX > 0 && raw > 0) {
        raw = Math.max(0, raw - intimidateX);
        consumeIntimidate = true;
      }
      const breakX = Math.max(r1.breakX | 0, r2.breakX | 0) + (openingBreak | 0);
      const dmgType = r1.dmgType || ab.dmgType || "Physical";
      const statuses = [].concat(r1.statuses || [], r2.statuses || []);
      const effect = {
        dmg: raw,
        dmgType,
        break: breakX,
        status: statuses,
        text: "Twin Strike",
      };
      return {
        ok: true,
        dryRun: true,
        twin: true,
        abilityId: ab.id,
        abilityName: ab.name,
        rolls: [r1.roll, r2.roll],
        roll: r1.roll,
        tier: Math.max(r1.roll.tier | 0, r2.roll.tier | 0),
        raw,
        dmgType,
        breakX,
        statuses,
        disadv: disadv | 0,
        adv: adv | 0,
        rollStat: (ab.roll && ab.roll.stat) || "DEX",
        rollStatValue: statOf(atk, (ab.roll && ab.roll.stat) || "DEX"),
        apCost: cost,
        declaration: {
          abilityId: ab.id,
          targetId: tgt.id,
          twin: true,
          rolls: [r1.roll, r2.roll],
          roll: r1.roll,
          tier: Math.max(r1.roll.tier | 0, r2.roll.tier | 0),
          raw,
          consumeIntimidate,
          dmgType,
          breakX,
          openingBreak: openingBreak | 0,
          statuses,
          effect,
          effectText: "Twin Strike",
          crit: !!(r1.roll && r1.roll.isCrit) || !!(r2.roll && r2.roll.isCrit),
          critRiders: !!(r1.critRiders || r2.critRiders),
          usedAim: false,
          mode: "power",
          rollStatValue: statOf(atk, (ab.roll && ab.roll.stat) || "DEX"),
          adv: adv | 0,
          disadv: disadv | 0,
          critX: 0,
        },
      };
    }
    return resolveTwinStrike(halfCtx, { cost, monster, openingBreak, opening });
  }

  // Ranged attack while in enemy RANGE 1 → OA (before the shot resolves).
  // Charges with approach are melee closures — not ranged OA.
  // dryRun / deferOa: collect candidates only — never apply OA damage (sandbox UI reacts first).
  const oaEvents = [];
  const pendingOas = [];
  const isRanged = abilityTriggersRangedOa(ab);
  if (isRanged && !ctx.asReaction && !ctx.skipRangedOa && !ctx.declared) {
    const allow =
      ctx.oaAllowIds == null
        ? null
        : new Set((ctx.oaAllowIds || []).map((id) => String(id)));
    const meleeThreats = (ctx.actors || []).filter(
      (e) =>
        e &&
        e !== atk &&
        e.side !== atk.side &&
        !e.dead &&
        e.alive !== false &&
        (e.hp | 0) > 0 &&
        inRange(atk, e, 1) &&
        (allow == null || allow.has(e.id))
    );
    for (const enemy of meleeThreats) {
      if (!canReact(enemy) && !enemy.lightArmor) continue;
      const rab =
        typeof ctx.getReactionAbility === "function" ? ctx.getReactionAbility(enemy) : null;
      if (!rab) continue;
      if (ctx.dryRun || ctx.deferOa) {
        pendingOas.push({
          fromId: enemy.id,
          toId: atk.id,
          abilityId: rab.id,
          stackKey: enemy.hordeStackId || enemy.id,
        });
        continue;
      }
      const hit = resolveStrike({
        attacker: enemy,
        target: atk,
        ability: rab,
        rng: ctx.rng,
        asReaction: true,
        asOa: true,
        // Heroes: baseline OA Adv 1; Vigilant adds +1 more (match move.js / applyOpportunityAttack)
        extraAdv:
          (isMonsterEconomy(enemy) ? 0 : 1) +
          (enemy.vigilant && !isMonsterEconomy(enemy) ? 1 : 0),
        allies: (ctx.actors || []).filter((a) => a.side === enemy.side),
        actors: ctx.actors || [],
        skipRangedOa: true,
        state: ctx.state,
      });
      if (hit && hit.ok && enemy.vigilant) enemy.vigilantMoveReady = true;
      oaEvents.push({ from: enemy.id, result: hit });
      if (atk.dead || (atk.hp | 0) <= 0) {
        return { ok: false, reason: "oa-down", oaEvents, pendingOas };
      }
    }
  }

  // Aim (Shortbow): opt-in — Aim action arms it, or strike.useAim. 1/round, no Move this turn.
  let usedAim = false;
  if (
    !ctx.declared &&
    isAttack &&
    !ctx.asReaction &&
    ab.weaponId === "shortbow" &&
    !atk.movedThisTurn &&
    !atk.aimUsedThisRound &&
    (ctx.useAim || atk.aimArmed)
  ) {
    adv += 1;
    if (!ctx.dryRun) {
      atk.aimUsedThisRound = true;
      atk.aimArmed = false;
    }
    usedAim = true;
    pushMod("+", 1, "Aim");
  }

  const mayCrit = actorCanCrit(atk);
  let critX = ctx.critX | 0;
  if (opening && !opening._needsPick) critX += opening.critX | 0;
  if (mayCrit && isAttack && tgt && hasFlank(atk, ctx.allies || [], tgt)) critX += 1;

  for (const t of ab.traits || []) {
    if (t.id === "crit" && t.x) critX += t.x | 0;
  }
  if (mayCrit && atk.passiveCritX) critX += atk.passiveCritX | 0;

  // Ability-printed Adv (Precise Strike etc.)
  if ((ab.adv | 0) > 0) {
    adv += ab.adv | 0;
    pushMod("+", ab.adv, ab.name || "ability");
  }
  if ((ab.extraAdv | 0) > 0) {
    adv += ab.extraAdv | 0;
    pushMod("+", ab.extraAdv, "extra");
  }
  // Optional stress boost: "1 stress: Adv 1" (Heavy Swing / Pin Shot / Uppercut)
  if ((ab.optionalStressAdv | 0) > 0 && ctx.spendStressAdv) {
    adv += 1;
    pushMod("+", 1, "stress Adv");
  }
  // Hunter's Knowledge: Adv 1 vs asked-about enemy
  if (atk.huntersMarkId && tgt && atk.huntersMarkId === tgt.id) {
    adv += 1;
    pushMod("+", 1, "Hunter's Knowledge");
  }
  // Primal Instinct: Adv 1 while Bloodied
  let primalInstinctAdv = 0;
  if (
    atk.primalInstinct &&
    (atk.hp | 0) <= Math.floor((atk.hpMax | 0) / 2)
  ) {
    adv += 1;
    primalInstinctAdv = 1;
    pushMod("+", 1, "Primal Instinct");
  }
  // Grapple: T2/T3 Adv 1 vs the locked target; T2 also Adv 1 vs the grappler.
  if (isAttack && tgt && tgt.grappleLock && tgt.grappleLock.advVsTarget) {
    adv += 1;
    pushMod("+", 1, "Grapple");
  }
  if (isAttack && tgt && tgt.grappleHold && tgt.grappleHold.advVsSelf) {
    adv += 1;
    pushMod("+", 1, "Grapple");
  }
  // Shadowplay: Adv 1 vs feared
  if (isAttack && atk.shadowplayFearAdv && tgt && tgt.st && tgt.st.fearSource) {
    adv += 1;
    pushMod("+", 1, "Shadowplay");
  }

  // Spotter Mark: ally BREAK 2 this round; marker Crit 1 next ranged
  const spotter = isAttack
    ? consumeSpotterAttackBonus(atk, tgt, {
        dryRun: !!ctx.dryRun,
        round: ctx.round != null ? ctx.round : undefined,
        range: ab.range | 0,
        ranged: (ab.range | 0) >= 3,
        isAttack,
        asReaction: !!ctx.asReaction,
      })
    : { breakBonus: 0, critBonus: 0 };
  if (mayCrit) critX += spotter.critBonus | 0;
  // Shadow Dash: Adv 1 on next melee this turn
  if (isAttack && atk.shadowDashMeleeAdv && (ab.range | 0) <= 1) {
    adv += 1;
    pushMod("+", 1, "Shadow Dash");
    if (!ctx.dryRun) atk.shadowDashMeleeAdv = false;
  }
  // Stealth: Crit 1 on first melee from hide; break stealth on any attack
  if (isAttack && atk.stealthCritPending && mayCrit && (ab.range | 0) <= 1) {
    critX += 1;
  }
  if (!ctx.dryRun && isAttack && (atk.stealthed || atk.stealthCritPending)) {
    atk.stealthed = false;
    atk.stealthCritPending = false;
  }
  if (!mayCrit) critX = 0;

  const blinded = !!(atk.st && atk.st.blind);
  const mode = (ab.roll && ab.roll.mode) || "power";
  let roll = null;
  let tier = 1;
  let effect;
  let critRiders = false;
  let critBlockedBySteel = false;
  let rollCritX = 0;

  if (ctx.declared && ctx.declared.effect) {
    roll = ctx.declared.roll || null;
    tier = ctx.declared.tier != null ? ctx.declared.tier : 1;
    effect = ctx.declared.effect;
    critRiders = !!ctx.declared.critRiders;
    critBlockedBySteel = !!ctx.declared.critBlockedBySteel;
    usedAim = !!ctx.declared.usedAim;
    if (usedAim) {
      atk.aimUsedThisRound = true;
      atk.aimArmed = false;
    }
    if (critBlockedBySteel && tgt && tgt.st) tgt.st.cannotBeCrit = false;
  } else if (mode === "flat") {
    effect = pickTierEffect(ab, 1, "flat");
    tier = 0;
  } else {
    const statName = (ab.roll && ab.roll.stat) || "STR";
    rollCritX = blinded || !mayCrit ? 0 : critX;
    const thrShift = atk.systemsBargain ? -1 : 0;
    roll = powerRoll({
      rng: ctx.rng,
      statValue: statOf(atk, statName),
      adv,
      disadv,
      critX: rollCritX,
      thresholdShift: thrShift,
    });
    // Bless: spend one reroll token on T1 (smoke auto)
    if (
      !ctx.dryRun &&
      (atk.blessReroll | 0) > 0 &&
      roll &&
      (roll.tier | 0) <= 1
    ) {
      atk.blessReroll = (atk.blessReroll | 0) - 1;
      roll = helpRerollLowerDie(roll, {
        rng: ctx.rng,
        statValue: statOf(atk, statName),
        adv,
        disadv,
        critX: rollCritX,
        thresholdShift: thrShift,
      });
    }
    let helpInfo = null;
    if (ctx.helpHelper && typeof ctx.helpHelper === "object") {
      const hr = resolveHelp(ctx.helpHelper);
      if (hr.ok) {
        const before = { d1: roll.d1, d2: roll.d2, natural: roll.natural, tier: roll.tier };
        roll = helpRerollLowerDie(roll, {
          rng: ctx.rng,
          statValue: statOf(atk, statName),
          adv,
          disadv,
          critX: rollCritX,
          thresholdShift: thrShift,
        });
        helpInfo = { helperId: ctx.helpHelper.id, before, after: { d1: roll.d1, d2: roll.d2, natural: roll.natural, tier: roll.tier } };
      }
    }
    // Standard / Horde: no crit — use total tier only (nat 19–20 does not force T3).
    if (roll.isCrit && !mayCrit) {
      const t = tierFromTotal(roll.total, thrShift);
      roll = Object.assign({}, roll, { isCrit: false, tier: t });
    }
    if (helpInfo) roll = Object.assign({}, roll, { help: helpInfo });
    tier = roll.tier;
    if (blinded) {
      if (roll.isCrit) {
        roll = Object.assign({}, roll, { isCrit: false });
      }
      if (tier > 2) tier = 2;
      roll = Object.assign({}, roll, { tier: tier });
    }
    // Steel Yourself: T3 from nat still lands; onCrit riders do not.
    // (consume cannotBeCrit only on commit — not during dryRun declare)
    if (roll.isCrit) {
      if (tgt && tgt.st && tgt.st.cannotBeCrit) {
        critRiders = false;
        critBlockedBySteel = true;
        if (!ctx.dryRun) tgt.st.cannotBeCrit = false;
      } else {
        critRiders = true;
      }
    }
    effect = pickTierEffect(ab, tier, "power");
    // System's Bargain: a T1 costs 3 × YOUR TIER unpreventable.
    if (!ctx.dryRun && atk.systemsBargain && tier === 1) {
      applyDamage(atk, systemsBargainT1Damage(atk), {
        unpreventable: true,
        skipBleed: true,
        actors: ctx.actors || actorsField,
      });
    }
  }

  if (!effect) return { ok: false, reason: "no-tier-effect", roll, oaEvents };

  // WD talents: pull type from active kit Strike (dmg via resolveAbilityTierDamage)
  let weaponDmgType = null;
  if (ab.useWeapon) {
    const wab = activeWeaponStrike(atk, ctx);
    if (wab) {
      const wt = pickTierEffect(wab, Math.max(1, tier | 0) || 1, "power");
      weaponDmgType = (wt && wt.dmgType) || wab.dmgType || null;
    }
  }

  // Charge / approach: move toward target before the hit (same Action)
  let approached = 0;
  const wantsApproach = extrasFrom(effect).some(
    (ex) => ex && (ex.id === "approach" || ex.id === "chargeMove")
  );
  if (wantsApproach && !ctx.declared) {
    const ax = extrasFrom(effect).find((ex) => ex && (ex.id === "approach" || ex.id === "chargeMove"));
    approached = approachTarget(atk, tgt, (ax && ax.x) | 0, ctx.actors, ctx.bounds);
    if (!inRange(atk, tgt, 1)) {
      return { ok: false, reason: "charge-blocked", approached, roll };
    }
  }

  let raw = resolveAbilityTierDamage(ab, effect, atk, ctx);
  if (ctx.pack && ctx.pack.bonusDmg) raw += ctx.pack.bonusDmg | 0;
  if (isAttack && (atk.enhanceWeaponBonus | 0) > 0) raw += atk.enhanceWeaponBonus | 0;
  if (opening && !opening._needsPick && (opening.bonusDmg | 0) > 0) {
    raw += opening.bonusDmg | 0;
  }
  if (critRiders) {
    raw += critPassiveBonusDmg(ab, atk, ctx);
  }
  // Intimidate X: your next *damaging* attack deals −X, then clears.
  // Status-only attacks (printed raw 0, e.g. Menacing Glare Fear) do not consume it.
  const intimidateX = (atk.st && atk.st.intimidate) | 0;
  let consumeIntimidate = false;
  if (ctx.declared && ctx.declared.raw != null) {
    raw = ctx.declared.raw | 0;
    consumeIntimidate = !!ctx.declared.consumeIntimidate;
  } else if (intimidateX > 0 && raw > 0) {
    raw = Math.max(0, raw - intimidateX);
    consumeIntimidate = true;
  }

  // Defend after we know printed raw — big hits defend more often
  let defendReact = null;
  if (
    !selfAoe &&
    !ctx.dryRun &&
    !ctx.asReaction &&
    typeof ctx.maybeDefend === "function" &&
    tgt &&
    !tgt.defendUp
  ) {
    defendReact = ctx.maybeDefend(tgt, {
      attacker: atk,
      ability: ab,
      raw,
      tier,
      roll,
    });
  }

  let dmgType = effect.dmgType || ab.dmgType || "Physical";
  if (weaponDmgType) dmgType = weaponDmgType;
  // Enhance Weapon: type = element/type with lowest DEF on the struck target
  if (isAttack && (atk.enhanceWeaponBonus | 0) > 0 && tgt) {
    dmgType = lowestDefDmgType(tgt, atk.enhanceWeaponType || dmgType);
  } else if (atk.enhanceWeaponType && isAttack) {
    dmgType = atk.enhanceWeaponType;
  }
  // elementPick attacks: type = foe lowest DEF (Enhance Weapon canon).
  // Summon Elemental Bolt restricted to Earth/Fire/Lightning/Water; spear etc. = full pool.
  // Player/AI override (ctx.dmgTypeOverride) still wins when provided.
  const hasElementPick = (ab.traits || []).some((t) => t && t.id === "elementPick");
  if (isAttack && tgt && hasElementPick) {
    if (ctx.dmgTypeOverride) {
      dmgType = ctx.dmgTypeOverride;
    } else if (ab.id === "summon-elemental-strike") {
      dmgType = lowestDefDmgTypeAmong(tgt, ELEMENTAL_BOLT_TYPES, dmgType);
    } else {
      dmgType = lowestDefDmgType(tgt, dmgType);
    }
    if (!ctx.dryRun) atk.elementPickedThisTurn = true;
  } else if (ctx.dmgTypeOverride) {
    dmgType = ctx.dmgTypeOverride;
    if (!ctx.dryRun && hasElementPick) atk.elementPickedThisTurn = true;
  }
  const feralBreak =
    atk.feralActive || atk.feralBreak ? Math.max(0, atk.str | 0) + 1 : 0;
  const breakX =
    (effect.break | 0) +
    (effect.breakStat ? statOf(atk, effect.breakStat) | 0 : 0) +
    (openingBreak | 0) +
    (spotter.breakBonus | 0) +
    feralBreak;

  // Collect AoE targets (blast around caster, ally source, or cube including primary target)
  const aoe = ab.aoe || {};
  if (ctx._aoeOrigin) aoeOrigin = ctx._aoeOrigin;
  const aoeShape = aoe.shape || (aoe.range != null || aoe.size != null || effect.aoeRange != null ? (aoe.shape || "blast") : null);
  // Tier may shrink AoE (Intimidating Shout Range 1/2/3 by tier).
  const aoeR =
    aoeShape === "cube"
      ? null
      : effect.aoeRange != null
        ? effect.aoeRange | 0
        : aoe.range != null
          ? aoe.range | 0
          : null;
  const aoeSize = aoeShape === "cube" ? Math.max(1, aoe.size | 0 || 2) : null;
  const aoeMode =
    selfAoe
      ? "all"
      : aoeShape != null || aoeR != null
        ? effect.aoeMode || (tier >= 2 ? "all" : "one")
        : null;
  let aoeCells = null;
  if (aoeShape === "cube") {
    aoeCells = cubeCellsIncluding(tgt || atk, aoeSize, ctx.bounds);
  }
  const aoeCellSet = aoeCells
    ? new Set(aoeCells.map((c) => cellKey(c.x, c.y)))
    : null;
  const aoeTargetIds = [];
  if (aoeMode === "all" && Array.isArray(ctx.actors)) {
    for (const other of ctx.actors) {
      if (!other || (!selfAoe && other === tgt) || other.side === atk.side) continue;
      if (other.dead || (other.hp | 0) <= 0) continue;
      if (aoeShape === "cube") {
        if (!aoeCellSet.has(cellKey(other.x, other.y))) continue;
      } else if (aoeR != null) {
        if (!inRange(aoeOrigin, other, aoeR)) continue;
      } else continue;
      aoeTargetIds.push(other.id);
    }
  }

  if (ctx.dryRun) {
    const supportPreview = [];
    for (const ex of extrasFrom(effect)) {
      if (!ex || !ex.id) continue;
      if (ex.id === "allyCatchBreath") {
        const pick = pickSymbolSupport(atk, ctx.actors || [], ex);
        if (pick) {
          supportPreview.push({
            id: pick.mode === "cleanse" ? "allyCleanse" : "allyCatchBreath",
            allyId: pick.ally.id,
            bonus: pick.bonus,
            points: pick.points,
          });
        }
      } else if (ex.id === "allyCleanse" || ex.id === "selfCleanse") {
        const ally =
          ex.id === "selfCleanse"
            ? atk
            : pickAllyCleanseTarget(atk, ctx.actors || [], ex);
        if (ally) {
          supportPreview.push({
            id: ex.id,
            allyId: ally.id,
            points: ex.x | 0,
            self: ally === atk,
          });
        }
      } else if (ex.id === "slowOrAllyCleanse") {
        supportPreview.push({ id: "slowOrAllyCleanse", note: "choose Slow or Cleanse" });
      }
    }
    const allStatuses = statusesFrom(effect).map((st) => resolveStatusSpec(st, atk));
    const statusesOk = [];
    const statusesBlocked = [];
    for (const st of allStatuses) {
      if (
        !selfAoe &&
        st &&
        st.gate &&
        tgt &&
        !gatePass(tgt, st.gate, { vsActor: atk })
      )
        statusesBlocked.push(st);
      else statusesOk.push(st);
    }
    return {
      ok: true,
      dryRun: true,
      abilityId: ab.id,
      abilityName: ab.name,
      roll,
      tier,
      raw,
      dmgType,
      breakX,
      statuses: statusesOk,
      statusesBlocked,
      extras: extrasFrom(effect),
      supportPreview,
      aoeR,
      aoeMode,
      aoeTargetIds,
      effectText: effect.text || "",
      oaEvents,
      pendingOas,
      approached,
      crit: !!(roll && roll.isCrit),
      critRiders,
      critBlockedBySteel,
      disadv,
      adv,
      courageFearIgnore,
      modNotes: modNotes.slice(),
      rollStat: (ab.roll && ab.roll.stat) || "STR",
      rollStatValue: mode === "flat" ? 0 : statOf(atk, (ab.roll && ab.roll.stat) || "STR"),
      apCost: cost,
      declaration: {
        abilityId: ab.id,
        targetId: tgt ? tgt.id : null,
        selfAoe,
        roll,
        tier,
        raw,
        consumeIntimidate,
        dmgType,
        breakX,
        openingBreak,
        statuses: statusesOk,
        statusesBlocked,
        aoeR,
        aoeMode,
        aoeTargetIds,
        effectText: effect.text || "",
        crit: !!(roll && roll.isCrit),
        critRiders,
        critBlockedBySteel,
        usedAim: !!usedAim,
        mode,
        effect,
        rollStat: (ab.roll && ab.roll.stat) || "STR",
        rollStatValue: mode === "flat" ? 0 : statOf(atk, (ab.roll && ab.roll.stat) || "STR"),
        adv: adv | 0,
        disadv: disadv | 0,
        modNotes: modNotes.slice(),
        critX: (typeof rollCritX !== "undefined" ? rollCritX : 0) | 0,
      },
    };
  }

  // Riposte / Hidden Bola mitigation (AI auto when policy set).
  // Riposte stacks with Defend on the same RANGE 1 hit (Defend ×2 DEF; Riposte −5×DEX).
  let mitigation = null;
  let riposteUsed = false;
  if (
    !selfAoe &&
    tgt &&
    !ctx.dryRun &&
    !ctx.asReaction &&
    isAttack &&
    tgt.side === "hero" &&
    typeof ctx.maybeMitigation === "function"
  ) {
    mitigation = ctx.maybeMitigation(tgt, {
      attacker: atk,
      ability: ab,
      raw,
      range: ab.range != null ? ab.range | 0 : 1,
      // Riposte is melee RANGE 1 only; Hidden Bola ignores this flag.
      ranged: (ab.range | 0) > 1,
    });
    if (mitigation && mitigation.ok) {
      raw = mitigation.raw | 0;
      // tryRiposte always sets boolean `oa`; Hidden Bola does not.
      if (Object.prototype.hasOwnProperty.call(mitigation, "oa")) riposteUsed = true;
    }
  }

  // AoE abilities: true blast/cube does not overflow through a horde stack.
  // Multi-target picks (maxTargets: Barrage / Flurry) are discrete shots — normal overflow.
  const hordeNoSpill =
    !!(ab.aoe && (aoeShape || aoeR != null) && ab.aoe.maxTargets == null);

  let dmgResult = { dealt: 0 };
  const statuses = [];
  const statusesBlocked = [];
  if (!selfAoe && tgt) {
    dmgResult = applyDamage(tgt, raw, {
      dmgType,
      break: breakX,
      unpreventable: dmgType === "unpreventable",
      actors: ctx.actors || actorsField,
      hordeNoSpill,
      // Single-target overflow: cull the struck pawn first (not rear tokens).
      preferRemoveIds: tgt && tgt.id ? [tgt.id] : null,
    });
    // Riposte OA when final HP damage is 0 (Defend + Riposte combo counts).
    if (
      !ctx.dryRun &&
      riposteUsed &&
      (dmgResult.toHp | 0) === 0 &&
      inRange(tgt, atk, 1)
    ) {
      tgt._riposteOaPending = atk.id;
    }
    for (const st0 of statusesFrom(effect)) {
      const st = resolveStatusSpec(st0, atk);
      if (applyStatus(tgt, st, { sourceId: atk.id, sourceActor: atk })) statuses.push(st);
      else if (st && st.gate && !gatePass(tgt, st.gate, { vsActor: atk }))
        statusesBlocked.push(st);
    }
    // Feral Invocation: weapon T3 → Fear if target INT ≤ YOUR STR
    if (
      !ctx.dryRun &&
      isAttack &&
      atk.feralFearOnT3 &&
      (tier | 0) >= 3 &&
      isWeaponAttack(ab, atk)
    ) {
      const fearSt = {
        id: "fear",
        gate: { stat: "INT", vsStat: "STR" },
      };
      if (applyStatus(tgt, fearSt, { sourceId: atk.id, sourceActor: atk })) {
        statuses.push(fearSt);
      } else if (!gatePass(tgt, fearSt.gate, { vsActor: atk })) {
        statusesBlocked.push(fearSt);
      }
    }
  }
  if (opening && !opening._needsPick && isAttack) {
    atk.nextAttack = null;
  }

  // Intimidate: −X on this damaging attack, then clear.
  if (!ctx.dryRun && consumeIntimidate && atk.st) {
    atk.st.intimidate = 0;
  }

  // AoE fan-out: one Power Roll; same tier/dmg/status to every foe token in blast/cube.
  // maxTargets (Barrage / Flurry): discrete extras — use ctx.extraTargetIds when the player
  // chose them; otherwise auto-pick nearest. Those shots use normal horde overflow.
  // True blast/cube (no maxTargets): every token in footprint; hordeNoSpill caps to unitHp.
  const aoeHits = [];
  if ((aoeShape || aoeR != null) && Array.isArray(ctx.actors) && !ctx.skipAoe) {
    if (aoeMode === "all") {
      const maxTargetsCap = resolveMaxTargets(ab, atk);
      const maxExtra = maxTargetsCap != null ? Math.max(0, maxTargetsCap - 1) : null;
      const multiPick = maxExtra != null;
      const candidates = [];
      const chosen = Array.isArray(ctx.extraTargetIds) ? ctx.extraTargetIds : null;
      if (chosen && chosen.length) {
        for (const id of chosen) {
          if (maxExtra != null && candidates.length >= maxExtra) break;
          let other = ctx.actors.find((a) => a && a.id === id);
          if (!other || other.side === atk.side) continue;
          // Multi-pick into a horde: second arrow still hits the stack even if that
          // pawn was culled by the primary shot's overflow.
          if (other.dead || (other.hp | 0) <= 0) {
            if (multiPick && other.hordeStackId) {
              const primary = ctx.actors.find(
                (a) =>
                  a &&
                  a.hordeStackId === other.hordeStackId &&
                  a.hordeIsPrimary &&
                  !a.dead &&
                  (a.hp | 0) > 0
              );
              if (!primary) continue;
              other = primary;
            } else continue;
          }
          // Same actor as primary (or retargeted onto it) → second packet into the stack.
          if (other === tgt) {
            if (multiPick && tgt.hordeStackId && !tgt.dead && (tgt.hp | 0) > 0) {
              candidates.push(tgt);
            }
            continue;
          }
          if (aoeShape === "cube") {
            if (!aoeCellSet || !aoeCellSet.has(cellKey(other.x, other.y))) continue;
          } else if (aoeR != null) {
            if (!inRange(aoeOrigin, other, aoeR) && !(multiPick && other.hordeStackId)) continue;
          } else continue;
          candidates.push(other);
        }
      } else {
        for (const other of ctx.actors) {
          if (!other || (!selfAoe && other === tgt) || other.side === atk.side) continue;
          if (other.dead || (other.hp | 0) <= 0) continue;
          if (aoeShape === "cube") {
            if (!aoeCellSet || !aoeCellSet.has(cellKey(other.x, other.y))) continue;
          } else if (aoeR != null) {
            if (!inRange(aoeOrigin, other, aoeR)) continue;
          } else continue;
          candidates.push(other);
        }
        // Prefer nearest extras when capped (Flurry of Daggers · 3 / Barrage · 2)
        if (maxExtra != null && candidates.length > maxExtra) {
          candidates.sort((a, b) => {
            const da = Math.max(Math.abs((a.x | 0) - (atk.x | 0)), Math.abs((a.y | 0) - (atk.y | 0)));
            const db = Math.max(Math.abs((b.x | 0) - (atk.x | 0)), Math.abs((b.y | 0) - (atk.y | 0)));
            return da - db;
          });
          candidates.length = maxExtra;
        }
      }
      for (const other of candidates) {
        if (
          !ctx.asReaction &&
          typeof ctx.maybeDefend === "function" &&
          !other.defendUp
        ) {
          ctx.maybeDefend(other, {
            attacker: atk,
            ability: ab,
            raw,
            tier,
            roll,
          });
        }
        const applied = [];
        for (const st0 of statusesFrom(effect)) {
          const st = resolveStatusSpec(st0, atk);
          if (applyStatus(other, st, { sourceId: atk.id, sourceActor: atk })) applied.push(st);
        }
        let dealt = 0;
        if (raw > 0) {
          const dr = applyDamage(other, raw, {
            dmgType,
            break: breakX,
            unpreventable: dmgType === "unpreventable",
            actors: ctx.actors || actorsField,
            // Multi-pick shots overflow; true blast does not.
            hordeNoSpill: !multiPick,
            preferRemoveIds: other && other.id ? [other.id] : null,
          });
          dealt = (dr && dr.dealt) | 0;
        }
        aoeHits.push({ id: other.id, statuses: applied, raw, dealt });
      }
    }
  }

  // Flurry of Blows: optional +1 stress → half DMG to another RANGE 1 foe
  let cleaveHit = null;
  const halfCleave = (ab.traits || []).find((t) => t && t.id === "halfCleave");
  if (
    halfCleave &&
    !ctx.dryRun &&
    !ctx.asReaction &&
    ctx.cleaveTargetId &&
    Array.isArray(ctx.actors)
  ) {
    const cleaveCost = halfCleave.stressCost != null ? halfCleave.stressCost | 0 : 1;
    const cleaveTgt = ctx.actors.find((a) => a && a.id === ctx.cleaveTargetId);
    if (
      cleaveTgt &&
      cleaveTgt !== tgt &&
      cleaveTgt.side !== atk.side &&
      !cleaveTgt.dead &&
      (cleaveTgt.hp | 0) > 0 &&
      inRange(atk, cleaveTgt, 1) &&
      (atk.stress | 0) >= cleaveCost
    ) {
      atk.stress = (atk.stress | 0) - cleaveCost;
      const half = Math.floor((raw | 0) / 2);
      if (half > 0) {
        applyDamage(cleaveTgt, half, {
          dmgType,
          break: breakX,
          actors: ctx.actors || actorsField,
        });
      }
      cleaveHit = { id: cleaveTgt.id, raw: half };
    }
  }

  // Leave difficult / hazard terrain (Eruption magma)
  let terrainLeft = [];
  const leaveSpec = aoe.leaveTerrain || effect.leaveTerrain || null;
  if (!ctx.dryRun && leaveSpec && aoeCells && aoeCells.length) {
    const st = ctx.state || null;
    if (st) {
      terrainLeft = leaveTerrainHazards(st, aoeCells, leaveSpec);
    }
  }

  if (!ctx.dryRun) {
    syncBloodiedShell(atk);
    if (tgt) syncBloodiedShell(tgt);
    for (const hit of aoeHits) {
      const other = (ctx.actors || []).find((a) => a && a.id === hit.id);
      if (other) syncBloodiedShell(other);
    }
  }

  if ((ab.traits || []).some((t) => t.id === "once-per-round")) {
    atk.roundUsed = atk.roundUsed || {};
    atk.roundUsed[ab.id] = true;
  }
  if ((ab.traits || []).some((t) => t.id === "once-per-fight")) {
    atk.fightUsed = atk.fightUsed || {};
    atk.fightUsed[ab.id] = (atk.fightUsed[ab.id] | 0) + 1;
  }
  {
    const gapT = (ab.traits || []).find((t) => t.id === "not-consecutive");
    if (gapT) {
      const gap = Math.max(1, (gapT.x != null ? gapT.x : gapT.uses) | 0 || 1);
      // gap turns to skip → cooldown ticks down on each beginTurn
      atk.abilityCooldown = atk.abilityCooldown || {};
      atk.abilityCooldown[ab.id] = gap + 1;
    }
  }

  // Card Crit line before forced movement (Push must not yank targets out of Crit RANGE).
  const cardCritHits = critRiders ? applyCardCrit(atk, ctx) : [];

  const forced = [];
  const pendingPushes = [];
  const supportEvents = [];
  function applyExtrasList(list) {
    for (const ex of list) {
      if (!ex || !ex.id) continue;
      if (ex.id === "regainStress") {
        const gain = Math.max(1, ex.x | 0 || 1);
        if (atk.stressMax != null) {
          atk.stress = Math.min(atk.stressMax | 0, (atk.stress | 0) + gain);
        } else {
          atk.stress = (atk.stress | 0) + gain;
        }
        continue;
      }
      if (ex.id === "vulnerable") {
        let vx = Math.max(0, ex.x | 0);
        if (ex.xStat) vx += statOf(atk, ex.xStat);
        vx = Math.max(1, vx);
        const typ =
          ex.dmgType ||
          (ab.useWeapon && weaponDmgType) ||
          dmgType ||
          "Physical";
        if (!tgt.vulnerable) tgt.vulnerable = {};
        tgt.vulnerable[typ] = (tgt.vulnerable[typ] | 0) + vx;
        statuses.push({
          id: "vulnerable",
          x: tgt.vulnerable[typ],
          dmgType: typ,
        });
        continue;
      }
      const fxOpts = {
        actors: ctx.actors || [],
        bounds: ctx.bounds,
        objects: ctx.objects,
        hazards: ctx.hazards || (ctx.state && ctx.state.hazards),
      };
      if (ex.id === "push") {
        let spaces = ex.x | 0;
        if (ex.xStat) spaces += statOf(atk, ex.xStat) | 0;
        const fcRaw = atk.fullContact;
        const fc =
          fcRaw === true ? { pushBonus: 1, maySlide: true } : fcRaw;
        let fullContactPush = 0;
        if (fc && fc.pushBonus) {
          spaces += fc.pushBonus | 0;
          fullContactPush = fc.pushBonus | 0;
        }
        if (ctx.askPush && !ctx.pushDir && !ctx.dryRun) {
          pendingPushes.push({
            targetId: tgt.id,
            spaces,
            fromId: atk.id,
            fullContactPush,
          });
          continue;
        }
        if (ctx.pushDir && (ctx.pushDir.dx != null || ctx.pushDir.dy != null)) {
          const fr = applyForcedMove(
            Object.assign({}, fxOpts, {
              source: atk,
              target: tgt,
              spaces,
              mode: "push",
              dx: ctx.pushDir.dx | 0,
              dy: ctx.pushDir.dy | 0,
            })
          );
          if (fullContactPush) fr.fullContactPush = fullContactPush;
          forced.push(fr);
          continue;
        }
        if (fc && fc.maySlide && ctx.bounds) {
          const slideDir = slideTowardEdge(tgt, ctx.bounds);
          if (slideDir.dx || slideDir.dy) {
            const fr = applySlide(atk, tgt, spaces, Object.assign({}, fxOpts, slideDir));
            if (fullContactPush) fr.fullContactPush = fullContactPush;
            forced.push(fr);
            continue;
          }
        }
        {
          const fr = applyPush(atk, tgt, spaces, fxOpts);
          if (fullContactPush) fr.fullContactPush = fullContactPush;
          forced.push(fr);
        }
      } else if (ex.id === "pull") {
        forced.push(applyPull(atk, tgt, ex.x | 0, fxOpts));
      } else if (ex.id === "slide") {
        forced.push(
          applySlide(atk, tgt, ex.x | 0, Object.assign({}, fxOpts, { dx: ex.dx | 0, dy: ex.dy | 0 }))
        );
      } else if (ex.id === "taunt") {
        applyStatus(tgt, { id: "taunt" }, { sourceId: atk.id, sourceActor: atk });
      } else if (ex.id === "grappleFocus") {
        // Duration and Adv live on grappleLock / grappleHold (applied once below).
        tgt.grappleFocus = true;
      } else if (ex.id === "livingBomb") {
        const INT = Math.max(0, atk.int | 0);
        const up = ctx.upcast ? 2 * INT : 0;
        tgt.livingBomb = {
          dmg: 8 + INT + up,
          fromId: atk.id,
          range: 3,
          upcast: !!ctx.upcast,
          traceState: ctx.state || null,
        };
      } else if (ex.id === "shadowplayMark") {
        atk.shadowplayFearAdv = true;
      } else if (ex.id === "toxicCloud") {
        const stRef = ctx.state || null;
        const anchor = tgt || atk;
        if (stRef && anchor) {
          paintToxicCloud(stRef, atk, anchor, {
            radius: (ab.aoe && ab.aoe.range != null ? ab.aoe.range : 3) | 0,
            upcast: !!ctx.upcast,
          });
        }
      } else if (ex.id === "selfShield") {
        if (!atk.st) atk.st = {};
        let sx = ex.x | 0;
        if (ex.xStat) sx += statOf(atk, ex.xStat) | 0;
        atk.st.shield = (atk.st.shield | 0) + Math.max(1, sx);
      } else if (ex.id === "focusNext") {
        if (!atk.nextAttack) atk.nextAttack = { break: 0, critX: 0, adv: 0, disadv: 0 };
        atk.nextAttack.bonusDmg = (atk.nextAttack.bonusDmg | 0) + Math.max(1, ex.x | 0);
      } else if (ex.id === "allyElemDef") {
        const typ = ctx.dmgTypeOverride || ex.dmgType || "Fire";
        let sx = ex.x | 0;
        if (ex.xStat) sx += statOf(atk, ex.xStat) | 0;
        const ally =
          (ctx.actors || []).find((a) => a && a.id === ctx.supportAllyId) ||
          (ctx.actors || []).find(
            (a) => a && a.side === atk.side && !a.dead && a !== atk && (a.hp | 0) > 0
          ) ||
          atk;
        if (ally && ally.def) {
          ally.def[typ] = (ally.def[typ] | 0) + Math.max(0, sx);
        }
      } else if (ex.id === "approach" || ex.id === "chargeMove") {
        // already applied before hit
      } else if (ex.id === "allyCatchBreath") {
        const forcedMode = ctx.supportPick || null;
        const forcedAlly = ctx.supportAllyId || null;
        if (forcedMode === "skip") continue;
        const range = ex.range != null ? ex.range | 0 : 5;
        let pick = null;
        if (forcedMode === "cleanse" && ex.orCleanse != null) {
          const ally =
            resolveForcedAlly(atk, ctx.actors || [], forcedAlly, range) ||
            pickAllyCleanseTarget(atk, ctx.actors || [], ex, forcedAlly);
          if (ally) pick = { mode: "cleanse", ally, points: ex.orCleanse | 0 };
        } else if (forcedMode === "catchBreath") {
          let ally = resolveForcedAlly(atk, ctx.actors || [], forcedAlly, range);
          if (ally && (ally.recoveries | 0) < 1) ally = null;
          if (!ally) {
            const allies = alliesInRange(atk, ctx.actors || [], range).filter(
              (a) => (a.recoveries | 0) > 0
            );
            ally = allies[0] || null;
          }
          if (ally) pick = { mode: "catchBreath", ally, bonus: ex.x | 0 };
        } else {
          pick = pickSymbolSupport(atk, ctx.actors || [], ex, forcedAlly);
          if (forcedAlly && pick) {
            const ally = resolveForcedAlly(atk, ctx.actors || [], forcedAlly, range);
            if (ally) pick = Object.assign({}, pick, { ally });
          }
        }
        if (!pick) continue;
        if (pick.mode === "cleanse") {
          const pts = pick.points != null ? pick.points : ex.orCleanse | 0;
          const used = cleanse(pick.ally, pts);
          supportEvents.push({
            id: "allyCleanse",
            allyId: pick.ally.id,
            points: pts,
            cleansed: used,
          });
        } else {
          const r = resolveSupportCatchBreath(pick.ally, {
            rng: ctx.rng,
            bonus: pick.bonus | 0,
          });
          if (r.ok) supportEvents.push(Object.assign({ id: "allyCatchBreath" }, r));
        }
      } else if (ex.id === "slowOrAllyCleanse") {
        const slowEx = ex.slow || { id: "slow", x: ex.x | 0, gate: ex.gate };
        const canSlow =
          slowEx &&
          (!slowEx.gate ||
            (() => {
              const g = slowEx.gate;
              const key = String(g.stat || "").toLowerCase();
              const val =
                key === "str"
                  ? tgt.str | 0
                  : key === "dex"
                    ? tgt.dex | 0
                    : key === "int"
                      ? tgt.int | 0
                      : 99;
              return val <= (g.n | 0);
            })());
        const cleansePts = (ex.cleanse && ex.cleanse.x) | 0 || (ex.cleanseX | 0) || (ex.x | 0);
        const cleanseRange =
          (ex.cleanse && ex.cleanse.range) != null ? ex.cleanse.range | 0 : 5;
        const prefer =
          ctx.supportPick === "slow"
            ? "slow"
            : ctx.supportPick === "cleanse"
              ? "cleanse"
              : canSlow
                ? "slow"
                : "cleanse";
        if (prefer === "slow" && canSlow) {
          if (applyStatus(tgt, slowEx, { sourceId: atk.id, sourceActor: atk })) statuses.push(slowEx);
        } else {
          const ally = pickAllyCleanseTarget(
            atk,
            ctx.actors || [],
            { range: cleanseRange },
            ctx.supportAllyId
          );
          if (ally) {
            const used = cleanse(ally, cleansePts);
            supportEvents.push({
              id: "allyCleanse",
              allyId: ally.id,
              points: cleansePts,
              cleansed: used,
              self: ally === atk,
              chose: "cleanse",
            });
          }
        }
      } else if (ex.id === "allyCleanse") {
        const ally = pickAllyCleanseTarget(atk, ctx.actors || [], ex, ctx.supportAllyId);
        if (!ally) continue;
        const used = cleanse(ally, ex.x | 0);
        supportEvents.push({
          id: "allyCleanse",
          allyId: ally.id,
          points: ex.x | 0,
          cleansed: used,
          self: ally === atk,
        });
      } else if (ex.id === "selfCleanse") {
        const used = cleanse(atk, ex.x | 0);
        supportEvents.push({
          id: "selfCleanse",
          allyId: atk.id,
          points: ex.x | 0,
          cleansed: used,
          self: true,
        });
      } else if (ex.status || ex.id === "status") {
        const st = ex.status || ex;
        if (applyStatus(tgt, st, { sourceId: atk.id, sourceActor: atk })) statuses.push(st);
      } else if (
        /^(burn|bleed|poison|shock|fear|intimidate|knockdown|blind|unsteady|slow)$/i.test(ex.id)
      ) {
        if (applyStatus(tgt, ex, { sourceId: atk.id, sourceActor: atk })) statuses.push(ex);
      }
    }
  }
  if (!selfAoe && tgt) {
    applyExtrasList(extrasFrom(effect));
    if (critRiders) applyExtrasList(onCritExtrasForStrike(ab, atk, ctx));
  }
  if (!ctx.dryRun && ab.id === "brawler-grapple" && tgt) {
    applyGrappleLock(atk, tgt, tier, ctx.actors || []);
  }
  if (!ctx.dryRun && ctx._fearSourceId) {
    const feared = [];
    const tookFear = (list) => (list || []).some((s) => s && String(s.id).toLowerCase() === "fear");
    if (tgt && tookFear(statuses)) feared.push(tgt);
    for (const hit of aoeHits) {
      if (!tookFear(hit.statuses)) continue;
      const other = (ctx.actors || []).find((a) => a && a.id === hit.id);
      if (other) feared.push(other);
    }
    for (const foe of feared) {
      if (foe.st) foe.st.fearSource = ctx._fearSourceId;
    }
    if (ctx.upcast) {
      const intimidateX = 2 * Math.max(0, atk.int | 0);
      if (intimidateX > 0) {
        for (const foe of feared) {
          applyStatus(
            foe,
            { id: "intimidate", x: intimidateX },
            { sourceId: atk.id, sourceActor: atk }
          );
        }
      }
    }
  }

  if (isAttack && !ctx.asReaction) noteAttack(atk);

  // Dual Daggers Flurry: after a non-flurry Strike, unlock 0 AP rushed follow-up 1/round
  if (
    isAttack &&
    !ctx.asReaction &&
    !isFlurry &&
    !atk.flurryUsedThisRound &&
    (ab.traits || []).some((t) => t.id === "flurry")
  ) {
    atk.flurryReady = true;
  }
  if (isFlurry) {
    atk.flurryUsedThisRound = true;
    atk.flurryReady = false;
  }

  // Hero crit benefits (+1 AP / clear Stress = regain toward max).
  let critApGain = 0;
  let coldBloodedClear = 0;
  if (roll && roll.isCrit) {
    if (!monster) {
      atk.ap = (atk.ap | 0) + 1;
      critApGain = 1;
    }
    if (atk.coldBlooded) coldBloodedClear = 1;
    if (atk.stress != null) {
      let clear = 1;
      if (atk.coldBlooded) clear += 1; // Cold Blooded: clear 1 more on Crit
      const before = atk.stress | 0;
      const cap = atk.stressMax != null ? atk.stressMax | 0 : before + clear;
      atk.stress = Math.min(cap, before + clear);
    }
  }

  // Weaponmaster: 1/turn — hit a Vulnerable foe → clear 1 Stress (regain 1 toward max)
  let weaponmasterClear = 0;
  if (
    !ctx.dryRun &&
    atk.weaponmaster &&
    !atk.weaponmasterUsedThisTurn &&
    isAttack &&
    tgt &&
    targetHasVulnerable(tgt) &&
    (((dmgResult && (dmgResult.toHp | 0) > 0) ||
      (statuses && statuses.length) ||
      (raw | 0) > 0))
  ) {
    const before = atk.stress | 0;
    const cap = atk.stressMax != null ? atk.stressMax | 0 : before + 1;
    if (before < cap) {
      atk.stress = Math.min(cap, before + 1);
      atk.weaponmasterUsedThisTurn = true;
      weaponmasterClear = 1;
    }
  }

  // Unlock Bear Charge etc. for the rest of the encounter
  if (atk.side === "hero" && tier === 3 && ctx.state) {
    ctx.state.heroTier3Seen = true;
  }

  return {
    ok: true,
    abilityId: ab.id,
    abilityName: ab.name,
    roll,
    tier,
    usedAim,
    raw,
    dmgType,
    dmgResult,
    breakX,
    statuses,
    statusesBlocked,
    aoeHits,
    aoeR,
    aoeMode,
    cleaveHit,
    aoeCells,
    aoeShape,
    terrainLeft,
    forced,
    pendingPushes,
    supportEvents,
    approached,
    oaEvents,
    defendReact,
    crit: !!(roll && roll.isCrit),
    critRiders,
    critBlockedBySteel,
    critApGain,
    coldBloodedClear,
    weaponmasterClear,
    primalInstinctAdv,
    courageFearIgnore,
    cardCritHits,
    disadv,
    adv,
    modNotes: modNotes.slice(),
    rollStat: (ab.roll && ab.roll.stat) || "STR",
    rollStatValue: mode === "flat" ? 0 : statOf(atk, (ab.roll && ab.roll.stat) || "STR"),
    apCost: cost,
    flurry: isFlurry,
  };
}

function resolveTwinStrike(ctx, meta) {
  const atk = ctx.attacker;
  const tgt = ctx.target;
  const ab = ctx.ability;
  if (ctx.declared && ctx.declared.twin && ctx.declared.rolls) {
    const rolls = ctx.declared.rolls;
    const raw = ctx.declared.raw | 0;
    const breakX = ctx.declared.breakX | 0;
    const dmgType = ctx.declared.dmgType || ab.dmgType || "Physical";
    const dmgResult = applyDamage(tgt, raw, {
      dmgType,
      break: breakX,
      actors: ctx.actors,
    });
    const statuses = [];
    for (const st of ctx.declared.statuses || []) {
      if (applyStatus(tgt, st, { sourceId: atk.id, sourceActor: atk })) statuses.push(st);
    }
    if (ctx.declared.consumeIntimidate && atk.st) atk.st.intimidate = 0;
    noteAttack(atk);
    noteAttack(atk);
    if (atk.nextAttack && !atk.nextAttack._needsPick) atk.nextAttack = null;
    return {
      ok: true,
      abilityId: ab.id,
      abilityName: ab.name,
      twin: true,
      rolls,
      roll: rolls[0],
      tier: Math.max((rolls[0] && rolls[0].tier) | 0, (rolls[1] && rolls[1].tier) | 0),
      raw,
      dmgType,
      dmgResult,
      statuses,
      apCost: meta.cost,
      disadv: ctx.declared.disadv | 0,
      adv: ctx.declared.adv | 0,
    };
  }
  const r1 = resolveStrikeHalf(ctx);
  const r2 = resolveStrikeHalf(ctx);
  if (!r1.ok) return r1;
  if (!r2.ok) return r2;
  let raw = (r1.raw | 0) + (r2.raw | 0);
  const intimidateX = (atk.st && atk.st.intimidate) | 0;
  let consumeIntimidate = false;
  if (intimidateX > 0 && raw > 0) {
    raw = Math.max(0, raw - intimidateX);
    consumeIntimidate = true;
  }
  const breakX =
    Math.max(r1.breakX | 0, r2.breakX | 0) + ((meta && meta.openingBreak) | 0);
  const dmgType = r1.dmgType || ab.dmgType || "Physical";
  const dmgResult = applyDamage(tgt, raw, {
    dmgType,
    break: breakX,
    actors: ctx.actors,
  });
  for (const st of r1.statuses || []) applyStatus(tgt, st, { sourceId: atk.id, sourceActor: atk });
  for (const st of r2.statuses || []) applyStatus(tgt, st, { sourceId: atk.id, sourceActor: atk });
  if (consumeIntimidate && atk.st) atk.st.intimidate = 0;
  noteAttack(atk);
  noteAttack(atk);
  if (atk.nextAttack && !atk.nextAttack._needsPick) atk.nextAttack = null;
  return {
    ok: true,
    abilityId: ab.id,
    abilityName: ab.name,
    twin: true,
    rolls: [r1.roll, r2.roll],
    roll: r1.roll,
    tier: Math.max(r1.roll.tier | 0, r2.roll.tier | 0),
    raw,
    dmgType,
    dmgResult,
    statuses: [].concat(r1.statuses || [], r2.statuses || []),
    apCost: meta.cost,
    adv: ctx.extraAdv | 0,
    disadv: ctx.extraDisadv | 0,
  };
}

/** Roll + tier effect only (no AP, no damage) for Twin Strike halves. */
function resolveStrikeHalf(ctx) {
  const atk = ctx.attacker;
  const tgt = ctx.target;
  const ab = ctx.ability;
  let adv = (ctx.extraAdv | 0) + ((ctx.pack && ctx.pack.adv) || 0);
  let disadv = ctx.extraDisadv | 0;
  if (!ctx.strikeModsPrecomputed) {
    disadv += fearDisadv(atk, tgt, ctx.actors || ctx.allies || []);
    disadv += tauntDisadv(atk, tgt);
    disadv += stressDisadv(atk);
    disadv += woundDisadv(atk);
    disadv += gloomDisadv(atk);
  }
  const mayCrit = actorCanCrit(atk);
  let critX = ctx.critX | 0;
  if (mayCrit && hasFlank(atk, ctx.allies || [], tgt)) critX += 1;
  for (const t of ab.traits || []) {
    if (t.id === "crit" && t.x) critX += t.x | 0;
  }
  if (mayCrit && atk.passiveCritX) critX += atk.passiveCritX | 0;
  if (!mayCrit) critX = 0;
  const roll = powerRoll({
    rng: ctx.rng,
    statValue: statOf(atk, (ab.roll && ab.roll.stat) || "STR"),
    adv,
    disadv,
    critX,
  });
  let live = roll;
  if (live.isCrit && !mayCrit) {
    const t = tierFromTotal(live.total);
    live = Object.assign({}, live, { isCrit: false, tier: t });
  }
  let critRiders = false;
  if (live.isCrit) {
    if (tgt.st && tgt.st.cannotBeCrit) {
      tgt.st.cannotBeCrit = false;
      critRiders = false;
    } else {
      critRiders = true;
    }
  }
  const effect = pickTierEffect(ab, live.tier, "power");
  if (!effect) return { ok: false, reason: "no-tier-effect", roll: live };
  let raw = resolveTierDmg(effect, null, atk);
  if (critRiders) {
    raw += critPassiveBonusDmg(ab, atk, ctx);
  }
  return {
    ok: true,
    roll: live,
    raw,
    breakX: effect.break | 0,
    dmgType: effect.dmgType || ab.dmgType || "Physical",
    statuses: statusesFrom(effect),
    critRiders,
  };
}

/** CATCH BREATH · 1 Reaction: spend 1 Recovery, heal higher of 2d10. */
export function resolveCatchBreath(actor, opts = {}) {
  if (!actor || actor.dead) return { ok: false, reason: "dead" };
  if ((actor.recoveries | 0) < 1) return { ok: false, reason: "no-recovery" };

  const rng = opts.rng || Math.random;
  let d1;
  let d2;
  let heal;
  if (opts.declared && opts.declared.d1 != null) {
    d1 = opts.declared.d1 | 0;
    d2 = opts.declared.d2 | 0;
    heal = Math.max(d1, d2) + (opts.bonus | 0);
  } else {
    d1 = 1 + Math.floor(rng() * 10);
    d2 = 1 + Math.floor(rng() * 10);
    heal = Math.max(d1, d2) + (opts.bonus | 0);
  }

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      d1,
      d2,
      heal,
      declaration: { d1, d2, heal },
    };
  }

  const pay = tryPayReaction(actor, {
    lightFree: !!actor.lightArmor,
    forceCost: 1,
  });
  if (!pay.ok) return { ok: false, reason: pay.reason || "no-ap" };
  actor.recoveries = (actor.recoveries | 0) - 1;
  const before = actor.hp | 0;
  actor.hp = Math.min(actor.hpMax | 0, before + heal);
  if ((actor.hp | 0) > 0) {
    actor.down = false;
  }
  return { ok: true, heal, d1, d2, hp: actor.hp, pay, before };
}

/**
 * Steel Yourself · 1 AP · Power Roll + INT.
 * T2/T3: cannotBeCrit — nat crit still deals T3 line; onCrit riders blocked (consumed).
 */
export function resolveSteelYourself(actor, opts = {}) {
  if (!actor || actor.dead) return { ok: false, reason: "dead" };
  if (isMonsterEconomy(actor)) return { ok: false, reason: "monster" };
  if (!opts.dryRun && !opts.skipAp) {
    if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  }
  const intStat = actor.int | 0;
  let roll = opts.declaredRoll || null;
  if (!roll) {
    roll = powerRoll({
      rng: opts.rng || Math.random,
      statValue: intStat,
      adv: opts.adv | 0,
      disadv: (opts.disadv | 0) + gloomDisadv(actor),
      critX: 0,
    });
  }
  const tier = roll.tier;
  if (!actor.st) actor.st = freshStatuses();
  let shield = 0;
  let cleansePts = 0;
  let cannotBeCrit = false;
  let needsPick = false;
  let pick = opts.pick || null;

  if (tier <= 1) {
    // Canon: SHIELD 2, or CLEANSE INT + 2 — player chooses
    const t1Cleanse = intStat + 2;
    if (pick === "shield") {
      shield = 2;
    } else if (pick === "cleanse") {
      cleansePts = t1Cleanse;
    } else if (opts.autoPick) {
      const hasDot =
        (actor.st.burn | 0) +
          (actor.st.bleed | 0) +
          (actor.st.poison | 0) +
          (actor.st.shock | 0) +
          (actor.st.intimidate | 0) +
          (actor.st.gloom | 0) >
        0;
      const hasFear = !!actor.st.fearSource;
      if (hasDot || hasFear) {
        pick = "cleanse";
        cleansePts = t1Cleanse;
      } else {
        pick = "shield";
        shield = 2;
      }
    } else if (opts.dryRun) {
      needsPick = true;
      cleansePts = t1Cleanse;
    } else {
      needsPick = true;
      cleansePts = t1Cleanse;
    }
  } else if (tier === 2) {
    cannotBeCrit = true;
    shield = 3;
    cleansePts = intStat + 3;
  } else {
    cannotBeCrit = true;
    shield = 5;
    cleansePts = intStat + 5;
  }

  if (opts.dryRun || needsPick) {
    return {
      ok: true,
      dryRun: !!opts.dryRun,
      roll,
      tier,
      shield,
      cleansePts,
      cannotBeCrit,
      needsPick,
      pick,
      rollStatValue: intStat,
    };
  }

  if (shield) applyStatus(actor, { id: "shield", x: shield });
  let cleansed = 0;
  if (cleansePts) cleansed = cleanse(actor, cleansePts);
  if (cannotBeCrit) actor.st.cannotBeCrit = true;
  return {
    ok: true,
    roll,
    tier,
    shield,
    cleansePts,
    cleansed,
    cannotBeCrit,
    pick,
  };
}

/**
 * Shove · 1 AP · RANGE 1 · Power Roll + STR.
 * Push STR+2 / STR+3 / STR+4. T3: STR ≤ YOUR STR → Knock down.
 * No weapon damage. Not rushed.
 */
export function resolveShove(actor, target, opts = {}) {
  if (!actor || actor.dead) return { ok: false, reason: "dead" };
  if (isMonsterEconomy(actor)) return { ok: false, reason: "monster" };
  if (!target || target.dead || (target.hp | 0) <= 0) return { ok: false, reason: "no-target" };
  const range = opts.range != null ? opts.range | 0 : 1;
  if (!inRange(actor, target, range)) return { ok: false, reason: "oor" };
  if (!opts.dryRun && !opts.skipAp) {
    if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  }
  const strStat = actor.str | 0;
  let roll = opts.declaredRoll || null;
  if (!roll) {
    roll = powerRoll({
      rng: opts.rng || Math.random,
      statValue: strStat,
      adv: opts.adv | 0,
      disadv: opts.disadv | 0,
      critX: 0,
    });
  }
  const tier = roll.tier | 0;
  const pushBonus = tier <= 1 ? 2 : tier === 2 ? 3 : 4;
  const spaces = strStat + pushBonus;
  const knockdown =
    tier >= 3 && (target.str | 0) <= strStat
      ? { id: "knockdown" }
      : null;

  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      roll,
      tier,
      spaces,
      knockdown: !!knockdown,
      rollStat: "STR",
      rollStatValue: strStat,
      targetId: target.id,
    };
  }

  const fxOpts = {
    actors: opts.actors || [],
    objects: opts.objects || null,
    bounds: opts.bounds || null,
    applyDamage,
  };
  const pendingPushes = [];
  const forced = [];
  if (opts.askPush && !opts.pushDir) {
    pendingPushes.push({
      targetId: target.id,
      spaces,
      fromId: actor.id,
    });
  } else if (opts.pushDir && (opts.pushDir.dx != null || opts.pushDir.dy != null)) {
    forced.push(
      applyForcedMove(
        Object.assign({}, fxOpts, {
          source: actor,
          target,
          spaces,
          mode: "push",
          dx: opts.pushDir.dx | 0,
          dy: opts.pushDir.dy | 0,
        })
      )
    );
  } else {
    forced.push(applyPush(actor, target, spaces, fxOpts));
  }

  let knockdownApplied = false;
  if (knockdown && applyStatus(target, knockdown, { sourceId: actor.id, sourceActor: actor })) {
    knockdownApplied = true;
  }

  return {
    ok: true,
    roll,
    tier,
    spaces,
    forced,
    pendingPushes,
    knockdown: knockdownApplied,
    rollStatValue: strStat,
    targetId: target.id,
  };
}

/**
 * Ask a Question · 1 AP · Power Roll + INT.
 * Lab: T2/T3 grant ADV 1 on the next attack. GM Q&A prose is out of kernel.
 */
export function resolveAskQuestion(actor, opts = {}) {
  if (!actor || actor.dead) return { ok: false, reason: "dead" };
  if (isMonsterEconomy(actor)) return { ok: false, reason: "monster" };
  if (!opts.dryRun && !opts.skipAp) {
    if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  }
  const intStat = actor.int | 0;
  let roll = opts.declaredRoll || null;
  if (!roll) {
    roll = powerRoll({
      rng: opts.rng || Math.random,
      statValue: intStat,
      adv: opts.adv | 0,
      disadv: opts.disadv | 0,
      critX: 0,
    });
  }
  const tier = roll.tier | 0;
  const grantAdv = tier >= 2 ? 1 : 0;
  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      roll,
      tier,
      grantAdv,
      rollStat: "INT",
      rollStatValue: intStat,
      adv: opts.adv | 0,
      disadv: opts.disadv | 0,
    };
  }
  if (grantAdv) {
    if (!actor.nextAttack) {
      actor.nextAttack = { break: 0, critX: 0, adv: grantAdv, disadv: 0 };
    } else {
      actor.nextAttack.adv = (actor.nextAttack.adv | 0) + grantAdv;
    }
  }
  return {
    ok: true,
    roll,
    tier,
    grantAdv,
    buff: actor.nextAttack,
    rollStatValue: intStat,
  };
}

/**
 * Line Up the Strike · 1 AP · Power Roll + DEX → buffs next attack.
 * T2 needs opts.pick "crit"|"adv" (sandbox); MC defaults to "adv".
 */
export function resolveCreateOpening(actor, opts = {}) {
  if (!actor || actor.dead) return { ok: false, reason: "dead" };
  if (isMonsterEconomy(actor)) return { ok: false, reason: "monster" };
  if (!opts.dryRun && !opts.skipAp) {
    if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  }
  let roll = opts.declaredRoll || null;
  if (!roll) {
    roll = powerRoll({
      rng: opts.rng || Math.random,
      statValue: actor.dex | 0,
      adv: opts.adv | 0,
      disadv: opts.disadv | 0,
      critX: 0,
    });
  }
  const tier = roll.tier;
  const buff = { break: 5, critX: 0, adv: 0, disadv: 0 };
  let pick = null;
  let needsPick = false;
  if (tier <= 1) {
    buff.disadv = 1;
  } else if (tier === 2) {
    if (opts.pick === "crit" || opts.pick === "adv") {
      pick = opts.pick;
      if (pick === "crit") buff.critX = 1;
      else buff.adv = 1;
    } else if (opts.autoPick) {
      pick = "adv";
      buff.adv = 1;
    } else {
      needsPick = true;
      buff._needsPick = true;
    }
  } else {
    buff.critX = 1;
    buff.adv = 1;
  }
  if (opts.dryRun) {
    return {
      ok: true,
      dryRun: true,
      roll,
      tier,
      buff,
      pick,
      needsPick,
      rollStat: "DEX",
      rollStatValue: actor.dex | 0,
      adv: opts.adv | 0,
      disadv: opts.disadv | 0,
    };
  }
  actor.nextAttack = buff;
  return { ok: true, roll, tier, buff, pick, needsPick };
}

/** Finish Line Up the Strike T2 choice without spending AP again. */
export function finishCreateOpeningPick(actor, pick) {
  if (!actor || !actor.nextAttack || !actor.nextAttack._needsPick) {
    return { ok: false, reason: "no-pick" };
  }
  const p = pick === "crit" ? "crit" : "adv";
  actor.nextAttack = {
    break: 5,
    critX: p === "crit" ? 1 : 0,
    adv: p === "adv" ? 1 : 0,
    disadv: 0,
  };
  return { ok: true, pick: p, buff: actor.nextAttack };
}

/**
 * Help · Reaction: ally rerolls one d10 on a Power Roll (lab: lower die).
 * Limit 1 Help per roll (caller tracks). Pays reaction AP — unless Ranger free Help.
 * Ranger: rangerFreeHelps (2 / Rift, carry between fights) → 0 AP, no reaction slot.
 */
export function resolveHelp(helper, opts = {}) {
  if (!helper || helper.dead) return { ok: false, reason: "dead" };
  if (isMonsterEconomy(helper)) return { ok: false, reason: "monster" };
  let pay;
  if ((helper.rangerFreeHelps | 0) > 0) {
    helper.rangerFreeHelps = (helper.rangerFreeHelps | 0) - 1;
    pay = { ok: true, apCost: 0, rangerFree: true };
  } else {
    pay = tryPayReaction(helper, {
      lightFree: !!helper.lightArmor,
      forceCost: 1,
    });
    if (!pay.ok) return { ok: false, reason: pay.reason || "no-ap" };
  }
  return { ok: true, pay, helperId: helper.id };
}

/**
 * Adjacent empty cells the protected target may step into after Interpose.
 */
export function listInterposeDests(protectedTarget, opts = {}) {
  if (!protectedTarget) return [];
  const actors = opts.actors || [];
  const interposer = opts.interposer || null;
  const occ = new Set();
  for (const a of actors) {
    if (!a || a.dead) continue;
    if (a === protectedTarget || a === interposer) continue;
    if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
    occ.add((a.x | 0) + "," + (a.y | 0));
  }
  for (const o of opts.objects || []) {
    if (!o || o.destroyed || (o.hp != null && (o.hp | 0) <= 0)) continue;
    occ.add((o.x | 0) + "," + (o.y | 0));
  }
  const ox = protectedTarget.x | 0;
  const oy = protectedTarget.y | 0;
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = ox + dx;
      const ny = oy + dy;
      if (opts.bounds) {
        if (
          nx < opts.bounds.minX ||
          nx > opts.bounds.maxX ||
          ny < opts.bounds.minY ||
          ny > opts.bounds.maxY
        ) {
          continue;
        }
      }
      if (occ.has(nx + "," + ny)) continue;
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

/**
 * Interpose · Reaction: ally within RANGE 3 of the target enters their space
 * and becomes the new attack target; original target steps to an adjacent empty cell.
 */
export function resolveInterpose(interposer, protectedTarget, opts = {}) {
  if (!interposer || !protectedTarget) return { ok: false, reason: "missing" };
  if (interposer.dead || protectedTarget.dead) return { ok: false, reason: "dead" };
  if (isMonsterEconomy(interposer)) return { ok: false, reason: "monster" };
  if (!inRange(interposer, protectedTarget, 3)) return { ok: false, reason: "out-of-range" };

  const pay = tryPayReaction(interposer, {
    lightFree: !!interposer.lightArmor,
    forceCost: 1,
  });
  if (!pay.ok) return { ok: false, reason: pay.reason || "no-ap" };

  const actors = opts.actors || [];
  const occ = new Set();
  for (const a of actors) {
    if (!a || a.dead || (a.hp | 0) <= 0) continue;
    if (a === protectedTarget || a === interposer) continue;
    occ.add((a.x | 0) + "," + (a.y | 0));
  }
  for (const o of opts.objects || []) {
    if (!o || o.destroyed || (o.hp | 0) <= 0) continue;
    occ.add((o.x | 0) + "," + (o.y | 0));
  }

  const ox = protectedTarget.x | 0;
  const oy = protectedTarget.y | 0;
  let dest = opts.dest || null;
  if (!dest) {
    const away = opts.awayFrom || null;
    const cand = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = ox + dx;
        const ny = oy + dy;
        if (opts.bounds) {
          if (nx < opts.bounds.minX || nx > opts.bounds.maxX || ny < opts.bounds.minY || ny > opts.bounds.maxY) {
            continue;
          }
        }
        if (occ.has(nx + "," + ny)) continue;
        let score = 0;
        if (away) score = Math.abs(nx - (away.x | 0)) + Math.abs(ny - (away.y | 0));
        cand.push({ x: nx, y: ny, score });
      }
    }
    cand.sort((a, b) => b.score - a.score);
    dest = cand[0] || null;
  }
  if (!dest) {
    // refund reaction roughly
    if (pay.usedFree) interposer.freeReactionUsed = false;
    else interposer.ap = (interposer.ap | 0) + 1;
    return { ok: false, reason: "no-space" };
  }

  protectedTarget.x = dest.x | 0;
  protectedTarget.y = dest.y | 0;
  interposer.x = ox;
  interposer.y = oy;
  return {
    ok: true,
    pay,
    newTargetId: interposer.id,
    protectedId: protectedTarget.id,
    vacated: { x: dest.x | 0, y: dest.y | 0 },
  };
}

/** True if this ability is a ranged shot that can provoke OA from adjacent foes. */
export function abilityTriggersRangedOa(ability) {
  if (!ability) return false;
  const range = ability.range != null ? ability.range | 0 : 1;
  if (range <= 1) return false;
  if ((ability.traits || []).some((t) => t && (t.id === "meleeCharge" || t.id === "charge"))) {
    return false;
  }
  const tiers = ability.tiers || {};
  for (const k of Object.keys(tiers)) {
    const ex = tiers[k] && tiers[k].extras;
    const list = Array.isArray(ex) ? ex : ex ? [ex] : [];
    if (list.some((e) => e && (e.id === "approach" || e.id === "chargeMove"))) return false;
  }
  return true;
}

/**
 * Heroes/monsters who may OA a ranged attack made while adjacent (RANGE 1).
 * Charges / approach abilities are melee closures — not ranged OA.
 */
export function listRangedOaCandidates(attacker, ability, actors, getReactionAbility) {
  if (!attacker || !ability) return [];
  if (!abilityTriggersRangedOa(ability)) return [];
  const out = [];
  for (const e of actors || []) {
    if (!e || e === attacker || e.side === attacker.side) continue;
    if (e.dead || e.alive === false || (e.hp | 0) <= 0) continue;
    if (!inRange(attacker, e, 1)) continue;
    if (!canReact(e) && !e.lightArmor) continue;
    const ab =
      typeof getReactionAbility === "function" ? getReactionAbility(e) : null;
    if (!ab) continue;
    out.push({
      actor: e,
      ability: ab,
      label:
        e.name +
        " · OA" +
        (e.side === "hero" ? " (ADV 1)" : "") +
        (e.side === "hero" && !isMonsterEconomy(e)
          ? hasWeaponEquipped(e, "glaive") && !e.glaiveFreeOaUsed
            ? " · free (Glaive)"
            : " (−1 AP)"
          : ""),
    });
  }
  return out;
}
