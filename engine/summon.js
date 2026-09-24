/**
 * Summon (Acolyte Rank1 COMPLETE / Primalist Elemental COMPLETE).
 * Max 1 summon per summoner. Acts after summoner's turn (Move+Action slots).
 * Pets scale HP / INT from summoner's INT (Rozwój).
 * HP bands @ INT=1 (hard-room hit ≈6–8 after DEF): mage 8, archer 10, warrior 14; elemental 10×INT (locked).
 * Elemental Range 5. Dead pets: monster-out (see damage.js) → activeSummonId cleared → recast OK.
 */
import { inRange, chebyshev } from "./grid.js";
import { footprintFree, footprintKeys } from "./grid.js";
import { objectBlockKeys } from "./terrain.js";
import { spendMana, canPayMana } from "./feats.js";
import { spendAp } from "./turn.js";
import { freshStatuses } from "./status.js";

/** Base templates. hpMult × summoner INT (Rozwój). spawnRange defaults 4. */
export const SUMMON_TEMPLATES = {
  warrior: {
    name: "Summon · Warrior",
    hpMult: 14,
    speed: 3,
    stressMax: 2,
    str: 1,
    dex: 0,
    int: 0,
    attackId: "summon-warrior-strike",
    specialId: "summon-warrior-living-shield",
    spawnRange: 4,
  },
  mage: {
    name: "Summon · Mage",
    hpMult: 8,
    speed: 4,
    stressMax: 2,
    str: 0,
    dex: 0,
    int: 0,
    attackId: "summon-mage-strike",
    specialId: "summon-mage-fireball",
    spawnRange: 4,
  },
  archer: {
    name: "Summon · Archer",
    hpMult: 10,
    speed: 6,
    stressMax: 3,
    str: 0,
    dex: 1,
    int: 0,
    attackId: "summon-archer-strike",
    specialId: "summon-archer-bone-arrow",
    spawnRange: 4,
  },
  elemental: {
    name: "Summon · Elemental",
    hpMult: 10,
    speed: 5,
    stressMax: 2,
    str: 0,
    dex: 0,
    int: 0,
    attackId: "summon-elemental-strike",
    specialId: "summon-elemental-shield",
    spawnRange: 5,
  },
};

function occupiedKeys(actors, objects) {
  const s = new Set();
  for (const a of actors || []) {
    if (!a || a.dead) continue;
    if (a.side === "enemy" && (a.hp | 0) <= 0) continue;
    for (const k of footprintKeys(a)) s.add(k);
  }
  for (const k of objectBlockKeys(objects || [])) s.add(k);
  return s;
}

function pickSpawnCell(state, summoner, preferred, spawnRange = 4) {
  const range = Math.max(1, spawnRange | 0);
  const occ = occupiedKeys(state.actors, state.objects);
  const bounds = state.bounds || { minX: 0, maxX: 11, minY: 0, maxY: 7 };
  const anchor = preferred || summoner;
  const candidates = [];
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const x = (anchor.x | 0) + dx;
      const y = (anchor.y | 0) + dy;
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) continue;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 1) continue;
      if (!inRange(summoner, { x, y }, range)) continue;
      const key = x + "," + y;
      if (occ.has(key)) continue;
      const dist = Math.max(
        Math.abs(x - (anchor.x | 0)),
        Math.abs(y - (anchor.y | 0))
      );
      candidates.push({ x, y, dist });
    }
  }
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0] || null;
}

export function findSummonOf(state, summonerId) {
  return (
    (state.actors || []).find(
      (a) => a && a.summon && a.summonerId === summonerId && !a.dead && (a.hp | 0) > 0
    ) || null
  );
}

export function dismissSummon(state, summonerId) {
  const pet = findSummonOf(state, summonerId);
  if (!pet) return null;
  pet.dead = true;
  pet.alive = false;
  pet.hp = 0;
  const owner = (state.actors || []).find((a) => a && a.id === summonerId);
  if (owner) owner.activeSummonId = null;
  return pet;
}

/** Scaled HP (Rozwój N×INT). */
export function summonHpMax(kind, summonerInt) {
  const tpl = SUMMON_TEMPLATES[kind];
  if (!tpl) return 0;
  if (tpl.flat && tpl.hpMax != null) return tpl.hpMax | 0;
  const INT = Math.max(1, summonerInt | 0);
  return (tpl.hpMult | 0) * INT;
}

/**
 * Place summon: 2 AP + 2 mana, Range 4, replaces existing.
 * @param {string} kind warrior|mage|archer|elemental
 */
export function placeSummon(state, actor, kind, opts = {}) {
  const tpl = SUMMON_TEMPLATES[kind];
  if (!tpl) return { ok: false, reason: "bad-kind" };
  if (!actor || actor.dead) return { ok: false, reason: "dead" };
  if (!opts.skipCost) {
    if ((actor.ap | 0) < 2) return { ok: false, reason: "no-ap" };
    if (!canPayMana(actor, 2)) return { ok: false, reason: "no-mana" };
  }
  const preferred =
    opts.dest ||
    (opts.nearId && (state.actors || []).find((a) => a && a.id === opts.nearId)) ||
    null;
  const spawnRange = tpl.spawnRange != null ? tpl.spawnRange | 0 : 4;
  const cell = pickSpawnCell(state, actor, preferred, spawnRange);
  if (!cell) return { ok: false, reason: "no-space" };
  if (!opts.skipCost) {
    if (!spendAp(actor, 2)) return { ok: false, reason: "no-ap" };
    const pay = spendMana(actor, 2);
    if (!pay.ok) {
      actor.ap = (actor.ap | 0) + 2;
      return pay;
    }
  }
  // Ensure stale id cleared even if previous pet corpse lingered
  if (actor.activeSummonId && !findSummonOf(state, actor.id)) {
    actor.activeSummonId = null;
  }
  dismissSummon(state, actor.id);
  const id = "summon-" + kind + "-" + actor.id;
  const ownerInt = Math.max(0, actor.int | 0);
  const scaleInt = Math.max(1, ownerInt);
  const flat = !!tpl.flat && tpl.hpMax != null;
  const hpMax = flat ? tpl.hpMax | 0 : (tpl.hpMult | 0) * scaleInt;
  const petInt = flat ? tpl.int | 0 : ownerInt;
  const pet = {
    id,
    name: tpl.name,
    side: "hero",
    summon: true,
    summonKind: kind,
    summonerId: actor.id,
    economy: "slots",
    str: tpl.str,
    dex: tpl.dex,
    int: petInt,
    speed: tpl.speed,
    speedBase: tpl.speed,
    size: 1,
    stability: 0,
    stabilityBase: 0,
    hp: hpMax,
    hpMax,
    stress: tpl.stressMax,
    stressMax: tpl.stressMax,
    recoveries: 0,
    recoveriesMax: 0,
    wounds: 0,
    mana: 0,
    def: {
      Physical: 1,
      Fire: 0,
      Air: 0,
      Water: 0,
      Earth: 0,
      Lightning: 0,
      Dark: 0,
      Light: 0,
      Toxic: 0,
    },
    resist: {},
    vulnerable: {},
    apMax: 0,
    ap: 0,
    moveLeft: 0,
    actionLeft: 0,
    oaLeft: 1,
    abilityIds: [tpl.attackId, tpl.specialId].filter(Boolean),
    x: cell.x,
    y: cell.y,
    down: false,
    dead: false,
    alive: true,
    st: freshStatuses(),
  };
  state.actors = state.actors || [];
  state.actors.push(pet);
  actor.activeSummonId = id;
  return { ok: true, summon: pet, kind, scaleInt: flat ? null : scaleInt };
}

export function summonKindForFeat(featId) {
  if (/warrior/i.test(featId)) return "warrior";
  if (/mage/i.test(featId)) return "mage";
  if (/archer/i.test(featId)) return "archer";
  if (/elemental/i.test(featId)) return "elemental";
  return null;
}
