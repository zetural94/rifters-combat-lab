/**
 * R1 Monte Carlo — scenarios, Battle Points, fight + Rift KPI.
 *
 * BP pillars (T1): Horde 1 · Standard 2 · Brute 3 · Boss 6.
 * Unit costs: Hedgehogs 1 · Wolf 2 · Bear 3 · Alpha Leader 6 · Magma Tortoise Solo 11.
 * Combat BP: Easy 6–8 (t8) · Medium 9–12 (t11) · Hard 13–16 (t14).
 * Rift pool BP (2–3 fights): Easy 24–28 (ref 27) · Medium 28–32 (30) · Hard 32–38 (34).
 * Per-room cap in Rift: Easy/Med ≤12 · Hard ≤16.
 * Fight KPI (p50): Easy Rec↓1–3 W0–1 · Medium Rec↓3–5 W0–2 · Hard Rec↓5–8 W2–4.
 * Rift KPI wounds: Easy 0–4 · Medium 0–6 · Hard 4–10 · Rec left 0–3. Soft LOCKED Adrian 2026-09-24.
 * Default hero policy: **table** (= smart decisions + 15-round hard cap in playFight).
 */
import {
  createEncounter,
  createRng,
  currentActor,
  runEnemyTurns,
  runHeroTurns,
} from "../engine/index.js?v=20260924remed";
import { expandParty, applyArmorStressToHeroSpecs } from "./party.js";
export {
  HERO_CATALOG,
  PARTY_PRESETS,
  PARTY_PRESET_LABELS,
  expandParty,
  resolvePartyIds,
  partyLabel,
  weakFireDefMap,
  applyArmorStressToHeroSpecs,
} from "./party.js";

export const PARTY_REC_MAX = 12; // 4 heroes × 3

/** Difficulty budgets — one combat (T1, 4-player R1 lock). */
export const BUDGET = {
  easy: { min: 6, max: 8, target: 8 },
  medium: { min: 9, max: 12, target: 11 },
  hard: { min: 13, max: 16, target: 14 },
};

/**
 * Rift pool BP (2–3 fights) + per-room cap inside that Rift.
 * ref = R1 lock chain sum (mid/top of band).
 */
export const RIFT_BUDGET = {
  easy: { min: 24, max: 28, ref: 27, roomCap: 12 },
  medium: { min: 28, max: 32, ref: 30, roomCap: 12 },
  hard: { min: 32, max: 38, ref: 34, roomCap: 16 },
};

/** Pillar costs — keep in sync with cards + RULES-CANON §10 + Rifters Design. */
export const BP_PILLAR = {
  horde: 1,
  standard: 2,
  brute: 3,
  boss: 6,
};

/** Locked unit BP (R1 T1). */
export const BP_UNIT = {
  "ember-hedgehogs": 1,
  "ember-wolf": 2,
  "burning-bear": 3,
  "ember-wolf-alpha": 6,
  "magma-tortoise": 11,
};

/**
 * Fight KPI bands (p50). p90 may sit one tier harder.
 * Medium is the design anchor.
 */
export const FIGHT_KPI = {
  easy: { recDrop: [1, 3], wounds: [0, 1], rounds: [2, 4] },
  medium: { recDrop: [3, 5], wounds: [0, 2], rounds: [3, 6] },
  hard: { recDrop: [5, 8], wounds: [2, 4], rounds: [4, 7] },
};

/** End-of-Rift KPI (clears) — p50 wounds by lane; Rec left shared. */
export const RIFT_KPI = {
  recLeft: [0, 3],
  /** @deprecated use RIFT_KPI_BY_LANE — Medium anchor kept for old callers */
  wounds: [0, 6],
};

/** Per-lane end-of-Rift wound bands (party sum, clears, p50 design target). */
export const RIFT_KPI_BY_LANE = {
  rift_easy: { wounds: [0, 4], label: "Easy" },
  rift_medium: { wounds: [0, 6], label: "Medium" },
  rift_hard: { wounds: [4, 10], label: "Hard" },
  // aliases
  rift_wolves: { wounds: [0, 4], label: "Easy" },
  rift_horde: { wounds: [0, 6], label: "Medium" },
  rift_boss: { wounds: [4, 10], label: "Hard" },
  rift2: { wounds: [0, 6], label: "Medium" },
  rift3: { wounds: [0, 6], label: "Medium" },
};


/**
 * v0.3g — Talent pad BP staircase by lane (Adrian lean 2026-09-24).
 * Readable +1 steps per shared talent rank. Soft bands may be retuned later.
 *
 *   n (talents/hero):  0   1   2   3   4
 *   Easy:              0   2   3   4   5
 *   Medium:            0   4   5   6   7
 *   Hard:              0   6   7   8   9
 *
 * partyTable stays 0. roomCap unchanged. LOCKED Adrian 2026-09-24. Soft bands LOCKED Easy 0–4 / Med 0–6 / Hard 4–10 (was 0–3/0–5/5–9).
 */
const PAD_EASY = [0, 2, 3, 4, 5];
const PAD_MED = [0, 4, 5, 6, 7];
const PAD_HARD = [0, 6, 7, 8, 9];

function padFromTable(table, n) {
  const x = Math.max(0, n | 0);
  if (x >= table.length) return table[table.length - 1] | 0;
  return table[x] | 0;
}

export function hardPadFromTalents(n) {
  return padFromTable(PAD_HARD, n);
}

export function mediumPadFromTalents(n) {
  return padFromTable(PAD_MED, n);
}

export function easyPadFromTalents(n) {
  return padFromTable(PAD_EASY, n);
}

/** Lane pad for a chain/scenario id. */
export function lanePadFromTalents(n, chainId) {
  const id = String(chainId || "");
  if (id === "rift_hard" || id === "rift_boss" || id === "hard") {
    return hardPadFromTalents(n) | 0;
  }
  if (id === "rift_medium" || id === "medium") {
    return mediumPadFromTalents(n) | 0;
  }
  if (id === "rift_easy" || id === "easy") {
    return easyPadFromTalents(n) | 0;
  }
  return 0;
}

/** Build hardLaneTable[0..maxN] from hardPadFromTalents. */
export function buildHardLaneTable(maxN = 4) {
  const out = [];
  for (let i = 0; i <= maxN; i++) out.push(hardPadFromTalents(i));
  return out;
}

export function buildMediumLaneTable(maxN = 4) {
  const out = [];
  for (let i = 0; i <= maxN; i++) out.push(mediumPadFromTalents(i));
  return out;
}

export function buildEasyLaneTable(maxN = 4) {
  const out = [];
  for (let i = 0; i <= maxN; i++) out.push(easyPadFromTalents(i));
  return out;
}

export const TALENT_BP_V03 = {
  label: "v0.3g LOCKED stairs E2-5 / M4-7 / H6-9",
  formula: "tables: E[0,2,3,4,5] M[0,4,5,6,7] H[0,6,7,8,9]",
  partyTable: [0, 0, 0, 0, 0],
  hardLaneTable: buildHardLaneTable(4),
  mediumLaneTable: buildMediumLaneTable(4),
  easyLaneTable: buildEasyLaneTable(4),
  table: [0, 0, 0, 0, 0],
};

/** Infer synced n from opts (talentsPerHero / counts / R1 featSmoke length÷4). */
export function inferTalentsPerHero(opts = {}) {
  if (opts.talentsPerHero != null) return Math.max(0, opts.talentsPerHero | 0);
  if (Array.isArray(opts.talentCounts) && opts.talentCounts.length) {
    return Math.round(
      opts.talentCounts.reduce((s, c) => s + (c | 0), 0) / opts.talentCounts.length
    );
  }
  if (Array.isArray(opts.featSmoke) && opts.featSmoke.length) {
    const partySize = Math.max(1, opts.partySize | 0 || 4);
    return Math.round(opts.featSmoke.length / partySize);
  }
  return null;
}

function hardLanePad(n, chainId, opts = {}) {
  // Name kept for call sites — now all lanes (Easy/Med/Hard).
  return lanePadFromTalents(n, chainId) | 0;
}

/** Sum / sync pad from talent counts. Number n → partyTable[n] (synced). */
export function bpFromTalentCounts(countsOrN, partySize = 4) {
  const pt = TALENT_BP_V03.partyTable || [0];
  const clamp = (n) => {
    const x = Math.max(0, Math.min(pt.length - 1, n | 0));
    return pt[x] | 0;
  };
  if (countsOrN == null) return 0;
  if (typeof countsOrN === "number") {
    return clamp(countsOrN);
  }
  if (Array.isArray(countsOrN)) {
    if (!countsOrN.length) return 0;
    const avg = Math.round(
      countsOrN.reduce((s, c) => s + (c | 0), 0) / countsOrN.length
    );
    return clamp(avg);
  }
  return 0;
}

/** Resolve pad BP for encounter/rift opts: explicit padBp > talentCounts > synced n. */
export function resolvePadBp(opts = {}) {
  if (opts.padBp != null) return Math.max(0, opts.padBp | 0);
  const chain = opts.chain || opts.chainId || opts.scenario || null;
  const n = inferTalentsPerHero(opts);
  let add = 0;
  if (opts.talentCounts != null) {
    add = bpFromTalentCounts(opts.talentCounts, opts.partySize || 4);
  } else if (n != null) {
    add = bpFromTalentCounts(n, opts.partySize || 4);
  }
  if (n != null) add += hardLanePad(n, chain, opts);
  return Math.max(0, add | 0);
}

/**
 * Split rift-pool talent pad across rooms (pool +, not full add × N rooms).
 * Pack onto later rooms in 2-BP chunks (Ember Wolf unit).
 * @param {number} totalAdd
 * @param {number} nFights
 * @param {{ skip?: boolean[] }} [opts] — skip[i]=true excludes fight i (e.g. Solo boss);
 *   remainder goes to the latest non-skipped room.
 */
export function splitPadBpAcrossFights(totalAdd, nFights, opts = {}) {
  const n = Math.max(1, nFights | 0);
  let left = Math.max(0, totalAdd | 0);
  const shares = Array(n).fill(0);
  const UNIT = 2;
  const skip = opts.skip || [];
  const slots = [];
  for (let i = 0; i < n; i++) {
    if (!skip[i]) slots.push(i);
  }
  if (!slots.length) {
    for (let i = 0; i < n; i++) slots.push(i);
  }
  for (let s = slots.length - 1; s >= 0 && left >= UNIT; s--) {
    shares[slots[s]] += UNIT;
    left -= UNIT;
  }
  if (left > 0) shares[slots[slots.length - 1]] += left;
  return shares;
}

/** True for Solo-boss MC rooms — do not pad with Rank0 wolves. */
export function isSoloPadSkipScenario(scenarioId) {
  return /^solo_/i.test(String(scenarioId || ""));
}

/** Base encounter BP + talent pad. */
export function effectiveEncounterBp(baseBp, opts = {}) {
  return (baseBp | 0) + resolvePadBp(opts || {});
}

/**
 * Rift pool with talent pad. roomCap unchanged.
 * @param {"easy"|"medium"|"hard"} tier
 * @param {object} [opts] — talentsPerHero / talentCounts / padBp / party / chain
 */
export function effectiveRiftBudget(tier, opts = {}) {
  const b = RIFT_BUDGET[tier] || RIFT_BUDGET.medium;
  const o = opts && typeof opts === "object" ? opts : {};
  const add = resolvePadBp(o);
  return {
    min: b.min + add,
    max: b.max + add,
    ref: b.ref + add,
    roomCap: b.roomCap,
    padBp: add,
    talentBpV03: TALENT_BP_V03,
  };
}

/**
 * Pad enemies with Ember Wolves until spent >= targetBp (Rank0 kits only).
 */
export function padEnemiesToBp(pack, enemies, targetBp) {
  const list = (enemies || []).slice();
  let spent = encounterSpentBp(list);
  const target = Math.max(spent, targetBp | 0);
  const wolf = pack && pack.cards && pack.cards["ember-wolf"];
  if (!wolf || wolf.kind !== "monster") return list;
  const spots = [
    [10, 1], [10, 3], [10, 5], [10, 7],
    [11, 2], [11, 4], [11, 6], [9, 0],
  ];
  let si = 0;
  let guard = 0;
  while (spent + (BP_UNIT["ember-wolf"] || 2) <= target && guard < 10) {
    const [x, y] = spots[si % spots.length];
    si++;
    list.push({
      card: wolf,
      pos: { x, y },
      name: wolf.name || "Ember Wolf",
    });
    spent += BP_UNIT["ember-wolf"] || 2;
    guard++;
  }
  return list;
}

/** Feat smoke — draft rules in engine. xp = current draft cost. */
export const FEAT_SMOKE_STUBS = {
  "fighter-frontliner": {
    xp: 250,
    classId: "fighter",
    label: "Frontliner (draft): +5 HP; Bloodied → +1 AP next turn",
    apply(actor) {
      const gain = 5;
      actor.hpMax = (actor.hpMax | 0) + gain;
      actor.maxHp = (actor.maxHp | 0) + gain;
      actor.hp = (actor.hp | 0) + gain;
      actor.frontliner = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-frontliner"]);
    },
  },
  "fighter-eye-for-an-eye": {
    xp: 200,
    classId: "fighter",
    label: "Eye for an eye: OA when hit by enemy T3",
    apply(actor) {
      actor.eyeForAnEye = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-eye-for-an-eye"]);
    },
  },
  "fighter-heavy-swing": {
    xp: 250,
    classId: "fighter",
    label: "Heavy Swing (2AP+1stress · AoE R1 · WD+STR / +2STR / 2WD; +1stress Adv)",
    apply(actor) {
      actor.heavySwing = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-heavy-swing"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("fighter-heavy-swing") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["fighter-heavy-swing"]);
      }
    },
  },
  "assassin-perfectionist": {
    xp: 350,
    classId: "assassin",
    label: "Perfectionist (draft): harmful status X += max(1, INT)",
    apply(actor) {
      actor.perfectionist = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-perfectionist"]);
    },
  },
  "brawler-martial-artist": {
    xp: 350,
    classId: "brawler",
    label: "Martial artist (draft): +1 Speed; MOVE 2 safe 1/turn; rush ignore 1/fight",
    apply(actor) {
      actor.speed = (actor.speed | 0) + 1;
      actor.martialArtist = true;
      actor.rushIgnoreLeft = 1;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-martial-artist"]);
    },
  },
  "brawler-flurry-blows": {
    xp: 250,
    classId: "brawler",
    label: "Flurry of Blows (3AP+1stress · 2WD/3WD/3WD+5 · half cleave)",
    apply(actor) {
      actor.flurryBlows = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-flurry-blows"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("brawler-flurry-blows") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["brawler-flurry-blows"]);
      }
    },
  },
  "brawler-uppercut": {
    xp: 150,
    classId: "brawler",
    label: "Uppercut (1 AP Adv1 · T3 Break 5)",
    apply(actor) {
      actor.uppercut = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-uppercut"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("brawler-uppercut") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["brawler-uppercut"]);
      }
    },
  },
  "brawler-guard": {
    xp: 150,
    classId: "brawler",
    label: "Guard: 1 stress → +1 DEF until next turn",
    apply(actor) {
      actor.hasGuard = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-guard"]);
    },
  },
  "brawler-full-contact": {
    xp: 150,
    classId: "brawler",
    label: "Full Contact: +1 Push; may Slide",
    apply(actor) {
      actor.fullContact = { pushBonus: 1, maySlide: true };
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-full-contact"]);
    },
  },
  "brawler-pugilist": {
    xp: 150,
    classId: "brawler",
    label: "Pugilist: +1 Phys DEF, +1 Stability; Opening Adv 1",
    apply(actor) {
      actor.pugilist = true;
      if (!actor.def) actor.def = {};
      actor.def.Physical = (actor.def.Physical | 0) + 1;
      actor.stability = (actor.stability | 0) + 1;
      if (actor.stabilityBase != null) actor.stabilityBase = (actor.stabilityBase | 0) + 1;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-pugilist"]);
    },
  },
  "brawler-tough": {
    xp: 250,
    classId: "brawler",
    label: "Tough: +5 HP, +1 Recovery",
    apply(actor) {
      const gain = 5;
      actor.hpMax = (actor.hpMax | 0) + gain;
      actor.maxHp = (actor.maxHp | 0) + gain;
      actor.hp = (actor.hp | 0) + gain;
      actor.recoveries = (actor.recoveries | 0) + 1;
      actor.recoveriesMax = (actor.recoveriesMax | 0) + 1;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-tough"]);
    },
  },
  "fighter-weaponmaster": {
    xp: 300,
    classId: "fighter",
    label: "Weaponmaster: 1/turn hit Vulnerable → clear 1 Stress",
    apply(actor) {
      actor.weaponmaster = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-weaponmaster"]);
    },
  },
  "assassin-cold-blooded": {
    xp: 150,
    classId: "assassin",
    label: "Cold Blooded: +2 max Stress; Crit clears +1 Stress",
    apply(actor) {
      actor.stressMax = (actor.stressMax | 0) + 2;
      actor.stress = Math.min(actor.stressMax, (actor.stress | 0) + 2);
      actor.coldBlooded = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-cold-blooded"]);
    },
  },
  "assassin-flurry-daggers": {
    xp: 250,
    classId: "assassin",
    label: "Flurry of Daggers (2AP+1stress · 3 targets R4 WD)",
    apply(actor) {
      actor.flurryDaggers = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-flurry-daggers"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("assassin-flurry-daggers") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["assassin-flurry-daggers"]);
      }
    },
  },
  "assassin-dirty-trick": {
    xp: 250,
    classId: "assassin",
    label: "Dirty Trick (2 AP Crit1 · Disarm · T3 +stress)",
    apply(actor) {
      actor.dirtyTrick = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-dirty-trick"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("assassin-dirty-trick") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["assassin-dirty-trick"]);
      }
    },
  },
  "assassin-expose-weakness": {
    xp: 250,
    classId: "assassin",
    label: "Expose Weakness (2AP+1stress · 2WD + typed Vuln)",
    apply(actor) {
      actor.exposeWeakness = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-expose-weakness"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("assassin-expose-weakness") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["assassin-expose-weakness"]);
      }
    },
  },
  "assassin-shadow-dash": {
    xp: 250,
    classId: "assassin",
    label: "Shadow Dash: 1AP+1stress · BLINK 3 · Adv 1 next melee",
    apply(actor) {
      actor.hasShadowDash = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-shadow-dash"]);
    },
  },
  "scout-vigilant": {
    xp: 150,
    classId: "scout",
    label: "Vigilant: +1 Stability; OA Adv+1; MOVE 1 safe after OA",
    apply(actor) {
      actor.stability = (actor.stability | 0) + 1;
      if (actor.stabilityBase != null) actor.stabilityBase = (actor.stabilityBase | 0) + 1;
      actor.vigilant = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-vigilant"]);
    },
  },
  "acolyte-systems-bargain": {
    xp: 350,
    classId: "acolyte",
    label: "System's Bargain (activate 2AP+2mana 1/fight)",
    apply(actor) {
      actor.hasSystemsBargain = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-systems-bargain"]);
    },
  },
  "mystic-ice-wall": {
    xp: 350,
    classId: "mystic",
    label: "Ice Wall (2 mana 1/fight · 5 seg · adj difficult)",
    apply(actor) {
      actor.hasIceWall = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-ice-wall"]);
    },
  },
  "scout-spotter": {
    xp: 150,
    classId: "scout",
    label: "Spotter: 1AP+1stress Mark; allies BREAK 2; Crit 1 next ranged",
    apply(actor) {
      actor.hasSpotter = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-spotter"]);
    },
  },
  "scout-hunters-knowledge": {
    xp: 250,
    classId: "scout",
    label: "Hunter's Knowledge: Adv 1 on Ask a Question; Adv 1 vs asked enemy",
    apply(actor) {
      actor.huntersKnowledge = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-hunters-knowledge"]);
    },
  },
  "scout-ranger": {
    xp: 200,
    classId: "scout",
    label: "Ranger: +1 max Stress; 2 free Help / Rift (0 AP, carry)",
    apply(actor) {
      actor.stressMax = (actor.stressMax | 0) + 1;
      actor.stress = Math.min(actor.stressMax, (actor.stress | 0) + 1);
      actor.ranger = true;
      actor.scoutingAdv = true; // OOC Scouting phase — not simulated in combat-lab
      // 2 free Helps for the whole Rift (carry between fights). Do not reset if carry restored.
      if (actor.rangerFreeHelps == null) actor.rangerFreeHelps = 2;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-ranger"]);
    },
  },
  "fighter-precise-strike": {
    xp: 250,
    classId: "fighter",
    label: "Precise Strike (2AP+1stress · Adv1 Crit3 · Break 2+STR / 4+STR)",
    apply(actor) {
      actor.preciseStrike = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-precise-strike"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("fighter-precise-strike") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["fighter-precise-strike"]);
      }
    },
  },
  "scout-pin-shot": {
    xp: 150,
    classId: "scout",
    label: "Pin Shot (1 AP + 1 stress · WD · Slow 1 gated / Slow 2 / Knockdown)",
    apply(actor) {
      actor.pinShot = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-pin-shot"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("scout-pin-shot") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["scout-pin-shot"]);
      }
    },
  },
  "scout-barrage": {
    xp: 250,
    classId: "scout",
    label: "Barrage (3AP+1stress · max 1+DEX · WD+DEX / +2DEX / +3DEX)",
    apply(actor) {
      actor.barrage = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-barrage"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("scout-barrage") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["scout-barrage"]);
      }
    },
  },
  "mystic-lightning-bolt": {
    xp: 250,
    classId: "mystic",
    label: "Lightning Bolt (2AP+1mana · 8/12/14 Lightning)",
    apply(actor) {
      actor.lightningBolt = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-lightning-bolt"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("mystic-lightning-bolt") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["mystic-lightning-bolt"]);
      }
    },
  },
  "mystic-magic-shield": {
    xp: 150,
    classId: "mystic",
    label: "Magic Shield: 1 mana free 1/turn SHIELD 3+INT",
    apply(actor) {
      actor.hasMagicShield = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-magic-shield"]);
    },
  },
  "acolyte-enfeeble": {
    xp: 150,
    classId: "acolyte",
    label: "Enfeeble (1AP+1mana · Intimidate 3 AoE R4)",
    apply(actor) {
      actor.enfeeble = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-enfeeble"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("acolyte-enfeeble") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["acolyte-enfeeble"]);
      }
    },
  },
  "primalist-frost-shock": {
    xp: 150,
    classId: "primalist",
    label: "Frost Shock (1AP+1mana · Water + Slow)",
    apply(actor) {
      actor.frostShock = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-frost-shock"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("primalist-frost-shock") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["primalist-frost-shock"]);
      }
    },
  },
  "fighter-courage": {
    xp: 300,
    classId: "fighter",
    label: "Courage: +1 Dark DEF; R1 aura ignore Fear",
    apply(actor) {
      actor.courage = true;
      if (!actor.def) actor.def = {};
      actor.def.Dark = (actor.def.Dark | 0) + 1;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-courage"]);
    },
  },
  "fighter-intimidating-shout": {
    xp: 200,
    classId: "fighter",
    label: "Intimidating Shout (1AP+1stress · not Attack · Intimidate AoE R1/2/2)",
    apply(actor) {
      actor.intimidatingShout = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-intimidating-shout"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("fighter-intimidating-shout") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["fighter-intimidating-shout"]);
      }
    },
  },
  "mystic-blink": {
    xp: 250,
    classId: "mystic",
    label: "Blink: 1AP+1mana · ≤½ Speed · SHIELD 3×INT (Upcast: Speed +INT SHIELD)",
    apply(actor) {
      actor.hasBlink = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-blink"]);
    },
  },
  "acolyte-bless": {
    xp: 250,
    classId: "acolyte",
    label: "Bless: free 1mana R3 · Recovery+INT + reroll (Upcast: +2×INT)",
    apply(actor) {
      actor.hasBless = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-bless"]);
    },
  },
  "mystic-enhance-weapon": {
    xp: 200,
    classId: "mystic",
    label: "Enhance Weapon: 1AP+1mana · R1 · +INT+1 weapon type dmg (Upcast: chosen type)",
    apply(actor) {
      actor.hasEnhanceWeapon = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-enhance-weapon"]);
    },
  },
  "primalist-barkskin": {
    xp: 300,
    classId: "primalist",
    label: "Barkskin: 1AP+1mana R4 · SHIELD 4+INT · immune Bleed EOTF (Upcast: +INT Stability)",
    apply(actor) {
      actor.hasBarkskin = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-barkskin"]);
    },
  },
  "primalist-primal-instinct": {
    xp: 150,
    classId: "primalist",
    label: "Primal Instinct: +1 Stab · +1 Phys DEF · Bloodied Adv1",
    apply(actor) {
      actor.primalInstinct = true;
      actor.stability = (actor.stability | 0) + 1;
      if (actor.stabilityBase != null) actor.stabilityBase = (actor.stabilityBase | 0) + 1;
      if (!actor.def) actor.def = {};
      actor.def.Physical = (actor.def.Physical | 0) + 1;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-primal-instinct"]);
    },
  },
  "assassin-stealth": {
    xp: 200,
    classId: "assassin",
    label: "Stealth: 0AP+1stress · 1/round, allowed even after attacking this turn; attacks still break stealth · ST untargetable >R2 · Crit1 first melee",
    apply(actor) {
      actor.hasStealth = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-stealth"]);
    },
  },
  "scout-survival-tactics": {
    xp: 250,
    classId: "scout",
    label: "Survival Tactics: +1 Recovery · +1 Fire/Air DEF",
    apply(actor) {
      actor.recoveries = (actor.recoveries | 0) + 1;
      actor.recoveriesMax = (actor.recoveriesMax | 0) + 1;
      if (!actor.def) actor.def = {};
      actor.def.Fire = (actor.def.Fire | 0) + 1;
      actor.def.Air = (actor.def.Air | 0) + 1;
      actor.survivalTactics = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-survival-tactics"]);
    },
  },
  "fighter-forceful-push": {
    xp: 250,
    classId: "fighter",
    label: "Forceful Push (2AP+1stress · WD + Push STR + KD)",
    apply(actor) {
      actor.forcefulPush = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["fighter-forceful-push"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("fighter-forceful-push") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["fighter-forceful-push"]);
      }
    },
  },
  "brawler-grapple": {
    xp: 250,
    classId: "brawler",
    label: "Grapple (2AP+1stress · WD+STR / 2×STR / 3×STR · Restrain until end of next turn)",
    apply(actor) {
      actor.grapple = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["brawler-grapple"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("brawler-grapple") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["brawler-grapple"]);
      }
    },
  },
  "assassin-riposte": {
    xp: 300,
    classId: "assassin",
    label: "Riposte: free reaction 1/round −5×DEX; 0 dmg → weapon OA",
    apply(actor) {
      actor.hasRiposte = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["assassin-riposte"]);
    },
  },
  "scout-hidden-bola": {
    xp: 250,
    classId: "scout",
    label: "Hidden Bola: reaction R3 −5×DEX; STR≤DEX KD",
    apply(actor) {
      actor.hasHiddenBola = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["scout-hidden-bola"]);
    },
  },
  "mystic-living-bomb": {
    xp: 250,
    classId: "mystic",
    label: "Living Bomb (2AP+2mana · Burn DEX≤INT · death 8+3×INT Fire R3)",
    apply(actor) {
      actor.livingBombFeat = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-living-bomb"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("mystic-living-bomb") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["mystic-living-bomb"]);
      }
    },
  },
  "mystic-shadowplay": {
    xp: 250,
    classId: "mystic",
    label: "Shadowplay (1AP+1mana · Fear AoE · Adv vs feared)",
    apply(actor) {
      actor.shadowplay = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-shadowplay"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("mystic-shadowplay") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["mystic-shadowplay"]);
      }
    },
  },
  "mystic-game-knowledge": {
    xp: 200,
    classId: "mystic",
    label: "Game Knowledge [passive meta]: Adv 1 system rolls · +XP unique Rift Types (OOC stub)",
    apply(actor) {
      actor.gameKnowledge = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["mystic-game-knowledge"]);
    },
  },
  "acolyte-purge-wicked": {
    xp: 250,
    classId: "acolyte",
    label: "Purge the Wicked (2AP+1mana · Light + Intimidate)",
    apply(actor) {
      actor.purgeWicked = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-purge-wicked"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("acolyte-purge-wicked") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["acolyte-purge-wicked"]);
      }
    },
  },
  "acolyte-toxic-cloud": {
    xp: 250,
    classId: "acolyte",
    label: "Toxic Cloud (2AP+2mana · Toxic AoE + hazard)",
    apply(actor) {
      actor.toxicCloud = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-toxic-cloud"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("acolyte-toxic-cloud") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["acolyte-toxic-cloud"]);
      }
    },
  },
  "primalist-entangle": {
    xp: 250,
    classId: "primalist",
    label: "Entangle (2AP+2mana · Earth AoE + Slow/Restrain)",
    apply(actor) {
      actor.entangle = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-entangle"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("primalist-entangle") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["primalist-entangle"]);
      }
    },
  },
  "primalist-wind-gale": {
    xp: 250,
    classId: "primalist",
    label: "Wind Gale (2AP+2mana · Air AoE + Push)",
    apply(actor) {
      actor.windGale = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-wind-gale"]);
      if (!actor.abilityIds) actor.abilityIds = [];
      if (actor.abilityIds.indexOf("primalist-wind-gale") < 0) {
        actor.abilityIds = actor.abilityIds.concat(["primalist-wind-gale"]);
      }
    },
  },
  "primalist-healing-water": {
    xp: 250,
    classId: "primalist",
    label: "Healing Water: 1AP+1mana R4 · Cleanse 2+INT · Recovery+INT · Adv (Upcast: +2×INT)",
    apply(actor) {
      actor.hasHealingWater = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-healing-water"]);
    },
  },
  "primalist-feral-invocation": {
    xp: 300,
    classId: "primalist",
    label: "Feral Invocation: +1 Speed; 1AP+2stress · Break STR · T3 Fear INT≤STR",
    apply(actor) {
      actor.speed = (actor.speed | 0) + 1;
      if (actor.speedBase != null) actor.speedBase = (actor.speedBase | 0) + 1;
      actor.hasFeralInvocation = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-feral-invocation"]);
    },
  },
  "acolyte-summon-warrior": {
    xp: 250,
    classId: "acolyte",
    label: "Summon Warrior (2AP+2mana · 14×INT HP · 4×INT Phys · Living Shield)",
    apply(actor) {
      actor.hasSummonWarrior = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-summon-warrior"]);
    },
  },
  "acolyte-summon-mage": {
    xp: 250,
    classId: "acolyte",
    label: "Summon Mage (2AP+2mana · 8×INT HP · 5×INT Dark · Fireball)",
    apply(actor) {
      actor.hasSummonMage = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-summon-mage"]);
    },
  },
  "acolyte-summon-archer": {
    xp: 250,
    classId: "acolyte",
    label: "Summon Archer (2AP+2mana · 10×INT HP · 7×INT R5 · Bone Arrow)",
    apply(actor) {
      actor.hasSummonArcher = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["acolyte-summon-archer"]);
    },
  },
  "primalist-summon-elemental": {
    xp: 250,
    classId: "primalist",
    label: "Summon Elemental (2AP+2mana R5 · 10×INT HP · 4×INT elem · Shield +INT DEF)",
    apply(actor) {
      actor.hasSummonElemental = true;
      actor.featSmoke = (actor.featSmoke || []).concat(["primalist-summon-elemental"]);
    },
  },
};

export function featSmokeXp(feats) {
  let xp = 0;
  for (const id of feats || []) {
    const s = FEAT_SMOKE_STUBS[id];
    if (s) xp += s.xp | 0;
  }
  return xp;
}

export function applyFeatSmokeStubs(state, feats) {
  const list = feats || [];
  if (!list.length || !state || !state.actors) return state;
  for (const a of state.actors) {
    if (a.side !== "hero") continue;
    const cid = String(a.cardId || a.id || a.name || "").toLowerCase();
    for (const fid of list) {
      const stub = FEAT_SMOKE_STUBS[fid];
      if (!stub) continue;
      if (cid.indexOf(stub.classId) >= 0 || String(a.name || "").toLowerCase().indexOf(stub.classId) >= 0) {
        stub.apply(a);
      }
    }
  }
  return state;
}

export function riftWoundBand(chainId) {
  const lane = RIFT_KPI_BY_LANE[chainId] || RIFT_KPI_BY_LANE.rift_medium;
  return lane.wounds;
}

const CARD_FILES = [
  "fighter",
  "fighter-heavy-sword",
  "fighter-longsword",
  "fighter-shield-bash",
  "fighter-heavy-swing",
  "fighter-precise-strike",
  "fighter-intimidating-shout",
  "fighter-forceful-push",
  "brawler",
  "brawler-fighting-gloves",
  "brawler-quarterstaff",
  "brawler-flurry-blows",
  "brawler-uppercut",
  "brawler-grapple",
  "assassin",
  "assassin-dual-daggers",
  "assassin-dual-daggers-twin",
  "assassin-stiletto",
  "assassin-flurry-daggers",
  "assassin-dirty-trick",
  "assassin-expose-weakness",
  "scout",
  "scout-shortbow",
  "scout-pin-shot",
  "scout-barrage",
  "scout-glaive",
  "mystic",
  "mystic-pyre-focus-ember",
  "mystic-storm-focus-spark",
  "mystic-lightning-bolt",
  "mystic-living-bomb",
  "mystic-shadowplay",
  "acolyte",
  "acolyte-symbol-strike",
  "acolyte-hex-knife-strike",
  "acolyte-enfeeble",
  "acolyte-purge-wicked",
  "acolyte-toxic-cloud",
  "primalist",
  "primalist-elemental-spear-strike",
  "primalist-tide-focus-droplet",
  "primalist-frost-shock",
  "primalist-entangle",
  "primalist-wind-gale",
  "summon-warrior-strike",
  "summon-warrior-living-shield",
  "summon-mage-strike",
  "summon-mage-fireball",
  "summon-archer-strike",
  "summon-archer-bone-arrow",
  "summon-elemental-strike",
  "summon-elemental-shield",
  "ember-wolf",
  "ember-wolf-bite",
  "ember-wolf-ember-claws",
  "ember-wolf-magma-tail",
  "ember-wolf-alpha",
  "ember-wolf-alpha-ember-claws",
  "ember-wolf-alpha-ember-howl",
  "ember-wolf-alpha-heavy-bite",
  "burning-bear",
  "burning-bear-basic",
  "burning-bear-maul",
  "burning-bear-savage-charge",
  "ember-hedgehogs",
  "ember-hedgehogs-spike-shots",
  "magma-tortoise",
  "magma-tortoise-spikes",
  "magma-tortoise-hot-steam",
  "magma-tortoise-eruption",
  "magma-tortoise-magma-claws",
  "magma-tortoise-oa-burn",
  "training-dummy",
  "training-dummy-basic",
  "training-dummy-oa",
  "training-dummy-cripple",
  "training-dummy-power-swing",
  "training-dummy-menace",
];

function r1Heroes(cards, party) {
  return expandParty({ cards }, party || "r1");
}

function wolf(cards, x, y) {
  return { card: cards["ember-wolf"], pos: { x, y } };
}

function alpha(cards, x, y) {
  return {
    card: cards["ember-wolf-alpha"],
    pos: { x, y },
    name: "Ember Wolf Alpha",
  };
}

function bear(cards, x, y) {
  return {
    card: cards["burning-bear"],
    pos: { x, y },
    name: "Burning Bear",
  };
}

function horde(cards, x, y) {
  return {
    card: cards["ember-hedgehogs"],
    pos: { x, y },
    name: "Ember Hedgehogs",
  };
}

function tortoise(cards, x, y) {
  return {
    card: cards["magma-tortoise"],
    pos: { x, y },
    name: "Magma Tortoise",
  };
}

function dummy(cards, x, y) {
  return {
    card: cards["training-dummy"],
    pos: { x, y },
    name: "Training Dummy",
  };
}

/** Talent lab: two identical heroes vs Training Dummy (Help available). */
function trainScenario(heroId, label) {
  return {
    id: "train_" + heroId,
    label: "Train · " + label + " ×2 vs Dummy",
    tier: "easy",
    budgetTarget: 0,
    training: true,
    build(pack) {
      const { cards } = pack;
      const card = cards[heroId];
      if (!card || card.kind !== "hero") {
        throw new Error("train: missing hero " + heroId);
      }
      const nm = card.name || label;
      return {
        // Twin copies so Help after roll works (unique ids; same class/kit/feats).
        heroes: [
          // A starts in melee (R1) so kit Strikes / WD talents are clickable immediately.
          { card, id: heroId + "-a", pos: { x: 3, y: 3 }, name: nm + " A" },
          { card, id: heroId + "-b", pos: { x: 2, y: 3 }, name: nm + " B" },
        ],
        enemies: [dummy(cards, 4, 3)],
        objects: [],
        arena: "open",
      };
    },
  };
}

function roomTerrain(kind) {
  // Inline objects so rooms always have Push surfaces (heroes + monsters).
  if (kind === "pit") {
    return [
      { x: 4, y: 2, material: "steel", label: "Filar" },
      { x: 4, y: 5, material: "steel", label: "Filar" },
      { x: 7, y: 2, material: "steel", label: "Filar" },
      { x: 7, y: 5, material: "steel", label: "Filar" },
      { x: 5, y: 3, material: "wood", label: "Skrzynia" },
      { x: 6, y: 4, material: "wood", label: "Skrzynia" },
    ];
  }
  if (kind === "wall") {
    return [
      { x: 5, y: 1, material: "stone", label: "Ściana" },
      { x: 5, y: 2, material: "stone", label: "Ściana" },
      { x: 5, y: 3, material: "stone", label: "Ściana" },
      { x: 5, y: 4, material: "stone", label: "Ściana" },
      { x: 5, y: 5, material: "stone", label: "Ściana" },
      { x: 5, y: 6, material: "wood", label: "Skrzynia" },
      { x: 3, y: 3, material: "wood", label: "Skrzynia" },
      { x: 8, y: 4, material: "wood", label: "Skrzynia" },
    ];
  }
  // columns (default)
  return [
    { x: 5, y: 2, material: "stone", label: "Kolumna" },
    { x: 5, y: 5, material: "stone", label: "Kolumna" },
    { x: 6, y: 3, material: "wood", label: "Skrzynia" },
    { x: 7, y: 4, material: "stone", label: "Kolumna" },
    { x: 3, y: 4, material: "wood", label: "Skrzynia" },
    { x: 8, y: 2, material: "wood", label: "Skrzynia" },
  ];
}

/**
 * Room fights used by Rifts (and MC). Each includes Push terrain.
 * Trimmed from the old probe zoo — only pieces that form full Rifts.
 */
export const SCENARIOS = {
  /** Easy — 4× Wolf = 8 BP */
  w1: {
    id: "w1",
    label: "Room · Easy — 4× Ember Wolf (8 BP)",
    tier: "easy",
    budgetTarget: 8,
    learningFight: true,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [0, 1, 2, 3].map((i) => wolf(cards, 8, Math.min(7, 1 + i))),
        objects: roomTerrain("columns"),
        arena: "columns",
      };
    },
  },
  /** Medium− — 2× Wolf + Alpha = 10 BP */
  w1b: {
    id: "w1b",
    label: "Room · Medium− — 2× Wolf + Alpha (10 BP)",
    tier: "medium",
    budgetTarget: 11,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [wolf(cards, 8, 2), wolf(cards, 8, 5), alpha(cards, 10, 3)],
        objects: roomTerrain("pit"),
        arena: "pit",
      };
    },
  },
  /** Medium+ — 3× Wolf + Alpha = 12 BP */
  medium: {
    id: "medium",
    label: "Room · Medium+ — 3× Wolf + Alpha (12 BP)",
    tier: "medium",
    budgetTarget: 11,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [
          wolf(cards, 8, 1),
          wolf(cards, 8, 3),
          wolf(cards, 8, 5),
          alpha(cards, 10, 3),
        ],
        objects: roomTerrain("wall"),
        arena: "wall",
      };
    },
  },
  /** Hard mid — 3× Wolf + Alpha = 12 BP (was 4W+α 14; −1 wolf for Hard W 6–8) */
  hard: {
    id: "hard",
    label: "Room · Hard — 3× Wolf + Alpha (12 BP)",
    tier: "hard",
    budgetTarget: 12,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [
          wolf(cards, 7, 1),
          wolf(cards, 7, 3),
          wolf(cards, 9, 2),
          alpha(cards, 10, 4),
        ],
        objects: roomTerrain("columns"),
        arena: "columns",
      };
    },
  },
  /** Easy — Bear + 2× Wolf = 7 BP */
  bear_w2: {
    id: "bear_w2",
    label: "Room · Easy — Bear + 2× Wolf (7 BP)",
    tier: "easy",
    budgetTarget: 8,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [wolf(cards, 8, 2), wolf(cards, 8, 5), bear(cards, 10, 3)],
        objects: roomTerrain("pit"),
        arena: "pit",
      };
    },
  },
  /** Medium — Bear + 4× Wolf = 11 BP */
  bear_w4: {
    id: "bear_w4",
    label: "Room · Medium — Bear + 4× Wolf (11 BP)",
    tier: "medium",
    budgetTarget: 11,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [
          wolf(cards, 7, 1),
          wolf(cards, 7, 3),
          wolf(cards, 7, 5),
          wolf(cards, 9, 2),
          bear(cards, 10, 4),
        ],
        objects: roomTerrain("pit"),
        arena: "pit",
      };
    },
  },
  /** Easy — 4× Horde stacks = 4 BP… padded with 2× Wolf → 8 BP (playable token count) */
  horde_pack: {
    id: "horde_pack",
    label: "Room · Easy — 4× Hedgehogs + 2× Wolf (8 BP)",
    tier: "easy",
    budgetTarget: 8,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [
          horde(cards, 7, 1),
          horde(cards, 7, 4),
          horde(cards, 9, 2),
          horde(cards, 9, 6),
          wolf(cards, 10, 3),
          wolf(cards, 10, 5),
        ],
        objects: roomTerrain("columns"),
        arena: "columns",
      };
    },
  },
  /** Alias kept for MC tools that still say horde8 */
  horde8: {
    id: "horde8",
    label: "Room · Easy — 4× Hedgehogs + 2× Wolf (8 BP)",
    tier: "easy",
    budgetTarget: 8,
    build(pack) {
      return SCENARIOS.horde_pack.build(pack);
    },
  },
  /** Medium− — 3× Horde + Alpha = 3+6 = 9 BP (≈10) */
  horde_alpha: {
    id: "horde_alpha",
    label: "Room · Medium− — 3× Hedgehogs + Alpha (9 BP)",
    tier: "medium",
    budgetTarget: 11,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [
          horde(cards, 7, 1),
          horde(cards, 7, 4),
          horde(cards, 7, 7),
          alpha(cards, 10, 4),
        ],
        objects: roomTerrain("columns"),
        arena: "columns",
      };
    },
  },
  /** Solo Boss arena @ 11 BP */
  solo_tortoise: {
    id: "solo_tortoise",
    label: "Room · Medium — Magma Tortoise Solo (11 BP)",
    tier: "medium",
    budgetTarget: 11,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [tortoise(cards, 8, 3)],
        objects: roomTerrain("wall"),
        arena: "wall",
      };
    },
  },
  // Talent lab — 1v1 vs Training Dummy (party dropdown ignored)
  train_fighter: trainScenario("fighter", "Fighter"),
  train_brawler: trainScenario("brawler", "Brawler"),
  train_assassin: trainScenario("assassin", "Assassin"),
  train_scout: trainScenario("scout", "Scout"),
  train_mystic: trainScenario("mystic", "Mystic"),
  train_acolyte: trainScenario("acolyte", "Acolyte"),
  train_primalist: trainScenario("primalist", "Primalist"),
  /** Playtest A — Leader shape @ 14 BP (kept for MC gate; not Rift Hard room 2) */
  pta: {
    id: "pta",
    label: "Room · Hard — 4× Wolf + Alpha (14 BP)",
    tier: "hard",
    budgetTarget: 14,
    playtest: true,
    build(pack) {
      const { cards } = pack;
      return {
        heroes: r1Heroes(cards),
        enemies: [
          wolf(cards, 7, 1),
          wolf(cards, 7, 3),
          wolf(cards, 9, 2),
          wolf(cards, 9, 5),
          alpha(cards, 10, 4),
        ],
        objects: roomTerrain("columns"),
        arena: "columns",
      };
    },
  },
};

/**
 * Full Rifts: Easy / Medium / Hard — mixed rooms, fixed finales.
 * Easy → Alpha + pack · Medium/Hard → Magma Tortoise Solo.
 */
export const RIFT_CHAINS = {
  rift_easy: {
    id: "rift_easy",
    label: "Rift Easy — H+W(8) → Bear+2W(7) → 3W+α(12) = 27 BP",
    fights: ["horde_pack", "bear_w2", "medium"],
  },
  rift_medium: {
    id: "rift_medium",
    label: "Rift Medium — 4W(8) → Bear+4W(11) → Tortoise(11) = 30 BP",
    fights: ["w1", "bear_w4", "solo_tortoise"],
  },
  rift_hard: {
    id: "rift_hard",
    label: "Rift Hard — Bear+4W(11) → 3W+α(12) → Tortoise(11) = 34 BP",
    fights: ["bear_w4", "hard", "solo_tortoise"],
  },
  // Legacy aliases → new difficulty lanes (MC / old bookmarks)
  rift_wolves: {
    id: "rift_wolves",
    label: "alias → Rift Easy",
    fights: ["horde_pack", "bear_w2", "medium"],
  },
  rift_horde: {
    id: "rift_horde",
    label: "alias → Rift Medium",
    fights: ["w1", "bear_w4", "solo_tortoise"],
  },
  rift_boss: {
    id: "rift_boss",
    label: "alias → Rift Hard",
    fights: ["bear_w4", "hard", "solo_tortoise"],
  },
  rift2: {
    id: "rift2",
    label: "alias → Rift Medium (short was 2-room; now full Medium ×3)",
    fights: ["w1", "bear_w4", "solo_tortoise"],
  },
  rift3: {
    id: "rift3",
    label: "alias → Rift Easy",
    fights: ["horde_pack", "bear_w2", "medium"],
  },
};

export async function loadCardPack(base = "./cards/") {
  const cards = {};
  const bust = "v=20260924remed";
  await Promise.all(
    CARD_FILES.map(async (n) => {
      const r = await fetch(base + n + ".json?" + bust);
      if (!r.ok) throw new Error("load " + n);
      cards[n] = await r.json();
    })
  );
  const abilityById = {};
  for (const c of Object.values(cards)) {
    if (c.kind === "ability") abilityById[c.id] = c;
  }
  return { cards, abilityById };
}

/** Card file stems used by R1 pack (shared with CLI loaders). */
export function r1CardFiles() {
  return CARD_FILES.slice();
}

export function encounterSpentBp(enemiesSpec) {
  let spent = 0;
  for (const e of enemiesSpec || []) {
    const card = e.card || e;
    spent += Number(card.battlePoints) || 0;
  }
  return spent;
}

export function tierHintForSpent(spent) {
  if (spent <= BUDGET.easy.max) return "easy";
  if (spent <= BUDGET.medium.max) return "medium";
  if (spent <= BUDGET.hard.max) return "hard";
  return "deadly";
}

export function makeR1Encounter(pack, seed, opts = {}) {
  const scenarioId = opts.scenario || "w1";
  const scenario = SCENARIOS[scenarioId] || SCENARIOS.w1;
  const partyOpt = opts.party != null ? opts.party : "r1";
  const heroesFromParty = () => r1Heroes(pack.cards, partyOpt);
  let built;
  if (opts.heroes) {
    built = {
      heroes: opts.heroes,
      enemies: opts.enemies || (scenario.build(pack).enemies),
    };
  } else if (opts.enemies) {
    built = {
      heroes: heroesFromParty(),
      enemies: opts.enemies,
    };
  } else if (opts.roster) {
    // Lazy import avoided — expand inline
    const enemies = [];
    const spots = [
      [7, 1],
      [7, 3],
      [7, 5],
      [7, 7],
      [9, 1],
      [9, 3],
      [9, 5],
      [9, 7],
      [10, 2],
      [10, 4],
      [10, 6],
      [8, 2],
      [8, 4],
      [8, 6],
    ];
    let spot = 0;
    for (const row of opts.roster) {
      const card = pack.cards[row.cardId];
      if (!card || card.kind !== "monster") continue;
      const n = Math.max(0, Math.min(12, row.count | 0));
      for (let i = 0; i < n; i++) {
        const [x, y] = spots[spot % spots.length];
        spot++;
        enemies.push({ card, pos: { x, y }, name: card.name });
      }
    }
    built = { heroes: heroesFromParty(), enemies };
  } else {
    built = scenario.build(pack);
    // Scenario builders hard-code R1 FBAS; override when party ≠ r1.
    // Training 1v1 scenarios keep their single hero regardless of party dropdown.
    if (partyOpt !== "r1" && !scenario.training) {
      built = {
        heroes: heroesFromParty(),
        enemies: built.enemies,
        objects: built.objects,
        arena: built.arena,
      };
    }
  }
  if (opts.mixKits) {
    built.heroes.forEach((h, i) => {
      h.activeKit = (seed + i) % 2;
    });
  }
  if (opts.armorStress) {
    built.heroes = applyArmorStressToHeroSpecs(built.heroes, opts.armorStress);
  }
  let enemies = built.enemies;
  const baseSpent = encounterSpentBp(enemies);
  const nInf = inferTalentsPerHero(opts);
  const wantPad =
    opts.padBpAdd != null ||
    opts.padBp != null ||
    opts.talentCounts != null ||
    opts.talentsPerHero != null ||
    opts.targetBp != null ||
    nInf != null;
  const padBp =
    opts.padBpAdd != null
      ? Math.max(0, opts.padBpAdd | 0)
      : resolvePadBp(opts);
  const targetBp =
    opts.targetBp != null
      ? opts.targetBp | 0
      : wantPad
        ? baseSpent + padBp
        : baseSpent;
  if (wantPad && targetBp > baseSpent) {
    enemies = padEnemiesToBp(pack, enemies, targetBp);
    built = Object.assign({}, built, { enemies });
  }
  const spent = encounterSpentBp(built.enemies);
  const state = createEncounter({
    seed,
    abilityById: pack.abilityById,
    heroes: built.heroes,
    enemies: built.enemies,
    startActorId: opts.startActorId || null,
    arena: opts.arena != null ? opts.arena : built.arena || null,
    objects: opts.objects != null ? opts.objects : built.objects || null,
    deferStart: !!opts.deferStart,
    askHeroPick: !!opts.askHeroPick,
    askKitPick: !!opts.askKitPick,
  });
  state.scenarioId = opts.roster || opts.enemies ? "builder" : scenario.id;
  if (opts.armorStress) state.armorStress = opts.armorStress;
  state.encounterBudget = {
    spent,
    baseSpent,
    padBp,
    target:
      opts.budgetTarget != null
        ? opts.budgetTarget
        : wantPad || opts.targetBp != null
          ? targetBp
          : opts.roster || opts.enemies
            ? BUDGET[tierHintForSpent(spent)]?.target || spent
            : scenario.budgetTarget,
    tier:
      opts.roster || opts.enemies
        ? tierHintForSpent(spent)
        : scenario.tier,
    tierHint: tierHintForSpent(spent),
  };
  if (opts.featSmoke) applyFeatSmokeStubs(state, opts.featSmoke);
  if (opts.positions) {
    for (const a of state.actors) {
      const p = opts.positions[a.id];
      if (!p) continue;
      a.x = p.x | 0;
      a.y = p.y | 0;
    }
  }
  if (opts.carry) applyHeroCarry(state, opts.carry);
  if (opts.askReactions) state.askReactions = true;
  if (opts.askHeroPick) state.askHeroPick = true;
  if (opts.askKitPick) state.askKitPick = true;
  if (opts.askPush || opts.askReactions) state.askPush = true;
  if (opts.playSummons) state.playSummons = true;
  return state;
}

/** Patch heroes after createEncounter for Rift continuity. */
export function applyHeroCarry(state, carryByKey) {
  if (!carryByKey) return;
  for (const h of state.actors.filter((a) => a.side === "hero")) {
    const c = carryByKey[h.id] || carryByKey[h.name];
    if (!c) continue;
    if (c.hp != null) h.hp = c.hp | 0;
    if (c.hpMax != null) h.hpMax = c.hpMax | 0;
    if (c.recoveries != null) h.recoveries = c.recoveries | 0;
    if (c.wounds != null) h.wounds = c.wounds | 0;
    if (c.stress != null) h.stress = c.stress | 0;
    if (c.dead != null) h.dead = !!c.dead;
    if (c.activeKit != null) h.activeKit = c.activeKit | 0;
    if (c.rangerFreeHelps != null) h.rangerFreeHelps = c.rangerFreeHelps | 0;
    if ((h.hp | 0) <= 0 && !h.dead) {
      h.down = true;
    }
  }
}

export function snapshotHeroCarry(state) {
  const out = {};
  for (const h of state.actors.filter((a) => a.side === "hero")) {
    out[h.id] = {
      hp: h.hp | 0,
      hpMax: h.hpMax | 0,
      recoveries: h.recoveries | 0,
      wounds: h.wounds | 0,
      stress: h.stress | 0,
      dead: !!h.dead,
      activeKit: h.activeKit | 0,
      name: h.name,
      rangerFreeHelps: h.rangerFreeHelps != null ? h.rangerFreeHelps | 0 : undefined,
    };
  }
  return out;
}

/**
 * Between Rift fights: spend Recoveries freely (CATCH BREATH = higher of 2d10).
 * Party pool: any remaining Rec can heal the neediest living hero (Rift continuity).
 */
export function betweenCombatRecover(carry, rng) {
  if (!carry) return;
  const next = typeof rng === "function" ? rng : Math.random;
  const d10 = () => 1 + Math.floor(next() * 10);
  const heroes = Object.values(carry).filter((h) => h && !h.dead);
  for (const h of heroes) {
    h.down = false;
    if ((h.hp | 0) <= 0) h.hp = 1;
  }
  let guard = 0;
  while (guard++ < 48) {
    const pool = heroes.reduce((s, h) => s + (h.recoveries | 0), 0);
    if (pool <= 0) break;
    const needy = heroes
      .filter((h) => (h.hp | 0) < (h.hpMax | 0))
      .sort((a, b) => (a.hp | 0) / Math.max(1, a.hpMax | 0) - (b.hp | 0) / Math.max(1, b.hpMax | 0));
    if (!needy.length) break;
    const target = needy[0];
    const donor = heroes.find((h) => (h.recoveries | 0) > 0);
    if (!donor) break;
    donor.recoveries = (donor.recoveries | 0) - 1;
    target.hp = Math.min(target.hpMax | 0, (target.hp | 0) + Math.max(d10(), d10()));
  }
}

export function playFight(state, policy = "smart", maxRounds = 60) {
  if (state && state.logCap == null) state.logCap = 5000;
  if (policy === "table") {
    state.defendPolicy = "table";
    // Hard cap: zombie grinds are not useful signal for table calibration.
    if (maxRounds > 15) maxRounds = 15;
  } else if (policy === "smart" || policy === "mixKits") {
    state.defendPolicy = state.defendPolicy || "smart";
  } else if (policy === "defend1") {
    state.defendPolicy = "defend1";
  }
  let guard = 0;
  const tally = { brawlerForced: 0, brawlerCollide: 0, kitSwaps: 0, slide: 0, push: 0 };
  while (!state.over && guard++ < maxRounds * 12) {
    if ((state.round | 0) > maxRounds) break;
    const cur = currentActor(state);
    if (!cur) break;
    if (cur.side === "hero") {
      const hr = runHeroTurns(state, policy);
      tallyForcedFromResults(hr, cur, tally);
      if (!state.over) runEnemyTurns(state);
    } else {
      runEnemyTurns(state);
    }
  }
  if (!state.over) {
    state.over = true;
    state.winner = "timeout";
    if (state.log) {
      state.log.push({ t: Date.now(), msg: "FIGHT END — Timeout (cap " + maxRounds + " rounds)" });
    }
  }
  for (const h of state.actors.filter((a) => a.side === "hero")) {
    tally.kitSwaps += h.kitSwapsTotal | 0;
  }
  const s = summarize(state);
  if (s.winner === "timeout") s.rounds = Math.min(s.rounds | 0, maxRounds);
  s.tally = tally;
  s.encounterBudget = state.encounterBudget || null;
  s.logKpi = logKpiFromState(state);
  return s;
}

function logKpiFromState(state) {
  const entries = (state.log || []).map((e) => (e && e.msg) || "");
  const re = (rx) => entries.reduce((n, m) => n + (rx.test(m) ? 1 : 0), 0);
  return {
    howl: re(/Piercing Howl|Ember Howl|\bHowl\b/i),
    fear: re(/\bFear\b/),
    catchBreath: re(/CATCH BREATH/),
    interpose: re(/Interpos/i),
    steel: re(/Steel Yourself/),
    opening: re(/Line Up the Strike/),
    collision: re(/\bcollision\b/i),
    lines: entries.length,
  };
}

function tallyForcedFromResults(results, actor, tally) {
  if (!results || !/brawler/i.test((actor && (actor.id || actor.name)) || "")) return;
  for (const row of results) {
    const forced = row && row.r && row.r.result && row.r.result.forced;
    if (!forced || !forced.length) continue;
    for (const f of forced) {
      tally.brawlerForced += 1;
      if (f.mode === "slide") tally.slide += 1;
      else tally.push += 1;
      if (f.collision) tally.brawlerCollide += 1;
    }
  }
}


/** Normalize hero actor → Rank0 class id (fighter, mystic, …). */
export function heroClassKey(h) {
  const raw = String((h && (h.cardId || h.id || h.name)) || "").toLowerCase();
  const ids = [
    "fighter",
    "brawler",
    "mystic",
    "acolyte",
    "primalist",
    "assassin",
    "scout",
  ];
  for (const id of ids) {
    if (raw === id || raw.startsWith(id + "-") || raw.startsWith(id + "_")) return id;
  }
  return raw.replace(/-\d+$/, "").replace(/_\d+$/, "") || "unknown";
}

/** Per-hero end-state snapshot keyed by class id. */
export function perHeroFromActors(heroes) {
  const out = {};
  for (const h of heroes || []) {
    const id = heroClassKey(h);
    out[id] = {
      id,
      name: h.name || id,
      hp: Math.max(0, h.hp | 0),
      hpMax: h.hpMax | 0,
      recoveries: h.recoveries | 0,
      wounds: h.wounds | 0,
      dead: !!h.dead,
    };
  }
  return out;
}

/** Aggregate per-hero snapshots across MC rows (mean / p50). */
export function aggregatePerHero(rows) {
  const buckets = {};
  for (const r of rows || []) {
    const ph = r.perHero || {};
    for (const id of Object.keys(ph)) {
      if (!buckets[id]) buckets[id] = [];
      buckets[id].push(ph[id]);
    }
  }
  const out = {};
  for (const id of Object.keys(buckets).sort()) {
    const list = buckets[id];
    const n = list.length || 1;
    const avg = (key) => list.reduce((s, x) => s + ((x && x[key]) | 0), 0) / n;
    const sorted = (key) => list.map((x) => (x && x[key]) | 0).sort((a, b) => a - b);
    const p50 = (key) => {
      const s = sorted(key);
      if (!s.length) return 0;
      return s[Math.min(s.length - 1, Math.floor((s.length - 1) * 0.5))];
    };
    out[id] = {
      n: list.length,
      hp: { mean: avg("hp"), p50: p50("hp") },
      hpMax: { mean: avg("hpMax") },
      recoveries: { mean: avg("recoveries"), p50: p50("recoveries") },
      wounds: { mean: avg("wounds"), p50: p50("wounds") },
    };
  }
  return out;
}

function summarize(state) {
  // Exclude summons from party KPIs (pet Dying wounds polluted Soft/ablation).
  const heroes = state.actors.filter((a) => a.side === "hero" && !a.summon);
  const enemies = state.actors.filter((a) => a.side === "enemy");
  const recLeft = heroes.reduce((s, h) => s + (h.recoveries | 0), 0);
  const recMax = heroes.reduce(
    (s, h) => s + (h.recoveriesMax != null ? h.recoveriesMax | 0 : 3),
    0
  );
  return {
    winner: state.winner,
    rounds: state.round,
    wounds: heroes.reduce((s, h) => s + (h.wounds | 0), 0),
    recLeft,
    recMax: recMax || PARTY_REC_MAX,
    recDrop: Math.max(0, (recMax || PARTY_REC_MAX) - recLeft),
    heroesAlive: heroes.filter((h) => !h.dead && (h.hp | 0) > 0).length,
    enemiesAlive: enemies.filter((e) => !e.dead && (e.hp | 0) > 0).length,
    wolvesAlive: enemies.filter((e) => !e.dead && (e.hp | 0) > 0).length,
    hpLeft: heroes.reduce((s, h) => s + Math.max(0, h.hp | 0), 0),
    perHero: perHeroFromActors(heroes),
  };
}

function q(rows, key, p) {
  const sorted = rows.map((r) => r[key]).sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[i];
}

function aggregateFightRows(rows, n, meta) {
  const wins = rows.filter((r) => r.winner === "hero").length;
  const losses = rows.filter((r) => r.winner === "enemy").length;
  const timeouts = rows.filter((r) => r.winner === "timeout").length;
  const avg = (key, list = rows) =>
    list.length ? list.reduce((s, r) => s + (r[key] | 0), 0) / list.length : 0;
  const avgT = (key) =>
    rows.reduce((s, r) => s + ((r.tally && r.tally[key]) || 0), 0) / n;
  const avgLog = (key) =>
    rows.reduce((s, r) => s + ((r.logKpi && r.logKpi[key]) || 0), 0) / n;
  const budget = rows[0] && rows[0].encounterBudget;
  // Long-tail grinds skew means — primary calibration uses median + trimmed (≤15).
  const longTail = rows.filter((r) => (r.rounds | 0) > 15);
  const trimmed = rows.filter((r) => (r.rounds | 0) <= 15);
  const tn = trimmed.length || 1;
  return {
    n,
    ...meta,
    winRate: wins / n,
    lossRate: losses / n,
    timeoutRate: timeouts / n,
    longTailRate: longTail.length / n,
    trimmedN: trimmed.length,
    rounds: {
      mean: avg("rounds"),
      p50: q(rows, "rounds", 0.5),
      p90: q(rows, "rounds", 0.9),
      trimmedMean: avg("rounds", trimmed),
    },
    wounds: {
      mean: avg("wounds"),
      p50: q(rows, "wounds", 0.5),
      p90: q(rows, "wounds", 0.9),
      trimmedMean: avg("wounds", trimmed),
    },
    recLeft: { mean: avg("recLeft"), p50: q(rows, "recLeft", 0.5) },
    recDrop: {
      mean: avg("recDrop"),
      p50: q(rows, "recDrop", 0.5),
      p90: q(rows, "recDrop", 0.9),
      trimmedMean: avg("recDrop", trimmed),
    },
    hpLeft: { mean: avg("hpLeft"), p50: q(rows, "hpLeft", 0.5) },
    brawler: {
      forcedMean: avgT("brawlerForced"),
      collideMean: avgT("brawlerCollide"),
      slideMean: avgT("slide"),
      pushMean: avgT("push"),
    },
    kitSwapsMean: avgT("kitSwaps"),
    logKpi: {
      howlMean: avgLog("howl"),
      fearMean: avgLog("fear"),
      catchBreathMean: avgLog("catchBreath"),
      interposeMean: avgLog("interpose"),
      steelMean: avgLog("steel"),
      openingMean: avgLog("opening"),
    },
    encounterBudget: budget || null,
    kpi: {
      fight: {
        recDropBand: rows.filter((r) => r.recDrop >= 3 && r.recDrop <= 5).length / n,
        woundsBand: rows.filter((r) => r.wounds >= 0 && r.wounds <= 2).length / n,
        roundsBand: rows.filter((r) => r.rounds >= 3 && r.rounds <= 6).length / n,
        // Bands on non-grind fights (closer to table tempo).
        trimmedRecDropBand:
          trimmed.filter((r) => r.recDrop >= 3 && r.recDrop <= 5).length / tn,
        trimmedWoundsBand:
          trimmed.filter((r) => r.wounds >= 0 && r.wounds <= 2).length / tn,
        trimmedRoundsBand:
          trimmed.filter((r) => r.rounds >= 3 && r.rounds <= 6).length / tn,
        learningFight: !!(meta && meta.learningFight),
      },
      riftTargets: {
        recLeft: "0–3 after 2–3 fights",
        wounds: "0–5 across Rift",
      },
    },
  };
}

export function runMonteCarlo(pack, opts = {}) {
  const n = opts.n || 200;
  const seed0 = opts.seed0 || 1;
  const policy = opts.policy || "table";
  const scenario = opts.scenario || "w1";
  const party = opts.party != null ? opts.party : "r1";
  const mixKits = !!opts.mixKits || policy === "mixKits" || policy === "table";
  const armorStress = opts.armorStress || null;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      playFight(
        makeR1Encounter(pack, seed0 + i, {
          scenario,
          mixKits,
          party,
          armorStress,
          padBp: opts.padBp,
          padBpAdd: opts.padBpAdd,
          talentsPerHero: opts.talentsPerHero,
          talentCounts: opts.talentCounts,
          featSmoke: opts.featSmoke,
          targetBp: opts.targetBp,
        }),
        policy
      )
    );
  }
  const sc = SCENARIOS[scenario] || SCENARIOS.w1;
  return aggregateFightRows(rows, n, {
    policy,
    scenario,
    scenarioLabel: sc.label,
    party,
    mixKits,
    armorStress,
    learningFight: !!sc.learningFight,
    padBp: opts.padBp != null ? opts.padBp | 0 : resolvePadBp(opts),
    talentsPerHero: opts.talentsPerHero != null ? opts.talentsPerHero | 0 : null,
    featSmoke: opts.featSmoke || null,
    talentBpV03: TALENT_BP_V03,
  });
}

/**
 * Play a Rift: sequential fights, shared Rec / Wounds / HP.
 * Between fights: spend Recoveries freely to heal (table fiction).
 */
export function playRift(pack, seed, opts = {}) {
  const chainId = opts.chain || "rift_easy";
  const chain = RIFT_CHAINS[chainId] || RIFT_CHAINS.rift_easy;
  const policy = opts.policy || "table";
  const party = opts.party != null ? opts.party : "r1";
  const mixKits = !!opts.mixKits || policy === "mixKits" || policy === "table";
  const armorStress = opts.armorStress || null;
  const betweenRng = createRng((seed | 0) ^ 0xbe7a);
  let carry = null;
  const fights = [];
  let totalBp = 0;
  const totalPad = resolvePadBp(opts);
  const padShares = splitPadBpAcrossFights(totalPad, chain.fights.length, {
    skip: chain.fights.map((id) => isSoloPadSkipScenario(id)),
  });
  for (let f = 0; f < chain.fights.length; f++) {
    const scenario = chain.fights[f];
    const recBefore = carry
      ? Object.keys(carry).reduce((s, k) => s + (carry[k].recoveries | 0), 0)
      : PARTY_REC_MAX;
    const share = padShares[f] | 0;
    const state = makeR1Encounter(pack, seed + f * 17, {
      scenario,
      mixKits,
      party,
      armorStress,
      carry,
      padBpAdd: share > 0 ? share : 0,
      featSmoke: opts.featSmoke,
      targetBp: opts.targetBp,
      talentsPerHero: opts.talentsPerHero,
      talentCounts: opts.talentCounts,
    });
    totalBp += (state.encounterBudget && state.encounterBudget.spent) || 0;
    if (opts.traceTalents) {
      state.traceTalents = true;
      state.talentTrace = [];
    }
    const summary = playFight(state, policy);
    if (state.talentTrace) summary.talentTrace = state.talentTrace;
    // Per-fight drop from resources entering this encounter (not from full 12)
    summary.recDrop = Math.max(0, recBefore - (summary.recLeft | 0));
    fights.push({
      scenario,
      label: (SCENARIOS[scenario] || {}).label,
      ...summary,
    });
    if (summary.winner === "enemy" || summary.winner === "timeout") {
      return {
        winner: summary.winner,
        chain: chainId,
        chainLabel: chain.label,
        fights,
        totalBp,
        padBpSplit: { totalAdd: totalPad, shares: padShares },
        recLeft: summary.recLeft,
        wounds: summary.wounds,
        hpLeft: summary.hpLeft | 0,
        recDrop: PARTY_REC_MAX - (summary.recLeft | 0),
        perHero: summary.perHero || null,
      };
    }
    carry = snapshotHeroCarry(state);
    for (const key of Object.keys(carry)) {
      if (carry[key].hp <= 0 && !carry[key].dead) {
        carry[key].hp = 1;
      }
    }
    if (f < chain.fights.length - 1) {
      betweenCombatRecover(carry, betweenRng);
    }
  }
  const last = fights[fights.length - 1];
  return {
    winner: "hero",
    chain: chainId,
    chainLabel: chain.label,
    fights,
    totalBp,
    padBpSplit: { totalAdd: totalPad, shares: padShares },
    recLeft: last.recLeft,
    wounds: last.wounds,
    hpLeft: last.hpLeft | 0,
    recDrop: PARTY_REC_MAX - (last.recLeft | 0),
    perHero: last.perHero || null,
  };
}

export function runRiftMonteCarlo(pack, opts = {}) {
  const n = opts.n || 100;
  const seed0 = opts.seed0 || 1;
  const policy = opts.policy || "table";
  const chain = opts.chain || "rift_easy";

  const party = opts.party != null ? opts.party : "r1";
  const mixKits = !!opts.mixKits || policy === "mixKits" || policy === "table";
  const armorStress = opts.armorStress || null;
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push(
      playRift(pack, seed0 + i, {
        chain,
        policy,
        mixKits,
        party,
        armorStress,
        padBp: opts.padBp,
        talentsPerHero: opts.talentsPerHero,
        talentCounts: opts.talentCounts,
        featSmoke: opts.featSmoke,
        targetBp: opts.targetBp,
      })
    );
  }
  const cleared = rows.filter((r) => r.winner === "hero");
  const wins = cleared.length;
  const avg = (key) => rows.reduce((s, r) => s + (r[key] | 0), 0) / n;
  const avgC = (key) =>
    cleared.length
      ? cleared.reduce((s, r) => s + (r[key] | 0), 0) / cleared.length
      : 0;
  return {
    n,
    policy,
    chain,
    party,
    armorStress,
    padBp: opts.padBp != null ? opts.padBp | 0 : resolvePadBp(opts),
    talentsPerHero: opts.talentsPerHero != null ? opts.talentsPerHero | 0 : null,
    featSmoke: opts.featSmoke || null,
    talentBpV03: TALENT_BP_V03,
    chainLabel: (RIFT_CHAINS[chain] || RIFT_CHAINS.rift_easy).label,
    mixKits,
    winRate: wins / n,
    lossRate: rows.filter((r) => r.winner === "enemy").length / n,
    timeoutRate: rows.filter((r) => r.winner === "timeout").length / n,
    totalBp: { mean: avg("totalBp") },
    recLeft: {
      mean: avg("recLeft"),
      meanCleared: avgC("recLeft"),
      p50: q(rows, "recLeft", 0.5),
    },
    recDrop: { mean: avg("recDrop"), p50: q(rows, "recDrop", 0.5) },
    wounds: {
      mean: avg("wounds"),
      meanCleared: avgC("wounds"),
      p50: q(rows, "wounds", 0.5),
      p90: q(rows, "wounds", 0.9),
    },
    hpLeft: {
      mean: avg("hpLeft"),
      meanCleared: avgC("hpLeft"),
      p50: q(rows, "hpLeft", 0.5),
    },
    perHero: aggregatePerHero(rows),
    kpi: {
      rift: {
        // End-of-Rift bands measured on clears only (design target).
        clearedN: cleared.length,
        woundTarget: riftWoundBand(chain),
        recLeftBand: cleared.filter((r) => r.recLeft >= 0 && r.recLeft <= 3).length /
          Math.max(1, cleared.length),
        woundsBand: cleared.filter((r) => {
          const [lo, hi] = riftWoundBand(chain);
          return r.wounds >= lo && r.wounds <= hi;
        }).length / Math.max(1, cleared.length),
      },
    },
    fightRecDrops: (RIFT_CHAINS[chain] || RIFT_CHAINS.rift_easy).fights.map((_, fi) => {
      const drops = rows
        .filter((r) => r.fights && r.fights[fi])
        .map((r) => r.fights[fi].recDrop | 0);
      const mean = drops.length ? drops.reduce((a, b) => a + b, 0) / drops.length : 0;
      return { index: fi, scenario: (RIFT_CHAINS[chain] || {}).fights[fi], mean };
    }),
  };
}
