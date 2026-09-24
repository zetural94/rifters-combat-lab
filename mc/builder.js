/**
 * Roster + BP helpers. The sandbox can read a roster already saved in this browser.
 * builder.html is not part of the lab pack.
 */
import {
  BUDGET,
  RIFT_BUDGET,
  FIGHT_KPI,
  BP_PILLAR,
  BP_UNIT,
  encounterSpentBp,
  tierHintForSpent,
  resolvePadBp,
  effectiveRiftBudget,
  TALENT_BP_V03,
} from "./r1.js";

/** Catalog entries for the builder UI. */
export const BUILDER_CATALOG = [
  {
    cardId: "ember-hedgehogs",
    label: "Ember Hedgehogs",
    role: "HORDE",
    bp: 1,
    note: "1 stack = 6 pawns (X), 1 activation. Spike 2+X/4+X/7+X (full 8/10/13).",
  },
  {
    cardId: "ember-wolf",
    label: "Ember Wolf",
    role: "STANDARD",
    bp: 2,
    note: "HP 18 · DEF 3 · Bite 7 · Claws 5/9/11",
  },
  {
    cardId: "burning-bear",
    label: "Burning Bear",
    role: "BRUTE",
    bp: 3,
    note: "HP 40 · DEF 5 · Swipe 8 / Maul 9 · Charge 5/8/10",
  },
  {
    cardId: "ember-wolf-alpha",
    label: "Ember Wolf Alpha",
    role: "BOSS · Leader",
    bp: 6,
    note: "HP 45 · DEF 5 · bossTurns 2 · Howl 2/fight",
  },
  {
    cardId: "magma-tortoise",
    label: "Magma Tortoise",
    role: "BOSS · Solo",
    bp: 11,
    note: "HP 80 · size 2×2 · Speed 0→6 Bloodied · Spikes R8 · 4 acts",
  },
];

export const BUILDER_STORAGE_KEY = "combatLabBuilderRoster";
export const BUILDER_PARTY_KEY = "combatLabBuilderParty";

/** Enemy spawn spots (right half of R1 board). */
const ENEMY_SPOTS = [
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

/**
 * roster: [{ cardId, count }]
 * → enemies spec for createEncounter / makeR1Encounter
 */
export function expandRosterToEnemies(pack, roster) {
  const { cards } = pack;
  const enemies = [];
  const used = new Set();
  let spot = 0;
  function takeSpot(size) {
    const n = Math.max(1, size | 0 || 1);
    for (let tries = 0; tries < ENEMY_SPOTS.length * 2; tries++) {
      const [x, y] = ENEMY_SPOTS[spot % ENEMY_SPOTS.length];
      spot++;
      let ok = true;
      for (let dy = 0; dy < n && ok; dy++) {
        for (let dx = 0; dx < n && ok; dx++) {
          if (used.has(x + dx + "," + (y + dy))) ok = false;
          if (x + dx > 11 || y + dy > 7) ok = false;
        }
      }
      if (!ok) continue;
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) used.add(x + dx + "," + (y + dy));
      }
      return { x, y };
    }
    return { x: 8, y: 3 };
  }
  for (const row of roster || []) {
    const card = cards[row.cardId];
    if (!card || card.kind !== "monster") continue;
    const n = Math.max(0, Math.min(12, row.count | 0));
    const size = Math.max(1, (card.size | 0) || 1);
    for (let i = 0; i < n; i++) {
      const pos = takeSpot(size);
      enemies.push({
        card,
        pos,
        name: card.name,
      });
    }
  }
  return enemies;
}

export function rosterSpentBp(roster, catalog = BUILDER_CATALOG) {
  let spent = 0;
  for (const row of roster || []) {
    const meta = catalog.find((c) => c.cardId === row.cardId);
    const bp =
      (meta && meta.bp) ||
      BP_UNIT[row.cardId] ||
      0;
    spent += bp * Math.max(0, row.count | 0);
  }
  return spent;
}

export function budgetSummary(spent, opts = {}) {
  // Legacy callers passed a number (party XP) — ignore; pad is talent-count only.
  const o = opts != null && typeof opts === "object" ? opts : {};
  const talentsPerHero = Math.max(0, Math.min(4, o.talentsPerHero | 0));
  const party = o.party != null ? o.party : "r1";
  const padOpts = { talentsPerHero, party };
  const padAdd = resolvePadBp(padOpts);
  const padHard = resolvePadBp({ ...padOpts, chain: "rift_hard" });
  const tier = tierHintForSpent(spent);
  const band =
    tier === "easy"
      ? BUDGET.easy
      : tier === "medium"
        ? BUDGET.medium
        : tier === "hard"
          ? BUDGET.hard
          : { min: 17, max: 99, target: spent };
  const kpi =
    tier === "easy"
      ? FIGHT_KPI.easy
      : tier === "medium"
        ? FIGHT_KPI.medium
        : tier === "hard"
          ? FIGHT_KPI.hard
          : null;
  const effective = spent + padAdd;
  return {
    spent,
    talentsPerHero,
    party,
    padAdd,
    padHard,
    effective,
    effectiveHard: spent + padHard,
    tier,
    band,
    kpi,
    pillars: BP_PILLAR,
    riftPools: RIFT_BUDGET,
    riftPoolsEffective: {
      easy: effectiveRiftBudget("easy", padOpts),
      medium: effectiveRiftBudget("medium", padOpts),
      hard: effectiveRiftBudget("hard", { ...padOpts, chain: "rift_hard" }),
    },
    talentBp: TALENT_BP_V03,
  };
}

export function saveBuilderRoster(roster, party) {
  try {
    const payload = { roster, savedAt: Date.now() };
    if (party != null) payload.party = party;
    localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

export function loadBuilderRoster() {
  try {
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return Array.isArray(o.roster) ? o.roster : null;
  } catch (_) {
    return null;
  }
}

/** Party: preset id string or array of 4 hero ids. */
export function saveBuilderParty(party) {
  try {
    localStorage.setItem(
      BUILDER_PARTY_KEY,
      JSON.stringify({ party, savedAt: Date.now() })
    );
    // Keep a copy next to roster payload when possible
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      o.party = party;
      o.savedAt = Date.now();
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(o));
    }
  } catch (_) {}
}

export function loadBuilderParty() {
  try {
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o.party != null) return o.party;
    }
    const stand = localStorage.getItem(BUILDER_PARTY_KEY);
    if (!stand) return "r1";
    const o2 = JSON.parse(stand);
    return o2.party != null ? o2.party : "r1";
  } catch (_) {
    return "r1";
  }
}

export function clearBuilderRoster() {
  try {
    localStorage.removeItem(BUILDER_STORAGE_KEY);
  } catch (_) {}
}

export {
  BUDGET,
  FIGHT_KPI,
  BP_PILLAR,
  encounterSpentBp,
  tierHintForSpent,
  resolvePadBp,
  effectiveRiftBudget,
  TALENT_BP_V03,
  HERO_CATALOG,
  PARTY_PRESETS,
  PARTY_PRESET_LABELS,
  expandParty,
  resolvePartyIds,
  partyLabel,
} from "./r1.js";
