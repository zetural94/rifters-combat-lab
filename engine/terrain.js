/**
 * Map objects for collision (Push into column/wall) and movement blocking.
 * Hazards: difficult terrain + optional enter damage (Magma Tortoise Eruption).
 */
import { applyDamage } from "./damage.js";

const MATERIAL_HP = { wood: 4, stone: 6, steel: 10 };

export function materialHp(mat) {
  const m = String(mat || "stone").toLowerCase();
  if (MATERIAL_HP[m] != null) return MATERIAL_HP[m] | 0;
  if (m === "wall" || m === "column" || m === "edge") return MATERIAL_HP.stone;
  return MATERIAL_HP.wood;
}

export function normalizeObjects(list) {
  return (list || []).map((o, i) => {
    const material = String(o.material || o.hardness || "stone").toLowerCase();
    const hp = o.hp != null ? o.hp | 0 : materialHp(material);
    return {
      id: o.id || "obj-" + i,
      x: o.x | 0,
      y: o.y | 0,
      material,
      hp,
      hpMax: o.hpMax != null ? o.hpMax | 0 : hp,
      label: o.label || defaultLabel(material),
      destroyed: !!o.destroyed,
    };
  });
}

function defaultLabel(material) {
  if (material === "wood") return "Skrzynia";
  if (material === "steel") return "Filar";
  if (material === "wall") return "Ściana";
  return "Kolumna";
}

/** Occupied keys for pathing / legal Move (skip destroyed). */
export function objectBlockKeys(objects) {
  const s = new Set();
  for (const o of objects || []) {
    if (!o || o.destroyed || (o.hp | 0) <= 0) continue;
    s.add((o.x | 0) + "," + (o.y | 0));
  }
  return s;
}

/** Sandbox / lab arena presets (12×8). */
export const ARENAS = {
  open: {
    id: "open",
    label: "Otwarte (brak przeszkód)",
    objects: [],
  },
  columns: {
    id: "columns",
    label: "Kolumny (Push / collision)",
    objects: [
      { x: 5, y: 2, material: "stone", label: "Kolumna" },
      { x: 5, y: 5, material: "stone", label: "Kolumna" },
      { x: 6, y: 3, material: "wood", label: "Skrzynia" },
      { x: 7, y: 4, material: "stone", label: "Kolumna" },
    ],
  },
  wall: {
    id: "wall",
    label: "Ściana środkowa",
    objects: [
      { x: 5, y: 1, material: "stone", label: "Ściana" },
      { x: 5, y: 2, material: "stone", label: "Ściana" },
      { x: 5, y: 3, material: "stone", label: "Ściana" },
      { x: 5, y: 4, material: "stone", label: "Ściana" },
      { x: 5, y: 5, material: "stone", label: "Ściana" },
      { x: 5, y: 6, material: "wood", label: "Skrzynia" },
    ],
  },
  pit: {
    id: "pit",
    label: "Arena z filarami",
    objects: [
      { x: 4, y: 2, material: "steel", label: "Filar" },
      { x: 4, y: 5, material: "steel", label: "Filar" },
      { x: 7, y: 2, material: "steel", label: "Filar" },
      { x: 7, y: 5, material: "steel", label: "Filar" },
      { x: 5, y: 3, material: "wood", label: "Skrzynia" },
      { x: 6, y: 4, material: "wood", label: "Skrzynia" },
    ],
  },
};

export function arenaObjects(arenaId) {
  const a = ARENAS[arenaId] || ARENAS.columns;
  return normalizeObjects(a.objects);
}

/** 2×2 (or N×N) cube cells that include `anchor`, clamped to bounds. */
export function cubeCellsIncluding(anchor, size, bounds) {
  const n = Math.max(1, size | 0);
  let ox = anchor.x | 0;
  let oy = anchor.y | 0;
  if (bounds) {
    const maxX = bounds.maxX | 0;
    const maxY = bounds.maxY | 0;
    const minX = bounds.minX | 0;
    const minY = bounds.minY | 0;
    if (ox + n - 1 > maxX) ox = maxX - n + 1;
    if (oy + n - 1 > maxY) oy = maxY - n + 1;
    if (ox < minX) ox = minX;
    if (oy < minY) oy = minY;
  }
  const cells = [];
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      const x = ox + dx;
      const y = oy + dy;
      if (bounds) {
        if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
          continue;
        }
      }
      cells.push({ x, y });
    }
  }
  return cells;
}

export function cellKey(x, y) {
  return (x | 0) + "," + (y | 0);
}

/** Map of "x,y" → hazard for pathing / enter damage. */
export function hazardMap(hazards) {
  const m = new Map();
  for (const h of hazards || []) {
    if (!h) continue;
    m.set(cellKey(h.x, h.y), h);
  }
  return m;
}

export function isDifficultCell(hazards, x, y) {
  const h = hazardMap(hazards).get(cellKey(x, y));
  return !!(h && h.difficult);
}

/**
 * Paint leave-terrain hazards onto state.hazards (merge by cell).
 * @returns {object[]} newly written / updated hazards
 */
export function leaveTerrainHazards(state, cells, spec) {
  if (!state || !cells || !cells.length || !spec) return [];
  state.hazards = state.hazards || [];
  const map = hazardMap(state.hazards);
  const out = [];
  for (const c of cells) {
    const key = cellKey(c.x, c.y);
    const prev = map.get(key);
    const h = {
      id: (spec.id || "hazard") + "-" + key,
      x: c.x | 0,
      y: c.y | 0,
      difficult: spec.difficult !== false,
      enterDmg: spec.enterDmg != null ? spec.enterDmg | 0 : 0,
      unpreventable: spec.unpreventable !== false,
      dmgType: spec.dmgType || "unpreventable",
      label: spec.label || "Difficult terrain",
    };
    if (prev) {
      Object.assign(prev, h);
      out.push(prev);
    } else {
      state.hazards.push(h);
      map.set(key, h);
      out.push(h);
    }
  }
  return out;
}

/**
 * Apply enter-contact hazard damage (willing Move or forced).
 * @returns {number} damage dealt
 */
export function applyHazardEnter(actor, hazards, x, y) {
  if (!actor || actor.dead) return 0;
  const h = hazardMap(hazards).get(cellKey(x, y));
  if (!h || !(h.enterDmg > 0)) return 0;
  applyDamage(actor, h.enterDmg | 0, {
    unpreventable: h.unpreventable !== false,
    dmgType: h.dmgType || "unpreventable",
    isDot: true,
    skipBleed: true,
  });
  return h.enterDmg | 0;
}
