import { freshStatuses } from "./status.js";

function parsePool(s, fallbackMax) {
  if (typeof s === "number") return { cur: s, max: fallbackMax != null ? fallbackMax : s };
  const m = String(s || "").match(/(-?\d+)\s*\/\s*(-?\d+)/);
  if (m) return { cur: +m[1], max: +m[2] };
  const n = parseInt(String(s || "0"), 10);
  return { cur: n || 0, max: fallbackMax != null ? fallbackMax : n || 0 };
}

/** Build DEF map from character card `def.rows` [[type, val], ...] or plain object. */
export function defMapFromCard(def) {
  const out = {};
  if (!def) return out;
  if (Array.isArray(def.rows)) {
    for (const row of def.rows) {
      if (!row) continue;
      out[String(row[0])] = Number(row[1]) || 0;
    }
    return out;
  }
  if (typeof def === "object") {
    for (const k of Object.keys(def)) {
      if (k === "rows" || k === "headers") continue;
      out[k] = Number(def[k]) || 0;
    }
  }
  return out;
}

export function makeHero(card, opts = {}) {
  const hp = parsePool(card.hp, card.hpMax);
  const stress = parsePool(card.stress, card.stressMax);
  const rec = parsePool(card.recoveries, card.recoveriesMax);
  return {
    id: opts.id || card.id || card.name || "hero",
    name: opts.name || card.name || "Hero",
    side: "hero",
    str: +(card.str || 0),
    dex: +(card.dex || 0),
    int: +(card.int || 0),
    speed: card.speed != null ? +card.speed : 5,
    size: Math.max(1, (card.size | 0) || 1),
    stability: +(card.stability || 0),
    stabilityBase: +(card.stability || 0),
    hp: hp.cur,
    hpMax: hp.max,
    stress: stress.cur,
    stressMax: stress.max,
    recoveries: rec.cur,
    recoveriesMax: rec.max,
    wounds: +(String(card.wounds || "0").split("/")[0] || 0),
    mana: card.mana != null ? +String(card.mana).split("/")[0] || 0 : 0,
    def: defMapFromCard(card.def),
    resist: card.resist || {},
    vulnerable: card.vulnerable || {},
    armorId: String(card.armorId || "").toLowerCase(),
    weaponOptions: card.weaponOptions
      ? card.weaponOptions.map((ref) => (Array.isArray(ref) ? ref.slice() : ref))
      : [],
    activeKit: card.activeKit == null ? 0 : +card.activeKit,
    kitSwapsThisTurn: 0,
    apMax: card.apMax != null ? +card.apMax : 3,
    ap: 0,
    apSpent: 0,
    defendUp: false,
    reactionWindowOpen: false,
    freeReactionUsed: false,
    lightArmor: !!(opts.lightArmor || /light/i.test(card.armorId || "") || /Light Armor/i.test(card.passive || "")),
    attacksThisTurn: 0,
    x: opts.x | 0,
    y: opts.y | 0,
    down: false,
    dead: false,
    alive: true,
    st: freshStatuses(),
    skills: card.skills || [],
    passive: card.passive || "",
  };
}

export function makeMob(card, opts = {}) {
  const isHordeCard =
    /horde/i.test(String(card.monsterType || "")) ||
    /HORDE/i.test(String(card.role || "")) ||
    (card.unitHp != null && card.units != null);
  const unitHp = isHordeCard ? Math.max(1, +(card.unitHp || 5)) : 0;
  const unitsMax = isHordeCard ? Math.max(1, +(card.units || card.unitsMax || 1)) : 0;
  const hpMax = isHordeCard
    ? unitHp * unitsMax
    : card.hpMax != null
      ? +card.hpMax
      : +(card.hp || 0);
  return {
    id: opts.id || card.id || card.name || "mob",
    name: opts.name || card.name || "Enemy",
    side: "enemy",
    economy: "slots", // 1 Move + 1 Action + 1 OA (not hero AP)
    tags: card.tags ? card.tags.slice() : [],
    str: +(card.str || 0),
    dex: +(card.dex || 0),
    int: +(card.int || 0),
    speed: card.speed != null ? +card.speed : 5,
    speedBase: card.speed != null ? +card.speed : 5,
    size: Math.max(1, (card.size | 0) || 1),
    stability: +(card.stability || 0),
    stabilityBase: +(card.stability || 0),
    hp: hpMax,
    hpMax,
    horde: !!isHordeCard,
    unitHp: unitHp || undefined,
    unitsMax: unitsMax || undefined,
    units: isHordeCard ? unitsMax : undefined,
    unitsRemaining: isHordeCard ? unitsMax : undefined,
    def: defMapFromCard(card.def) || card.def || {},
    defBase: Object.assign({}, defMapFromCard(card.def) || card.def || {}),
    bloodied: card.bloodied ? Object.assign({}, card.bloodied) : null,
    resist: card.resist || {},
    vulnerable: card.vulnerable || {},
    apMax: 0,
    ap: 0,
    moveLeft: 0,
    actionLeft: 0,
    oaLeft: 1, // available from encounter start (before first activation)
    defendUp: false,
    attacksThisTurn: 0,
    x: opts.x | 0,
    y: opts.y | 0,
    down: false,
    dead: false,
    alive: true,
    wounds: 0,
    st: freshStatuses(),
    abilities: card.abilities || card.attacks || [],
    reaction: card.reaction || null,
    bossTurns: card.bossTurns != null ? Math.max(1, card.bossTurns | 0) : 1,
    immuneStatuses: Array.isArray(card.immuneStatuses)
      ? card.immuneStatuses.map((s) => String(s).toLowerCase())
      : [],
    monsterType: card.monsterType || (isHordeCard ? "horde" : ""),
    bossMode: card.bossMode || "",
    // Brute / Boss (Leader|Solo) can crit on Power Rolls; Standard / Horde cannot.
    canCrit:
      card.canCrit != null
        ? !!card.canCrit
        : /^(brute|boss)$/i.test(String(card.monsterType || "")),
    // Card-level Crit rider (not tied to a specific attack line). Blocked by Steel Yourself.
    crit: card.crit
      ? typeof card.crit === "string"
        ? { text: card.crit }
        : Object.assign({}, card.crit)
      : null,
    // Targeting / movement priority, e.g. ["aoe","ranged","lowestHp"]
    aiPattern: Array.isArray(card.aiPattern)
      ? card.aiPattern.slice()
      : null,
    token: card.token || null,
    fightUsed: {},
    abilityCooldown: {},
    passive: card.passive || null,
    battlePoints: card.battlePoints != null ? +card.battlePoints : undefined,
  };
}

/** Living Shell / bloodied mods: DEF, Speed, Stability while Bloodied. */
export function syncBloodiedShell(actor) {
  if (!actor || !actor.bloodied) return false;
  const mods = actor.bloodied;
  const bloody = (actor.hp | 0) <= Math.floor((actor.hpMax | 0) / 2);
  const baseSpeed = actor.speedBase != null ? actor.speedBase | 0 : actor.speed | 0;
  const baseStab =
    actor.stabilityBase != null ? actor.stabilityBase | 0 : actor.stability | 0;
  const baseDef = actor.defBase || actor.def || {};
  if (bloody) {
    actor.speed = baseSpeed + (mods.speedMod | 0);
    if (mods.speed != null) actor.speed = mods.speed | 0;
    actor.stability = baseStab + (mods.stabilityMod | 0);
    if (mods.stability != null) actor.stability = mods.stability | 0;
    actor.def = Object.assign({}, baseDef);
    const dm = mods.defMod || {};
    for (const k of Object.keys(dm)) {
      actor.def[k] = (Number(baseDef[k]) || 0) + (Number(dm[k]) || 0);
    }
    if (mods.def && typeof mods.def === "object") {
      actor.def = Object.assign({}, baseDef, mods.def);
    }
  } else {
    actor.speed = baseSpeed;
    actor.stability = baseStab;
    actor.def = Object.assign({}, baseDef);
  }
  return bloody;
}
