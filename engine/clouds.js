/**
 * Toxic Cloud zone (canon): lasts until end of fight.
 * Enter or start of turn there: 4×INT Toxic, and INT ≤ YOUR INT → Poison 2.
 * UPCAST: the owner may slide the anchor up to 2 at the start of their turn.
 */
import { chebyshev, inRange } from "./grid.js";
import { applyDamage } from "./damage.js";
import { applyStatus } from "./status.js";
import { noteTalent } from "./talentTrace.js";

export function toxicCloudDamage(owner) {
  return 4 * Math.max(0, (owner && owner.int) | 0);
}

function cloudIdFor(owner) {
  return "toxic-" + (owner && owner.id ? owner.id : "caster");
}

export function findCloud(state, ownerId) {
  return ((state && state.clouds) || []).find((c) => c && c.ownerId === ownerId) || null;
}

function cellsFor(cloud, bounds) {
  const cells = [];
  const r = cloud.radius | 0;
  const ax = cloud.ax | 0;
  const ay = cloud.ay | 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
      const x = ax + dx;
      const y = ay + dy;
      if (bounds) {
        if (x < (bounds.minX | 0) || x > (bounds.maxX | 0)) continue;
        if (y < (bounds.minY | 0) || y > (bounds.maxY | 0)) continue;
      }
      cells.push({ x, y });
    }
  }
  return cells;
}

function syncHazards(state, cloud) {
  state.hazards = (state.hazards || []).filter((h) => !h || h.cloudId !== cloud.id);
  for (const c of cellsFor(cloud, state.bounds)) {
    state.hazards.push({
      id: cloud.id + "-" + c.x + "," + c.y,
      cloudId: cloud.id,
      ownerId: cloud.ownerId,
      x: c.x,
      y: c.y,
      difficult: false,
      enterDmg: cloud.dmg | 0,
      unpreventable: false,
      dmgType: "Toxic",
      poison: cloud.poison | 0,
      gateInt: cloud.gateInt | 0,
      label: "Toxic Cloud",
    });
  }
}

/** Typed Toxic hit + Poison gate. DEF applies. Does not tick the DoT. */
export function applyCloudPulse(actor, cloud, actors, state, reason) {
  if (!actor || actor.dead || (actor.hp | 0) <= 0 || !cloud) return null;
  const dmg = cloud.dmg | 0;
  if (dmg > 0) {
    applyDamage(actor, dmg, {
      dmgType: "Toxic",
      unpreventable: false,
      skipBleed: true,
      actors: actors || (state && state.actors) || null,
    });
  }
  let poisoned = false;
  if ((cloud.poison | 0) > 0 && (actor.int | 0) <= (cloud.gateInt | 0)) {
    poisoned = !!applyStatus(
      actor,
      { id: "poison", x: cloud.poison | 0 },
      { sourceId: cloud.ownerId, sourceActor: null }
    );
  }
  noteTalent(state, {
    kind: "cloudPulse",
    reason: reason || "pulse",
    cloudId: cloud.id,
    ownerId: cloud.ownerId,
    targetId: actor.id,
    side: actor.side,
    self: actor.id === cloud.ownerId,
    dmg,
    poisoned,
    poison: (actor.st && actor.st.poison) | 0,
  });
  return { dmg, poisoned };
}

function pulseOccupants(state, cloud, cellSet, reason) {
  const pulsed = [];
  for (const a of state.actors || []) {
    if (!a || a.dead || (a.hp | 0) <= 0) continue;
    const key = (a.x | 0) + "," + (a.y | 0);
    if (cellSet && !cellSet.has(key)) continue;
    if (!cellSet && chebyshev({ x: cloud.ax, y: cloud.ay }, a) > (cloud.radius | 0)) continue;
    applyCloudPulse(a, cloud, state.actors, state, reason);
    pulsed.push(a.id);
  }
  return pulsed;
}

/**
 * Place or replace this caster's cloud, centered on `anchor`.
 * Creatures already standing there take the enter pulse immediately.
 */
export function paintToxicCloud(state, owner, anchor, opts = {}) {
  if (!state || !owner || !anchor) return null;
  const id = cloudIdFor(owner);
  const cloud = {
    id,
    ownerId: owner.id,
    ax: anchor.x | 0,
    ay: anchor.y | 0,
    radius: opts.radius != null ? opts.radius | 0 : 3,
    dmg: toxicCloudDamage(owner),
    poison: 2,
    gateInt: Math.max(0, owner.int | 0),
    upcast: !!opts.upcast,
    dmgType: "Toxic",
  };
  state.clouds = (state.clouds || []).filter((c) => !c || c.id !== id);
  state.clouds.push(cloud);
  syncHazards(state, cloud);
  const pulsedIds = pulseOccupants(state, cloud, null, "cast");
  noteTalent(state, {
    kind: "cloudCast",
    ownerId: owner.id,
    upcast: !!opts.upcast,
    dmg: cloud.dmg,
    ax: cloud.ax,
    ay: cloud.ay,
    radius: cloud.radius,
    hits: pulsedIds.length,
  });
  cloud.lastPulsedIds = pulsedIds;
  return cloud;
}

function cellKey(x, y) {
  return (x | 0) + "," + (y | 0);
}

/** Slide an upcast cloud at most 2 toward the best enemy cluster. New cells pulse. */
export function moveUpcastClouds(state, owner) {
  if (!state || !owner) return null;
  const cloud = findCloud(state, owner.id);
  if (!cloud || !cloud.upcast) return null;
  const foes = (state.actors || []).filter(
    (a) => a && a.side !== owner.side && !a.dead && (a.hp | 0) > 0
  );
  const heroes = (state.actors || []).filter(
    (a) => a && a.side === owner.side && !a.dead && (a.hp | 0) > 0
  );
  let best = { x: cloud.ax | 0, y: cloud.ay | 0, score: -999 };
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 2) continue;
      const ax = (cloud.ax | 0) + dx;
      const ay = (cloud.ay | 0) + dy;
      const origin = { x: ax, y: ay };
      let enemies = 0;
      let allies = 0;
      for (const f of foes) if (chebyshev(origin, f) <= (cloud.radius | 0)) enemies += 1;
      for (const h of heroes) if (chebyshev(origin, h) <= (cloud.radius | 0)) allies += 1;
      const score = enemies * 3 - allies * 5;
      if (score > best.score) best = { x: ax, y: ay, score };
    }
  }
  if ((best.x | 0) === (cloud.ax | 0) && (best.y | 0) === (cloud.ay | 0)) {
    return { cloud, pulsedIds: [] };
  }
  const before = new Set(cellsFor(cloud, state.bounds).map((c) => cellKey(c.x, c.y)));
  cloud.ax = best.x | 0;
  cloud.ay = best.y | 0;
  syncHazards(state, cloud);
  const after = cellsFor(cloud, state.bounds);
  const fresh = new Set();
  for (const c of after) {
    const k = cellKey(c.x, c.y);
    if (!before.has(k)) fresh.add(k);
  }
  const pulsedIds = fresh.size ? pulseOccupants(state, cloud, fresh, "move") : [];
  noteTalent(state, {
    kind: "cloudMove",
    ownerId: owner.id,
    ax: cloud.ax,
    ay: cloud.ay,
  });
  return { cloud, pulsedIds };
}

/** Start of turn: creatures already in a cloud take the pulse (unless this turn already pulsed them). */
export function pulseCloudsAtStart(state, actor) {
  if (!state || !actor || actor.dead || (actor.hp | 0) <= 0) return;
  const here = cellKey(actor.x, actor.y);
  for (const cloud of state.clouds || []) {
    if (!cloud) continue;
    const inside = cellsFor(cloud, state.bounds).some((c) => cellKey(c.x, c.y) === here);
    if (!inside) continue;
    applyCloudPulse(actor, cloud, state.actors, state, "start");
  }
}

export function heroInToxicCloud(actor, state) {
  if (!actor || !state) return false;
  const here = cellKey(actor.x, actor.y);
  return (state.hazards || []).some(
    (h) => h && h.cloudId && (h.x | 0) + "," + (h.y | 0) === here
  );
}

export function cellInToxicCloud(x, y, state) {
  const here = (x | 0) + "," + (y | 0);
  const hazards = (state && state.hazards) || [];
  return hazards.some((h) => h && h.cloudId && (h.x | 0) + "," + (h.y | 0) === here);
}

export function cloudCovers(cloud, actor) {
  if (!cloud || !actor) return false;
  return inRange({ x: cloud.ax, y: cloud.ay }, actor, cloud.radius | 0);
}
