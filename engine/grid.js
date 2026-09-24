/** Chebyshev distance (king-move). Diagonal = 1.
 * Actors with `size` > 1 occupy a square footprint; (x,y) is the NW anchor.
 * Distance between creatures = min Chebyshev between any pair of footprint cells.
 */

export function actorSize(a) {
  if (!a) return 1;
  return Math.max(1, (a.size | 0) || 1);
}

/** NW-anchored footprint cells for an actor / {x,y,size?}. */
export function footprintCells(a) {
  const n = actorSize(a);
  const ox = a.x | 0;
  const oy = a.y | 0;
  const out = [];
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      out.push({ x: ox + dx, y: oy + dy });
    }
  }
  return out;
}

export function footprintKeys(a) {
  return footprintCells(a).map((c) => c.x + "," + c.y);
}

/** Same creature at a different NW anchor (for move/AI probes). */
export function atAnchor(actor, xOrCell, y) {
  const x = typeof xOrCell === "object" && xOrCell ? xOrCell.x : xOrCell;
  const yy = typeof xOrCell === "object" && xOrCell ? xOrCell.y : y;
  return { x: x | 0, y: yy | 0, size: actorSize(actor) };
}

/** True if NW anchor's full footprint fits in bounds. */
export function footprintInBounds(ax, ay, size, bounds) {
  const n = Math.max(1, size | 0 || 1);
  if (!bounds) return true;
  return (
    (ax | 0) >= bounds.minX &&
    (ay | 0) >= bounds.minY &&
    (ax | 0) + n - 1 <= bounds.maxX &&
    (ay | 0) + n - 1 <= bounds.maxY
  );
}

/**
 * Footprint free of blockers (keys "x,y").
 * `ignoreKeys` = cells the mover already occupies (may be re-entered).
 */
export function footprintFree(ax, ay, size, blockers, bounds, ignoreKeys) {
  const n = Math.max(1, size | 0 || 1);
  if (!footprintInBounds(ax, ay, n, bounds)) return false;
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      const k = (ax + dx) + "," + (ay + dy);
      if (ignoreKeys && ignoreKeys.has(k)) continue;
      if (blockers && blockers.has(k)) return false;
    }
  }
  return true;
}

export function chebyshev(a, b) {
  if (!a || !b) return 999;
  const na = actorSize(a);
  const nb = actorSize(b);
  if (na === 1 && nb === 1) {
    return Math.max(Math.abs((a.x | 0) - (b.x | 0)), Math.abs((a.y | 0) - (b.y | 0)));
  }
  let best = Infinity;
  for (const ca of footprintCells(a)) {
    for (const cb of footprintCells(b)) {
      const d = Math.max(Math.abs(ca.x - cb.x), Math.abs(ca.y - cb.y));
      if (d < best) best = d;
    }
  }
  return best === Infinity ? 0 : best;
}

export function inRange(a, b, range) {
  return chebyshev(a, b) <= (range | 0);
}

/**
 * Opposite-side flanking: ally and self both RANGE 1 of target, and
 * (self - target) and (ally - target) point roughly opposite
 * (dot product of displacement vectors < 0).
 * For large targets, vectors use nearest footprint cells.
 */
export function isFlanking(self, ally, target) {
  if (!inRange(self, target, 1) || !inRange(ally, target, 1)) return false;
  // Nearest cell of target to self / ally for opposite-side test
  let tSelf = target;
  let tAlly = target;
  if (actorSize(target) > 1) {
    let bestS = Infinity;
    let bestA = Infinity;
    for (const c of footprintCells(target)) {
      const ds = Math.max(Math.abs((self.x | 0) - c.x), Math.abs((self.y | 0) - c.y));
      const da = Math.max(Math.abs((ally.x | 0) - c.x), Math.abs((ally.y | 0) - c.y));
      if (ds < bestS) {
        bestS = ds;
        tSelf = c;
      }
      if (da < bestA) {
        bestA = da;
        tAlly = c;
      }
    }
  }
  const sx = (self.x | 0) - (tSelf.x | 0);
  const sy = (self.y | 0) - (tSelf.y | 0);
  const ax = (ally.x | 0) - (tAlly.x | 0);
  const ay = (ally.y | 0) - (tAlly.y | 0);
  return sx * ax + sy * ay < 0;
}

/** Any living ally opposite to target → flanking (CRIT 1 on attacks). */
export function hasFlank(self, allies, target) {
  if (target && target.unflankable) return false;
  for (const a of allies || []) {
    if (!a || a === self || a.dead || a.hp <= 0) continue;
    if (isFlanking(self, a, target)) return true;
  }
  return false;
}

/** Cells within Chebyshev radius (optional occupancy filter). */
export function cellsInRange(origin, range, opts = {}) {
  const r = range | 0;
  const out = [];
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > r) continue;
      if (dx === 0 && dy === 0 && opts.excludeOrigin) continue;
      const cell = { x: (origin.x | 0) + dx, y: (origin.y | 0) + dy };
      if (opts.blocked && opts.blocked(cell)) continue;
      out.push(cell);
    }
  }
  return out;
}
