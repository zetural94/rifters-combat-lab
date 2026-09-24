import { d10 } from "./rng.js";

/**
 * Power Roll per RULES-CANON §3.
 * natural = raw 2d10 sum (no STAT, no ADV/DISADV).
 * Crit window baseline 19–20; CRIT X lowers the floor by X.
 * Optional d1/d2 override (Help reroll).
 */
export function powerRoll(opts) {
  const rng = opts.rng;
  const d1 = opts.d1 != null ? opts.d1 | 0 : d10(rng);
  const d2 = opts.d2 != null ? opts.d2 | 0 : d10(rng);
  const natural = d1 + d2;
  const stat = opts.statValue | 0;
  const adv = (opts.adv | 0) - (opts.disadv | 0);
  const total = natural + stat + adv;
  const critFloor = Math.max(2, 19 - (opts.critX | 0));
  const isCrit = natural >= critFloor;
  // System's Bargain: thresholds shift −1 → ≤10 / 11–15 / 16+
  const shift = opts.thresholdShift | 0;
  const t1Max = 11 + shift;
  const t2Max = 16 + shift;
  let tier;
  if (isCrit) tier = 3;
  else if (total <= t1Max) tier = 1;
  else if (total <= t2Max) tier = 2;
  else tier = 3;
  return { d1, d2, natural, total, tier, isCrit, advNet: adv, thresholdShift: shift };
}

/** Help: reroll the lower d10 once; rebuild tier from same STAT/ADV/CRIT X. */
export function helpRerollLowerDie(roll, opts = {}) {
  if (!roll) return null;
  const lowerIsD1 = (roll.d1 | 0) <= (roll.d2 | 0);
  const nd = d10(opts.rng);
  return powerRoll({
    rng: opts.rng,
    d1: lowerIsD1 ? nd : roll.d1,
    d2: lowerIsD1 ? roll.d2 : nd,
    statValue: opts.statValue | 0,
    adv: opts.adv | 0,
    disadv: opts.disadv | 0,
    critX: opts.critX | 0,
    thresholdShift: opts.thresholdShift | 0,
  });
}

export function tierKey(tier) {
  return tier === 1 ? "t1" : tier === 2 ? "t2" : "t3";
}

function statBonus(attacker, name) {
  const k = String(name || "").toUpperCase();
  if (!attacker) return 0;
  if (k === "STR") return attacker.str | 0;
  if (k === "DEX") return attacker.dex | 0;
  if (k === "INT") return attacker.int | 0;
  return 0;
}

/** Resolve printed damage on a tier effect (number, WD / 2WD → weaponDmg, +stat).
 *  nWD = n × the weapon's printed damage for **this same tier** (the band where nWD is written).
 */
export function resolveTierDmg(tierEffect, weaponDmgByTier, attacker) {
  if (!tierEffect) return 0;
  const d = tierEffect.dmg;
  let base = 0;
  if (d === "WD" || d === "2WD" || d === "3WD") {
    // Optional wdKey override only when a card intentionally pulls another band.
    const wdKey = tierEffect.wdKey || tierEffect._tierKey || "t1";
    base = (weaponDmgByTier && weaponDmgByTier[wdKey]) | 0;
    const mult =
      tierEffect.dmgMult != null
        ? Number(tierEffect.dmgMult) || 1
        : d === "3WD"
          ? 3
          : d === "2WD"
            ? 2
            : 1;
    base *= mult;
    if (base) {
      base += tierEffect.dmgBonus | 0;
      if (tierEffect.dmgStat) base += statBonus(attacker, tierEffect.dmgStat) * Math.max(1, (tierEffect.dmgStatMult | 0) || 1);
    } else if (tierEffect.dmgFallback != null) {
      // Smoke fallback is the full printed band (already includes +stat / +bonus).
      base = Number(tierEffect.dmgFallback) || 0;
    }
  } else if (tierEffect.dmgPerUnit != null && attacker) {
    // Lazy import avoided — inline horde math to keep powerRoll free of cycles
    const y = Math.max(1, (attacker.unitHp | 0) || 1);
    const hp = Math.max(0, attacker.hp | 0);
    const alive =
      attacker.horde || ((attacker.unitHp | 0) > 0 && (attacker.unitsMax | 0) > 0);
    if (alive && hp > 0 && !attacker.dead && attacker.alive !== false) {
      const x = Math.max(1, Math.ceil(hp / y));
      base = Math.max(
        0,
        (Number(tierEffect.dmgPerUnit) || 0) * x + (Number(tierEffect.dmgFlat) || 0)
      );
    }
  } else {
    base = Number(d) || 0;
    base += tierEffect.dmgBonus | 0;
    if (tierEffect.dmgStat) base += statBonus(attacker, tierEffect.dmgStat) * Math.max(1, (tierEffect.dmgStatMult | 0) || 1);
  }
  return Math.max(0, base);
}
