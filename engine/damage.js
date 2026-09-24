/**
 * Damage pipeline (RULES-CANON §5):
 * printed DEF → Vulnerable (−DEF) → Defend (×2) → BREAK → subtract DEF from raw → Resist → SHIELD → HP
 * then Bleed X adds Physical unpreventable (DoTs do not trigger Bleed).
 *
 * Printed DEF may be **negative** (e.g. Water −3): raw − (−3) = raw+3.
 * BREAK only eats positive DEF (floor 0 after BREAK); it does not erase a weakness bonus.
 *
 * Printed numbers only — no Mechanika band table.
 *
 * Horde + AoE (`hordeNoSpill`): damage hits one unit slot only — capped to `unitHp`,
 * excess is wasted (does not overflow onto other tokens of the same stack).
 */

import { syncHordeAfterHp, resolveHordeDamageTarget, cullHordeTokens, isHorde, resolveHordeAoeTokenHit } from "./horde.js";
import { inRange } from "./grid.js";

function defFor(target, dmgType) {
  if (!target || !target.def) return 0;
  if (typeof target.def === "object" && !Array.isArray(target.def)) {
    const v = target.def[dmgType];
    if (v == null || v === "") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function resistMod(target, dmgType) {
  const r = (target && target.resist && target.resist[dmgType]) || 0;
  // Resist reduces incoming after DEF. Vulnerable is a DEF reduction (see applyDamage).
  return -(Number(r) || 0);
}

function vulnerableDef(target, dmgType) {
  return Math.max(0, Number((target && target.vulnerable && target.vulnerable[dmgType]) || 0) || 0);
}

/**
 * @returns {{ dealt: number, toHp: number, absorbedShield: number, afterDef: number, bleedExtra?: number }}
 */
export function applyDamage(target, rawAmount, opts = {}) {
  if (!target || target.dead || target.alive === false) {
    return { dealt: 0, toHp: 0, absorbedShield: 0, afterDef: 0 };
  }
  // Remember the board token that was struck (AoE no-spill kills this pawn only).
  const hitToken = target;
  // Horde followers share the primary's HP pool (overflow culls tokens) — unless AoE no-spill.
  if (opts.actors) {
    target = resolveHordeDamageTarget(target, opts.actors) || target;
  }
  let dmg = Math.max(0, Number(rawAmount) || 0);
  if (opts.unpreventable) {
    // Unpreventable hits still trigger Bleed only if damage > 0 (Bleed itself is unprev — do not recurse).
    if (opts.hordeNoSpill && isHorde(target)) {
      const cap = Math.max(1, target.unitHp | 0);
      dmg = Math.min(dmg, cap);
    }
    const bleedExtra =
      dmg > 0 && !opts.fromBleed ? triggerBleedBonus(target, opts) : 0;
    let packet = dmg + bleedExtra;
    if (opts.hordeNoSpill && isHorde(target)) {
      packet = Math.min(packet, Math.max(1, target.unitHp | 0));
    }
    const r = commitHp(target, packet, 0, dmg, { ...opts, hitToken });
    if (bleedExtra) r.bleedExtra = bleedExtra;
    return r;
  }

  const dmgType = opts.dmgType || "Physical";
  let def = defFor(target, dmgType);
  // Vulnerable X: DEF of that type −X (may go further negative = more bonus dmg).
  def = def - vulnerableDef(target, dmgType);
  if (target.defendUp) def *= 2;
  // BREAK X: ignore up to X of positive DEF only (DEF cannot go below 0 via BREAK).
  const breakX = Math.max(0, opts.break | 0);
  if (breakX > 0 && def > 0) {
    def = Math.max(0, def - breakX);
  }

  // Negative DEF increases damage (e.g. DEF −3 → raw+3). Floor only the final HP packet.
  dmg = Math.max(0, dmg - def);
  dmg = Math.max(0, dmg + resistMod(target, dmgType));

  let absorbedShield = 0;
  const shield = (target.st && target.st.shield) || 0;
  if (shield > 0 && dmg > 0) {
    absorbedShield = Math.min(shield, dmg);
    dmg -= absorbedShield;
    target.st.shield = shield - absorbedShield;
  }

  // AoE vs horde: one unit slot only — excess does not walk onto the next pawn.
  if (opts.hordeNoSpill && isHorde(target)) {
    const cap = Math.max(1, target.unitHp | 0);
    dmg = Math.min(dmg, cap);
  }

  // Canon: Bleed only when you actually take damage (after DEF / Resist / SHIELD).
  const bleedExtra = dmg > 0 ? triggerBleedBonus(target, opts) : 0;
  let packet = dmg + bleedExtra;
  if (opts.hordeNoSpill && isHorde(target)) {
    packet = Math.min(packet, Math.max(1, target.unitHp | 0));
  }
  const r = commitHp(target, packet, absorbedShield, Math.max(0, Number(rawAmount) || 0), {
    ...opts,
    hitToken,
  });
  if (bleedExtra) r.bleedExtra = bleedExtra;
  return r;
}

/** Bleed X: when you take damage, add X Physical unpreventable. DoTs do not trigger Bleed. */
function triggerBleedBonus(target, opts) {
  if (opts.fromBleed || opts.skipBleed) return 0;
  if (opts.isDot) return 0;
  const x = (target.st && target.st.bleed) | 0;
  return x > 0 ? x : 0;
}

function commitHp(target, toHp, absorbedShield, afterDefHint, opts = {}) {
  const before = target.hp | 0;
  if (toHp <= 0) {
    return { dealt: 0, toHp: 0, absorbedShield, afterDef: afterDefHint };
  }

  if (before <= 0) {
    // Summons never use Dying track — force out + clear owner id.
    if (target.summon) {
      target.dead = true;
      target.alive = false;
      target.hp = 0;
      if (target.summonerId && opts.actors) {
        const owner = opts.actors.find((a) => a && a.id === target.summonerId);
        if (owner && owner.activeSummonId === target.id) owner.activeSummonId = null;
      }
      return {
        dealt: toHp,
        toHp: 0,
        absorbedShield,
        afterDef: afterDefHint,
        wound: false,
        summonOut: true,
      };
    }
    // Already dying: further damaging hits → Wound (RULES-CANON / Mechanika)
    target.wounds = (target.wounds | 0) + 1;
    let warMachineStress = 0;
    if (target.warMachine && (target.stress | 0) < (target.stressMax | 0)) {
      target.stress = Math.min(target.stressMax | 0, (target.stress | 0) + 1);
      warMachineStress = 1;
    }
    if ((target.wounds | 0) >= 5) {
      target.dead = true;
      target.alive = false;
    }
    return {
      dealt: toHp,
      toHp: 0,
      absorbedShield,
      afterDef: afterDefHint,
      wound: true,
      warMachineStress,
    };
  }

  const thrBefore = Math.floor((target.hpMax | 0) / 2);
  const wasBloodied = before > 0 && before <= thrBefore;

  target.hp = Math.max(0, before - toHp);
  let warMachineStress = 0;
  if (target.hp <= 0) {
    target.wounds = (target.wounds | 0) + 1;
    if (target.warMachine) {
      target.stress = Math.min(target.stressMax | 0, (target.stress | 0) + 1);
      warMachineStress = 1;
    }
    target.down = true;
    // Monsters + summons: 0 HP = out (no Dying track). Heroes: Dying until 5 Wounds.
    if (target.side === "enemy" || target.summon || (target.wounds | 0) >= 5) {
      target.dead = true;
      target.alive = false;
      if (target.summon && target.summonerId && opts.actors) {
        const owner = opts.actors.find((a) => a && a.id === target.summonerId);
        if (owner && owner.activeSummonId === target.id) owner.activeSummonId = null;
      }
    }
  }

  // Frontliner: first time you become Bloodied → +1 AP on your next beginTurn.
  if (target.frontliner && !target.frontlinerApPending) {
    const thr = Math.floor((target.hpMax | 0) / 2);
    const nowBloodied = (target.hp | 0) > 0 && (target.hp | 0) <= thr;
    if (nowBloodied && !wasBloodied) {
      target.frontlinerApPending = true;
    }
  }

  const dealt = before - (target.hp | 0);
  syncHordeAfterHp(target);
  if (opts.actors && target.hordeStackId) {
    if (opts.hordeNoSpill && opts.hitToken) {
      resolveHordeAoeTokenHit(opts.actors, opts.hitToken, dealt);
    } else {
      const prefer = [];
      if (opts.hitToken && opts.hitToken.id) prefer.push(opts.hitToken.id);
      for (const id of opts.preferRemoveIds || []) {
        if (id && prefer.indexOf(id) < 0) prefer.push(id);
      }
      for (const id of opts.aoeCullIds || []) {
        if (id && prefer.indexOf(id) < 0) prefer.push(id);
      }
      cullHordeTokens(opts.actors, target.hordeStackId, {
        preferRemoveIds: prefer.length ? prefer : null,
      });
    }
  }
  // Living Bomb death burst (once)
  if (
    target.dead &&
    target.livingBomb &&
    !opts.fromLivingBomb &&
    Array.isArray(opts.actors)
  ) {
    const bomb = target.livingBomb;
    target.livingBomb = null;
    const br = bomb.range != null ? bomb.range | 0 : 3;
    const bd = bomb.dmg | 0 || 5;
    const casterSide =
      (opts.actors.find((a) => a && a.id === bomb.fromId) || {}).side || "hero";
    for (const other of opts.actors) {
      if (!other || other === target || other.side === casterSide) continue;
      if (other.dead || (other.hp | 0) <= 0) continue;
      if (!inRange(target, other, br)) continue;
      applyDamage(other, bd, {
        dmgType: "Fire",
        actors: opts.actors,
        fromLivingBomb: true,
      });
    }
  }
  const out = {
    dealt,
    toHp: dealt,
    absorbedShield,
    afterDef: afterDefHint,
  };
  if (warMachineStress) out.warMachineStress = warMachineStress;
  return out;
}

/** Activate Defend stance until start of next turn — does not stack. */
export function activateDefend(actor) {
  if (actor.defendUp) return { ok: false, reason: "already-up" };
  actor.defendUp = true;
  return { ok: true };
}

export function clearDefend(actor) {
  actor.defendUp = false;
}
