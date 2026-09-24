import {
  chebyshev,
  inRange,
  actorSize,
  footprintKeys,
  footprintFree,
  footprintCells,
  atAnchor,
} from "./grid.js";
import {
  spendAp,
  spendMonsterMove,
  spendMonsterAction,
  isMonsterEconomy,
  canReact,
  noteMoved,
  oaRangeFor,
} from "./turn.js";
import { resolveStrike } from "./strike.js";
import { applyDamage } from "./damage.js";
import { shockOnWillingMove } from "./status.js";
import { applyHazardEnter, isDifficultCell } from "./terrain.js";

/**
 * Move / Careful Step with simple OA when leaving enemy RANGE 1.
 * Large creatures (size>1): (x,y) is NW anchor; pathing shifts the whole footprint.
 */

function occupiedSet(actors, ignoreId) {
  const s = new Set();
  for (const a of actors || []) {
    if (!a || a.dead || a.alive === false) continue;
    if (a.id === ignoreId) continue;
    if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
    for (const k of footprintKeys(a)) s.add(k);
  }
  return s;
}

const DIRS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

function stepMoveCost(hazards, x, y) {
  return isDifficultCell(hazards, x, y) ? 2 : 1;
}

/** Cost to place a size-N footprint at NW anchor (max cell cost, min 1). */
function footprintStepCost(hazards, ax, ay, size) {
  const n = Math.max(1, size | 0 || 1);
  let cost = 1;
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      const c = stepMoveCost(hazards, ax + dx, ay + dy);
      if (c > cost) cost = c;
    }
  }
  return cost;
}

/**
 * Costed BFS on NW anchors. Difficult terrain costs 2.
 * Returns anchor cells after leaving start (empty if unreachable within maxSteps).
 */
export function pathTo(from, dest, maxSteps, blockers, bounds, hazards) {
  const size = actorSize(from);
  const sx = from.x | 0;
  const sy = from.y | 0;
  const gx = dest.x | 0;
  const gy = dest.y | 0;
  if (sx === gx && sy === gy) return [];
  const max = Math.max(0, maxSteps | 0);
  if (!max) return [];

  const selfKeys = new Set(footprintKeys(from));
  const startKey = sx + "," + sy;
  const goalKey = gx + "," + gy;
  const prev = new Map();
  const dist = new Map();
  dist.set(startKey, 0);
  const q = [{ x: sx, y: sy }];

  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const ck = cur.x + "," + cur.y;
    const d = dist.get(ck) | 0;
    if (d >= max) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = nx + "," + ny;
      const isGoal = nk === goalKey;
      if (!footprintFree(nx, ny, size, blockers, bounds, selfKeys) && !isGoal) continue;
      if (isGoal && !footprintFree(nx, ny, size, blockers, bounds, selfKeys)) continue;
      const nd = d + footprintStepCost(hazards, nx, ny, size);
      if (nd > max) continue;
      if (dist.has(nk) && (dist.get(nk) | 0) <= nd) continue;
      dist.set(nk, nd);
      prev.set(nk, { x: cur.x, y: cur.y });
      q.push({ x: nx, y: ny });
    }
  }

  if (!dist.has(goalKey)) return [];

  const path = [];
  let cx = gx;
  let cy = gy;
  while (!(cx === sx && cy === sy)) {
    path.push({ x: cx, y: cy });
    const p = prev.get(cx + "," + cy);
    if (!p) return [];
    cx = p.x;
    cy = p.y;
  }
  path.reverse();
  return path;
}

/** All NW anchors reachable in ≤ maxSteps (difficult costs 2). */
export function reachableCells(from, maxSteps, blockers, bounds, hazards) {
  const size = actorSize(from);
  const sx = from.x | 0;
  const sy = from.y | 0;
  const max = Math.max(0, maxSteps | 0);
  const out = [];
  const selfKeys = new Set(footprintKeys(from));
  const dist = new Map();
  dist.set(sx + "," + sy, 0);
  const q = [{ x: sx, y: sy }];
  for (let qi = 0; qi < q.length; qi++) {
    const cur = q[qi];
    const d = dist.get(cur.x + "," + cur.y) | 0;
    if (d >= max) continue;
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = nx + "," + ny;
      if (!footprintFree(nx, ny, size, blockers, bounds, selfKeys)) continue;
      const nd = d + footprintStepCost(hazards, nx, ny, size);
      if (nd > max) continue;
      if (dist.has(nk) && (dist.get(nk) | 0) <= nd) continue;
      dist.set(nk, nd);
      q.push({ x: nx, y: ny });
      out.push({ x: nx, y: ny });
    }
  }
  return out;
}

function enemiesInOaReach(mover, others, reach) {
  const r = reach != null ? reach | 0 : 1;
  return (others || []).filter(
    (e) =>
      e &&
      e !== mover &&
      !e.dead &&
      e.alive !== false &&
      e.side &&
      e.side !== mover.side &&
      inRange(mover, e, r)
  );
}

function applyFootprintHazards(actor, hazards, prevAnchor, nextAnchor, hazardEvents) {
  const prev = new Set(footprintKeys(atAnchor(actor, prevAnchor)));
  for (const c of footprintCells(atAnchor(actor, nextAnchor))) {
    const k = c.x + "," + c.y;
    if (prev.has(k)) continue;
    const hz = applyHazardEnter(actor, hazards, c.x, c.y);
    if (hz > 0) hazardEvents.push({ x: c.x, y: c.y, dmg: hz });
  }
}

/**
 * @param {object} opts
 * @param {object} opts.actor
 * @param {{x:number,y:number}} opts.dest  NW anchor
 * @param {object[]} opts.actors all combatants
 * @param {number} [opts.maxSteps]
 * @param {boolean} [opts.careful] Careful Step — no OA
 * @param {boolean} [opts.skipAp]
 * @param {function} [opts.rng]
 * @param {function} [opts.getReactionAbility] (enemy) => ability card for OA
 * @param {object} [opts.abilityById]
 */
export function resolveMove(opts) {
  const actor = opts.actor;
  const dest = opts.dest;
  if (!actor || !dest) return { ok: false, reason: "missing" };
  if (actor.dead) return { ok: false, reason: "dead" };

  const size = actorSize(actor);
  const maxSteps =
    opts.maxSteps != null
      ? opts.maxSteps | 0
      : opts.careful
        ? 3
        : isMonsterEconomy(actor)
          ? Math.max(0, actor.speed | 0)
          : Math.max(
              0,
              actor.moveBudget != null ? actor.moveBudget | 0 : actor.speed | 0
            );

  const blockers = occupiedSet(opts.actors, actor.id);
  for (const k of opts.objectKeys || []) blockers.add(k);
  if (opts.objects) {
    for (const o of opts.objects) {
      if (!o || o.destroyed || (o.hp | 0) <= 0) continue;
      blockers.add((o.x | 0) + "," + (o.y | 0));
    }
  }
  const selfKeys = new Set(footprintKeys(actor));
  if (!footprintFree(dest.x | 0, dest.y | 0, size, blockers, opts.bounds, selfKeys)) {
    return { ok: false, reason: "occupied" };
  }

  const bounds = opts.bounds;
  // Anchor-to-anchor Chebyshev (not footprint min) for step budget estimate
  const dist = Math.max(
    Math.abs((actor.x | 0) - (dest.x | 0)),
    Math.abs((actor.y | 0) - (dest.y | 0))
  );
  if (dist === 0) return { ok: false, reason: "same-cell" };
  const hazards = opts.hazards || null;
  if (!hazards || !hazards.length) {
    if (dist > maxSteps) return { ok: false, reason: "too-far" };
  }

  const monster = isMonsterEconomy(actor);
  let paidUnlock = false;
  let paidChase = false;
  if (!opts.skipAp) {
    if (monster) {
      if (opts.asChase || opts.chase) {
        if (!spendMonsterAction(actor)) return { ok: false, reason: "no-action" };
        paidChase = true;
      } else {
        if (!spendMonsterMove(actor)) return { ok: false, reason: "no-move" };
      }
    } else if (opts.careful) {
      if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
    } else if (!actor.moveUnlocked) {
      if (!spendAp(actor, 1)) return { ok: false, reason: "no-ap" };
      paidUnlock = true;
    }
  }

  const path = pathTo(actor, dest, maxSteps, blockers, bounds, hazards);
  if (!path.length) {
    if (!opts.skipAp) {
      if (monster) {
        if (paidChase) actor.actionLeft = (actor.actionLeft | 0) + 1;
        else actor.moveLeft = (actor.moveLeft | 0) + 1;
      } else if (opts.careful || paidUnlock) actor.ap = (actor.ap | 0) + 1;
    }
    return { ok: false, reason: "blocked" };
  }

  const stepsUsed = path.length;
  if (!monster && !opts.careful) {
    if (paidUnlock || !actor.moveUnlocked) actor.moveUnlocked = true;
    if (actor.moveBudget != null) {
      actor.moveBudget = Math.max(0, (actor.moveBudget | 0) - stepsUsed);
    }
  }

  const oaEvents = [];
  const pendingOas = [];
  const hazardEvents = [];
  if (!opts.careful) {
    let pos = atAnchor(actor, actor.x, actor.y);
    for (const step of path) {
      const next = atAnchor(actor, step);
      const watchers = (opts.actors || []).filter(
        (e) =>
          e &&
          e !== actor &&
          !e.dead &&
          e.alive !== false &&
          e.side &&
          e.side !== actor.side
      );
      for (const enemy of watchers) {
        const reach = oaRangeFor(enemy);
        const wasIn = inRange(pos, enemy, reach);
        const stillIn = inRange(next, enemy, reach);
        if (!wasIn || stillIn) continue;
        if (!canReact(enemy) && !enemy.lightArmor) continue;
        const ab =
          typeof opts.getReactionAbility === "function"
            ? opts.getReactionAbility(enemy)
            : null;
        if (!ab) continue;
        // Horde: one OA per stack (shared brain), not per token.
        const stackKey = enemy.hordeStackId || enemy.id;
        if (
          oaEvents.some((p) => p.stackKey === stackKey) ||
          pendingOas.some((p) => p.stackKey === stackKey)
        ) {
          continue;
        }
        const oaAttacker =
          enemy.hordeFollower && enemy.hordeStackId
            ? (opts.actors || []).find(
                (a) =>
                  a &&
                  a.hordeStackId === enemy.hordeStackId &&
                  a.hordeIsPrimary
              ) || enemy
            : enemy;
        // Table sandbox: pause for Defend / Catch Breath before OA damage.
        if (opts.deferOa) {
          pendingOas.push({
            fromId: oaAttacker.id,
            toId: actor.id,
            abilityId: ab.id,
            stackKey,
            step: { x: next.x | 0, y: next.y | 0 },
          });
          continue;
        }
        const hit = resolveStrike({
          attacker: oaAttacker,
          target: actor,
          ability: ab,
          rng: opts.rng,
          asReaction: true,
          asOa: true,
          extraAdv:
            (isMonsterEconomy(oaAttacker) ? 0 : 1) +
            (oaAttacker.vigilant && !isMonsterEconomy(oaAttacker) ? 1 : 0),
          allies: (opts.actors || []).filter((a) => a.side === oaAttacker.side),
          actors: opts.actors || [],
          skipRangedOa: true,
          maybeDefend:
            typeof opts.maybeDefend === "function" ? opts.maybeDefend : null,
          maybeMitigation:
            typeof opts.maybeMitigation === "function" ? opts.maybeMitigation : null,
          state: opts.state || null,
        });
        if (hit && hit.ok && oaAttacker.vigilant) oaAttacker.vigilantMoveReady = true;
        oaEvents.push({ from: oaAttacker.id, result: hit, stackKey });
        if (actor.dead || (actor.hp | 0) <= 0) break;
      }
      applyFootprintHazards(actor, hazards, pos, next, hazardEvents);
      pos = next;
      if (actor.dead || (actor.hp | 0) <= 0) break;
    }
  } else {
    let pos = atAnchor(actor, actor.x, actor.y);
    for (const step of path) {
      const next = atAnchor(actor, step);
      applyFootprintHazards(actor, hazards, pos, next, hazardEvents);
      pos = next;
      if (actor.dead || (actor.hp | 0) <= 0) break;
    }
  }

  const end = path[path.length - 1];
  actor.x = end.x | 0;
  actor.y = end.y | 0;
  noteMoved(actor);

  const shockDmg = shockOnWillingMove(actor, function (t, x) {
    applyDamage(t, x, {
      unpreventable: true,
      dmgType: "Lightning",
      isDot: true,
      skipBleed: true,
    });
  });

  return {
    ok: true,
    careful: !!opts.careful,
    path,
    oaEvents,
    pendingOas,
    hazardEvents,
    shockDmg: shockDmg | 0,
  };
}
