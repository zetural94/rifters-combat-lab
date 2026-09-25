/**
 * Draft feat helpers (Rank1 smoke / ports).
 */
import { chebyshev, inRange } from "./grid.js";
import { applyDamage } from "./damage.js";
import { leaveTerrainHazards, cellKey, objectBlockKeys } from "./terrain.js";
import { spendAp, tryPayReaction } from "./turn.js";
import { applyStatus, cleanse } from "./status.js";
import { noteTalent } from "./talentTrace.js";

/** Mana first; overflow from Stress (caster passive). */
export function spendMana(actor, cost) {
  const need = Math.max(0, cost | 0);
  if (!need) return { ok: true, mana: 0, stress: 0 };
  let left = need;
  const manaPay = Math.min(actor.mana | 0, left);
  actor.mana = (actor.mana | 0) - manaPay;
  left -= manaPay;
  let stressPay = 0;
  if (left > 0) {
    stressPay = Math.min(actor.stress | 0, left);
    actor.stress = (actor.stress | 0) - stressPay;
    left -= stressPay;
  }
  if (left > 0) return { ok: false, reason: "no-mana", mana: manaPay, stress: stressPay };
  return { ok: true, mana: manaPay, stress: stressPay };
}

export function canPayMana(actor, cost) {
  const need = Math.max(0, cost | 0);
  return (actor.mana | 0) + (actor.stress | 0) >= need;
}

/** T1 backlash: 3 × YOUR TIER unpreventable. Rank-1 lab tier defaults to 1. */
export function systemsBargainT1Damage(actor) {
  const tier = Math.max(1, (actor && ((actor.tier | 0) || (actor.rank | 0))) || 1);
  return 3 * tier;
}

/** System's Bargain activate: 2 AP + 2 mana, 1/fight. */
export function activateSystemsBargain(actor, opts = {}) {
  if (!actor || !actor.hasSystemsBargain) return { ok: false, reason: "no-feat" };
  if (actor.systemsBargainUsed || actor.systemsBargain) {
    return { ok: false, reason: "already" };
  }
  if (!opts.skipAp && !spendAp(actor, 2)) return { ok: false, reason: "no-ap" };
  const pay = spendMana(actor, 2);
  if (!pay.ok) {
    if (!opts.skipAp) actor.ap = (actor.ap | 0) + 2;
    return { ok: false, reason: pay.reason || "no-mana" };
  }
  actor.systemsBargain = true;
  actor.systemsBargainUsed = true;
  return { ok: true, pay };
}

/**
 * Ice Wall smoke: 5 segments, HP = 3+INT, adjacent difficult.
 * Places a line between caster and preferred foe (or horizontal in front).
 */
export function placeIceWall(state, actor, opts = {}) {
  if (!actor || !actor.hasIceWall) return { ok: false, reason: "no-feat" };
  if (actor.iceWallUsed) return { ok: false, reason: "already" };
  if (!opts.skipMana) {
    const pay = spendMana(actor, 2);
    if (!pay.ok) return { ok: false, reason: pay.reason || "no-mana" };
  }
  const foes = (state.actors || []).filter(
    (a) => a && a.side === "enemy" && !a.dead && (a.hp | 0) > 0
  );
  const preferred =
    opts.preferred ||
    foes.slice().sort((a, b) => chebyshev(actor, a) - chebyshev(actor, b))[0] ||
    null;
  const cells = pickIceWallCells(actor, preferred, state, 5);
  if (!cells.length) return { ok: false, reason: "no-space" };

  const segHp = Math.max(1, 3 + (actor.int | 0));
  state.objects = state.objects || [];
  const placed = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const obj = {
      id: "ice-" + actor.id + "-" + i,
      x: c.x,
      y: c.y,
      material: "ice",
      hp: segHp,
      hpMax: segHp,
      label: "Ice Wall",
      iceWall: true,
      destroyDmg: 2,
      destroyed: false,
    };
    state.objects.push(obj);
    placed.push(obj);
  }

  const adj = new Map();
  for (const o of placed) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const x = (o.x | 0) + dx;
        const y = (o.y | 0) + dy;
        const onWall = placed.some((p) => (p.x | 0) === x && (p.y | 0) === y);
        if (onWall) continue;
        adj.set(cellKey(x, y), { x, y });
      }
    }
  }
  leaveTerrainHazards(state, [...adj.values()], {
    id: "ice-adj",
    difficult: true,
    enterDmg: 0,
    label: "Ice Wall adjacent",
  });

  actor.iceWallUsed = true;
  return { ok: true, segments: placed, segHp };
}

export function pickIceWallCells(actor, preferred, state, n = 5) {
  const bounds = state.bounds || { minX: 0, minY: 0, maxX: 11, maxY: 7 };
  const blocked = new Set();
  for (const a of state.actors || []) {
    if (!a || a.dead) continue;
    blocked.add((a.x | 0) + "," + (a.y | 0));
  }
  for (const o of state.objects || []) {
    if (!o || o.destroyed || (o.hp | 0) <= 0) continue;
    blocked.add((o.x | 0) + "," + (o.y | 0));
  }

  const ax = actor.x | 0;
  const ay = actor.y | 0;
  let tx = preferred ? preferred.x | 0 : ax + 3;
  let ty = preferred ? preferred.y | 0 : ay;

  // Midpoint toward target, clamp range ≤5 from caster
  let mx = Math.round((ax + tx) / 2);
  let my = Math.round((ay + ty) / 2);
  if (chebyshev({ x: ax, y: ay }, { x: mx, y: my }) > 5) {
    const dx = Math.sign(tx - ax);
    const dy = Math.sign(ty - ay);
    mx = ax + dx * 3;
    my = ay + dy * 3;
  }

  const horizontal = Math.abs(tx - ax) >= Math.abs(ty - ay);
  const cells = [];
  const half = Math.floor(n / 2);
  for (let i = -half; i <= half && cells.length < n; i++) {
    const x = horizontal ? mx + i : mx;
    const y = horizontal ? my : my + i;
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
    const key = x + "," + y;
    if (blocked.has(key)) continue;
    if (x === ax && y === ay) continue;
    cells.push({ x, y });
    blocked.add(key);
  }
  // Fill remaining along axis if short
  let guard = 0;
  while (cells.length < n && guard++ < 12) {
    const tip = cells[cells.length - 1] || { x: mx, y: my };
    const nx = horizontal ? tip.x + 1 : tip.x;
    const ny = horizontal ? tip.y : tip.y + 1;
    if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) break;
    const key = nx + "," + ny;
    if (blocked.has(key)) break;
    cells.push({ x: nx, y: ny });
    blocked.add(key);
  }
  return cells;
}

/** When an ice segment is destroyed: 2 unprev to adjacent creatures. */
export function iceWallDestroySplash(obj, actors) {
  if (!obj || !obj.iceWall) return [];
  const dmg = obj.destroyDmg != null ? obj.destroyDmg | 0 : 2;
  const hit = [];
  for (const a of actors || []) {
    if (!a || a.dead || (a.hp | 0) <= 0) continue;
    if (inRange(obj, a, 1)) {
      applyDamage(a, dmg, { unpreventable: true, skipBleed: true });
      hit.push(a.id);
    }
  }
  return hit;
}

/** Spotter: Mark foe (1 at a time). Allies get BREAK 2 on next hit this round; scout Crit 1 on next ranged vs Mark. */
export function applySpotterMark(state, actor, targetId) {
  if (!actor || !actor.hasSpotter) return { ok: false, reason: "no-feat" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  if ((actor.stress | 0) < 1) return { ok: false, reason: "no-stress" };
  const target = (state.actors || []).find((a) => a && a.id === targetId);
  if (!target || target.side === actor.side || target.dead || (target.hp | 0) <= 0) {
    return { ok: false, reason: "bad-target" };
  }
  const range = spotterRange(actor, state);
  if (!inRange(actor, target, range)) return { ok: false, reason: "out-of-range" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  actor.stress = (actor.stress | 0) - 1;

  // Clear previous mark on any foe
  for (const a of state.actors || []) {
    if (a && a.spotterMarked) delete a.spotterMarked;
  }
  target.spotterMarked = {
    byId: actor.id,
    round: state.round | 0,
    allyBreakLeft: {}, // attackerId → used this round
  };
  actor.spotterMarkId = target.id;
  actor.spotterCritPending = true;
  return { ok: true, targetId: target.id, range };
}

export function spotterRange(actor, state) {
  let r = 8;
  const ids = actor.abilityIds || actor.abilities || [];
  for (const id of ids) {
    const ab = state.abilityById && state.abilityById[id];
    if (!ab || ab.isAttack === false) continue;
    const ar = ab.range != null ? ab.range | 0 : 1;
    if (ar > r) r = ar;
  }
  return r;
}

/**
 * Consume Spotter bonuses for this attack.
 * Allies (not the marker): next attack vs Mark this round → BREAK 2 once each.
 * Marker: next ranged Strike vs Mark → Crit 1.
 * @returns {{ breakBonus: number, critBonus: number }}
 */
export function consumeSpotterAttackBonus(atk, tgt, opts = {}) {
  let breakBonus = 0;
  let critBonus = 0;
  if (!tgt || !tgt.spotterMarked || !atk) return { breakBonus, critBonus };
  if (opts.isAttack === false) return { breakBonus, critBonus };
  const mark = tgt.spotterMarked;
  const markRound = mark.round | 0;
  const nowRound = opts.round != null ? opts.round | 0 : markRound;
  const isRanged = (opts.range | 0) >= 3 || !!opts.ranged;
  const isMarker = atk.id === mark.byId;

  if (
    isMarker &&
    atk.spotterCritPending &&
    isRanged &&
    !opts.asReaction
  ) {
    critBonus = 1;
    if (!opts.dryRun) atk.spotterCritPending = false;
  }

  if (!isMarker && nowRound === markRound && !opts.asReaction) {
    const used = mark.allyBreakLeft || (mark.allyBreakLeft = {});
    if (!used[atk.id]) {
      breakBonus = 2;
      if (!opts.dryRun) used[atk.id] = true;
    }
  }
  return { breakBonus, critBonus };
}

/** Guard: 1 stress → +1 all printed DEF until start of next turn. */
export function activateGuard(actor) {
  if (!actor || !actor.hasGuard) return { ok: false, reason: "no-feat" };
  if ((actor.stress | 0) < 1) return { ok: false, reason: "no-stress" };
  if (actor.guardUp) return { ok: false, reason: "already" };
  actor.stress = (actor.stress | 0) - 1;
  actor.guardUp = true;
  if (!actor.def) actor.def = {};
  actor._guardDefBonus = 1;
  for (const k of Object.keys(actor.def)) {
    actor.def[k] = (actor.def[k] | 0) + 1;
  }
  return { ok: true };
}

export function clearGuard(actor) {
  if (!actor || !actor.guardUp) return;
  const b = actor._guardDefBonus | 0 || 1;
  if (actor.def) {
    for (const k of Object.keys(actor.def)) {
      actor.def[k] = (actor.def[k] | 0) - b;
    }
  }
  actor.guardUp = false;
  delete actor._guardDefBonus;
}

/** Shadow Dash: 1 AP + 1 stress → blink ≤3; Adv 1 next melee this turn. */
export function applyShadowDash(state, actor, dest) {
  if (!actor || !actor.hasShadowDash) return { ok: false, reason: "no-feat" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  if ((actor.stress | 0) < 1) return { ok: false, reason: "no-stress" };
  if (!dest) return { ok: false, reason: "no-dest" };
  const dx = Math.abs((dest.x | 0) - (actor.x | 0));
  const dy = Math.abs((dest.y | 0) - (actor.y | 0));
  if (Math.max(dx, dy) > 3 || Math.max(dx, dy) < 1) return { ok: false, reason: "bad-range" };
  const occ = new Set();
  for (const a of state.actors || []) {
    if (!a || a === actor || a.dead) continue;
    if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
    occ.add((a.x | 0) + "," + (a.y | 0));
  }
  for (const k of objectBlockKeys(state.objects || [])) occ.add(k);
  const key = (dest.x | 0) + "," + (dest.y | 0);
  if (occ.has(key)) return { ok: false, reason: "blocked" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  actor.stress = (actor.stress | 0) - 1;
  actor.x = dest.x | 0;
  actor.y = dest.y | 0;
  // Dedicated melee Adv — ranged must not consume it.
  actor.shadowDashMeleeAdv = true;
  actor.shadowDashUsedThisTurn = true;
  return { ok: true, dest: { x: actor.x, y: actor.y } };
}

/** Magic Shield: 1 mana free 1/turn · SHIELD 3+INT · Range 5 ally or self. */
export function applyMagicShield(state, actor, targetId) {
  if (!actor || !actor.hasMagicShield) return { ok: false, reason: "no-feat" };
  if (actor.magicShieldUsedThisTurn) return { ok: false, reason: "used" };
  if (!canPayMana(actor, 1)) return { ok: false, reason: "no-mana" };
  const target =
    !targetId || targetId === actor.id
      ? actor
      : (state.actors || []).find((a) => a && a.id === targetId);
  if (!target || target.side !== actor.side || target.dead) return { ok: false, reason: "bad-target" };
  if (target !== actor && !inRange(actor, target, 5)) return { ok: false, reason: "out-of-range" };
  const pay = spendMana(actor, 1);
  if (!pay.ok) return pay;
  const amount = 3 + (actor.int | 0);
  if (!target.st) target.st = {};
  target.st.shield = (target.st.shield | 0) + amount;
  actor.magicShieldUsedThisTurn = true;
  return { ok: true, targetId: target.id, shield: amount };
}

/** Blink max Chebyshev range (Rozwój): half SPEED; UPCAST → full SPEED. */
export function blinkMaxRange(actor, upcast = false) {
  const spd = Math.max(0, actor && (actor.speed | 0));
  if (upcast) return Math.max(1, spd);
  return Math.max(1, Math.floor(spd / 2));
}

/** Blink SHIELD (Rozwój): 3×INT; UPCAST → +INT. */
export function blinkShieldAmount(actor, upcast = false) {
  const int = (actor && (actor.int | 0)) || 0;
  const base = 3 * int;
  return upcast ? base + int : base;
}

/** Blink: 1 AP + 1 mana · teleport ≤ half SPEED · SHIELD 3×INT (Rozwój).
 *  opts.upcast: +1 mana → full SPEED and +INT SHIELD. */
export function applyBlink(state, actor, dest, opts = {}) {
  if (!actor || !actor.hasBlink) return { ok: false, reason: "no-feat" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  const upcast = !!(opts && opts.upcast);
  const manaNeed = 1 + (upcast ? 1 : 0);
  if (!canPayMana(actor, manaNeed)) return { ok: false, reason: "no-mana" };
  if (!dest) return { ok: false, reason: "no-dest" };
  const maxR = blinkMaxRange(actor, upcast);
  const dx = Math.abs((dest.x | 0) - (actor.x | 0));
  const dy = Math.abs((dest.y | 0) - (actor.y | 0));
  if (Math.max(dx, dy) > maxR || Math.max(dx, dy) < 1) return { ok: false, reason: "bad-range" };
  const occ = new Set();
  for (const a of state.actors || []) {
    if (!a || a === actor || a.dead) continue;
    if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
    occ.add((a.x | 0) + "," + (a.y | 0));
  }
  for (const k of objectBlockKeys(state.objects || [])) occ.add(k);
  if (occ.has((dest.x | 0) + "," + (dest.y | 0))) return { ok: false, reason: "blocked" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  const pay = spendMana(actor, manaNeed);
  if (!pay.ok) return pay;
  actor.x = dest.x | 0;
  actor.y = dest.y | 0;
  const shield = blinkShieldAmount(actor, upcast);
  if (!actor.st) actor.st = {};
  actor.st.shield = (actor.st.shield | 0) + shield;
  return { ok: true, dest: { x: actor.x, y: actor.y }, shield, upcast };
}

/** Bless INT bonus (Rozwój): +INT; UPCAST adds +2×INT (total +3×INT). */
export function blessBonus(actor, upcast = false) {
  const INT = Math.max(0, (actor && actor.int) | 0);
  return upcast ? INT + INT * 2 : INT;
}

/**
 * Bless (Rozwój COMPLETE): Free Action, 1/turn, 1 MANA (+1 upcast), Range 3.
 * REQUIRES target spend 1 Recovery → heal higher of 2d10 + YOUR INT (upcast +2×INT → total +3×INT).
 * Also grants one reroll token until end of combat (together with the heal spend).
 * Without Recovery: not legal / cannot cast.
 */
export function applyBless(state, actor, targetId, opts = {}) {
  if (!actor || !actor.hasBless) return { ok: false, reason: "no-feat" };
  if (actor.blessUsedThisTurn) return { ok: false, reason: "used" };
  const upcast = !!opts.upcast;
  const manaNeed = upcast ? 2 : 1;
  if (!canPayMana(actor, manaNeed)) return { ok: false, reason: "no-mana" };
  const target =
    !targetId || targetId === actor.id
      ? actor
      : (state.actors || []).find((a) => a && a.id === targetId);
  if (!target || target.side !== actor.side || target.dead) return { ok: false, reason: "bad-target" };
  if (target !== actor && !inRange(actor, target, 3)) return { ok: false, reason: "out-of-range" };
  if ((target.recoveries | 0) < 1) return { ok: false, reason: "no-recovery" };
  const pay = spendMana(actor, manaNeed);
  if (!pay.ok) return pay;
  const rngSrc = opts.rng || (state && state.rng) || Math.random;
  const rollFn =
    typeof rngSrc === "function"
      ? rngSrc
      : rngSrc && typeof rngSrc.next === "function"
        ? () => rngSrc.next()
        : Math.random;
  let d1;
  let d2;
  if (opts.declared && opts.declared.d1 != null) {
    d1 = opts.declared.d1 | 0;
    d2 = opts.declared.d2 | 0;
  } else {
    d1 = 1 + Math.floor(rollFn() * 10);
    d2 = 1 + Math.floor(rollFn() * 10);
  }
  const bonus = blessBonus(actor, upcast);
  const heal = Math.max(d1, d2) + bonus;
  target.recoveries = (target.recoveries | 0) - 1;
  target.hp = Math.min(target.hpMax | 0, (target.hp | 0) + heal);
  if ((target.hp | 0) > 0) target.down = false;
  target.blessReroll = (target.blessReroll | 0) + 1;
  actor.blessUsedThisTurn = true;
  return {
    ok: true,
    targetId: target.id,
    heal,
    d1: d1 | 0,
    d2: d2 | 0,
    bonus,
    upcast,
    spendRecovery: true,
  };
}

/** Barkskin SHIELD = 4 + caster INT (Rozwój). */
export function barkskinShieldAmount(actor) {
  return 4 + Math.max(0, (actor && actor.int) | 0);
}

/**
 * Barkskin (Rozwój COMPLETE): Reaction, 1 AP + 1 MANA (+1 upcast), Range 4.
 * Target: SHIELD 4+INT · Immunity to Bleed until end of fight.
 * UPCAST 1: +1×INT Stability.
 */
export function applyBarkskin(state, actor, targetId, opts = {}) {
  if (!actor || !actor.hasBarkskin) return { ok: false, reason: "no-feat" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  const upcast = !!(opts && opts.upcast);
  const manaNeed = upcast ? 2 : 1;
  if (!canPayMana(actor, manaNeed)) return { ok: false, reason: "no-mana" };
  const target =
    !targetId || targetId === actor.id
      ? actor
      : (state.actors || []).find((a) => a && a.id === targetId);
  if (!target || target.side !== actor.side || target.dead) return { ok: false, reason: "bad-target" };
  if (target !== actor && !inRange(actor, target, 4)) return { ok: false, reason: "out-of-range" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  const pay = spendMana(actor, manaNeed);
  if (!pay.ok) {
    actor.ap = (actor.ap | 0) + 1;
    return pay;
  }
  const amount = barkskinShieldAmount(actor);
  if (!target.st) target.st = {};
  target.st.shield = (target.st.shield | 0) + amount;
  const hasBleedImm = (target.immuneStatuses || []).some(
    (s) => String(s).toLowerCase() === "bleed"
  );
  if (!hasBleedImm) {
    target.immuneStatuses = (target.immuneStatuses || []).concat(["bleed"]);
  }
  target.barkskinBleedImmune = true;
  let stabilityGain = 0;
  if (upcast) {
    stabilityGain = Math.max(0, actor.int | 0);
    target.stability = (target.stability | 0) + stabilityGain;
    if (target.stabilityBase != null) {
      target.stabilityBase = (target.stabilityBase | 0) + stabilityGain;
    }
  }
  return {
    ok: true,
    targetId: target.id,
    shield: amount,
    upcast,
    stability: stabilityGain,
  };
}

/** Stealth: 0 AP + 1 stress. Once per round, allowed even after attacking this turn. Attacks still break stealth. Untargetable beyond range 2 (AoE still hits). First melee from stealth is Crit 1. */
export function applyStealth(actor) {
  if (!actor || !actor.hasStealth) return { ok: false, reason: "no-feat" };
  if (actor.stealthUsedThisRound) return { ok: false, reason: "used-this-round" };
  if ((actor.stress | 0) < 1) return { ok: false, reason: "no-stress" };
  if (actor.stealthed) return { ok: false, reason: "already" };
  actor.stress = (actor.stress | 0) - 1;
  actor.stealthed = true;
  actor.stealthCritPending = true;
  actor.stealthUsedThisRound = true;
  return { ok: true };
}

export function clearStealth(actor) {
  if (!actor) return;
  actor.stealthed = false;
}

/** Enhance Weapon (Mystic · Rozwój): 1 AP + 1 mana · Range 1 self.
 *  Weapon deals INT+1 additional damage rest of fight.
 *  Damage type = lowest DEF of the struck target (elementPick-style); opts.dmgType seeds AI/upcast.
 *  opts.upcast (+1 mana): whole weapon damage uses that type. */
export function applyEnhanceWeapon(actor, opts = {}) {
  if (!actor || !actor.hasEnhanceWeapon) return { ok: false, reason: "no-feat" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  const upcast = !!(opts && opts.upcast);
  const manaNeed = 1 + (upcast ? 1 : 0);
  if (!canPayMana(actor, manaNeed)) return { ok: false, reason: "no-mana" };
  if (actor.enhanceWeaponBonus) return { ok: false, reason: "already" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  const pay = spendMana(actor, manaNeed);
  if (!pay.ok) return pay;
  const bonus = (actor.int | 0) + 1;
  actor.enhanceWeaponBonus = bonus;
  if (opts.dmgType) {
    actor.enhanceWeaponType = String(opts.dmgType);
  }
  actor.enhanceWeaponUpcast = upcast;
  return { ok: true, bonus, upcast, dmgType: actor.enhanceWeaponType || null };
}

/**
 * Riposte: Reaction, free action, 1 stress, once per round · reduce DMG by 5×DEX.
 * Only vs RANGE 1 (melee) attacks. If you take no DMG → standard weapon OA (adjacent).
 */
export function tryRiposte(defender, incomingRaw, opts = {}) {
  if (!defender || !defender.hasRiposte) return { ok: false, reason: "no-feat" };
  // Melee RANGE 1 only — never vs ranged / RANGE>1.
  if (opts.ranged || (opts.range != null && (opts.range | 0) > 1)) {
    return { ok: false, reason: "melee-only" };
  }
  if (defender.riposteUsedThisRound) return { ok: false, reason: "used-this-round" };
  if ((defender.stress | 0) < 1) return { ok: false, reason: "no-stress" };
  // Free action reaction: 0 AP, only 1 stress (Rozwój). Once per round.
  defender.riposteUsedThisRound = true;
  defender.stress = (defender.stress | 0) - 1;
  const reduce = 5 * Math.max(0, defender.dex | 0);
  const next = Math.max(0, (incomingRaw | 0) - reduce);
  noteTalent(opts.state, {
    kind: "riposte",
    actorId: defender.id,
    reduce,
    zeroed: next <= 0,
  });
  return { ok: true, reduce, raw: next, oa: next <= 0, pay: { ok: true, apCost: 0 } };
}

/**
 * Hidden Bola [Reaction]: 1 AP + 1 stress · Range 3 · reduce damage by 5×DEX;
 * STR ≤ YOUR DEX → Knockdown. (Light Armor free-reaction may waive the AP.)
 */
export function tryHiddenBola(defender, attacker, incomingRaw, opts = {}) {
  if (!defender || !defender.hasHiddenBola) return { ok: false, reason: "no-feat" };
  if ((defender.stress | 0) < 1) return { ok: false, reason: "no-stress" };
  if (!attacker || !inRange(defender, attacker, 3)) return { ok: false, reason: "oor" };
  const pay = tryPayReaction(defender, {
    lightFree: !!defender.lightArmor,
    forceCost: 1,
  });
  if (!pay.ok) return { ok: false, reason: pay.reason || "no-ap" };
  defender.stress = (defender.stress | 0) - 1;
  const reduce = 5 * Math.max(0, defender.dex | 0);
  const next = Math.max(0, (incomingRaw | 0) - reduce);
  let knockdown = false;
  if ((attacker.str | 0) <= (defender.dex | 0)) {
    knockdown = applyStatus(attacker, { id: "knockdown" }, { sourceId: defender.id, sourceActor: defender });
  }
  return { ok: true, reduce, raw: next, knockdown: !!knockdown, pay };
}

/** Healing Water Recovery bonus (Rozwój): +INT; UPCAST adds +2×INT (total +3×INT). */
export function healingWaterBonus(actor, upcast = false) {
  const INT = Math.max(0, (actor && actor.int) | 0);
  return upcast ? INT + INT * 2 : INT;
}

/**
 * Healing Water (Rozwój COMPLETE): Reaction, 1 AP + 1 MANA (+1 upcast), Range 4.
 * Ally: Cleanse 2+INT; REQUIRES spend 1 Recovery → heal higher of 2d10 + INT (upcast +2×INT → +3×INT);
 * Adv 1 on next roll. Without Recovery: not legal.
 */
export function applyHealingWater(state, actor, targetId, opts = {}) {
  if (!actor || !actor.hasHealingWater) return { ok: false, reason: "no-feat" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  const upcast = !!(opts && opts.upcast);
  const manaNeed = upcast ? 2 : 1;
  if (!canPayMana(actor, manaNeed)) return { ok: false, reason: "no-mana" };
  const target =
    !targetId || targetId === actor.id
      ? actor
      : (state.actors || []).find((a) => a && a.id === targetId);
  if (!target || target.side !== actor.side || target.dead) return { ok: false, reason: "bad-target" };
  if (target !== actor && !inRange(actor, target, 4)) return { ok: false, reason: "out-of-range" };
  if ((target.recoveries | 0) < 1) return { ok: false, reason: "no-recovery" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  const pay = spendMana(actor, manaNeed);
  if (!pay.ok) {
    actor.ap = (actor.ap | 0) + 1;
    return pay;
  }
  const INT = Math.max(0, actor.int | 0);
  const cleansePts = 2 + INT;
  cleanse(target, cleansePts);
  const rngSrc = opts.rng || (state && state.rng) || Math.random;
  const rollFn =
    typeof rngSrc === "function"
      ? rngSrc
      : rngSrc && typeof rngSrc.next === "function"
        ? () => rngSrc.next()
        : Math.random;
  let d1;
  let d2;
  if (opts.declared && opts.declared.d1 != null) {
    d1 = opts.declared.d1 | 0;
    d2 = opts.declared.d2 | 0;
  } else {
    d1 = 1 + Math.floor(rollFn() * 10);
    d2 = 1 + Math.floor(rollFn() * 10);
  }
  const bonus = healingWaterBonus(actor, upcast);
  const heal = Math.max(d1, d2) + bonus;
  target.recoveries = (target.recoveries | 0) - 1;
  target.hp = Math.min(target.hpMax | 0, (target.hp | 0) + heal);
  if ((target.hp | 0) > 0) target.down = false;
  if (!target.nextAttack) target.nextAttack = { break: 0, critX: 0, adv: 0, disadv: 0 };
  target.nextAttack.adv = (target.nextAttack.adv | 0) + 1;
  return {
    ok: true,
    targetId: target.id,
    heal,
    d1,
    d2,
    bonus,
    cleansePts,
    upcast,
  };
}

/**
 * Feral Invocation activate (Rozwój COMPLETE): 1 AP + 2 stress.
 * Until end of fight: Break (YOUR STR + 1) on attacks/skills; weapon T3 → Fear if INT ≤ YOUR STR.
 * (+1 Speed is passive on stub apply — not here.)
 */
export function activateFeralInvocation(actor) {
  if (!actor || !actor.hasFeralInvocation) return { ok: false, reason: "no-feat" };
  if (actor.feralActive) return { ok: false, reason: "already" };
  if ((actor.ap | 0) < 1) return { ok: false, reason: "no-ap" };
  if ((actor.stress | 0) < 2) return { ok: false, reason: "no-stress" };
  if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
  actor.stress = (actor.stress | 0) - 2;
  actor.feralActive = true;
  actor.feralBreak = true;
  actor.feralFearOnT3 = true;
  return { ok: true, breakStr: (actor.str | 0) + 1 };
}


