/**
 * Kits / Weapon Swap (RULES-CANON §7).
 * Both kits available; only active kit’s Strikes are legal.
 * 1 free swap per your turn; second same turn = 1 AP; whole kit.
 */

/** Split kit ref into weapon id parts (handles dual kits + string aliases). */
export function normalizeKitParts(ref) {
  if (ref == null || ref === "") return [];
  if (Array.isArray(ref)) {
    return ref.map((p) => String(p || "").trim()).filter(Boolean);
  }
  if (ref && typeof ref === "object" && Array.isArray(ref.value)) {
    return ref.value.map((p) => String(p || "").trim()).filter(Boolean);
  }
  let s = String(ref).trim();
  if (!s) return [];
  // Common aliases written as a single token
  const aliases = {
    "longsword-shield": ["longsword", "shield"],
    "longsword+shield": ["longsword", "shield"],
    "longsword + shield": ["longsword", "shield"],
    "sword-shield": ["longsword", "shield"],
    "weapon-shield": ["longsword", "shield"],
  };
  const key = s.toLowerCase();
  if (aliases[key]) return aliases[key].slice();
  if (/[+/,]/.test(s) || /\s+\+\s+/.test(s)) {
    return s
      .split(/\s*[+/,]\s*|\s+and\s+/i)
      .map((p) => p.trim())
      .filter(Boolean);
  }
  // "longsword shield" / "longsword-shield" already handled; bare id:
  return [s];
}

export function activeKitIndex(actor) {
  const opts = actor.weaponOptions || actor.kits || [];
  let i = actor.activeKit == null ? 0 : +actor.activeKit;
  if (!opts.length) return 0;
  if (i < 0 || i >= opts.length) i = 0;
  return i;
}

export function activeKitRef(actor) {
  const opts = actor.weaponOptions || actor.kits || [];
  return opts[activeKitIndex(actor)] || null;
}

export function activeKitParts(actor) {
  return normalizeKitParts(activeKitRef(actor));
}

/** True if kit is weapon+shield (main hand + shield). */
export function kitIsWeaponAndShield(parts) {
  const p = Array.isArray(parts) ? parts : normalizeKitParts(parts);
  return p.length >= 2 && p.indexOf("shield") >= 0;
}

/** True if kit is a single two-hand / one-weapon profile (no shield). */
export function kitIsTwoHand(parts) {
  const p = Array.isArray(parts) ? parts : normalizeKitParts(parts);
  return p.length === 1 && p[0] !== "shield";
}

/**
 * Does this ability match the actor's active kit?
 * - no weaponId/kitId/kitModes → always ok (talents)
 * - weaponId must be in active kit parts
 * - kitModes: "2h" | "weapon+shield" | "any"
 */
export function kitMatchesAbility(actor, ability) {
  if (!ability) return false;
  const modes = ability.kitModes || ability.requireKitModes || null;
  const parts = activeKitParts(actor);

  if (Array.isArray(modes) && modes.length) {
    const okMode = modes.some((m) => {
      const mode = String(m || "").toLowerCase();
      if (mode === "any") return true;
      if (mode === "2h" || mode === "twohand" || mode === "two-hand") return kitIsTwoHand(parts);
      if (
        mode === "weapon+shield" ||
        mode === "weapon-shield" ||
        mode === "shield" ||
        mode === "1h+shield"
      ) {
        return kitIsWeaponAndShield(parts);
      }
      return false;
    });
    if (!okMode) return false;
  }

  if (!ability.kitId && !ability.weaponId) return true;
  if (!parts.length) return true;

  if (ability.weaponId) {
    const wid = String(ability.weaponId);
    if (parts.indexOf(wid) >= 0) return true;
    // string kit id embeds weapon id (fighter-kit-heavy-sword)
    if (parts.length === 1 && String(parts[0]).indexOf(wid) >= 0) return true;
    return false;
  }

  if (ability.kitId) {
    const kid = String(ability.kitId);
    // kitId like fighter-kit-heavy-sword vs active "heavy-sword"
    for (const p of parts) {
      if (kid.indexOf(p) >= 0 || p.indexOf(kid) >= 0) return true;
    }
    return false;
  }

  return true;
}

/**
 * Attempt kit swap.
 * @returns {{ ok: boolean, free?: boolean, apCost?: number, reason?: string }}
 */
export function weaponSwap(actor, nextIndex, spendAp) {
  const opts = actor.weaponOptions || actor.kits || [];
  const next = nextIndex | 0;
  if (!opts.length) return { ok: false, reason: "no-kits" };
  if (next < 0 || next >= opts.length) return { ok: false, reason: "bad-index" };
  if (next === activeKitIndex(actor)) return { ok: false, reason: "already-active" };

  const swaps = actor.kitSwapsThisTurn | 0;
  if (swaps === 0) {
    actor.activeKit = next;
    actor.kitSwapsThisTurn = 1;
    actor.kitSwapsTotal = (actor.kitSwapsTotal | 0) + 1;
    return { ok: true, free: true, apCost: 0 };
  }

  const apCost = 1;
  if (typeof spendAp === "function") {
    const paid = spendAp(actor, apCost);
    if (!paid) return { ok: false, reason: "no-ap" };
  } else if ((actor.ap | 0) < apCost) {
    return { ok: false, reason: "no-ap" };
  } else {
    actor.ap -= apCost;
  }
  actor.activeKit = next;
  actor.kitSwapsThisTurn = swaps + 1;
  actor.kitSwapsTotal = (actor.kitSwapsTotal | 0) + 1;
  return { ok: true, free: false, apCost };
}

export function resetKitSwaps(actor) {
  actor.kitSwapsThisTurn = 0;
}

/** Deep-ish copy of weaponOptions so nested dual-kit arrays aren't shared. */
export function copyWeaponOptions(opts) {
  if (!Array.isArray(opts)) return [];
  return opts.map((ref) => (Array.isArray(ref) ? ref.slice() : ref));
}
