/**
 * Horde stack helpers (RULES-CANON §10a).
 * One BP card = one stack brain: X tokens on the board (X = units).
 * Shared HP pool on the primary; overflow culls tokens; one queue activation.
 */
import { inRange } from "./grid.js";

export function isHorde(actor) {
  return !!(
    actor &&
    (actor.horde ||
      /horde/i.test(String(actor.monsterType || "")) ||
      ((actor.unitHp | 0) > 0 && (actor.unitsMax | 0) > 0))
  );
}

/** Living pawn count X (ceil of remaining HP / unitHp) on the stack primary. */
export function hordeUnitsAlive(actor) {
  const primary = actor && actor.hordeFollower ? null : actor;
  const a = primary || actor;
  if (!isHorde(a)) return 0;
  const y = Math.max(1, a.unitHp | 0);
  const hp = Math.max(0, a.hp | 0);
  if (hp <= 0 || a.dead || a.alive === false) return 0;
  return Math.max(1, Math.ceil(hp / y));
}

export function hordePrimary(actors, stackId) {
  if (!stackId) return null;
  const members = (actors || []).filter(
    (a) => a && a.hordeStackId === stackId && !a.dead && a.alive !== false
  );
  return members.find((a) => a.hordeIsPrimary) || members[0] || null;
}

export function hordeMembers(actors, stackId) {
  return (actors || []).filter(
    (a) =>
      a &&
      a.hordeStackId === stackId &&
      !a.dead &&
      a.alive !== false &&
      (a.hp | 0) > 0
  );
}

/** True if any living token of the attacker's stack is within range of target. */
export function hordeStackInRange(attacker, target, range, actors) {
  if (!attacker || !target) return false;
  if (!attacker.hordeStackId) return inRange(attacker, target, range);
  const members = hordeMembers(actors, attacker.hordeStackId);
  if (!members.length) return inRange(attacker, target, range);
  return members.some((m) => inRange(m, target, range));
}

/** Keep unitsRemaining in sync after HP changes on the primary. */
export function syncHordeAfterHp(actor) {
  if (!isHorde(actor) || actor.hordeFollower) return;
  const x = hordeUnitsAlive(actor);
  actor.units = x;
  actor.unitsRemaining = x;
}

/**
 * After shared-pool damage: keep exactly X living tokens (primary + followers).
 * Extra tokens are removed from the board (dead).
 * @param {object[]} actors
 * @param {string} stackId
 * @param {{ preferRemoveIds?: string[], noSpill?: boolean }} [opts]
 *   preferRemoveIds — remove these first when overflowing (struck / in-blast pawns)
 *   noSpill — never revive dead tokens (AoE already killed the struck pawns)
 */
export function cullHordeTokens(actors, stackId, opts = {}) {
  if (!stackId || !Array.isArray(actors)) return [];
  let primary = hordePrimary(actors, stackId);
  if (!primary) return [];
  syncHordeAfterHp(primary);
  const need = hordeUnitsAlive(primary);
  const prefer = new Set(opts.preferRemoveIds || []);
  const noSpill = !!opts.noSpill;
  const members = actors.filter((a) => a && a.hordeStackId === stackId);
  const removed = [];

  if (primary.dead || (primary.hp | 0) <= 0 || need < 1) {
    for (const m of members) {
      if (!m.dead) {
        m.hp = 0;
        m.dead = true;
        m.alive = false;
        removed.push(m.id);
      }
    }
    return removed;
  }

  // Candidates to keep: living, or (if !noSpill) any member we may revive.
  const candidates = members.filter((m) => {
    const alive = !m.dead && m.alive !== false && (m.hp | 0) > 0;
    return alive || !noSpill;
  });
  // Keep non-preferred first; preferred (struck) last → they die first on overflow.
  candidates.sort((a, b) => {
    const ar = prefer.has(a.id) ? 1 : 0;
    const br = prefer.has(b.id) ? 1 : 0;
    if (ar !== br) return ar - br;
    return (a.hordeIndex | 0) - (b.hordeIndex | 0);
  });
  const keepIds = new Set(candidates.slice(0, need).map((m) => m.id));

  // If the shared-pool primary is being culled, move the pool onto a kept token first.
  if (primary && !keepIds.has(primary.id)) {
    const next = candidates.find((m) => keepIds.has(m.id));
    if (next) {
      next.hp = primary.hp | 0;
      next.hpMax = primary.hpMax | 0;
      next.units = primary.units;
      next.unitsMax = primary.unitsMax;
      next.unitsRemaining = primary.unitsRemaining;
      next.unitHp = primary.unitHp;
      next.horde = primary.horde;
      next.hordeIsPrimary = true;
      next.hordeFollower = false;
      next.dead = false;
      next.alive = true;
      primary.hordeIsPrimary = false;
      primary.hordeFollower = true;
      primary = next;
    }
  }

  const unitHp = Math.max(1, primary.unitHp | 0);
  for (const m of members) {
    if (keepIds.has(m.id)) {
      if (!m.hordeIsPrimary) {
        m.hp = unitHp;
        m.hpMax = unitHp;
      }
      m.dead = false;
      m.alive = true;
      continue;
    }
    if (!m.dead && m.alive !== false && (m.hp | 0) > 0) {
      m.hp = 0;
      m.dead = true;
      m.alive = false;
      m.hordeIsPrimary = false;
      m.hordeFollower = true;
      removed.push(m.id);
    }
  }
  promoteHordePrimaryIfNeeded(actors, stackId);
  return removed;
}

/**
 * AoE vs horde: spend at most one unit slot on the struck token; excess is wasted.
 * Marks that pawn dead when a full slot is spent; promotes a new primary if needed.
 * Careful: the shared pool lives on the primary — never zero primary.hp before promote.
 */
export function resolveHordeAoeTokenHit(actors, hitToken, dealtToPool) {
  if (!hitToken || !hitToken.hordeStackId || !Array.isArray(actors)) return;
  const stackId = hitToken.hordeStackId;
  const primary = hordePrimary(actors, stackId);
  if (!primary) return;
  const unitHp = Math.max(1, primary.unitHp | 0);
  syncHordeAfterHp(primary);
  if ((dealtToPool | 0) >= unitHp && !hitToken.dead) {
    hitToken.dead = true;
    hitToken.alive = false;
    // If the struck pawn holds the pool, promote BEFORE clearing hp.
    if (hitToken.hordeIsPrimary) {
      promoteHordePrimaryIfNeeded(actors, stackId);
      hitToken.hp = 0;
      hitToken.hordeIsPrimary = false;
      hitToken.hordeFollower = true;
    } else {
      hitToken.hp = 0;
      promoteHordePrimaryIfNeeded(actors, stackId);
    }
  } else {
    promoteHordePrimaryIfNeeded(actors, stackId);
  }
  cullHordeTokens(actors, stackId, {
    preferRemoveIds: [hitToken.id],
    noSpill: true,
  });
}

/** If the stack primary was culled/killed but the pool remains, promote another living token. */
export function promoteHordePrimaryIfNeeded(actors, stackId) {
  if (!stackId || !Array.isArray(actors)) return null;
  const members = actors.filter((a) => a && a.hordeStackId === stackId);
  const livePrimary = members.find(
    (a) => a.hordeIsPrimary && !a.dead && a.alive !== false && (a.hp | 0) > 0
  );
  if (livePrimary) return livePrimary;
  const donor = members.find((a) => a.hordeIsPrimary) || members[0];
  const next = members
    .filter((a) => a && !a.dead && a.alive !== false && (a.hp | 0) > 0)
    .sort((a, b) => (a.hordeIndex | 0) - (b.hordeIndex | 0))[0];
  if (!next || !donor) return null;
  // Move shared pool onto the new primary.
  next.hp = donor.hp | 0;
  next.hpMax = donor.hpMax | 0;
  next.units = donor.units;
  next.unitsMax = donor.unitsMax;
  next.unitsRemaining = donor.unitsRemaining;
  next.unitHp = donor.unitHp;
  next.horde = donor.horde;
  next.hordeIsPrimary = true;
  next.hordeFollower = false;
  next.bossTurns = donor.bossTurns;
  for (const m of members) {
    if (m === next) continue;
    m.hordeIsPrimary = false;
    m.hordeFollower = true;
    if (!m.dead) {
      m.hp = Math.max(1, next.unitHp | 0);
      m.hpMax = next.unitHp | 0;
    }
  }
  syncHordeAfterHp(next);
  return next;
}

/**
 * Redirect follower hits onto the stack primary (shared pool / overflow).
 */
export function resolveHordeDamageTarget(target, actors) {
  if (!target || !target.hordeFollower || !target.hordeStackId) return target;
  return hordePrimary(actors, target.hordeStackId) || target;
}

/**
 * Resolve horde-scaled printed damage.
 * Tier may use { dmgPerUnit, dmgFlat } and/or plain dmg.
 */
export function resolveHordeScaledDmg(tierEffect, attacker) {
  if (!tierEffect) return 0;
  const per = tierEffect.dmgPerUnit;
  if (per != null && isHorde(attacker)) {
    const x = hordeUnitsAlive(attacker);
    return Math.max(0, (Number(per) || 0) * x + (Number(tierEffect.dmgFlat) || 0));
  }
  return Number(tierEffect.dmg) || 0;
}

/**
 * Expand a single horde mob into X board tokens around (x,y).
 * Primary holds the shared HP pool; followers are pushable / targetable bodies.
 * @param {object} actor
 * @param {Set} occupied
 * @param {object} bounds
 * @param {{ groupIndex?: number }} [opts] — which copy of this horde card (1, 2, …) for labels h1.1 / h2.1
 */
export function expandHordeToTokens(actor, occupied, bounds, opts = {}) {
  if (!actor || !isHorde(actor) || (actor.unitsMax | 0) <= 1) {
    return [actor];
  }
  const n = Math.max(1, actor.unitsMax | 0);
  const group = Math.max(1, (opts.groupIndex | 0) || (actor.hordeGroup | 0) || 1);
  const stackId = (actor.id || "horde") + "-stack";
  const cells = clusterCells(actor.x | 0, actor.y | 0, n, occupied, bounds);
  const letter = String(actor.token || "h").replace(/\d.*$/, "") || "h";
  const out = [];
  for (let i = 0; i < n; i++) {
    const cell = cells[i] || { x: actor.x | 0, y: actor.y | 0 };
    const u = {
      ...actor,
      id: stackId + "-u" + (i + 1),
      name: hordeTokenName(actor.name, group, i + 1),
      x: cell.x,
      y: cell.y,
      hordeStackId: stackId,
      hordeGroup: group,
      hordeIndex: i,
      hordeIsPrimary: i === 0,
      hordeFollower: i > 0,
      token: letter + group + "." + (i + 1),
      st: actor.st ? { ...actor.st } : actor.st,
      def: actor.def ? { ...actor.def } : actor.def,
      defBase: actor.defBase ? { ...actor.defBase } : actor.defBase,
      tags: actor.tags ? actor.tags.slice() : [],
      abilityIds: actor.abilityIds ? actor.abilityIds.slice() : [],
      reactionIds: actor.reactionIds ? actor.reactionIds.slice() : [],
    };
    if (i === 0) {
      u.hp = actor.hpMax | 0;
      u.hpMax = actor.hpMax | 0;
    } else {
      u.hp = actor.unitHp | 0;
      u.hpMax = actor.unitHp | 0;
      u.bossTurns = 1;
    }
    out.push(u);
    occupied.add(cell.x + "," + cell.y);
  }
  return out;
}

function hordeTokenName(base, group, unit) {
  const root = String(base || "Horde")
    .replace(/\s+\d+$/, "")
    .replace(/\s+\d+·\d+$/, "")
    .trim();
  return root + " " + group + "·" + unit;
}

/** Compact spiral of free cells around an anchor. */
export function clusterCells(ax, ay, count, occupied, bounds) {
  const out = [];
  const seen = new Set();
  const b = bounds || { minX: 0, maxX: 11, minY: 0, maxY: 7 };
  function tryAdd(x, y) {
    const k = x + "," + y;
    if (seen.has(k)) return;
    if (x < (b.minX | 0) || x > (b.maxX | 0) || y < (b.minY | 0) || y > (b.maxY | 0)) {
      return;
    }
    if (occupied && occupied.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  }
  tryAdd(ax, ay);
  for (let ring = 1; out.length < count && ring < 12; ring++) {
    for (let dy = -ring; dy <= ring && out.length < count; dy++) {
      for (let dx = -ring; dx <= ring && out.length < count; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        tryAdd(ax + dx, ay + dy);
      }
    }
  }
  while (out.length < count) {
    out.push({ x: ax, y: ay });
  }
  return out.slice(0, count);
}

/** Enemies that take a queue slot (skip horde followers). */
export function queueableEnemies(enemies) {
  return (enemies || []).filter((e) => e && !e.hordeFollower);
}
