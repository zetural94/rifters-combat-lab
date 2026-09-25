/**
 * Inspect / action-panel preview of WD / 2WD / 3WD.
 * Numbers come from resolveAbilityTierDamage (same path as a real strike).
 */
import { resolveAbilityTierDamage } from "./strike.js";
import { kitMatchesAbility } from "./kits.js";

export function isWeaponDmgToken(d) {
  return d === "WD" || d === "2WD" || d === "3WD";
}

/** Shallow actor with a different active kit. Does not mutate the live hero. */
export function previewActor(actor, kitIndex) {
  if (!actor) return actor;
  const i = kitIndex | 0;
  if ((actor.activeKit | 0) === i) return actor;
  return Object.assign({}, actor, { activeKit: i });
}

/**
 * Kit indexes this ability can actually be used with.
 * Falls back to the active kit when nothing matches (preview still has a number).
 */
export function kitIndexesForAbility(actor, ability) {
  const opts = (actor && (actor.weaponOptions || actor.kits)) || [];
  const out = [];
  for (let i = 0; i < opts.length; i++) {
    if (ability && kitMatchesAbility(previewActor(actor, i), ability)) out.push(i);
  }
  if (!out.length && opts.length) {
    const active = actor.activeKit | 0;
    out.push(active >= 0 && active < opts.length ? active : 0);
  }
  return out;
}

/**
 * Resolved printed damage for one tier effect, or null when it is not a WD token.
 * @param {object} abilityById pack / state lookup used by activeWeaponStrike
 */
export function previewTierDamage(ability, effect, actor, kitIndex, abilityById) {
  if (!ability || !ability.useWeapon || !effect || !actor) return null;
  if (!isWeaponDmgToken(effect.dmg)) return null;
  return resolveAbilityTierDamage(ability, effect, previewActor(actor, kitIndex), {
    abilityById: abilityById || {},
  });
}

/** [t1, t2, t3] resolved numbers. Non-WD tiers stay their printed integers. Missing tiers are null. */
export function previewTierTriplet(ability, actor, kitIndex, abilityById) {
  const tiers = (ability && ability.tiers) || {};
  const out = [];
  for (const key of ["t1", "t2", "t3"]) {
    const eff = tiers[key];
    if (!eff || eff.dmg == null) {
      out.push(null);
      continue;
    }
    if (isWeaponDmgToken(eff.dmg)) {
      out.push(previewTierDamage(ability, eff, actor, kitIndex, abilityById));
    } else {
      let n = Number(eff.dmg) || 0;
      n += eff.dmgBonus | 0;
      if (eff.dmgStat && actor) {
        const key = String(eff.dmgStat).toLowerCase();
        const v =
          key === "str" ? actor.str | 0 : key === "dex" ? actor.dex | 0 : actor.int | 0;
        n += v * Math.max(1, (eff.dmgStatMult | 0) || 1);
      }
      out.push(Math.max(0, n));
    }
  }
  return out;
}
