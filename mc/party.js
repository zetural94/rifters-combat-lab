/**
 * T1 hero catalog + 4-PC party presets for R1 / Builder / MC.
 * Default R1 balance anchor = Fighter / Brawler / Assassin / Scout.
 */
export const HERO_CATALOG = [
  { id: "fighter", label: "Fighter" },
  { id: "brawler", label: "Brawler" },
  { id: "mystic", label: "Mystic" },
  { id: "acolyte", label: "Acolyte" },
  { id: "primalist", label: "Primalist" },
  { id: "assassin", label: "Assassin" },
  { id: "scout", label: "Scout" },
];

/** Preset id → 4 hero card ids. */
export const PARTY_PRESETS = {
  r1: ["fighter", "brawler", "assassin", "scout"],
  casters: ["mystic", "acolyte", "primalist", "scout"],
  frontline: ["fighter", "brawler", "primalist", "acolyte"],
  glass: ["assassin", "scout", "mystic", "acolyte"],
};

export const PARTY_PRESET_LABELS = {
  r1: "R1 lock (F/B/A/S) — balance anchor",
  casters: "Casters — Mystic / Acolyte / Primalist / Scout",
  frontline: "Frontline — Fighter / Brawler / Primalist / Acolyte",
  glass: "Glass — Assassin / Scout / Mystic / Acolyte",
};

/** Default spawn spots (left half). */
export const HERO_SPOTS = [
  { x: 2, y: 2 },
  { x: 2, y: 4 },
  { x: 1, y: 3 },
  { x: 1, y: 5 },
];

/**
 * Resolve party option → exactly 4 hero ids.
 * Legacy alias: "sunday" → r1 (old localStorage / bookmarks).
 * @param {'r1'|string|string[]} party
 */
export function resolvePartyIds(party) {
  if (Array.isArray(party)) {
    const ids = party.map((x) => String(x || "").toLowerCase()).filter(Boolean);
    while (ids.length < 4) ids.push(PARTY_PRESETS.r1[ids.length]);
    return ids.slice(0, 4);
  }
  let raw = String(party || "r1");
  if (raw.toLowerCase() === "sunday") raw = "r1";
  const keyLower = raw.toLowerCase();
  // Also accept a case-insensitive preset key.
  if (PARTY_PRESETS[raw]) return PARTY_PRESETS[raw].slice();
  const alias = Object.keys(PARTY_PRESETS).find((k) => k.toLowerCase() === keyLower);
  if (alias) return PARTY_PRESETS[alias].slice();
  return PARTY_PRESETS.r1.slice();
}

/**
 * Expand to createEncounter hero specs.
 * @param {{ cards: Record<string, object> }} pack
 * @param {'r1'|string|string[]} party
 */
export function expandParty(pack, party = "r1") {
  const cards = (pack && pack.cards) || pack || {};
  const ids = resolvePartyIds(party);
  const heroes = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const card = cards[id];
    if (!card || card.kind !== "hero") {
      throw new Error("party: missing hero card " + id);
    }
    heroes.push({
      card,
      pos: HERO_SPOTS[i] || { x: 1, y: 1 + i },
      name: card.name,
    });
  }
  return heroes;
}

export function partyLabel(party) {
  if (Array.isArray(party)) {
    return party
      .map((id) => {
        const hit = HERO_CATALOG.find((h) => h.id === id);
        return (hit && hit.label) || id;
      })
      .join(" / ");
  }
  let key = String(party || "r1").toLowerCase();
  if (key === "sunday") key = "r1";
  return PARTY_PRESET_LABELS[key] || PARTY_PRESET_LABELS.r1;
}

/**
 * Conscious weak Fire DEF vs Ember rift (legal bag permute).
 * Light/Heavy: Fire 0 (0 from bag; displaced value → Lightning).
 * Medium: unchanged (all 2s).
 * Magic: Fire 2 (one 3 stays on Air; other 3 on Water).
 * Does not mutate the source card — returns a new def map.
 */
export function weakFireDefMap(armorId, baseDef) {
  const armor = String(armorId || "").toLowerCase();
  const d = Object.assign({}, baseDef || {});
  if (/medium/.test(armor)) return d;
  if (/light/.test(armor) || /heavy/.test(armor)) {
    const oldFire = d.Fire != null ? d.Fire | 0 : 0;
    d.Fire = 0;
    d.Lightning = oldFire;
    return d;
  }
  if (/magic/.test(armor)) {
    d.Fire = 2;
    d.Air = 3;
    d.Water = 3;
    d.Earth = 2;
    d.Lightning = 2;
    return d;
  }
  return d;
}

/** @param {'riftFire'|string|null} stress */
export function applyArmorStressToHeroSpecs(heroes, stress) {
  if (!stress || stress === "default") return heroes;
  if (String(stress) !== "riftFire") return heroes;
  return (heroes || []).map((h) => {
    const card = h.card;
    if (!card) return h;
    const def = weakFireDefMap(card.armorId, card.def);
    return Object.assign({}, h, {
      card: Object.assign({}, card, { def }),
    });
  });
}
