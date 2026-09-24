/**
 * Forced movement (Push / Pull / Slide) — Stability first.
 * Collision into creature: leftover → packet 2 unprev × leftover, split evenly
 * (odd extra to the forced creature).
 * Collision into object: same packet vs hardness (Wood 4 / Stone 6 / Steel 10);
 * destroy → +5 unpreventable on the forced creature. RULES-CANON / Mechanika.
 */
import { chebyshev, actorSize, footprintKeys, footprintCells, footprintInBounds } from "./grid.js";
import { applyDamage } from "./damage.js";
import { applyHazardEnter } from "./terrain.js";
import { iceWallDestroySplash } from "./feats.js";

export const HARDNESS = { wood: 4, stone: 6, steel: 10 };
export const DESTROY_BONUS = 5;

function occupiedActors(actors, ignoreId) {
  const map = new Map();
  for (const a of actors || []) {
    if (!a || a.dead || a.alive === false) continue;
    if (a.id === ignoreId) continue;
    if ((a.hp | 0) <= 0 && a.side === "enemy") continue;
    for (const k of footprintKeys(a)) map.set(k, a);
  }
  return map;
}

function objectsMap(objects) {
  const map = new Map();
  for (const o of objects || []) {
    if (!o) continue;
    const key = (o.x | 0) + "," + (o.y | 0);
    map.set(key, o);
  }
  return map;
}

function materialHp(mat) {
  const m = String(mat || "wood").toLowerCase();
  if (HARDNESS[m] != null) return HARDNESS[m] | 0;
  if (m === "wall" || m === "edge") return HARDNESS.stone;
  return HARDNESS.wood;
}

/**
 * Hit an object / edge with a collision packet.
 * @returns {{ packet, toForced, objectDestroyed, objectHpLeft }}
 */
export function resolveObjectCollision(forced, leftover, opts = {}) {
  const packet = 2 * Math.max(0, leftover | 0);
  let toForced = packet;
  let objectDestroyed = false;
  let objectHpLeft = null;
  const obj = opts.object;
  if (obj && packet > 0) {
    if (obj.hp == null) obj.hp = materialHp(obj.material || obj.hardness);
    obj.hp = (obj.hp | 0) - packet;
    objectHpLeft = obj.hp;
    if (obj.hp <= 0) {
      objectDestroyed = true;
      obj.destroyed = true;
      toForced = packet + DESTROY_BONUS;
    }
  }
  if (toForced > 0) {
    applyDamage(forced, toForced, { unpreventable: true, skipBleed: true, isDot: true });
  }
  let iceSplash = [];
  if (objectDestroyed && obj && obj.iceWall && opts.actors) {
    // lazy import avoided — call via opts.splash if provided
    if (typeof opts.onIceDestroy === "function") {
      iceSplash = opts.onIceDestroy(obj) || [];
    }
  }
  return { packet, toForced, objectDestroyed, objectHpLeft, iceSplash };
}

function stepDelta(mode, source, target, opts) {
  if (opts && (opts.dx != null || opts.dy != null)) {
    return { dx: Math.sign(opts.dx | 0) || 0, dy: Math.sign(opts.dy | 0) || 0 };
  }
  if (mode === "slide") {
    return { dx: Math.sign(opts.dx | 0) || 0, dy: Math.sign(opts.dy | 0) || 0 };
  }
  if (mode === "pull") {
    return {
      dx: Math.sign((source.x | 0) - (target.x | 0)),
      dy: Math.sign((source.y | 0) - (target.y | 0)),
    };
  }
  // push: away from source
  let dx = Math.sign((target.x | 0) - (source.x | 0));
  let dy = Math.sign((target.y | 0) - (source.y | 0));
  if (!dx && !dy) dx = 1;
  return { dx, dy };
}

/**
 * Legal Push directions: step increases Chebyshev distance from pusher,
 * OR the first step collides with terrain/edge (may push into obstacle).
 */
export function listLegalPushDirs(pusher, target, spaces, opts = {}) {
  if (!pusher || !target) return [];
  const raw = Math.max(0, spaces | 0);
  const stab = Math.max(0, target.stability | 0);
  const left = Math.max(0, raw - stab);
  if (left <= 0) return [];

  const occ = occupiedActors(opts.actors, target.id);
  const objs = objectsMap(opts.objects);
  const bounds = opts.bounds;
  const size = actorSize(target);
  const d0 = chebyshev(pusher, target);
  const dirs = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = (target.x | 0) + dx;
      const ny = (target.y | 0) + dy;
      let hitsTerrain = false;
      let hitsCreature = false;
      if (!footprintInBounds(nx, ny, size, bounds)) hitsTerrain = true;
      for (const c of footprintCells({ x: nx, y: ny, size })) {
        const key = c.x + "," + c.y;
        const obj = objs.get(key);
        if (obj && !obj.destroyed && (obj.hp == null || (obj.hp | 0) > 0)) hitsTerrain = true;
        if (occ.has(key)) hitsCreature = true;
      }
      if (hitsCreature) hitsTerrain = true;
      const d1 = chebyshev(pusher, { x: nx, y: ny, size });
      const farther = d1 > d0;
      if (!farther && !hitsTerrain) continue;
      dirs.push({
        dx,
        dy,
        label:
          (dx === -1 ? "W" : dx === 1 ? "E" : "") +
          (dy === -1 ? "N" : dy === 1 ? "S" : "") +
          (hitsCreature ? " (stworzenie)" : hitsTerrain ? " (teren)" : ""),
        farther,
        hitsTerrain,
        hitsCreature,
        preview: { x: nx, y: ny },
      });
    }
  }
  return dirs;
}

/**
 * Generic forced move.
 * @param {object} opts
 * @param {object} opts.source  pusher / puller / slide origin
 * @param {object} opts.target  moved creature
 * @param {number} opts.spaces
 * @param {'push'|'pull'|'slide'} [opts.mode='push']
 * @param {object[]} [opts.actors]
 * @param {object[]} [opts.objects]  {x,y,material?,hp?}
 * @param {object} [opts.bounds]
 * @param {string} [opts.edgeMaterial='stone']
 * @param {number} [opts.dx]  slide only
 * @param {number} [opts.dy]  slide only
 */
export function applyForcedMove(opts) {
  const source = opts.source;
  const target = opts.target;
  const mode = opts.mode || "push";
  if (!source || !target) return { ok: false, reason: "missing" };

  const raw = Math.max(0, opts.spaces | 0);
  const stab = Math.max(0, target.stability | 0);
  let left = Math.max(0, raw - stab);
  if (left <= 0) return { ok: true, moved: 0, reducedToZero: true, mode };

  const { dx, dy } = stepDelta(mode, source, target, opts);
  if (!dx && !dy) return { ok: true, moved: 0, reducedToZero: true, mode, reason: "no-dir" };

  const occ = occupiedActors(opts.actors, target.id);
  const objs = objectsMap(opts.objects);
  const bounds = opts.bounds;
  const edgeMaterial = opts.edgeMaterial || "stone";
  const size = actorSize(target);
  const selfKeys = new Set(footprintKeys(target));
  let moved = 0;
  let collision = null;

  for (let i = 0; i < left; i++) {
    const nx = (target.x | 0) + dx;
    const ny = (target.y | 0) + dy;

    if (!footprintInBounds(nx, ny, size, bounds)) {
      const leftover = left - moved;
      const r = resolveObjectCollision(target, leftover, {
        object: { material: edgeMaterial, hp: materialHp(edgeMaterial) },
        actors: opts.actors,
        onIceDestroy: (o) => iceWallDestroySplash(o, opts.actors),
      });
      collision = { kind: "edge", material: edgeMaterial, ...r };
      break;
    }

    let blocker = null;
    let hitObj = null;
    for (const c of footprintCells({ x: nx, y: ny, size })) {
      const key = c.x + "," + c.y;
      if (selfKeys.has(key)) continue;
      const b = occ.get(key);
      if (b) {
        blocker = b;
        break;
      }
      const obj = objs.get(key);
      if (obj && !obj.destroyed) {
        hitObj = obj;
        break;
      }
    }

    if (blocker) {
      const leftover = left - moved;
      const packet = 2 * leftover;
      const toBlocker = Math.floor(packet / 2);
      const toForced = packet - toBlocker;
      if (toForced > 0) {
        applyDamage(target, toForced, { unpreventable: true, skipBleed: true });
      }
      if (toBlocker > 0) {
        applyDamage(blocker, toBlocker, { unpreventable: true, skipBleed: true });
      }
      collision = {
        kind: "creature",
        blockerId: blocker.id,
        packet,
        toForced,
        toBlocker,
      };
      break;
    }

    if (hitObj) {
      const leftover = left - moved;
      const r = resolveObjectCollision(target, leftover, {
        object: hitObj,
        actors: opts.actors,
        onIceDestroy: (o) => iceWallDestroySplash(o, opts.actors),
      });
      collision = {
        kind: "object",
        material: hitObj.material || hitObj.hardness || "wood",
        x: hitObj.x,
        y: hitObj.y,
        ...r,
      };
      break;
    }

    const prevKeys = new Set(footprintKeys(target));
    target.x = nx;
    target.y = ny;
    moved += 1;
    for (const c of footprintCells(target)) {
      const k = c.x + "," + c.y;
      if (prevKeys.has(k)) continue;
      applyHazardEnter(target, opts.hazards, c.x, c.y);
    }
  }

  return {
    ok: true,
    mode,
    moved,
    requested: raw,
    afterStability: left,
    collision,
  };
}

/** Push target away from pusher. */
export function applyPush(pusher, target, spaces, opts = {}) {
  return applyForcedMove(
    Object.assign({}, opts, {
      source: pusher,
      target,
      spaces: spaces | 0,
      mode: "push",
    })
  );
}

/** Pull target toward puller. */
export function applyPull(puller, target, spaces, opts = {}) {
  return applyForcedMove(
    Object.assign({}, opts, {
      source: puller,
      target,
      spaces,
      mode: "pull",
    })
  );
}

/** Slide target along dx/dy (each ±1 or 0). */
export function applySlide(source, target, spaces, opts = {}) {
  return applyForcedMove(
    Object.assign({}, opts, {
      source: source || target,
      target,
      spaces,
      mode: "slide",
    })
  );
}

export function distance(a, b) {
  return chebyshev(a, b);
}
