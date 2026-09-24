/**
 * Curated T1 talent ladders for R1 party (v0.3 pad calib).
 * Each hero buys n talents in lockstep; package = union of class picks.
 * Costs aligned to Rifters_18 left axis where stubs exist.
 */
import { FEAT_SMOKE_STUBS, featSmokeXp } from "./r1.js";

/** Per-class ordered picks (index 0 = first purchase). */
export const R1_LADDER_PICKS = {
  fighter: [
    "fighter-frontliner", // 250
    "fighter-precise-strike", // 250
    "fighter-heavy-swing", // 250
    "fighter-courage", // 300 if stub; else eye
  ],
  brawler: [
    "brawler-pugilist",
    "brawler-martial-artist",
    "brawler-uppercut",
    "brawler-flurry-blows",
  ],
  assassin: [
    "assassin-shadow-dash",
    "assassin-riposte",
    "assassin-stealth",
    "assassin-dirty-trick",
  ],
  scout: [
    "scout-hidden-bola",
    "scout-ranger",
    "scout-hunters-knowledge",
    "scout-pin-shot",
  ],
  mystic: [
    "mystic-blink",
    "mystic-enhance-weapon",
    "mystic-game-knowledge",
    "mystic-lightning-bolt",
  ],
  acolyte: [
    "acolyte-bless",
    "acolyte-summon-warrior",
    "acolyte-summon-mage",
    "acolyte-summon-archer",
  ],
  primalist: [
    "primalist-healing-water",
    "primalist-barkskin",
    "primalist-feral-invocation",
    "primalist-summon-elemental",
  ],
};
/** Fallback if a pick id is missing from stubs. */
const FALLBACKS = {
  "scout-spotter-mark": "scout-spotter",
  "acolyte-enhance-weapon": "mystic-enhance-weapon",
};

function resolveId(id) {
  if (FEAT_SMOKE_STUBS[id]) return id;
  const fb = FALLBACKS[id];
  if (fb && FEAT_SMOKE_STUBS[fb]) return fb;
  return null;
}

/** Feat id list for synced n talents per R1 hero (0..4). */
export function r1LadderFeats(n) {
  const k = Math.max(0, Math.min(4, n | 0));
  const out = [];
  for (const cls of Object.keys(R1_LADDER_PICKS)) {
    const picks = R1_LADDER_PICKS[cls];
    for (let i = 0; i < k; i++) {
      const id = resolveId(picks[i]);
      if (id) out.push(id);
    }
  }
  return out;
}

/**
 * Uneven R1 ladder: counts in class order fighter→brawler→assassin→scout.
 * @param {number[]} counts
 */
export function r1LadderFeatsByCounts(counts) {
  const classes = Object.keys(R1_LADDER_PICKS);
  const out = [];
  for (let i = 0; i < classes.length; i++) {
    const n = Math.max(0, Math.min(4, (counts && counts[i]) | 0));
    const picks = R1_LADDER_PICKS[classes[i]];
    for (let j = 0; j < n; j++) {
      const id = resolveId(picks[j]);
      if (id) out.push(id);
    }
  }
  return out;
}

export function r1LadderMeta(n) {
  const feats = r1LadderFeats(n);
  const missing = [];
  for (const cls of Object.keys(R1_LADDER_PICKS)) {
    for (let i = 0; i < n; i++) {
      const raw = R1_LADDER_PICKS[cls][i];
      if (!resolveId(raw)) missing.push(raw);
    }
  }
  return {
    n: n | 0,
    feats,
    stubXp: featSmokeXp(feats),
    missing,
    perClass: Object.fromEntries(
      Object.keys(R1_LADDER_PICKS).map((cls) => [
        cls,
        R1_LADDER_PICKS[cls].slice(0, n)
          .map(resolveId)
          .filter(Boolean),
      ])
    ),
  };
}

/** Alt packages (2nd set) — slightly different power shape for variance check. */
export const R1_LADDER_PICKS_B = {
  fighter: [
    "fighter-frontliner",
    "fighter-precise-strike",
    "fighter-heavy-swing",
    "fighter-forceful-push",
  ],
  brawler: [
    "brawler-martial-artist",
    "brawler-pugilist",
    "brawler-full-contact",
    "brawler-tough",
  ],
  assassin: [
    "assassin-cold-blooded",
    "assassin-shadow-dash",
    "assassin-riposte",
    "assassin-stealth",
  ],
  scout: [
    "scout-hidden-bola",
    "scout-hunters-knowledge",
    "scout-barrage",
    "scout-vigilant",
  ],
  mystic: [
    "mystic-enhance-weapon",
    "mystic-blink",
    "mystic-lightning-bolt",
    "mystic-game-knowledge",
  ],
  acolyte: [
    "acolyte-summon-warrior",
    "acolyte-bless",
    "acolyte-summon-mage",
    "acolyte-summon-archer",
  ],
  primalist: [
    "primalist-summon-elemental",
    "primalist-healing-water",
    "primalist-barkskin",
    "primalist-feral-invocation",
  ],
};
export function r1LadderFeatsVariant(n, variant = "A") {
  const picks = variant === "B" ? R1_LADDER_PICKS_B : R1_LADDER_PICKS;
  const k = Math.max(0, Math.min(4, n | 0));
  const out = [];
  for (const cls of Object.keys(picks)) {
    for (let i = 0; i < k; i++) {
      const id = resolveId(picks[cls][i]);
      if (id) out.push(id);
    }
  }
  return out;
}

/**
 * Curated combat-first ladders for non-R1 presets (usage gates).
 * Order = purchase priority; n = talents per hero.
 */
export const MIX_LADDER_PICKS = {
  casters: {
    mystic: [
      "mystic-lightning-bolt",
      "mystic-blink",
      "mystic-enhance-weapon",
      "mystic-living-bomb",
    ],
    acolyte: [
      "acolyte-enfeeble",
      "acolyte-purge-wicked",
      "acolyte-toxic-cloud",
      "acolyte-bless",
    ],
    primalist: [
      "primalist-healing-water",
      "primalist-barkskin",
      "primalist-feral-invocation",
      "primalist-summon-elemental",
    ],
    scout: [
      "scout-hidden-bola",
      "scout-pin-shot",
      "scout-barrage",
      "scout-ranger",
    ],
  },
  frontline: {
    fighter: [
      "fighter-precise-strike",
      "fighter-heavy-swing",
      "fighter-eye-for-an-eye",
      "fighter-frontliner",
    ],
    brawler: [
      "brawler-uppercut",
      "brawler-flurry-blows",
      "brawler-martial-artist",
      "brawler-guard",
    ],
    primalist: [
      "primalist-frost-shock",
      "primalist-entangle",
      "primalist-barkskin",
      "primalist-primal-instinct",
    ],
    acolyte: [
      "acolyte-enfeeble",
      "acolyte-bless",
      "acolyte-purge-wicked",
      "acolyte-systems-bargain",
    ],
  },
  glass: {
    assassin: [
      "assassin-shadow-dash",
      "assassin-riposte",
      "assassin-stealth",
      "assassin-dirty-trick",
    ],
    scout: [
      "scout-hidden-bola",
      "scout-pin-shot",
      "scout-barrage",
      "scout-hunters-knowledge",
    ],
    mystic: [
      "mystic-lightning-bolt",
      "mystic-blink",
      "mystic-enhance-weapon",
      "mystic-ice-wall",
    ],
    acolyte: [
      "acolyte-enfeeble",
      "acolyte-purge-wicked",
      "acolyte-toxic-cloud",
      "acolyte-bless",
    ],
  },
};

/** Full class talent package for 1v1 training (sandbox train_*). */
export const TRAIN_CLASS_FEATS = {
  fighter: [
    "fighter-frontliner",
    "fighter-eye-for-an-eye",
    "fighter-weaponmaster",
    "fighter-courage",
    "fighter-precise-strike",
    "fighter-heavy-swing",
    "fighter-forceful-push",
    "fighter-intimidating-shout",
  ],
};

/** Feats for a train_<class> scenario (every Rank-1 stub for that class). */
export function trainClassFeats(classId) {
  const cls = String(classId || "")
    .replace(/^train_/, "")
    .toLowerCase();
  if (!cls) return null;
  const fromStubs = Object.keys(FEAT_SMOKE_STUBS).filter((id) => {
    const stub = FEAT_SMOKE_STUBS[id];
    return stub && stub.classId === cls;
  });
  if (fromStubs.length) return fromStubs;
  const picks = TRAIN_CLASS_FEATS[cls];
  if (!picks) return null;
  return picks.map(resolveId).filter(Boolean);
}

/** Feat list for a party preset @ synced n talents/hero. */
export function mixLadderFeats(partyKey, n) {
  const picks = MIX_LADDER_PICKS[partyKey];
  if (!picks) return r1LadderFeats(n);
  const k = Math.max(0, Math.min(4, n | 0));
  const out = [];
  for (const cls of Object.keys(picks)) {
    for (let i = 0; i < k; i++) {
      const id = resolveId(picks[cls][i]);
      if (id) out.push(id);
    }
  }
  return out;
}
