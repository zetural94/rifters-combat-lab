/**
 * Full talent-pool coverage helpers (not ladder-only).
 * Canon (Adrian 2026-09-24): every Soft/BP / balance iteration must
 * check ALL class talents in FEAT_SMOKE_STUBS, not only R1_LADDER_PICKS slots.
 */
import { FEAT_SMOKE_STUBS } from "./r1.js";
import {
  R1_LADDER_PICKS,
  R1_LADDER_PICKS_B,
  r1LadderFeats,
  r1LadderFeatsVariant,
} from "./talent-ladder.js";

/** T1 balance classes (exclude warrior T2 draft). */
export const CLASS_ORDER = [
  "fighter",
  "brawler",
  "assassin",
  "scout",
  "mystic",
  "acolyte",
  "primalist",
];

const DEFAULT_PARTY = ["fighter", "brawler", "assassin", "scout"];

/**
 * All FEAT_SMOKE_STUBS keys grouped by stub.classId (or id prefix).
 * Includes warrior if present in stubs; callers usually iterate CLASS_ORDER.
 */
export function talentPoolFromStubs() {
  const by = {};
  for (const id of Object.keys(FEAT_SMOKE_STUBS)) {
    const stub = FEAT_SMOKE_STUBS[id];
    const cls =
      (stub && stub.classId) ||
      String(id).split("-")[0] ||
      "unknown";
    if (!by[cls]) by[cls] = [];
    by[cls].push(id);
  }
  for (const cls of Object.keys(by)) by[cls].sort();
  return by;
}

/** Ladder feat ids for synced n (variant A|B). */
export function ladderIds(n = 4, variant = "A") {
  const k = Math.max(0, Math.min(4, n | 0));
  if (variant === "B") return r1LadderFeatsVariant(k, "B");
  return r1LadderFeats(k);
}

/**
 * Per-class on/off ladder at n, plus flat off-ladder list (CLASS_ORDER only).
 * @returns {{ byClass: Record<string,{onLadder:string[],offLadder:string[]}>, offLadderFlat: string[] }}
 */
export function coverageGap(n = 4) {
  const k = Math.max(0, Math.min(4, n | 0));
  const pool = talentPoolFromStubs();
  const byClass = {};
  const offLadderFlat = [];
  for (const cls of CLASS_ORDER) {
    const picks = (R1_LADDER_PICKS[cls] || []).slice(0, k);
    const onSet = new Set(picks.filter((id) => FEAT_SMOKE_STUBS[id]));
    const all = pool[cls] || [];
    const onLadder = all.filter((id) => onSet.has(id));
    const offLadder = all.filter((id) => !onSet.has(id));
    byClass[cls] = { onLadder, offLadder };
    for (const id of offLadder) offLadderFlat.push(id);
  }
  return { byClass, offLadderFlat };
}

/**
 * Fixed party of 4 that includes cls.
 * Base = R1 F/B/A/S; if cls missing, swap last slot (scout) for cls.
 */
export function partyForClass(cls) {
  const c = String(cls || "").toLowerCase();
  const base = DEFAULT_PARTY.slice();
  if (base.includes(c)) return base;
  // Prefer keeping fighter+brawler frontline; replace scout.
  const out = base.slice();
  out[3] = c;
  // If somehow cls is already elsewhere (shouldn't), ensure uniqueness.
  const seen = new Set();
  for (let i = 0; i < out.length; i++) {
    if (seen.has(out[i])) out[i] = DEFAULT_PARTY.find((x) => !seen.has(x) && x !== c) || "scout";
    seen.add(out[i]);
  }
  if (!out.includes(c)) out[3] = c;
  return out;
}

function ladderSliceForClass(cls, n, variant = "A") {
  const table = variant === "B" ? R1_LADDER_PICKS_B : R1_LADDER_PICKS;
  const picks = table[cls] || [];
  const k = Math.max(0, Math.min(4, n | 0));
  const out = [];
  for (let i = 0; i < k; i++) {
    const id = picks[i];
    if (id && FEAT_SMOKE_STUBS[id]) out.push(id);
  }
  return out;
}

/**
 * Flat featSmoke list: focus class gets ladder@n with talentId forced in
 * (replace last slot or inject if missing). Other CLASS_ORDER classes: normal ladder@n.
 */
export function featPackageForTalent(talentId, n = 4, variant = "A") {
  const stub = FEAT_SMOKE_STUBS[talentId];
  if (!stub) return ladderIds(n, variant);
  const focus = stub.classId;
  const k = Math.max(0, Math.min(4, n | 0));
  const out = [];
  for (const cls of CLASS_ORDER) {
    let slice = ladderSliceForClass(cls, k, variant);
    if (cls === focus) {
      if (k <= 0) {
        slice = [talentId];
      } else if (!slice.includes(talentId)) {
        if (slice.length >= k) slice = slice.slice(0, k - 1).concat([talentId]);
        else slice = slice.concat([talentId]);
      }
    }
    out.push(...slice);
  }
  // Warrior / non-CLASS_ORDER: still force the one talent if focus outside CLASS_ORDER
  if (!CLASS_ORDER.includes(focus)) {
    if (!out.includes(talentId)) out.push(talentId);
  }
  return out;
}

export function classOfTalent(talentId) {
  const stub = FEAT_SMOKE_STUBS[talentId];
  return (stub && stub.classId) || String(talentId).split("-")[0] || null;
}

/** Flat list of T1 talents (CLASS_ORDER) for coverage runs. */
export function allCoverageTalents() {
  const pool = talentPoolFromStubs();
  const out = [];
  for (const cls of CLASS_ORDER) {
    for (const id of pool[cls] || []) out.push(id);
  }
  return out;
}
